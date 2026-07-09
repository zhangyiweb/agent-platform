import { create } from 'zustand';
import type { UIElement, UIElementStyle, UIElementType } from '@/types/uiEditor';
import { UI_COMPONENT_DEFAULTS, canHaveChildren } from '@/types/uiEditor';

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `ui_${Date.now()}_${idCounter}`;
}

export function getAbsolutePosition(
  element: UIElement,
  elements: UIElement[]
): { x: number; y: number } {
  if (!element.parentId) {
    return { x: element.x, y: element.y };
  }
  const parent = elements.find((el) => el.id === element.parentId);
  if (!parent) {
    return { x: element.x, y: element.y };
  }
  const parentAbs = getAbsolutePosition(parent, elements);
  return { x: parentAbs.x + element.x, y: parentAbs.y + element.y };
}

function collectDescendantIds(id: string, elements: UIElement[]): string[] {
  const children = elements.filter((el) => el.parentId === id);
  return children.flatMap((child) => [child.id, ...collectDescendantIds(child.id, elements)]);
}

function isDescendantOf(
  ancestorId: string,
  descendantId: string,
  elements: UIElement[]
): boolean {
  return collectDescendantIds(ancestorId, elements).includes(descendantId);
}

interface UIEditorState {
  elements: UIElement[];
  selectedId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: string;
  zoom: number;
  showGrid: boolean;
}

interface UIEditorActions {
  addElement: (type: UIElementType, x?: number, y?: number, parentId?: string | null) => string;
  updateElement: (id: string, patch: Partial<UIElement>) => void;
  updateElementStyle: (id: string, style: Partial<UIElementStyle>) => void;
  updateElementHoverStyle: (id: string, style: Partial<UIElementStyle>) => void;
  deleteElement: (id: string) => void;
  duplicateElement: (id: string) => string | null;
  selectElement: (id: string | null) => void;
  moveElement: (id: string, x: number, y: number) => void;
  resizeElement: (id: string, width: number, height: number, x?: number, y?: number) => void;
  reparentElement: (id: string, newParentId: string | null) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  toggleVisible: (id: string) => void;
  toggleLocked: (id: string) => void;
  setCanvasSize: (width: number, height: number) => void;
  setCanvasBackground: (color: string) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  clearCanvas: () => void;
  /** 载入 UI 项目（覆盖当前画布） */
  loadProject: (project: {
    canvasWidth: number;
    canvasHeight: number;
    canvasBackground: string;
    elements: UIElement[];
  }) => void;
  /** 当前 UI 画布是否有内容（用于打开项目前提示覆盖） */
  hasContent: () => boolean;
  getChildren: (parentId: string | null) => UIElement[];
  findContainerAtPoint: (x: number, y: number, excludeId?: string) => UIElement | null;
}

