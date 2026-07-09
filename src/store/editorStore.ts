import { create } from 'zustand';
import type { EditorMode, EditorState, EditorTool } from '@/types/scene';

interface EditorStore extends EditorState {
  // 切换工具
  setTool: (tool: EditorTool) => void;

  // 切换编辑器模式
  setEditorMode: (mode: EditorMode) => void;
  
  // 切换网格显示
  toggleGrid: () => void;
  
  // 切换坐标轴显示
  toggleAxes: () => void;
  
  // 切换线框模式
  toggleWireframe: () => void;
}

const initialState: EditorState = {
  currentTool: 'select',
  gridVisible: true,
  axesVisible: true,
  wireframeMode: false,
  editorMode: 'scene',
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...initialState,

  setTool: (tool) => set({ currentTool: tool }),

  setEditorMode: (mode) => set({ editorMode: mode }),

  toggleGrid: () =>
    set((state) => ({ gridVisible: !state.gridVisible })),

  toggleAxes: () =>
    set((state) => ({ axesVisible: !state.axesVisible })),

  toggleWireframe: () =>
    set((state) => ({ wireframeMode: !state.wireframeMode })),
}));
