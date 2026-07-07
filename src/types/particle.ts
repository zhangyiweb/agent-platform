/** 粒子预设 ID */
export type ParticlePresetId =
  | 'smoke'
  | 'steam'
  | 'fire'
  | 'sparks'
  | 'dust'
  | 'magic'
  | 'explosion'
  | 'mist'
  | 'bubbles'
  | 'embers'
  | 'confetti'
  | 'custom';

/** 发射形状 */
export type ParticleEmitShape = 'point' | 'sphere' | 'box' | 'cone';

/** 混合模式 */
export type ParticleBlendMode = 'normal' | 'additive';

/** 粒子贴图类型 */
export type ParticleTextureKind = 'soft' | 'smoke' | 'spark' | 'custom';

/** 粒子发射器配置 */
export interface ParticleEmitterConfig {
  enabled: boolean;
  preset: ParticlePresetId;
  maxParticles: number;
  /** 每秒发射粒子数 */
  emissionRate: number;
  lifetimeMin: number;
  lifetimeMax: number;
  sizeStart: number;
  sizeEnd: number;
  speedMin: number;
  speedMax: number;
  /** 发射锥角（弧度） */
  spread: number;
  /** 局部空间发射方向 */
  direction: [number, number, number];
  emitShape: ParticleEmitShape;
  /** 发射区域尺寸，含义随 emitShape 变化，见 getParticleEmitSizeMeta */
  emitSize: [number, number, number];
  colorStart: string;
  colorEnd: string;
  opacityStart: number;
  opacityEnd: number;
  gravity: [number, number, number];
  /** 湍流强度 0~3 */
  turbulence: number;
  /** 粒子自旋速度 */
  rotationSpeed: number;
  blendMode: ParticleBlendMode;
  texture: ParticleTextureKind;
  /** 自定义贴图（Data URL 或 Blob URL） */
  customTextureUrl?: string;
  /** 是否循环发射 */
  loop: boolean;
  /** 单次播放时长（秒），0 = 无限 */
  duration: number;
  /** 是否显示发射区域辅助线框 */
  showHelper: boolean;
  /**
   * 自定义 Quarks 效果 JSON（来自 quarks.art 或高级用户导出）
   * preset 为 custom 时优先使用
   */
  customQuarksJson?: string;
}

export const DEFAULT_PARTICLE_CONFIG: ParticleEmitterConfig = {
  enabled: true,
  preset: 'smoke',
  maxParticles: 800,
  emissionRate: 60,
  lifetimeMin: 2.0,
  lifetimeMax: 4.0,
  sizeStart: 0.4,
  sizeEnd: 2.2,
  speedMin: 0.3,
  speedMax: 0.9,
  spread: 0.6,
  direction: [0, 1, 0],
  emitShape: 'sphere',
  emitSize: [0.5, 0.3, 0.5],
  colorStart: '#aaaaaa',
  colorEnd: '#333333',
  opacityStart: 0.35,
  opacityEnd: 0,
  gravity: [0, 0.15, 0],
  turbulence: 1.2,
  rotationSpeed: 0.8,
  blendMode: 'normal',
  texture: 'smoke',
  loop: true,
  duration: 0,
  showHelper: false,
};
