/** 后期效果 ID（对应 EffectComposer 中的 Pass） */
export type PostProcessEffectId =
  | 'none'
  | 'bloom'
  | 'fxaa'
  | 'sobel'
  | 'chromatic'
  | 'pixelate'
  | 'vignette'
  | 'film'
  | 'glitch'
  | 'outline'
  | 'bokeh'
  | 'afterimage'
  | 'halftone'
  | 'dotscreen'
  | 'sao'
  | 'ssao'
  | 'pixelated';

export interface PostProcessParams {
  bloom: { intensity: number; radius: number; threshold: number };
  vignette: { darkness: number };
  film: { intensity: number; grayscale: boolean };
  chromatic: { amount: number };
  pixelate: { size: number };
  glitch: { dtSize: number; goWild: boolean };
  outline: { edgeStrength: number; edgeGlow: number; edgeThickness: number; pulsePeriod: number };
  bokeh: { focus: number; aperture: number; maxblur: number };
  afterimage: { damp: number };
  halftone: { radius: number; scatter: number; blending: number };
  dotscreen: { scale: number; angle: number };
  sao: { bias: number; intensity: number; scale: number; kernelRadius: number };
  ssao: { kernelRadius: number; minDistance: number; maxDistance: number };
  pixelated: { size: number };
}

export interface PostProcessConfig {
  enabled: boolean;
  effect: PostProcessEffectId;
  presetId: string;
  params: PostProcessParams;
}

export interface PostProcessPreset {
  id: string;
  name: string;
  description: string;
  effect: PostProcessEffectId;
  /** 相对默认值的覆盖参数（深度合并） */
  params?: Partial<{
    [K in keyof PostProcessParams]: Partial<PostProcessParams[K]>;
  }>;
}
