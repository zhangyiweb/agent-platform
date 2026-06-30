import { create } from 'zustand';

export type ActionType =
  | 'move'
  | 'rotate'
  | 'scale'
  | 'add'
  | 'remove'
  | 'material'
  | 'light';

export interface TransformSnapshot {
  objectId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface HistoryEntry {
  id: string;
  type: ActionType;
  timestamp: number;
  description: string;
  before: TransformSnapshot;
  after: TransformSnapshot;
  objectId?: string;
}

interface HistoryState {
  history: HistoryEntry[];
  currentIndex: number;
  maxHistory: number;
}

interface HistoryActions {
  push: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const initialState: HistoryState = {
  history: [],
  currentIndex: -1,
  maxHistory: 50,
};

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  ...initialState,

  push: (entry) =>
    set((state) => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
      };

      const newHistory = state.history.slice(0, state.currentIndex + 1);
      newHistory.push(newEntry);

      if (newHistory.length > state.maxHistory) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        currentIndex: newHistory.length - 1,
      };
    }),

  undo: () => {
    const state = get();
    if (!state.canUndo()) return null;

    const entry = state.history[state.currentIndex];
    set({ currentIndex: state.currentIndex - 1 });
    return entry;
  },

  redo: () => {
    const state = get();
    if (!state.canRedo()) return null;

    const newIndex = state.currentIndex + 1;
    const entry = state.history[newIndex];
    set({ currentIndex: newIndex });
    return entry;
  },

  clear: () => set(initialState),

  canUndo: () => get().currentIndex >= 0,

  canRedo: () => get().currentIndex < get().history.length - 1,
}));
