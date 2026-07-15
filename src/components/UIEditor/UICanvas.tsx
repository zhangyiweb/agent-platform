import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAbsolutePosition,
  getDeepestSelectedIds,
  getTopmostSelectedIds,
  useUIEditorStore,
} from '@/store/uiEditorStore';
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

  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [marqueeBox, setMarqueeBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const rootElements = getChildren(null);

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
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const currentZoom = useUIEditorStore.getState().zoom;
      setZoom(currentZoom + delta);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom,
      };
    },
    [zoom]
  );

  const handleFitZoom = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const padding = 80;
    const availW = scroll.clientWidth - padding;
    const availH = scroll.clientHeight - padding;
    const scale = Math.min(availW / canvasWidth, availH / canvasHeight);
    setZoom(Math.max(0.1, Math.min(3, scale)));
  }, [canvasWidth, canvasHeight, setZoom]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ui-canvas-inner')) {
      selectElement(null);
    }
  };

  const handleMarqueeMouseDown = (e: React.MouseEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.ui-element')) return;
    if (
      target !== e.currentTarget &&
      !target.classList.contains('ui-canvas-inner') &&
      !target.classList.contains('ui-canvas-grid')
    ) {
      return;
    }

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

      // 点击无拖动：清空选择
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

      // 去掉被框住的祖先，保留最深层多个目标，确保都能显示选中态
      setSelectedIds(getDeepestSelectedIds(hitIds, els));
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

      const dx = (ev.clientX - state.startX) / zoom;
      const dy = (ev.clientY - state.startY) / zoom;
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

      const dx = (ev.clientX - state.startX) / zoom;
      const dy = (ev.clientY - state.startY) / zoom;
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
        scale={zoom}
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
          <button type="button" className="ui-zoom-btn" onClick={() => setZoom(zoom - 0.1)} title="缩小">
            −
          </button>
          <span className="ui-zoom-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ui-zoom-btn" onClick={() => setZoom(zoom + 0.1)} title="放大">
            +
          </button>
          <button type="button" className="ui-zoom-fit-btn" onClick={handleFitZoom} title="适应窗口">
            适应
          </button>
        </div>
      </div>

      <div className="ui-canvas-scroll" ref={scrollRef}>
        <div className="ui-canvas-scroll-content">
          <div
            className={`ui-canvas-stage ${isDragOver ? 'drag-over' : ''}`}
            style={{
              width: canvasWidth * zoom,
              height: canvasHeight * zoom,
            }}
            onClick={handleCanvasClick}
            onMouseDown={handleMarqueeMouseDown}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => {
              setIsDragOver(false);
              setDropTargetId(null);
            }}
          >
            <div className="ui-canvas-frame">
              <div className="ui-canvas-frame-label">{canvasWidth} × {canvasHeight}</div>
              <div
                ref={canvasRef}
                className="ui-canvas-inner"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  backgroundColor: canvasBackground,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
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
