import JSZip from 'jszip';
import type { UIElement, UIPage } from '@/types/uiEditor';
import { parseDataUrl } from '@/utils/uiExportCore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { slugifyPageName } from '@/utils/uiProjectExporter';

export const UI_EDITOR_PROJECT_FORMAT = 'ui-editor-project';
export const UI_EDITOR_PROJECT_VERSION = '2.0.0';

export interface UIEditorProjectFile {
  format: string;
  version: string;
  exportTime: string;
  activePageId?: string;
  /** 联动预览展示的画布 */
  previewPageId?: string;
  /** v2：多画布 */
  pages?: UIPage[];
  /** v1 兼容：单画布 */
  canvas?: {
    width: number;
    height: number;
    background: string;
  };
  elements?: UIElement[];
}

export interface UIEditorSaveResult {
  filename: string;
  imageCount: number;
  pageCount: number;
  pageNames: string[];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function cloneElementsForExport(elements: UIElement[]): UIElement[] {
  return elements.map((el) => ({
    ...el,
    style: { ...el.style },
    hoverStyle: el.hoverStyle ? { ...el.hoverStyle } : undefined,
    chartConfig: el.chartConfig ? { ...el.chartConfig } : undefined,
  }));
}

function buildSaveReadme(pages: UIPage[], exportTime: string): string {
  const list = pages
    .map((p, i) => `${i + 1}. **${p.name}** — ${p.canvasWidth}×${p.canvasHeight}，${p.elements.length} 个元素`)
    .join('\n');
  return `# UI 编排项目包

保存时间：${exportTime}

本压缩包可由数字孪生平台「UI 编排 → 打开项目」重新载入。

## 画布列表

${list}

## 目录说明

\`\`\`
├── config/ui-editor.json   # 多画布项目配置
└── assets/images/          # 图片资源
\`\`\`
`;
}

/** 保存可重新导入的 UI 编排项目包（ZIP，含多画布） */
export async function saveUIEditorProject(): Promise<UIEditorSaveResult> {
  const pages = useUIEditorStore.getState().getPagesSnapshot();
  const activePageId = useUIEditorStore.getState().activePageId;
  const previewPageId = useUIEditorStore.getState().previewPageId;

  if (pages.length === 0) {
    throw new Error('没有可保存的画布');
  }

  const timestamp = Date.now();
  const nameSlug = slugifyPageName(pages[0].name, 'ui-project');
  const folderName =
    pages.length === 1
      ? `ui-editor-${nameSlug}-${timestamp}`
      : `ui-editor-${nameSlug}-等${pages.length}页-${timestamp}`;

  const zip = new JSZip();
  const root = zip.folder(folderName);
  if (!root) throw new Error('无法创建 ZIP 目录');

  const imageFiles = new Map<string, Uint8Array>();
  const imagePathCache = new Map<string, string>();
  let imageCount = 0;

  const resolveImagePath = (
    pageId: string,
    elementId: string,
    dataUrl: string,
    kind: 'src' | 'background'
  ): string => {
    const cacheKey = `${pageId}:${elementId}:${kind}`;
    const cached = imagePathCache.get(cacheKey);
    if (cached) return cached;

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    const shortPage = pageId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'p';
    const shortId = elementId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'img';
    const filename = `${kind}-${shortPage}-${shortId}.${parsed.ext}`;
    const relativePath = `assets/images/${filename}`;
    imagePathCache.set(cacheKey, relativePath);
    imageFiles.set(relativePath, parsed.bytes);
    imageCount += 1;
    return relativePath;
  };

  const exportedPages: UIPage[] = pages.map((page) => ({
    ...page,
    name: page.name.trim() || '未命名画布',
    elements: cloneElementsForExport(page.elements).map((el) => {
      const next: UIElement = { ...el, style: { ...el.style } };
      if (next.src?.startsWith('data:')) {
        next.src = resolveImagePath(page.id, el.id, next.src, 'src');
      }
      if (next.style.backgroundImage?.startsWith('data:')) {
        next.style.backgroundImage = resolveImagePath(
          page.id,
          el.id,
          next.style.backgroundImage,
          'background'
        );
      }
      return next;
    }),
  }));

  imageFiles.forEach((bytes, path) => {
    root.file(path, bytes);
  });

  const exportTime = new Date().toISOString();
  const projectFile: UIEditorProjectFile = {
    format: UI_EDITOR_PROJECT_FORMAT,
    version: UI_EDITOR_PROJECT_VERSION,
    exportTime,
    activePageId,
    previewPageId,
    pages: exportedPages,
  };

  root.file('config/ui-editor.json', JSON.stringify(projectFile, null, 2));
  root.file('README.md', buildSaveReadme(exportedPages, exportTime));

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  downloadBlob(blob, filename);

  return {
    filename,
    imageCount,
    pageCount: exportedPages.length,
    pageNames: exportedPages.map((p) => p.name),
  };
}
