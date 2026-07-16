import type { SceneObject } from '@/types/scene';
import type { UIPage } from '@/types/uiEditor';
import type { UIBindingExportEntry } from '@/types/uiInteraction';
import {
  buildUIExportBundle,
  parseDataUrl,
  type UIExportContext,
} from '@/utils/uiExportCore';
import { collectUIBindings } from '@/utils/uiInteractionExport';
import { useUIEditorStore } from '@/store/uiEditorStore';

/** 部署包中标签引用的 UI 页预渲染数据 */
export interface ExportedLabelPagePack {
  pageId: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: string;
  bodyHtml: string;
  elementCss: string;
  hoverCss: string;
  bindings: UIBindingExportEntry[];
}

/** 收集标签引用的 UI 页面 id */
export function collectReferencedLabelPageIds(objects: SceneObject[]): string[] {
  const ids = new Set<string>();
  for (const obj of objects) {
    if (obj.type !== 'label') continue;
    if (obj.label?.contentMode === 'uiPage' && obj.label.uiPageId) {
      ids.add(obj.label.uiPageId);
    }
  }
  return [...ids];
}

export function countSceneLabels(objects: SceneObject[]): number {
  return objects.filter((o) => o.type === 'label').length;
}

/**
 * 为部署包构建标签页 HTML 包（图片抽到 assets/labels/）。
 * 仅处理被标签引用的页面，避免打包无关画布。
 */
export function buildLabelPagePacks(
  objects: SceneObject[],
  pages?: UIPage[]
): {
  packs: Record<string, ExportedLabelPagePack>;
  files: Array<{ path: string; data: Uint8Array }>;
} {
  const pageIds = collectReferencedLabelPageIds(objects);
  const packs: Record<string, ExportedLabelPagePack> = {};
  const files: Array<{ path: string; data: Uint8Array }> = [];

  if (pageIds.length === 0) {
    return { packs, files };
  }

  useUIEditorStore.getState().flushActivePage();

  let imageSeq = 0;
  for (const pageId of pageIds) {
    const page =
      pages?.find((p) => p.id === pageId) ??
      useUIEditorStore.getState().getPageSnapshot(pageId);
    if (!page) continue;

    const exportCtx: UIExportContext = {
      resolveImage: (elementId, dataUrl, kind) => {
        const parsed = parseDataUrl(dataUrl);
        if (!parsed) return dataUrl;
        imageSeq += 1;
        const filename = `${pageId}_${elementId}_${kind}_${imageSeq}.${parsed.ext}`;
        const path = `assets/labels/${filename}`;
        files.push({ path, data: parsed.bytes });
        return `./${path}`;
      },
    };

    const bundle = buildUIExportBundle(
      page.elements,
      page.canvasWidth,
      page.canvasHeight,
      page.canvasBackground,
      exportCtx,
      { includeHidden: true, sizeUnit: 'px' }
    );

    packs[pageId] = {
      pageId,
      name: page.name,
      canvasWidth: page.canvasWidth,
      canvasHeight: page.canvasHeight,
      canvasBackground: page.canvasBackground,
      bodyHtml: bundle.bodyHtml,
      elementCss: bundle.elementCss,
      hoverCss: bundle.hoverCss,
      bindings: collectUIBindings(page.elements),
    };
  }

  return { packs, files };
}
