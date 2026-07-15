/** UI 触发的动作类型 */
export type UIActionType =
  | 'object.setVisible'
  | 'object.select'
  | 'object.focus' // 兼容旧数据，面板不再提供
  | 'object.setMaterial'
  | 'object.setTransform'
  | 'camera.set'
  | 'ui.setVisible'
  | 'tour.play'
  | 'tour.stop'
  | 'tour.pause'
  | 'custom';

/** 事件触发方式 */
export type UIActionTrigger = 'click' | 'dblclick' | 'mouseenter' | 'mouseleave';

/** 显隐模式：显示 / 隐藏 / 切换 */
export type VisibilityMode = 'show' | 'hide' | 'toggle';

export interface Vec3Param {
  x: number;
  y: number;
  z: number;
}

/** 单条 UI → 场景/面板交互 */
export interface UIAction {
  id: string;
  trigger: UIActionTrigger;
  type: UIActionType;
  /** 场景对象 ID / 主目标；多目标时配合 targetIds */
  targetId?: string;
  /** UI 面板等多选目标 */
  targetIds?: string[];
  params?: {
    visibilityMode?: VisibilityMode;
    /** @deprecated 请用 visibilityMode */
    visible?: boolean;
    /** 相机终点位置 / 节点位移 */
    position?: Vec3Param;
    /** 相机注视目标点 */
    target?: Vec3Param;
    rotation?: Vec3Param;
    scale?: Vec3Param;
    /** 相机移动过渡秒数，默认 2 */
    duration?: number;
    /**
     * 节点变换：开启后再次触发会还原到动作执行前的原始变换（默认关闭）
     */
    restoreToggle?: boolean;
    /** @deprecated 仅兼容旧「飞向模型」 */
    distance?: number;
    nodeName?: string;
    color?: string;
    metalness?: number;
    roughness?: number;
    opacity?: number;
    emissive?: string;
    emissiveIntensity?: number;
    fn?: string;
  };
}

export const UI_ACTION_TRIGGER_OPTIONS: Array<{ value: UIActionTrigger; label: string }> = [
  { value: 'click', label: '单击' },
  { value: 'dblclick', label: '双击' },
  { value: 'mouseenter', label: '鼠标移入' },
  { value: 'mouseleave', label: '鼠标移出' },
];

export const VISIBILITY_MODE_OPTIONS: Array<{ value: VisibilityMode; label: string }> = [
  { value: 'show', label: '显示' },
  { value: 'hide', label: '隐藏' },
  { value: 'toggle', label: '切换显示/隐藏' },
];

export const UI_ACTION_TYPE_OPTIONS: Array<{
  value: UIActionType;
  label: string;
  needsTarget: boolean;
  targetKind?: 'object' | 'tour' | 'ui' | 'none';
}> = [
  { value: 'object.setVisible', label: '模型显示/隐藏', needsTarget: true, targetKind: 'object' },
  { value: 'object.select', label: '选中模型', needsTarget: true, targetKind: 'object' },
  { value: 'object.setMaterial', label: '修改模型材质', needsTarget: true, targetKind: 'object' },
  { value: 'object.setTransform', label: '移动/旋转/缩放节点', needsTarget: true, targetKind: 'object' },
  { value: 'camera.set', label: '相机移动', needsTarget: false, targetKind: 'none' },
  { value: 'ui.setVisible', label: 'UI 面板显示/隐藏', needsTarget: true, targetKind: 'ui' },
  { value: 'tour.play', label: '播放漫游', needsTarget: false, targetKind: 'tour' },
  { value: 'tour.pause', label: '暂停漫游', needsTarget: false, targetKind: 'none' },
  { value: 'tour.stop', label: '停止漫游', needsTarget: false, targetKind: 'none' },
  { value: 'custom', label: '自定义函数', needsTarget: false, targetKind: 'none' },
];

export const DEFAULT_CAMERA_DURATION = 2;
/** 节点移动/旋转/缩放默认过渡秒数 */
export const DEFAULT_TRANSFORM_DURATION = 1;

export function createEmptyUIAction(): UIAction {
  const cam = typeof window !== 'undefined' ? window.__editorCamera : undefined;
  const controls = typeof window !== 'undefined' ? window.__editorControls : undefined;
  const position = cam
    ? {
        x: Number(cam.position.x.toFixed(3)),
        y: Number(cam.position.y.toFixed(3)),
        z: Number(cam.position.z.toFixed(3)),
      }
    : { x: 10, y: 10, z: 10 };
  const target = controls
    ? {
        x: Number(controls.target.x.toFixed(3)),
        y: Number(controls.target.y.toFixed(3)),
        z: Number(controls.target.z.toFixed(3)),
      }
    : { x: 0, y: 0, z: 0 };

  return {
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    trigger: 'click',
    type: 'camera.set',
    targetId: undefined,
    targetIds: undefined,
    params: {
      visibilityMode: 'toggle',
      duration: DEFAULT_CAMERA_DURATION,
      position,
      target,
    },
  };
}

/** 归一化动作目标 ID 列表 */
export function resolveActionTargetIds(action: UIAction): string[] {
  const ids = [
    ...(action.targetIds ?? []),
    ...(action.targetId ? [action.targetId] : []),
  ];
  return Array.from(new Set(ids.filter(Boolean)));
}

export function resolveVisibilityMode(params?: UIAction['params']): VisibilityMode {
  if (params?.visibilityMode) return params.visibilityMode;
  if (params?.visible === false) return 'hide';
  if (params?.visible === true) return 'show';
  return 'toggle';
}

export function applyVisibilityMode(current: boolean, mode: VisibilityMode): boolean {
  if (mode === 'show') return true;
  if (mode === 'hide') return false;
  return !current;
}

export interface UIBindingExportEntry {
  domId: string;
  elementId: string;
  elementName: string;
  actions: UIAction[];
}

export interface RuntimeDataSourceConfig {
  enabled: boolean;
  type: 'mock' | 'websocket' | 'mqtt' | 'http';
  url: string;
  pollIntervalMs?: number;
  reconnectMs?: number;
  topics?: string[];
}

export function createDefaultDataSourceConfig(): RuntimeDataSourceConfig {
  return {
    enabled: false,
    type: 'websocket',
    url: '',
    pollIntervalMs: 5000,
    reconnectMs: 3000,
    topics: [],
  };
}

export interface RuntimeConfigFile {
  version: string;
  exportTime: string;
  ui: {
    enabled: boolean;
    pageId?: string;
    pageName?: string;
    designWidth?: number;
    designHeight?: number;
  };
  dataSource: RuntimeDataSourceConfig;
  dataBindings: unknown[];
}
