/** 漫游站点类型：路径点 / 设备聚焦 */
export type CameraTourStopType = 'waypoint' | 'focus';

/** 漫游方式：站点停靠（看设备） / 一镜到底（曲线连续漫游） */
export type CameraTourMode = 'stop' | 'spline';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 单个漫游站点 */
export interface CameraTourStop {
  id: string;
  name: string;
  type: CameraTourStopType;
  /** 相机位置 */
  position: Vec3;
  /** 注视点（OrbitControls.target） */
  target: Vec3;
  /** 聚焦模式绑定的场景对象 id */
  objectId?: string;
  objectName?: string;
  /** 到达后停留秒数 */
  dwellTime: number;
  /** 从上一站飞入的过渡秒数 */
  transitionTime: number;
}

/** 漫游路线 */
export interface CameraTour {
  id: string;
  name: string;
  /** stop=逐站停靠；spline=样条曲线一镜到底 */
  mode: CameraTourMode;
  loop: boolean;
  stops: CameraTourStop[];
  /** 一镜到底模式：整条路径播放时长（秒） */
  splineDuration?: number;
}

export const DEFAULT_DWELL_TIME = 2;
export const DEFAULT_TRANSITION_TIME = 2;
export const DEFAULT_SPLINE_DURATION = 30;

export function normalizeCameraTour(tour: CameraTour): CameraTour {
  return {
    ...tour,
    mode: tour.mode ?? 'stop',
    splineDuration: tour.splineDuration ?? DEFAULT_SPLINE_DURATION,
  };
}

export function createStopId(): string {
  return `stop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createTourId(): string {
  return `tour_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
