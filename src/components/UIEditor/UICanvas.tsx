import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAbsolutePosition,
  getDeepestSelectedIds,
  getTopmostSelectedIds,
  useUIEditorStore,
} from '@/store/uiEditorStore';
import { useEditorStore } from '@/store/editorStore';
import type { UIElement, UIElementType } from '@/types/uiEditor';
import {
  computeSnap,
  getParentBounds,
  type SnapGuide,
} from '@/utils/uiSnapGuides';
import { UIElementView, type ResizeHandle } from './UIElementView';

const DRAG_TYPE = 'application/ui-component';
const LAYER_DRAG_TYPE = 'application/ui-layer';

export { DRAG_TYPE, LAYER_DRAG_TYPE };

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function UICanvas() {
  const {
    elements,
    selectedId,
    selectedIds,
    canvasWidth,
    canvasHeight,
    canvasBackground,
    zoom,
    showGrid,
    pages,
    activePageId,
    addElement,
    selectElement,
    setSelectedIds,
    copySelectedElements,
    pasteClipboardElements,
    moveElements,
    resizeElement,
    reparentElement,
    updateElement,
    deleteElement,
    setZoom,
    getChildren,
    findContainerAtPoint,
    addPage,
    switchPage,
    removePage,
  } = useUIEditorStore();
  const editorMode = useEditorStore((s) => s.editorMode);

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    type: 'move' | 'resize';
    id: string;
    handle?: ResizeHandle;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewFlushRaf = useRef(0);
  const panDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
    moved: boolean;
  } | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [marqueeBox, setMarqueeBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  /** 本地视口状态：缩放与平移同帧更新，避免抖动 */
  const [view, setView] = useState({ zoom, panX: 0, panY: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const rootElements = getChildren(null);

  const applyView = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }, commit = true) => {
      const z = Math.min(3, Math.max(0.1, nextZoom));
      const p = {
        x: Math.round(nextPan.x),
        y: Math.round(nextPan.y),
      };
      zoomRef.current = z;
      panRef.current = p;
      if (stageRef.current) {
        stageRef.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
      }

      const flush = () => {
        setView({ zoom: zoomRef.current, panX: panRef.current.x, panY: panRef.current.y });
        if (Math.abs(useUIEditorStore.getState().zoom - zoomRef.current) > 1e-4) {
          setZoom(zoomRef.current);
        }
      };

      if (!commit) {
        // 滚轮/拖拽：先改 DOM，每帧最多同步一次 React，避免卡顿抖动
        if (!viewFlushRaf.current) {
          viewFlushRaf.current = requestAnimationFrame(() => {
            viewFlushRaf.current = 0;
            flush();
          });
        }
        return;
      }

      if (viewFlushRaf.current) {
        cancelAnimationFrame(viewFlushRaf.current);
        viewFlushRaf.current = 0;
      }
      flush();
    },
    [setZoom]
  );

  /** 以视口中心为基准缩放，缩放与平移一次算完 */
  const setZoomAtViewportCenter = useCallback(
    (nextZoom: number) => {
      const world = scrollRef.current;
      const oldZoom = zoomRef.current;
      const clamped = Math.min(3, Math.max(0.1, nextZoom));
      if (Math.abs(clamped - oldZoom) < 1e-4) return;
      if (!world) {
        applyView(clamped, panRef.current);
        return;
      }

      const rect = world.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const canvasX = (cx - panRef.current.x) / oldZoom;
      const canvasY = (cy - panRef.current.y) / oldZoom;
      applyView(clamped, {
        x: cx - canvasX * clamped,
        y: cy - canvasY * clamped,
      });
    },
    [applyView]
  );

  /** 画布居中并适应视口 */
  const centerCanvasInViewport = useCallback(
    (nextZoom?: number) => {
      const world = scrollRef.current;
      if (!world) return;
      // 面板隐藏时宽高为 0，此时适应会算成 10%，必须跳过
      if (world.clientWidth < 40 || world.clientHeight < 40) return;
      const z =
        nextZoom ??
        Math.max(
          0.1,
          Math.min(
            3,
            Math.min(
              (world.clientWidth - 80) / canvasWidth,
              (world.clientHeight - 80) / canvasHeight
            )
          )
        );
      applyView(z, {
        x: (world.clientWidth - canvasWidth * z) / 2,
        y: (world.clientHeight - canvasHeight * z) / 2,
      });
    },
    [canvasWidth, canvasHeight, applyView]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copySelectedElements();
        return;
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteClipboardElements();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedIds.length > 0 || selectedId)) {
        e.preventDefault();
        const ids =
          selectedIds.length > 0 ? [...selectedIds] : selectedId ? [selectedId] : [];
        ids.forEach((id) => deleteElement(id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, deleteElement, copySelectedElements, pasteClipboardElements]);

  useEffect(() => {
    const world = scrollRef.current;
    if (!world) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const oldZoom = zoomRef.current;
      // 指数缩放更顺滑；限制单次步进，避免跳变
      const factor = Math.exp(-e.deltaY * 0.0012);
      const clamped = Math.min(3, Math.max(0.1, oldZoom * factor));
      if (Math.abs(clamped - oldZoom) < 1e-4) return;

      const rect = world.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const canvasX = (cx - panRef.current.x) / oldZoom;
      const canvasY = (cy - panRef.current.y) / oldZoom;
      applyView(clamped, {
        x: cx - canvasX * clamped,
        y: cy - canvasY * clamped,
      }, false);
    };

    world.addEventListener('wheel', onWheel, { passive: false });
    return () => world.removeEventListener('wheel', onWheel);
  }, [applyView]);

  // 进入 UI 编排 / 切页 / 改画布尺寸后：布局完成再适应屏幕并居中
  useEffect(() => {
    if (editorMode !== 'ui') return;
    const world = scrollRef.current;
    if (!world) return;

    let cancelled = false;
    let fitted = false;

    const tryFit = () => {
      if (cancelled || fitted) return;
      if (world.clientWidth < 40 || world.clientHeight < 40) return;
      centerCanvasInViewport();
      fitted = true;
    };

    // 隐藏 → 显示后需等浏览器完成 reflow
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(tryFit);
    });
    const timer = window.setTimeout(tryFit, 80);

    // 若首帧仍无尺寸，等容器真正显示后再适应一次
    const ro = new ResizeObserver(() => {
      tryFit();
      if (fitted) ro.disconnect();
    });
    ro.observe(world);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [editorMode, activePageId, canvasWidth, canvasHeight, centerCanvasInViewport]);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const world = scrollRef.current;
      if (!world) return { x: 0, y: 0 };
      const rect = world.getBoundingClientRect();
      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;
      return {
        x: (clientX - rect.left - currentPan.x) / currentZoom,
        y: (clientY - rect.top - currentPan.y) / currentZoom,
      };
    },
    []
  );

  const handleFitZoom = useCallback(() => {
    centerCanvasInViewport();
  }, [centerCanvasInViewport]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    if (panDragRef.current?.moved) return;
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ui-canvas-inner')) {
      selectElement(null);
    }
  };

  const handleWorldMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;

    // Ctrl + 左键：框选
    if (e.ctrlKey || e.metaKey) {
      if (target.closest('.ui-element')) return;

      e.preventDefault();
      e.stopPropagation();

      const start = getCanvasPoint(e.clientX, e.clientY);
      marqueeRef.current = {
        startX: start.x,
        startY: start.y,
        currentX: start.x,
        currentY: start.y,
      };
      setMarqueeBox({ x: start.x, y: start.y, w: 0, h: 0 });

      const onMouseMove = (ev: MouseEvent) => {
        if (!marqueeRef.current) return;
        const point = getCanvasPoint(ev.clientX, ev.clientY);
        marqueeRef.current.currentX = point.x;
        marqueeRef.current.currentY = point.y;
        const x = Math.min(marqueeRef.current.startX, point.x);
        const y = Math.min(marqueeRef.current.startY, point.y);
        const w = Math.abs(point.x - marqueeRef.current.startX);
        const h = Math.abs(point.y - marqueeRef.current.startY);
        setMarqueeBox({ x, y, w, h });
      };

      const onMouseUp = () => {
        const box = marqueeRef.current;
        marqueeRef.current = null;
        setMarqueeBox(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (!box) return;
        const x = Math.min(box.startX, box.currentX);
        const y = Math.min(box.startY, box.currentY);
        const w = Math.abs(box.currentX - box.startX);
        const h = Math.abs(box.currentY - box.startY);

        if (w < 2 && h < 2) {
          selectElement(null);
          return;
        }

        const selectionRect = { x, y, w, h };
        const { elements: els } = useUIEditorStore.getState();
        const hitIds = els
          .filter((el) => el.visible !== false)
          .filter((el) => {
            const abs = getAbsolutePosition(el, els);
            return rectsIntersect(selectionRect, {
              x: abs.x,
              y: abs.y,
              w: el.width,
              h: el.height,
            });
          })
          .map((el) => el.id);

        setSelectedIds(getDeepestSelectedIds(hitIds, els));
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return;
    }

    // 左键拖空白区域：平移画布（元素本身会 stopPropagation）
    if (target.closest('.ui-element')) return;

    e.preventDefault();
    panDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: panRef.current.x,
      origPanY: panRef.current.y,
      moved: false,
    };
    setIsPanning(true);

    const onMouseMove = (ev: MouseEvent) => {
      const drag = panDragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startClientX;
      const dy = ev.clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      applyView(zoomRef.current, {
        x: drag.origPanX + dx,
        y: drag.origPanY + dy,
      }, false);
    };

    const onMouseUp = () => {
      const drag = panDragRef.current;
      // 保留 moved 标记给随后 click 判断；下一帧清掉
      window.setTimeout(() => {
        panDragRef.current = null;
      }, 0);
      setIsPanning(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (drag && !drag.moved) {
        // 纯点击空白：取消选中
        selectElement(null);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDropTargetId(null);

    const layerId = e.dataTransfer.getData(LAYER_DRAG_TYPE);
    if (layerId) {
      const point = getCanvasPoint(e.clientX, e.clientY);
      const container = findContainerAtPoint(point.x, point.y, layerId);
      reparentElement(layerId, container?.id ?? null);
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const point = getCanvasPoint(e.clientX, e.clientY);
          const container = findContainerAtPoint(point.x, point.y);
          const id = addElement('image', point.x, point.y, container?.id ?? null);
          updateElement(id, { src: reader.result, name: files[0].name.replace(/\.[^.]+$/, '') });
        }
      };
      reader.readAsDataURL(files[0]);
      return;
    }

    const type = e.dataTransfer.getData(DRAG_TYPE) as UIElementType;
    if (!type) return;

    const point = getCanvasPoint(e.clientX, e.clientY);
    const container = findContainerAtPoint(point.x, point.y);

    if (type === 'echart') {
      const preset = e.dataTransfer.getData('application/ui-echart-preset') || 'line';
      const id = addElement('echart', point.x, point.y, container?.id ?? null);
      updateElement(id, { content: preset });
      return;
    }

    addElement(type, point.x, point.y, container?.id ?? null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);

    const point = getCanvasPoint(e.clientX, e.clientY);
    const container = findContainerAtPoint(point.x, point.y);
    setDropTargetId(container?.id ?? null);
  };

  const handleMoveStart = (id: string, e: React.MouseEvent) => {
    const store = useUIEditorStore.getState();
    const el = store.elements.find((item) => item.id === id);
    if (!el || el.locked) return;

    // 已在多选中：保持多选；否则单选该元素
    let ids = store.selectedIds.includes(id)
      ? [...store.selectedIds]
      : [id];
    if (!store.selectedIds.includes(id)) {
      selectElement(id);
      ids = [id];
    }

    // 顶层一起拖，避免父子同时位移叠加速度
    const moveIds = getTopmostSelectedIds(ids, store.elements).filter((mid) => {
      const item = store.elements.find((x) => x.id === mid);
      return item && !item.locked;
    });
    if (moveIds.length === 0) return;

    const origins = new Map<string, { x: number; y: number }>();
    moveIds.forEach((mid) => {
      const item = store.elements.find((x) => x.id === mid)!;
      origins.set(mid, { x: item.x, y: item.y });
    });

    dragState.current = {
      type: 'move',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
    };

    let moved = false;

    const onMouseMove = (ev: MouseEvent) => {
      const state = dragState.current;
      if (!state || state.type !== 'move') return;

      const dx = (ev.clientX - state.startX) / zoomRef.current;
      const dy = (ev.clientY - state.startY) / zoomRef.current;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;

      const currentElements = useUIEditorStore.getState().elements;
      const primary = currentElements.find((item) => item.id === state.id);
      if (!primary) return;

      // 仅对「拖拽主元素」吸附；其他选中项跟同样的位移
      const primaryOrig = origins.get(state.id) ?? { x: state.origX, y: state.origY };
      const proposedX = primaryOrig.x + dx;
      const proposedY = primaryOrig.y + dy;
      const { width: parentW, height: parentH } = getParentBounds(
        primary.parentId,
        currentElements,
        canvasWidth,
        canvasHeight
      );
      const snap = computeSnap(
        currentElements,
        state.id,
        proposedX,
        proposedY,
        primary.width,
        primary.height,
        primary.parentId,
        parentW,
        parentH
      );
      setSnapGuides(snap.guides);

      const snappedDx = snap.x - primaryOrig.x;
      const snappedDy = snap.y - primaryOrig.y;

      const updates = moveIds.map((mid) => {
        const orig = origins.get(mid)!;
        return {
          id: mid,
          x: Math.round(orig.x + snappedDx),
          y: Math.round(orig.y + snappedDy),
        };
      });
      moveElements(updates);
    };

    const onMouseUp = (ev: MouseEvent) => {
      setSnapGuides([]);
      const state = dragState.current;
      // 多选时不自动改父级，避免把一组拆散；单选才允许落点挂载
      if (moved && state && state.type === 'move' && moveIds.length === 1) {
        const elNow = useUIEditorStore.getState().elements.find((item) => item.id === state.id);
        if (elNow) {
          const point = getCanvasPoint(ev.clientX, ev.clientY);
          const container = findContainerAtPoint(point.x, point.y, state.id);
          const currentParent = elNow.parentId;
          const newParentId = container?.id ?? null;
          if (newParentId !== currentParent) {
            reparentElement(state.id, newParentId);
          }
        }
      }
      dragState.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResizeStart = (id: string, handle: ResizeHandle, e: React.MouseEvent) => {
    const el = elements.find((item) => item.id === id);
    if (!el || el.locked) return;

    dragState.current = {
      type: 'resize',
      id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
    };

    const onMouseMove = (ev: MouseEvent) => {
      const state = dragState.current;
      if (!state || state.type !== 'resize' || !state.handle) return;

      const dx = (ev.clientX - state.startX) / zoomRef.current;
      const dy = (ev.clientY - state.startY) / zoomRef.current;
      const { handle: h } = state;

      let newX = state.origX;
      let newY = state.origY;
      let newW = state.origW;
      let newH = state.origH;

      if (h.includes('e')) newW = state.origW + dx;
      if (h.includes('w')) {
        newW = state.origW - dx;
        newX = state.origX + dx;
      }
      if (h.includes('s')) newH = state.origH + dy;
      if (h.includes('n')) {
        newH = state.origH - dy;
        newY = state.origY + dy;
      }

      if (newW < 10) {
        if (h.includes('w')) newX = state.origX + state.origW - 10;
        newW = 10;
      }
      if (newH < 10) {
        if (h.includes('n')) newY = state.origY + state.origH - 10;
        newH = 10;
      }

      resizeElement(state.id, Math.round(newW), Math.round(newH), Math.round(newX), Math.round(newY));
    };

    const onMouseUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const renderElement = (element: UIElement): React.ReactNode => {
    const children = getChildren(element.id);
    const isSelected = selectedIds.includes(element.id) || selectedId === element.id;
    const isMultiSelect = selectedIds.length > 1;
    return (
      <UIElementView
        key={element.id}
        element={element}
        children={children}
        selected={isSelected}
        primarySelected={selectedId === element.id}
        selectedId={selectedId}
        scale={view.zoom}
        onSelect={selectElement}
        onMoveStart={handleMoveStart}
        onResizeStart={handleResizeStart}
        renderChild={renderElement}
        isDropTarget={dropTargetId === element.id}
        keepMultiSelectOnDrag
        multiSelect={isMultiSelect}
      />
    );
  };

  return (
    <div className="ui-canvas-viewport" ref={viewportRef}>
      <div className="ui-canvas-toolbar">
        <div className="ui-canvas-toolbar-left">
          <div className="ui-page-tabs">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={`ui-page-tab ${page.id === activePageId ? 'active' : ''}`}
                onClick={() => switchPage(page.id)}
                title={page.name}
              >
                <span className="ui-page-tab-name">{page.name}</span>
                {pages.length > 1 && (
                  <span
                    className="ui-page-tab-close"
                    role="button"
                    tabIndex={0}
                    title="删除画布"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`确定删除「${page.name}」？`)) {
                        removePage(page.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        if (window.confirm(`确定删除「${page.name}」？`)) {
                          removePage(page.id);
                        }
                      }
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ui-page-add-btn"
            onClick={() => addPage()}
            title="新建画布"
          >
            + 新建画布
          </button>
          <span className="ui-canvas-info">
            {canvasWidth} × {canvasHeight}
          </span>
        </div>
        <div className="ui-canvas-zoom">
          <button
            type="button"
            className="ui-zoom-btn"
            onClick={() => setZoomAtViewportCenter(view.zoom - 0.1)}
            title="缩小"
          >
            −
          </button>
          <span className="ui-zoom-label">{Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            className="ui-zoom-btn"
            onClick={() => setZoomAtViewportCenter(view.zoom + 0.1)}
            title="放大"
          >
            +
          </button>
          <button type="button" className="ui-zoom-fit-btn" onClick={handleFitZoom} title="适应窗口">
            适应
          </button>
        </div>
      </div>

      <div
        className={`ui-canvas-scroll ${isPanning ? 'is-panning' : ''}`}
        ref={scrollRef}
        onMouseDown={handleWorldMouseDown}
      >
        <div className="ui-canvas-scroll-content">
          <div
            ref={stageRef}
            className={`ui-canvas-stage ${isDragOver ? 'drag-over' : ''}`}
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            }}
            onClick={handleCanvasClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => {
              setIsDragOver(false);
              setDropTargetId(null);
            }}
          >
            <div className="ui-canvas-frame">
              <div
                ref={canvasRef}
                className="ui-canvas-inner"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  backgroundColor: canvasBackground,
                }}
              >
                {showGrid && <div className="ui-canvas-grid" aria-hidden />}
                {rootElements.map((el) => renderElement(el))}
                {marqueeBox && (
                  <div
                    className="ui-marquee"
                    style={{
                      left: marqueeBox.x,
                      top: marqueeBox.y,
                      width: marqueeBox.w,
                      height: marqueeBox.h,
                    }}
                  />
                )}
                {snapGuides.length > 0 && (
                  <div className="ui-snap-guides" aria-hidden>
                    {snapGuides.map((guide, i) =>
                      guide.orientation === 'vertical' ? (
                        <div
                          key={`v-${i}`}
                          className="ui-snap-guide ui-snap-guide--vertical"
                          style={{ left: guide.position }}
                        />
                      ) : (
                        <div
                          key={`h-${i}`}
                          className="ui-snap-guide ui-snap-guide--horizontal"
                          style={{ top: guide.position }}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
