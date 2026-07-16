/** 场景 3D 标签渲染模式 */
export type SceneLabelMode = 'css2d' | 'css3d' | 'css3dSprite';

/** 标签内容来源 */
export type SceneLabelContentMode = 'text' | 'uiPage';

/** CSS3D 像素 → 世界单位的基础换算（scale=1 时生效） */
export const LABEL_CSS3D_BASE_SCALE = 0.01;

/** 场景标签配置（存于 SceneObject.label） */
export interface SceneLabelConfig {
  mode: SceneLabelMode;
  /** text：纯文案；uiPage：嵌入 UI 编排某页 */
  contentMode: SceneLabelContentMode;
  text: string;
  /** UI 编排页面 id */
  uiPageId?: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  padding: number;
  borderRadius: number;
  borderColor: string;
  borderWidth: number;
  /**
   * 内容缩放，默认 1
   * - CSS2D：DOM transform scale
   * - CSS3D / Sprite：世界缩放 = 0.01 × scale
   * - UI 页面：相对设计尺寸缩放
   */
  scale: number;
  /** @deprecated 请使用 scale；旧数据兼容 */
  htmlScale?: number;
  /** @deprecated 请使用 scale */
  displayWidth?: number;
  /** @deprecated 请使用 scale */
  displayHeight?: number;
}

export const SCENE_LABEL_MODE_OPTIONS: Array<{
  value: SceneLabelMode;
  label: string;
  desc: string;
}> = [
  {
    value: 'css2d',
    label: 'CSS2D',
    desc: '屏幕空间标签，始终正对相机，适合设备名/测点',
  },
  {
    value: 'css3d',
    label: 'CSS3D',
    desc: '三维空间 HTML，可随物体旋转，适合面板/铭牌',
  },
  {
    value: 'css3dSprite',
    label: 'CSS3DSprite',
    desc: '三维空间中始终朝向相机的 HTML 精灵',
  },
];

/** 解析用户缩放（兼容旧 htmlScale） */
export function resolveLabelScale(cfg: Partial<SceneLabelConfig> | undefined): number {
  if (cfg?.scale != null && Number.isFinite(cfg.scale) && cfg.scale > 0) {
    return cfg.scale;
  }
  if (cfg?.htmlScale != null && Number.isFinite(cfg.htmlScale) && cfg.htmlScale > 0) {
    return cfg.htmlScale / LABEL_CSS3D_BASE_SCALE;
  }
  return 1;
}

export function createDefaultLabelConfig(
  mode: SceneLabelMode = 'css2d'
): SceneLabelConfig {
  return {
    mode,
    contentMode: 'text',
    text: '标签',
    fontSize: 14,
    color: '#f8fafc',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 8,
    borderRadius: 6,
    borderColor: 'rgba(56, 189, 248, 0.55)',
    borderWidth: 1,
    scale: 1,
  };
}
