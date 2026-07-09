// 场景对象类型
export interface SceneObject {
  id: string;
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'group' | 'particle';
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  children?: SceneObject[];
}

// 材质参数类型
export interface MaterialParams {
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

// 灯光配置类型
export interface LightConfig {
  id: string;
  type: 'ambient' | 'directional' | 'point' | 'spot';
  color: string;
  intensity: number;
  position?: [number, number, number];
  target?: [number, number, number];
  castShadow?: boolean;
}

// 相机配置类型
export interface CameraConfig {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
}

// 场景状态类型
export interface SceneState {
  objects: SceneObject[];
  selectedIds: string[];
  camera: CameraConfig;
  lights: LightConfig[];
  backgroundColor: string;
}

// 编辑器工具类型
export type EditorTool = 'select' | 'move' | 'rotate' | 'scale';

// 编辑器模式
export type EditorMode = 'scene' | 'ui';

// 编辑器状态类型
export interface EditorState {
  currentTool: EditorTool;
  gridVisible: boolean;
  axesVisible: boolean;
  wireframeMode: boolean;
  editorMode: EditorMode;
}
