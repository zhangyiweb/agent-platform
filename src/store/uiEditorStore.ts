import { create } from 'zustand';
import type { UIElement, UIElementStyle, UIElementType, UIPage } from '@/types/uiEditor';
import { UI_COMPONENT_DEFAULTS, canHaveChildren } from '@/types/uiEditor';

let idCounter = 0;
let pageCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `ui_${Date.now()}_${idCounter}`;
}

function generatePageId(): string {
  pageCounter += 1;
  return `page_${Date.now()}_${pageCounter}`;
}

export function createEmptyPage(name?: string): UIPage {
  const id = generatePageId();
  return {
    id,
    name: name ?? `页面 ${pageCounter}`,
    canvasWidth: 1920,
    canvasHeight: 1080,
    canvasBackground: '#0f1117',
    elements: [],
  };
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

function cloneElements(elements: UIElement[]): UIElement[] {
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

function pageFromActive(state: {
  activePageId: string;
  pages: UIPage[];
  elements: UIElement[];
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: string;
}): UIPage {
  const existing = state.pages.find((p) => p.id === state.activePageId);
  return {
    id: state.activePageId,
    name: existing?.name ?? '页面',
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    canvasBackground: state.canvasBackground,
    elements: state.elements,
  };
}

/** 将当前编辑态写回 pages，并可选切换到另一页 */
function flushAndOptionalSwitch(
  state: UIEditorState,
  nextPageId?: string
): Partial<UIEditorState> {
  const flushedPages = state.pages.map((p) =>
    p.id === state.activePageId ? pageFromActive(state) : p
  );
  if (!nextPageId || nextPageId === state.activePageId) {
    return { pages: flushedPages };
  }
  const next = flushedPages.find((p) => p.id === nextPageId);
  if (!next) return { pages: flushedPages };
  return {
    pages: flushedPages,
    activePageId: next.id,
    elements: cloneElements(next.elements),
    canvasWidth: next.canvasWidth,
    canvasHeight: next.canvasHeight,
    canvasBackground: next.canvasBackground,
    selectedId: null,
  };
}

interface UIEditorState {
  pages: UIPage[];
  activePageId: string;
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
  /** 新建空白画布并切换过去 */
  addPage: (name?: string) => string;
  /** 切换当前编辑的画布 */
  switchPage: (pageId: string) => void;
  /** 重命名画布 */
  renamePage: (pageId: string, name: string) => void;
  /** 删除画布（至少保留一页） */
  removePage: (pageId: string) => void;
  /** 复制当前或指定画布 */
  duplicatePage: (pageId?: string) => string;
  /** 获取已 flush 的全部页面快照（导出/保存用） */
  getPagesSnapshot: () => UIPage[];
  /** 载入 UI 项目（覆盖全部画布） */
  loadProject: (project: {
    pages?: UIPage[];
    canvasWidth?: number;
    canvasHeight?: number;
    canvasBackground?: string;
    elements?: UIElement[];
    activePageId?: string;
  }) => void;
  /** 当前 UI 项目是否有内容（用于打开项目前提示覆盖） */
  hasContent: () => boolean;
  getChildren: (parentId: string | null) => UIElement[];
  findContainerAtPoint: (x: number, y: number, excludeId?: string) => UIElement | null;
}

const initialPage = createEmptyPage('页面 1');

export const useUIEditorStore = create<UIEditorState & UIEditorActions>((set, get) => ({
  pages: [initialPage],
  activePageId: initialPage.id,
  elements: [],
  selectedId: null,
  canvasWidth: initialPage.canvasWidth,
  canvasHeight: initialPage.canvasHeight,
  canvasBackground: initialPage.canvasBackground,
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

    set((state) => {
      const nextElements = [...elements, element];
      return {
        elements: nextElements,
        selectedId: element.id,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });

    return element.id;
  },

  updateElement: (id, patch) => {
    set((state) => {
      const nextElements = state.elements.map((el) => (el.id === id ? { ...el, ...patch } : el));
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  updateElementStyle: (id, style) => {
    set((state) => {
      const nextElements = state.elements.map((el) =>
        el.id === id ? { ...el, style: { ...el.style, ...style } } : el
      );
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  updateElementHoverStyle: (id, style) => {
    set((state) => {
      const nextElements = state.elements.map((el) =>
        el.id === id ? { ...el, hoverStyle: { ...el.hoverStyle, ...style } } : el
      );
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  deleteElement: (id) => {
    set((state) => {
      const toDelete = new Set([id, ...collectDescendantIds(id, state.elements)]);
      const nextElements = state.elements.filter((el) => !toDelete.has(el.id));
      return {
        elements: nextElements,
        selectedId: state.selectedId && toDelete.has(state.selectedId) ? null : state.selectedId,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  duplicateElement: (id) => {
    const { elements } = get();
    const source = elements.find((el) => el.id === id);
    if (!source) return null;

    const idMap = new Map<string, string>();
    const toCopy = [
      source,
      ...collectDescendantIds(id, elements)
        .map((cid) => elements.find((e) => e.id === cid)!)
        .filter(Boolean),
    ];

    const newElements: UIElement[] = [];
    for (const el of toCopy) {
      idMap.set(el.id, generateId());
    }

    const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
    let zOffset = 0;

    for (const el of toCopy) {
      const newId = idMap.get(el.id)!;
      const newParentId =
        el.id === source.id
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
    set((state) => {
      const nextElements = [...elements, ...newElements];
      return {
        elements: nextElements,
        selectedId: rootCopy.id,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });

    return rootCopy.id;
  },

  selectElement: (id) => set({ selectedId: id }),

  moveElement: (id, x, y) => {
    set((state) => {
      const nextElements = state.elements.map((el) => (el.id === id ? { ...el, x, y } : el));
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  resizeElement: (id, width, height, x, y) => {
    set((state) => {
      const nextElements = state.elements.map((el) => {
        if (el.id !== id) return el;
        return {
          ...el,
          width: Math.max(10, width),
          height: Math.max(10, height),
          ...(x !== undefined ? { x } : {}),
          ...(y !== undefined ? { y } : {}),
        };
      });
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
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

    set((state) => {
      const nextElements = elements.map((el) =>
        el.id === id
          ? { ...el, parentId: newParentId, x: newX, y: newY, zIndex: maxZ + 1 }
          : el
      );
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
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
    set((state) => {
      const nextElements = elements.map((e) => {
        if (e.id === id) return { ...e, zIndex: next.zIndex };
        if (e.id === next.id) return { ...e, zIndex: el.zIndex };
        return e;
      });
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
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
    set((state) => {
      const nextElements = elements.map((e) => {
        if (e.id === id) return { ...e, zIndex: prev.zIndex };
        if (e.id === prev.id) return { ...e, zIndex: el.zIndex };
        return e;
      });
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  toggleVisible: (id) => {
    set((state) => {
      const nextElements = state.elements.map((el) =>
        el.id === id ? { ...el, visible: !el.visible } : el
      );
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  toggleLocked: (id) => {
    set((state) => {
      const nextElements = state.elements.map((el) =>
        el.id === id ? { ...el, locked: !el.locked } : el
      );
      return {
        elements: nextElements,
        pages: state.pages.map((p) =>
          p.id === state.activePageId ? { ...p, elements: nextElements } : p
        ),
      };
    });
  },

  setCanvasSize: (width, height) => {
    set((state) => ({
      canvasWidth: width,
      canvasHeight: height,
      pages: state.pages.map((p) =>
        p.id === state.activePageId ? { ...p, canvasWidth: width, canvasHeight: height } : p
      ),
    }));
  },

  setCanvasBackground: (color) => {
    set((state) => ({
      canvasBackground: color,
      pages: state.pages.map((p) =>
        p.id === state.activePageId ? { ...p, canvasBackground: color } : p
      ),
    }));
  },

  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.1, zoom)) }),

  toggleGrid: () => set({ showGrid: !get().showGrid }),

  clearCanvas: () => {
    set((state) => ({
      elements: [],
      selectedId: null,
      pages: state.pages.map((p) =>
        p.id === state.activePageId ? { ...p, elements: [] } : p
      ),
    }));
  },

  addPage: (name) => {
    const page = createEmptyPage(name);
    set((state) => {
      const flushed = flushAndOptionalSwitch(state);
      const pages = [...(flushed.pages ?? state.pages), page];
      return {
        ...flushed,
        pages,
        activePageId: page.id,
        elements: [],
        canvasWidth: page.canvasWidth,
        canvasHeight: page.canvasHeight,
        canvasBackground: page.canvasBackground,
        selectedId: null,
      };
    });
    return page.id;
  },

  switchPage: (pageId) => {
    set((state) => {
      if (pageId === state.activePageId) return state;
      return flushAndOptionalSwitch(state, pageId);
    });
  },

  renamePage: (pageId, name) => {
    set((state) => ({
      pages: state.pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
    }));
  },

  removePage: (pageId) => {
    set((state) => {
      if (state.pages.length <= 1) return state;
      const flushedPages = state.pages.map((p) =>
        p.id === state.activePageId ? pageFromActive(state) : p
      );
      const nextPages = flushedPages.filter((p) => p.id !== pageId);
      if (nextPages.length === flushedPages.length) return state;

      const switching = state.activePageId === pageId;
      const nextActive = switching ? nextPages[0] : nextPages.find((p) => p.id === state.activePageId)!;

      return {
        pages: nextPages,
        activePageId: nextActive.id,
        elements: switching ? cloneElements(nextActive.elements) : state.elements,
        canvasWidth: switching ? nextActive.canvasWidth : state.canvasWidth,
        canvasHeight: switching ? nextActive.canvasHeight : state.canvasHeight,
        canvasBackground: switching ? nextActive.canvasBackground : state.canvasBackground,
        selectedId: switching ? null : state.selectedId,
      };
    });
  },

  duplicatePage: (pageId) => {
    const state = get();
    const flushedPages = state.pages.map((p) =>
      p.id === state.activePageId ? pageFromActive(state) : p
    );
    const sourceId = pageId ?? state.activePageId;
    const source = flushedPages.find((p) => p.id === sourceId);
    if (!source) return '';

    const copy: UIPage = {
      ...source,
      id: generatePageId(),
      name: `${source.name} 副本`,
      elements: cloneElements(source.elements),
    };

    set({
      pages: [...flushedPages, copy],
      activePageId: copy.id,
      elements: cloneElements(copy.elements),
      canvasWidth: copy.canvasWidth,
      canvasHeight: copy.canvasHeight,
      canvasBackground: copy.canvasBackground,
      selectedId: null,
    });

    return copy.id;
  },

  getPagesSnapshot: () => {
    const state = get();
    return state.pages.map((p) =>
      p.id === state.activePageId
        ? {
            ...pageFromActive(state),
            elements: cloneElements(state.elements),
          }
        : {
            ...p,
            elements: cloneElements(p.elements),
          }
    );
  },

  loadProject: (project) => {
    let pages: UIPage[];

    if (project.pages && project.pages.length > 0) {
      pages = project.pages.map((p, index) => ({
        id: p.id || generatePageId(),
        name: p.name || `页面 ${index + 1}`,
        canvasWidth: p.canvasWidth || 1920,
        canvasHeight: p.canvasHeight || 1080,
        canvasBackground: p.canvasBackground || '#0f1117',
        elements: cloneElements(p.elements || []),
      }));
    } else {
      pages = [
        {
          id: generatePageId(),
          name: '页面 1',
          canvasWidth: project.canvasWidth ?? 1920,
          canvasHeight: project.canvasHeight ?? 1080,
          canvasBackground: project.canvasBackground ?? '#0f1117',
          elements: cloneElements(project.elements ?? []),
        },
      ];
    }

    const active =
      pages.find((p) => p.id === project.activePageId) ?? pages[0];

    set({
      pages,
      activePageId: active.id,
      elements: cloneElements(active.elements),
      canvasWidth: active.canvasWidth,
      canvasHeight: active.canvasHeight,
      canvasBackground: active.canvasBackground,
      selectedId: null,
    });
  },

  hasContent: () => {
    const pages = get().getPagesSnapshot();
    return pages.some((p) => p.elements.length > 0) || pages.length > 1;
  },
}));
