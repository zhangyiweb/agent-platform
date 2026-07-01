import { create } from 'zustand';
import {
  type CameraTour,
  type CameraTourStop,
  createStopId,
  createTourId,
  DEFAULT_DWELL_TIME,
  DEFAULT_TRANSITION_TIME,
  DEFAULT_SPLINE_DURATION,
  type CameraTourMode,
} from '@/types/cameraTour';

interface TourStore {
  tours: CameraTour[];
  activeTourId: string | null;
  /** 编辑器内是否正在预览播放 */
  isPreviewPlaying: boolean;

  getActiveTour: () => CameraTour | null;
  setActiveTourId: (id: string | null) => void;
  addTour: (name?: string) => string;
  removeTour: (id: string) => void;
  renameTour: (id: string, name: string) => void;
  setTourLoop: (id: string, loop: boolean) => void;
  setTourMode: (id: string, mode: CameraTourMode) => void;
  setSplineDuration: (id: string, duration: number) => void;

  addStop: (tourId: string, stop: Omit<CameraTourStop, 'id'>) => void;
  updateStop: (tourId: string, stopId: string, updates: Partial<CameraTourStop>) => void;
  removeStop: (tourId: string, stopId: string) => void;
  moveStop: (tourId: string, stopId: string, direction: 'up' | 'down') => void;
  reorderStop: (tourId: string, fromIndex: number, toIndex: number) => void;

  setPreviewPlaying: (playing: boolean) => void;
  /** 若无路线则创建默认路线（原子操作，避免重复创建） */
  ensureDefaultTour: () => void;
  /** 清理重复 id 的路线（开发模式热重载偶发） */
  dedupeTours: () => void;
}

export const useTourStore = create<TourStore>((set, get) => ({
  tours: [],
  activeTourId: null,
  isPreviewPlaying: false,

  getActiveTour: () => {
    const { tours, activeTourId } = get();
    if (!activeTourId) return tours[0] ?? null;
    return tours.find((t) => t.id === activeTourId) ?? null;
  },

  setActiveTourId: (id) => set({ activeTourId: id }),

  addTour: (name) => {
    const id = createTourId();
    const tour: CameraTour = {
      id,
      name: name || `漫游路线 ${get().tours.length + 1}`,
      mode: 'stop',
      loop: false,
      splineDuration: DEFAULT_SPLINE_DURATION,
      stops: [],
    };
    set((state) => ({
      tours: [...state.tours, tour],
      activeTourId: id,
    }));
    return id;
  },

  removeTour: (id) =>
    set((state) => {
      if (state.tours.length <= 1) {
        const tour = state.tours.find((t) => t.id === id) ?? state.tours[0];
        if (!tour) return state;
        return {
          tours: [
            {
              ...tour,
              name: '默认漫游',
              mode: 'stop',
              loop: false,
              splineDuration: DEFAULT_SPLINE_DURATION,
              stops: [],
            },
          ],
          activeTourId: tour.id,
        };
      }
      const tours = state.tours.filter((t) => t.id !== id);
      const activeTourId =
        state.activeTourId === id ? (tours[0]?.id ?? null) : state.activeTourId;
      return { tours, activeTourId };
    }),

  renameTour: (id, name) =>
    set((state) => ({
      tours: state.tours.map((t) => (t.id === id ? { ...t, name } : t)),
    })),

  setTourLoop: (id, loop) =>
    set((state) => ({
      tours: state.tours.map((t) => (t.id === id ? { ...t, loop } : t)),
    })),

  setTourMode: (id, mode) =>
    set((state) => ({
      tours: state.tours.map((t) =>
        t.id === id
          ? {
              ...t,
              mode,
              splineDuration: t.splineDuration ?? DEFAULT_SPLINE_DURATION,
            }
          : t
      ),
    })),

  setSplineDuration: (id, duration) =>
    set((state) => ({
      tours: state.tours.map((t) =>
        t.id === id ? { ...t, splineDuration: Math.max(1, duration) } : t
      ),
    })),

  addStop: (tourId, stop) =>
    set((state) => ({
      tours: state.tours.map((t) =>
        t.id === tourId
          ? {
              ...t,
              stops: [...t.stops, { ...stop, id: createStopId() }],
            }
          : t
      ),
    })),

  updateStop: (tourId, stopId, updates) =>
    set((state) => ({
      tours: state.tours.map((t) =>
        t.id === tourId
          ? {
              ...t,
              stops: t.stops.map((s) => (s.id === stopId ? { ...s, ...updates } : s)),
            }
          : t
      ),
    })),

  removeStop: (tourId, stopId) =>
    set((state) => ({
      tours: state.tours.map((t) =>
        t.id === tourId ? { ...t, stops: t.stops.filter((s) => s.id !== stopId) } : t
      ),
    })),

  moveStop: (tourId, stopId, direction) =>
    set((state) => ({
      tours: state.tours.map((t) => {
        if (t.id !== tourId) return t;
        const idx = t.stops.findIndex((s) => s.id === stopId);
        if (idx < 0) return t;
        const next = [...t.stops];
        const swap = direction === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= next.length) return t;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        return { ...t, stops: next };
      }),
    })),

  reorderStop: (tourId, fromIndex, toIndex) =>
    set((state) => ({
      tours: state.tours.map((t) => {
        if (t.id !== tourId) return t;
        const stops = [...t.stops];
        if (
          fromIndex < 0 ||
          fromIndex >= stops.length ||
          toIndex < 0 ||
          toIndex >= stops.length ||
          fromIndex === toIndex
        ) {
          return t;
        }
        const [item] = stops.splice(fromIndex, 1);
        stops.splice(toIndex, 0, item);
        return { ...t, stops };
      }),
    })),

  setPreviewPlaying: (playing) => set({ isPreviewPlaying: playing }),

  ensureDefaultTour: () =>
    set((state) => {
      if (state.tours.length > 0) return state;
      const id = createTourId();
      return {
        tours: [
          {
            id,
            name: '默认漫游',
            mode: 'stop',
            loop: false,
            splineDuration: DEFAULT_SPLINE_DURATION,
            stops: [],
          },
        ],
        activeTourId: id,
      };
    }),

  dedupeTours: () =>
    set((state) => {
      const seen = new Set<string>();
      const tours = state.tours.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      if (tours.length === state.tours.length) return state;
      const activeTourId =
        state.activeTourId && tours.some((t) => t.id === state.activeTourId)
          ? state.activeTourId
          : tours[0]?.id ?? null;
      return { tours, activeTourId };
    }),
}));

export function createDefaultStopFields(
  partial: Pick<CameraTourStop, 'name' | 'type' | 'position' | 'target'> &
    Partial<Pick<CameraTourStop, 'objectId' | 'objectName' | 'dwellTime' | 'transitionTime'>>
): Omit<CameraTourStop, 'id'> {
  return {
    name: partial.name,
    type: partial.type,
    position: partial.position,
    target: partial.target,
    objectId: partial.objectId,
    objectName: partial.objectName,
    dwellTime: partial.dwellTime ?? DEFAULT_DWELL_TIME,
    transitionTime: partial.transitionTime ?? DEFAULT_TRANSITION_TIME,
  };
}
