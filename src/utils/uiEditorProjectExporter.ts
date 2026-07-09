import JSZip from 'jszip';
import type { UIElement } from '@/types/uiEditor';
import { parseDataUrl } from '@/utils/uiExportCore';
import { useUIEditorStore } from '@/store/uiEditorStore';

export const UI_EDITOR_PROJECT_FORMAT = 'ui-editor-project';
export const UI_EDITOR_PROJECT_VERSION = '1.0.0';

export interface UIEditorProjectFile {
  format: string;
  version: string;
  exportTime: string;
  canvas: {
    width: number;
    height: number;
    background: string;
  };
  elements: UIElement[];
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

/** 保存可重新导入的 UI 编排项目包（ZIP） */
export async function saveUIEditorProject(): Promise<{ filename: string; imageCount: number }> {
  const { elements, canvasWidth, canvasHeight, canvasBackground } = useUIEditorStore.getState();

  const timestamp = Date.now();
  const folderName = `ui-editor-${timestamp}`;
  const zip = new JSZip();
  const root = zip.folder(folderName);
  if (!root) throw new Error('无法创建 ZIP 目录');

  const imageFiles = new Map<string, Uint8Array>();
  const imagePathCache = new Map<string, string>();
  let imageCount = 0;

  const resolveImagePath = (elementId: string, dataUrl: string, kind: 'src' | 'background'): string => {
    const cacheKey = `${elementId}:${kind}`;
    const cached = imagePathCache.get(cacheKey);
    if (cached) return cached;

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    const shortId = elementId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'img';
    const filename = `${kind}-${shortId}.${parsed.ext}`;
    const relativePath = `assets/images/${filename}`;
    imagePathCache.set(cacheKey, relativePath);
    imageFiles.set(relativePath, parsed.bytes);
    imageCount += 1;
    return relativePath;
  };

  const exportedElements = cloneElementsForExport(elements).map((el) => {
    const next: UIElement = { ...el, style: { ...el.style } };
    if (next.src?.startsWith('data:')) {
      next.src = resolveImagePath(el.id, next.src, 'src');
    }
    if (next.style.backgroundImage?.startsWith('data:')) {
      next.style.backgroundImage = resolveImagePath(el.id, next.style.backgroundImage, 'background');
    }
    return next;
  });

  imageFiles.forEach((bytes, path) => {
    root.file(path, bytes);
  });

  const projectFile: UIEditorProjectFile = {
    format: UI_EDITOR_PROJECT_FORMAT,
    version: UI_EDITOR_PROJECT_VERSION,
    exportTime: new Date().toISOString(),
    canvas: { width: canvasWidth, height: canvasHeight, background: canvasBackground },
    elements: exportedElements,
  };

  root.file('config/ui-editor.json', JSON.stringify(projectFile, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  downloadBlob(blob, filename);
  return { filename, imageCount };
}

