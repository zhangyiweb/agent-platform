import JSZip from 'jszip';
import type { UIElement, UIPage } from '@/types/uiEditor';
import { bytesToDataUrl } from '@/utils/uiExportCore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import type { UIEditorProjectFile } from '@/utils/uiEditorProjectExporter';
import { UI_EDITOR_PROJECT_FORMAT } from '@/utils/uiEditorProjectExporter';

export interface UIEditorImportResult {
  pageCount: number;
  pageNames: string[];
  elementCount: number;
}

function findUIEditorJsonPath(zip: JSZip): string | null {
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  const preferred = paths.find((p) => p.endsWith('config/ui-editor.json'));
  if (preferred) return preferred;
  const fallback = paths.find((p) => /(^|\/)ui-editor\.json$/i.test(p));
  return fallback ?? null;
}

function getZipRootPrefix(uiJsonPath: string): string {
  const idx = uiJsonPath.indexOf('config/ui-editor.json');
  return idx >= 0 ? uiJsonPath.slice(0, idx) : '';
}

function parseProjectConfig(raw: unknown): UIEditorProjectFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效的 UI 项目配置文件');
  }
  const config = raw as UIEditorProjectFile;
  if (config.format !== UI_EDITOR_PROJECT_FORMAT) {
    throw new Error('不是 UI 编排项目包（format 不匹配）');
  }
  const hasPages = Array.isArray(config.pages) && config.pages.length > 0;
  const hasLegacy = Boolean(config.canvas && Array.isArray(config.elements));
  if (!hasPages && !hasLegacy) {
    throw new Error('UI 项目配置缺少 pages 或 canvas/elements');
  }
  return config;
}

function extFromPath(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return 'png';
  const ext = m[1];
  if (ext === 'jpeg') return 'jpg';
  return ext;
}

async function loadImageDataUrlFromZip(
  zip: JSZip,
  rootPrefix: string,
  relativePath: string
): Promise<string | null> {
  const fullPath = `${rootPrefix}${relativePath}`.replace(/\/+/g, '/');
  const file = zip.file(fullPath) ?? zip.file(relativePath);
  if (!file) return null;
  const buffer = await file.async('uint8array');
  return bytesToDataUrl(buffer, extFromPath(relativePath));
}

function isRelativeAssetPath(value?: string): boolean {
  return Boolean(
    value && !value.startsWith('data:') && !value.startsWith('http') && !value.startsWith('blob:')
  );
}

async function resolveElementAssets(
  zip: JSZip,
  rootPrefix: string,
  el: UIElement
): Promise<UIElement> {
  const next: UIElement = { ...el, style: { ...el.style } };

  if (isRelativeAssetPath(next.src)) {
    const dataUrl = await loadImageDataUrlFromZip(zip, rootPrefix, next.src!);
    if (dataUrl) next.src = dataUrl;
  }

  const bg = next.style.backgroundImage;
  if (isRelativeAssetPath(bg)) {
    const dataUrl = await loadImageDataUrlFromZip(zip, rootPrefix, bg!);
    if (dataUrl) next.style.backgroundImage = dataUrl;
  }

  return next;
}

async function resolvePageAssets(zip: JSZip, rootPrefix: string, page: UIPage): Promise<UIPage> {
  const elements = await Promise.all(
    (page.elements || []).map((el) => resolveElementAssets(zip, rootPrefix, el))
  );
  return {
    ...page,
    name: page.name?.trim() || '未命名画布',
    canvasWidth: page.canvasWidth || 1920,
    canvasHeight: page.canvasHeight || 1080,
    canvasBackground: page.canvasBackground || '#0f1117',
    elements,
  };
}

function summarizePages(pages: UIPage[]): UIEditorImportResult {
  return {
    pageCount: pages.length,
    pageNames: pages.map((p) => p.name),
    elementCount: pages.reduce((sum, p) => sum + p.elements.length, 0),
  };
}

/** 从 ZIP UI 项目包导入（恢复多画布，兼容 v1 单画布） */
export async function importUIEditorProjectZip(file: File): Promise<UIEditorImportResult> {
  const zip = await JSZip.loadAsync(file);
  const uiJsonPath = findUIEditorJsonPath(zip);
  if (!uiJsonPath) {
    throw new Error('ZIP 中未找到 config/ui-editor.json，请选择「保存项目」生成的 UI 项目包');
  }
  const rootPrefix = getZipRootPrefix(uiJsonPath);
  const jsonText = await zip.file(uiJsonPath)!.async('text');
  const config = parseProjectConfig(JSON.parse(jsonText));

  if (config.pages && config.pages.length > 0) {
    const pages = await Promise.all(
      config.pages.map((page) => resolvePageAssets(zip, rootPrefix, page))
    );
    useUIEditorStore.getState().loadProject({
      pages,
      activePageId: config.activePageId,
    });
    return summarizePages(pages);
  }

  const elements = await Promise.all(
    (config.elements || []).map((el) => resolveElementAssets(zip, rootPrefix, el))
  );

  const legacyPage: UIPage = {
    id: 'page_imported',
    name: '页面 1',
    canvasWidth: config.canvas!.width,
    canvasHeight: config.canvas!.height,
    canvasBackground: config.canvas!.background,
    elements,
  };

  useUIEditorStore.getState().loadProject({
    pages: [legacyPage],
  });
  return summarizePages([legacyPage]);
}

/** 从独立 UI JSON 导入（仅恢复配置，图片保持原值） */
export async function importUIEditorProjectJson(file: File): Promise<UIEditorImportResult> {
  const text = await file.text();
  const config = parseProjectConfig(JSON.parse(text));

  if (config.pages && config.pages.length > 0) {
    const pages = config.pages.map((page) => ({
      ...page,
      name: page.name?.trim() || '未命名画布',
      elements: page.elements || [],
    }));
    useUIEditorStore.getState().loadProject({
      pages,
      activePageId: config.activePageId,
    });
    return summarizePages(pages);
  }

  const legacyPage: UIPage = {
    id: 'page_imported',
    name: '页面 1',
    canvasWidth: config.canvas!.width,
    canvasHeight: config.canvas!.height,
    canvasBackground: config.canvas!.background,
    elements: config.elements || [],
  };

  useUIEditorStore.getState().loadProject({
    pages: [legacyPage],
  });
  return summarizePages([legacyPage]);
}
