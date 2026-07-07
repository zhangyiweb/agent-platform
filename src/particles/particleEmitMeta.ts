import type { ParticleEmitShape, ParticlePresetId } from '@/types/particle';

export interface ParticleEmitSizeMeta {
  x: string;
  y: string;
  z: string;
  showY: boolean;
  note: string;
}

const FALLING_WEATHER: ParticlePresetId[] = ['confetti'];

export function isFallingWeatherPreset(preset: ParticlePresetId) {
  return FALLING_WEATHER.includes(preset);
}

/** 右侧面板「区域」字段标签与说明（随发射形状变化） */
export function getParticleEmitSizeMeta(
  emitShape: ParticleEmitShape,
  preset: ParticlePresetId
): ParticleEmitSizeMeta {
  if (isFallingWeatherPreset(preset)) {
    return {
      x: '水平覆盖 X',
      y: '发射层厚度',
      z: '水平覆盖 Z',
      showY: false,
      note:
        '彩纸碎屑从发射器所在高度的水平面落下。移动对象可改变位置；X、Z 控制地面覆盖范围（单位：米）。',
    };
  }

  switch (emitShape) {
    case 'box':
      return {
        x: '网格宽度 X',
        y: '辅助线框 Y',
        z: '网格高度 Z',
        showY: false,
        note: '盒子发射时，粒子从 X×Z 平面网格喷出；中间 Y 不参与发射计算，仅影响辅助线框。',
      };
    case 'sphere':
      return {
        x: '球体半径',
        y: '球体半径',
        z: '球体半径',
        showY: false,
        note: '球体发射时取 X 作为半径（修改 X 即可）。',
      };
    case 'cone':
      return {
        x: '锥底半径',
        y: '参考高度',
        z: '锥底半径',
        showY: false,
        note: '锥形发射时，X 控制底面半径；扩散角由下方「扩散角」参数控制。',
      };
  }

  return {
    x: '区域 X',
    y: '区域 Y',
    z: '区域 Z',
    showY: true,
    note: '点发射时区域尺寸无实际效果。',
  };
}
