import JSZip from 'jszip';
import type { UIElement, UIPage } from '@/types/uiEditor';
import { parseDataUrl } from '@/utils/uiExportCore';
import { useUIEditorStore } from '@/store/uiEditorStore';

export const UI_EDITOR_PROJECT_FORMAT = 'ui-editor-project';
export const UI_EDITOR_PROJECT_VERSION = '2.0.0';

export interface UIEditorProjectFile {
  format: string;
  version: string;
  exportTime: string;
  activePageId?: string;
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

/** 保存可重新导入的 UI 编排项目包（ZIP，含多画布） */
export async function saveUIEditorProject(): Promise<{ filename: string; imageCount: number; pageCount: number }> {
  const pages = useUIEditorStore.getState().getPagesSnapshot();
  const activePageId = useUIEditorStore.getState().activePageId;

  const timestamp = Date.now();
  const folderName = `ui-editor-${timestamp}`;
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

  const projectFile: UIEditorProjectFile = {
    format: UI_EDITOR_PROJECT_FORMAT,
    version: UI_EDITOR_PROJECT_VERSION,
    exportTime: new Date().toISOString(),
    activePageId,
    pages: exportedPages,
  };

  root.file('config/ui-editor.json', JSON.stringify(projectFile, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  downloadBlob(blob, filename);
  return { filename, imageCount, pageCount: exportedPages.length };
}
