import type {
  PostProcessEffectId,
  PostProcessParams,
  PostProcessPreset,
} from '@/types/postProcess';

/** 默认参数（对齐 Three.js addons 各 Pass 文档默认值） */
export const DEFAULT_POST_PROCESS_PARAMS: PostProcessParams = {
  bloom: { intensity: 1.0, radius: 0.4, threshold: 0.85 },
  vignette: { darkness: 0.5 },
  film: { intensity: 0.25, grayscale: false },
  chromatic: { amount: 0.002 },
  pixelate: { size: 4 },
  glitch: { dtSize: 64, goWild: false },
  outline: { edgeStrength: 3.0, edgeGlow: 0.5, edgeThickness: 1.0, pulsePeriod: 0 },
  bokeh: { focus: 10, aperture: 0.000015, maxblur: 0.015 },
  afterimage: { damp: 0.88 },
  halftone: { radius: 4, scatter: 0.2, blending: 1 },
  dotscreen: { scale: 0.8, angle: 0.785 },
  sao: { bias: 0.5, intensity: 0.00001, scale: 12, kernelRadius: 32 },
  ssao: { kernelRadius: 12, minDistance: 0.005, maxDistance: 0.12 },
  pixelated: { size: 6 },
};

export const POST_PROCESS_EFFECT_GROUPS: {
  label: string;
  effects: { id: PostProcessEffectId; label: string; hint: string }[];
}[] = [
  {
    label: '常用',
    effects: [
      { id: 'none', label: '无', hint: '关闭后期 Pass' },
      { id: 'bloom', label: '泛光 (UnrealBloomPass)', hint: '高亮区域发光，适合展示与夜景' },
      { id: 'ssao', label: '环境遮蔽 (SSAOPass)', hint: '增强角落与接触面阴影，提升立体感' },
      { id: 'fxaa', label: '抗锯齿 (FXAA)', hint: '快速平滑锯齿，性能友好' },
      { id: 'vignette', label: '暗角 (Vignette)', hint: '四周压暗，聚焦画面中心' },
    ],
  },
  {
    label: '镜头 / 胶片',
    effects: [
      { id: 'film', label: '胶片颗粒 (FilmPass)', hint: '颗粒噪点，电影质感' },
      { id: 'bokeh', label: '景深 (BokehPass)', hint: '背景虚化，需场景有一定深度' },
      { id: 'chromatic', label: '色差 (Chromatic)', hint: '边缘色散，镜头感' },
      { id: 'afterimage', label: '运动残影 (AfterimagePass)', hint: '拖影效果，适合动态展示' },
    ],
  },
  {
    label: '风格化',
    effects: [
      { id: 'sobel', label: '边缘检测 (Sobel)', hint: '线稿 / 蓝图风格' },
      { id: 'outline', label: '轮廓描边 (OutlinePass)', hint: '物体外轮廓高亮' },
      { id: 'pixelate', label: '像素化 (Shader)', hint: '马赛克块大小可调' },
      { id: 'pixelated', label: '低分辨率渲染 (RenderPixelatedPass)', hint: '复古像素风' },
      { id: 'halftone', label: '半调网点 (HalftonePass)', hint: '印刷漫画风' },
      { id: 'dotscreen', label: '点阵 (DotScreenPass)', hint: '波普圆点纹理' },
      { id: 'glitch', label: '故障 (GlitchPass)', hint: '数字故障艺术' },
    ],
  },
  {
    label: '高级',
    effects: [
      { id: 'sao', label: 'SAO 遮蔽 (SAOPass)', hint: '高质量 AO，开销较大' },
    ],
  },
];

/** 一键预设：选择后可继续微调参数 */
export const POST_PROCESS_PRESETS: PostProcessPreset[] = [
  {
    id: 'custom',
    name: '自定义',
    description: '手动选择效果并调节参数',
    effect: 'none',
  },
  {
    id: 'showcase-bloom',
    name: '展示辉光',
    description: '轻微泛光，适合产品/数字孪生展示',
    effect: 'bloom',
    params: { bloom: { intensity: 0.55, radius: 0.45, threshold: 0.92 } },
  },
  {
    id: 'night-glow',
    name: '夜景强光',
    description: '低阈值高亮度，霓虹/夜景氛围',
    effect: 'bloom',
    params: { bloom: { intensity: 1.6, radius: 0.55, threshold: 0.35 } },
  },
  {
    id: 'cinema-film',
    name: '电影胶片',
    description: '胶片颗粒 + 暗角',
    effect: 'film',
    params: { film: { intensity: 0.38, grayscale: false } },
  },
  {
    id: 'depth-ssao',
    name: '空间深度',
    description: 'SSAO 强化结构阴影',
    effect: 'ssao',
    params: { ssao: { kernelRadius: 16, minDistance: 0.004, maxDistance: 0.18 } },
  },
  {
    id: 'focus-bokeh',
    name: '景深特写',
    description: '背景虚化，突出主体',
    effect: 'bokeh',
    params: { bokeh: { focus: 8, aperture: 0.00002, maxblur: 0.02 } },
  },
  {
    id: 'tech-outline',
    name: '科技描边',
    description: '全场景轮廓高亮',
    effect: 'outline',
    params: { outline: { edgeStrength: 2.5, edgeGlow: 0.8, edgeThickness: 1.2, pulsePeriod: 0 } },
  },
  {
    id: 'blueprint',
    name: '蓝图线稿',
    description: 'Sobel 边缘，工程图纸感',
    effect: 'sobel',
  },
  {
    id: 'retro-pixel',
    name: '复古像素',
    description: '低分辨率像素渲染',
    effect: 'pixelated',
    params: { pixelated: { size: 8 } },
  },
  {
    id: 'vignette-focus',
    name: '中心聚焦',
    description: '暗角压边，引导视线',
    effect: 'vignette',
    params: { vignette: { darkness: 0.65 } },
  },
];

export function mergePostProcessParams(
  base: PostProcessParams,
  patch?: PostProcessPreset['params']
): PostProcessParams {
  if (!patch) return { ...base };
  const result = JSON.parse(JSON.stringify(base)) as PostProcessParams;
  for (const key of Object.keys(patch) as (keyof PostProcessParams)[]) {
    Object.assign(result[key], patch[key]);
  }
  return result;
}

export function buildPostProcessConfig(
  enabled: boolean,
  effect: PostProcessEffectId,
  presetId: string,
  params: PostProcessParams
) {
  return {
    enabled,
    effect,
    presetId,
    ...params,
  };
}
