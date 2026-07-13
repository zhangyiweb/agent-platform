import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIEditorStore } from '@/store/uiEditorStore';
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

export function UICanvas() {
  const {
    elements,
    selectedId,
    canvasWidth,
    canvasHeight,
    canvasBackground,
    zoom,
    showGrid,
    pages,
    activePageId,
    addElement,
    selectElement,
    moveElement,
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

  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  const rootElements = getChildren(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        deleteElement(selectedId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, deleteElement]);

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
    setZoom(Math.max(0.1, Math.min(2, scale)));
  }, [canvasWidth, canvasHeight, setZoom]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ui-canvas-inner')) {
      selectElement(null);
    }
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
    const el = elements.find((item) => item.id === id);
    if (!el || el.locked) return;

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

    const onMouseMove = (ev: MouseEvent) => {
      const state = dragState.current;
      if (!state || state.type !== 'move') return;

      const dx = (ev.clientX - state.startX) / zoom;
      const dy = (ev.clientY - state.startY) / zoom;
      const proposedX = state.origX + dx;
      const proposedY = state.origY + dy;
      const currentElements = useUIEditorStore.getState().elements;
      const dragged = currentElements.find((item) => item.id === state.id);
      if (!dragged) return;

      const { width: parentW, height: parentH } = getParentBounds(
        dragged.parentId,
        currentElements,
        canvasWidth,
        canvasHeight
      );
      const snap = computeSnap(
        currentElements,
        state.id,
        proposedX,
        proposedY,
        dragged.width,
        dragged.height,
        dragged.parentId,
        parentW,
        parentH
      );
      setSnapGuides(snap.guides);
      moveElement(state.id, Math.round(snap.x), Math.round(snap.y));
    };

    const onMouseUp = (ev: MouseEvent) => {
      setSnapGuides([]);
      const state = dragState.current;
      if (state && state.type === 'move') {
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
    return (
      <UIElementView
        key={element.id}
        element={element}
        children={children}
        selected={selectedId === element.id}
        selectedId={selectedId}
        scale={zoom}
        onSelect={selectElement}
        onMoveStart={handleMoveStart}
        onResizeStart={handleResizeStart}
        renderChild={renderElement}
        isDropTarget={dropTargetId === element.id}
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