export const useUIEditorStore = create<UIEditorState & UIEditorActions>((set, get) => ({
  elements: [],
  selectedId: null,
  canvasWidth: 1920,
  canvasHeight: 1080,
  canvasBackground: '#0f1117',
  zoom: 0.5,
  showGrid: true,

  getChildren: (parentId) => {
    return get()
      .elements.filter((el) => el.parentId === parentId)
      .sort((a, b) => a.zIndex - b.zIndex);
  },

  findContainerAtPoint: (x, y, excludeId) => {
    const { elements } = get();
    const candidates = elements
      .filter((el) => canHaveChildren(el.type) && el.visible && el.id !== excludeId)
      .sort((a, b) => b.zIndex - a.zIndex);

    for (const el of candidates) {
      const abs = getAbsolutePosition(el, elements);
      if (x >= abs.x && x <= abs.x + el.width && y >= abs.y && y <= abs.y + el.height) {
        return el;
      }
    }
    return null;
  },

  addElement: (type, x, y, parentId = null) => {
    const defaults = UI_COMPONENT_DEFAULTS[type];
    const { canvasWidth, canvasHeight, elements } = get();
    const siblings = elements.filter((el) => el.parentId === parentId);
    const maxZ = siblings.reduce((max, el) => Math.max(max, el.zIndex), 0);

    let posX = x ?? (canvasWidth - defaults.width) / 2;
    let posY = y ?? (canvasHeight - defaults.height) / 2;

    if (parentId) {
      const parent = elements.find((el) => el.id === parentId);
      if (parent) {
        const abs = getAbsolutePosition(parent, elements);
        if (x === undefined) posX = (parent.width - defaults.width) / 2;
        if (y === undefined) posY = (parent.height - defaults.height) / 2;
        if (x !== undefined) posX = x - abs.x;
        if (y !== undefined) posY = y - abs.y;
      }
    }

    const element: UIElement = {
      id: generateId(),
      name: `${defaults.name}${elements.filter((e) => e.type === type).length + 1}`,
      type,
      parentId,
      x: posX,
      y: posY,
      width: defaults.width,
      height: defaults.height,
      zIndex: maxZ + 1,
      visible: true,
      locked: false,
      content: defaults.content,
      style: { ...defaults.style },
      ...(defaults.chartConfig ? { chartConfig: { ...defaults.chartConfig } } : {}),
    };

    set({
      elements: [...elements, element],
      selectedId: element.id,
    });

    return element.id;
  },

  updateElement: (id, patch) => {
    set({
      elements: get().elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  },

  updateElementStyle: (id, style) => {
    set({
      elements: get().elements.map((el) =>
        el.id === id ? { ...el, style: { ...el.style, ...style } } : el
      ),
    });
  },

  updateElementHoverStyle: (id, style) => {
    set({
      elements: get().elements.map((el) =>
        el.id === id ? { ...el, hoverStyle: { ...el.hoverStyle, ...style } } : el
      ),
    });
  },

  deleteElement: (id) => {
    const { elements, selectedId } = get();
    const toDelete = new Set([id, ...collectDescendantIds(id, elements)]);
    set({
      elements: elements.filter((el) => !toDelete.has(el.id)),
      selectedId: selectedId && toDelete.has(selectedId) ? null : selectedId,
    });
  },

  duplicateElement: (id) => {
    const { elements } = get();
    const source = elements.find((el) => el.id === id);
    if (!source) return null;

    const idMap = new Map<string, string>();
    const toCopy = [source, ...collectDescendantIds(id, elements).map((cid) => elements.find((e) => e.id === cid)!).filter(Boolean)];

    const newElements: UIElement[] = [];
    for (const el of toCopy) {
      const newId = generateId();
      idMap.set(el.id, newId);
    }

    const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
    let zOffset = 0;

    for (const el of toCopy) {
      const newId = idMap.get(el.id)!;
      const newParentId = el.id === source.id
        ? el.parentId
        : el.parentId && idMap.has(el.parentId)
          ? idMap.get(el.parentId)!
          : null;

      newElements.push({
        ...el,
        id: newId,
        parentId: newParentId ?? null,
        name: el.id === source.id ? `${el.name} 副本` : el.name,
        x: el.id === source.id ? el.x + 20 : el.x,
        y: el.id === source.id ? el.y + 20 : el.y,
        zIndex: maxZ + 1 + zOffset,
        style: { ...el.style },
        domId: undefined,
      });
      zOffset += 1;
    }

    const rootCopy = newElements[0];
    set({
      elements: [...elements, ...newElements],
      selectedId: rootCopy.id,
    });

    return rootCopy.id;
  },

  selectElement: (id) => set({ selectedId: id }),

  moveElement: (id, x, y) => {
    set({
      elements: get().elements.map((el) => (el.id === id ? { ...el, x, y } : el)),
    });
  },

  resizeElement: (id, width, height, x, y) => {
    set({
      elements: get().elements.map((el) => {
        if (el.id !== id) return el;
        return {
          ...el,
          width: Math.max(10, width),
          height: Math.max(10, height),
          ...(x !== undefined ? { x } : {}),
          ...(y !== undefined ? { y } : {}),
        };
      }),
    });
  },

  reparentElement: (id, newParentId) => {
    const { elements } = get();
    const element = elements.find((el) => el.id === id);
    if (!element) return;

    if (newParentId === id) return;
    if (newParentId && isDescendantOf(id, newParentId, elements)) return;

    const abs = getAbsolutePosition(element, elements);

    let newX = abs.x;
    let newY = abs.y;

    if (newParentId) {
      const parent = elements.find((el) => el.id === newParentId);
      if (!parent || !canHaveChildren(parent.type)) return;
      const parentAbs = getAbsolutePosition(parent, elements);
      newX = abs.x - parentAbs.x;
      newY = abs.y - parentAbs.y;
    }

    const siblings = elements.filter((el) => el.parentId === newParentId && el.id !== id);
    const maxZ = siblings.reduce((max, el) => Math.max(max, el.zIndex), 0);

    set({
      elements: elements.map((el) =>
        el.id === id
          ? { ...el, parentId: newParentId, x: newX, y: newY, zIndex: maxZ + 1 }
          : el
      ),
    });
  },

  bringForward: (id) => {
    const { elements } = get();
    const el = elements.find((e) => e.id === id);
    if (!el) return;

    const siblings = elements
      .filter((e) => e.parentId === el.parentId)
      .sort((a, b) => a.zIndex - b.zIndex);
    const sIdx = siblings.findIndex((e) => e.id === id);
    if (sIdx < 0 || sIdx === siblings.length - 1) return;

    const next = siblings[sIdx + 1];
    set({
      elements: elements.map((e) => {
        if (e.id === id) return { ...e, zIndex: next.zIndex };
        if (e.id === next.id) return { ...e, zIndex: el.zIndex };
        return e;
      }),
    });
  },

  sendBackward: (id) => {
    const { elements } = get();
    const el = elements.find((e) => e.id === id);
    if (!el) return;

    const siblings = elements
      .filter((e) => e.parentId === el.parentId)
      .sort((a, b) => a.zIndex - b.zIndex);
    const sIdx = siblings.findIndex((e) => e.id === id);
    if (sIdx <= 0) return;

    const prev = siblings[sIdx - 1];
    set({
      elements: elements.map((e) => {
        if (e.id === id) return { ...e, zIndex: prev.zIndex };
        if (e.id === prev.id) return { ...e, zIndex: el.zIndex };
        return e;
      }),
    });
  },

  toggleVisible: (id) => {
    set({
      elements: get().elements.map((el) =>
        el.id === id ? { ...el, visible: !el.visible } : el
      ),
    });
  },

  toggleLocked: (id) => {
    set({
      elements: get().elements.map((el) =>
        el.id === id ? { ...el, locked: !el.locked } : el
      ),
    });
  },

  setCanvasSize: (width, height) => set({ canvasWidth: width, canvasHeight: height }),

  setCanvasBackground: (color) => set({ canvasBackground: color }),

  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.1, zoom)) }),

  toggleGrid: () => set({ showGrid: !get().showGrid }),

  clearCanvas: () => set({ elements: [], selectedId: null }),

  loadProject: (project) => {
    set({
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      canvasBackground: project.canvasBackground,
      elements: project.elements,
      selectedId: null,
    });
  },

  hasContent: () => {
    const { elements } = get();
    return elements.length > 0;
  },
}));
