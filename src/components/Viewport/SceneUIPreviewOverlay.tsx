import { useEffect, useRef, useState } from 'react';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { buildUIExportBundle, buildUIStyleCss } from '@/utils/uiExportCore';
import { buildUIOverlayExtraCss, collectUIBindings } from '@/utils/uiInteractionExport';
import { dispatchUIActions, ensureEditorSceneApi, clearPreviewUIVisibility } from '@/runtime/sceneApi';
import { getElementDomId } from '@/utils/uiElementDom';
import type { UIElement } from '@/types/uiEditor';

/**
 * 联动预览：UI 叠在 3D 上。
 * 展示「预览画布」下拉所选页面（默认第一页），与当前编辑页可不同。
 * 大图 base64 不走 CSS 字符串（会卡主线程），改为挂载后写 inline style。
 */
export function SceneUIPreviewOverlay() {
  const hostRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const [ready, setReady] = useState(false);

  const previewPageId = useUIEditorStore((s) => s.previewPageId);
  const pages = useUIEditorStore((s) => s.pages);
  const elements = useUIEditorStore((s) => s.elements);
  const activePageId = useUIEditorStore((s) => s.activePageId);
  const canvasWidth = useUIEditorStore((s) => s.canvasWidth);
  const canvasHeight = useUIEditorStore((s) => s.canvasHeight);

  useEffect(() => {
    ensureEditorSceneApi();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    const timer = window.setTimeout(() => {
      if (cancelled || !hostRef.current) return;

      const snap = useUIEditorStore.getState().getPagesSnapshot();
      const page =
        snap.find((p) => p.id === previewPageId) ??
        snap[0] ??
        null;
      if (!page) return;

      const pageElements = page.elements;
      const pageWidth = page.canvasWidth;
      const pageHeight = page.canvasHeight;

      const elementsForCss = stripDataUrlBackgrounds(pageElements);
      const bundle = buildUIExportBundle(
        elementsForCss,
        pageWidth,
        pageHeight,
        'transparent',
        undefined,
        { includeHidden: true }
      );

      const cssText =
        buildUIStyleCss(bundle, { external: false }) + '\n' + buildUIOverlayExtraCss();

      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-ui-preview-style', '1');
      styleEl.textContent = cssText;
      document.head.appendChild(styleEl);
      styleRef.current = styleEl;

      const host = hostRef.current;
      host.innerHTML = bundle.bodyHtml;
      host.dataset.designWidth = String(pageWidth);
      host.dataset.designHeight = String(pageHeight);
      applyInlineAssets(host, pageElements);

      const bindings = collectUIBindings(pageElements);
      const cleanups: Array<() => void> = [];

      bindings.forEach((entry) => {
        const el = host.querySelector(`#${CSS.escape(entry.domId)}`) as HTMLElement | null;
        if (!el) return;
        el.classList.add('ui-interactive');

        const byTrigger = new Map<string, typeof entry.actions>();
        (entry.actions || []).forEach((action) => {
          const trigger = action.trigger || 'click';
          const list = byTrigger.get(trigger) ?? [];
          list.push(action);
          byTrigger.set(trigger, list);
        });

        byTrigger.forEach((actions, trigger) => {
          const handler = (ev: Event) => {
            if (trigger === 'click' || trigger === 'dblclick') {
              ev.preventDefault();
            }
            ev.stopPropagation();
            dispatchUIActions(actions);
          };
          el.addEventListener(trigger, handler);
          cleanups.push(() => el.removeEventListener(trigger, handler));
        });
      });

      setReady(true);

      (host as HTMLElement & { __previewCleanups?: Array<() => void> }).__previewCleanups =
        cleanups;
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      clearPreviewUIVisibility();
      const host = hostRef.current as
        | (HTMLElement & { __previewCleanups?: Array<() => void> })
        | null;
      host?.__previewCleanups?.forEach((fn) => fn());
      if (host) {
        host.__previewCleanups = undefined;
        host.innerHTML = '';
      }
      styleRef.current?.remove();
      styleRef.current = null;
    };
  }, [
    previewPageId,
    pages,
    elements,
    activePageId,
    canvasWidth,
    canvasHeight,
  ]);

  return (
    <div
      ref={hostRef}
      id="ui-overlay"
      className="ui-page"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 12,
        pointerEvents: 'none',
        background: 'transparent',
        overflow: 'hidden',
        opacity: ready ? 1 : 0,
      }}
    />
  );
}

function stripDataUrlBackgrounds(elements: UIElement[]): UIElement[] {
  return elements.map((el) => {
    const bg = el.style.backgroundImage;
    const src = el.src;
    const nextStyle = { ...el.style };
    if (bg?.startsWith('data:')) {
      delete nextStyle.backgroundImage;
    }
    return {
      ...el,
      src: src?.startsWith('data:') ? undefined : src,
      style: nextStyle,
    };
  });
}

function applyInlineAssets(host: HTMLElement, elements: UIElement[]) {
  elements.forEach((el) => {
    const domId = getElementDomId(el);
    const node = host.querySelector(`#${CSS.escape(domId)}`) as HTMLElement | null;
    if (!node) return;

    const bg = el.style.backgroundImage;
    if (bg?.startsWith('data:')) {
      node.style.backgroundImage = `url("${bg.replace(/"/g, '%22')}")`;
      node.style.backgroundSize = el.style.backgroundSize || 'cover';
      node.style.backgroundPosition = el.style.backgroundPosition || 'center';
      node.style.backgroundRepeat = el.style.backgroundRepeat || 'no-repeat';
    }

    if (el.type === 'image' && el.src?.startsWith('data:')) {
      const img = node.querySelector('img') as HTMLImageElement | null;
      if (img) {
        img.src = el.src;
      } else {
        const created = document.createElement('img');
        created.src = el.src;
        created.alt = el.name;
        created.style.width = '100%';
        created.style.height = '100%';
        created.style.objectFit = el.style.objectFit || 'cover';
        created.style.display = 'block';
        node.appendChild(created);
      }
    }
  });
}
