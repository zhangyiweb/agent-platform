/** 贴图动画作用目标 */
export type TextureAnimationTarget = 'map' | 'all';

/** 贴图 UV 偏移动画配置（按对象 ID 存储） */
export interface TextureUvAnimationConfig {
  enabled: boolean;
  /** 每秒 U 方向偏移量（贴图 UV 单位） */
  speedU: number;
  /** 每秒 V 方向偏移量 */
  speedV: number;
  target: TextureAnimationTarget;
}

export const DEFAULT_TEXTURE_UV_ANIMATION: TextureUvAnimationConfig = {
  enabled: false,
  speedU: 0.1,
  speedV: 0,
  target: 'map',
};
