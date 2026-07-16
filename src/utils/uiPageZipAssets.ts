import type { UIElement, UIPage } from '@/types/uiEditor';
import { bytesToDataUrl, parseDataUrl } from '@/utils/uiExportCore';
import type JSZip from 'jszip';

function cloneElementsForExport(elements: UIElement[]): UIElement[] {
  return elements.map((el) => ({
    ...el,
    style: { ...el.style },
    hoverStyle: el.hoverStyle ? { ...el.hoverStyle } : undefined,
    chartConfig: el.chartConfig ? { ...el.chartConfig } : undefined,
    actions: el.actions?.map((a) => ({
      ...a,
      targetIds: a.targetIds ? [...a.targetIds] : undefined,
      params: a.params ? { ...a.params } : undefined,
    })),
  }));
}

export function isRelativeAssetPath(value?: string): boolean {
  return Boolean(
    value &&
      !value.startsWith('data:') &&
      !value.startsWith('http') &&
      !value.startsWith('blob:')
  );
}

function extFromPath(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return 'png';
  const ext = m[1];
  if (ext === 'jpeg') return 'jpg';
  return ext;
}

/**
 * 将 UI 页面中的 dataURL 图片拆到 ZIP 文件，页面内改为相对路径。
 * @param assetDir 例如 assets/ui-pages
 */
export function packUiPagesForZip(
  pages: UIPage[],
  assetDir = 'assets/ui-pages'
): {
  pages: UIPage[];
  files: Array<{ path: string; data: Uint8Array }>;
  imageCount: number;
} {
  const files = new Map<string, Uint8Array>();
  const pathCache = new Map<string, string>();
  let imageCount = 0;
  const dir = assetDir.replace(/\/+$/, '');

  const resolveImagePath = (
    pageId: string,
    elementId: string,
    dataUrl: string,
    kind: 'src' | 'background'
  ): string => {
    const cacheKey = `${pageId}:${elementId}:${kind}:${dataUrl.slice(0, 64)}`;
    const cached = pathCache.get(cacheKey);
    if (cached) return cached;

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    const shortPage = pageId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'p';
    const shortId = elementId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'img';
    const filename = `${kind}-${shortPage}-${shortId}-${imageCount}.${parsed.ext}`;
    const relativePath = `${dir}/${filename}`;
    pathCache.set(cacheKey, relativePath);
    files.set(relativePath, parsed.bytes);
    imageCount += 1;
    return relativePath;
  };

  const exportedPages: UIPage[] = pages.map((page) => ({
    ...page,
    name: page.name.trim() || '未命名画布',
    elements: cloneElementsForExport(page.elements || []).map((el) => {
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

  return {
    pages: exportedPages,
    files: Array.from(files.entries()).map(([path, data]) => ({ path, data })),
    imageCount,
  };
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

/** 从 ZIP 把相对路径图片还原为 dataURL */
export async function resolveUiPagesFromZip(
  zip: JSZip,
  rootPrefix: string,
  pages: UIPage[]
): Promise<UIPage[]> {
  return Promise.all(
    pages.map(async (page) => {
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
    })
  );
}
