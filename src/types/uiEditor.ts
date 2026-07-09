/** UI 组件类型 */
export type UIElementType = 'container' | 'text' | 'image' | 'button' | 'rect' | 'input' | 'echart';

/** 可作为父级的组件类型 */
export const PARENT_ELEMENT_TYPES: UIElementType[] = ['container'];

/** UI 元素样式 */
export interface UIElementStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  opacity?: number;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y';
  objectFit?: 'cover' | 'contain' | 'fill';
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  boxShadow?: string;
  textShadow?: string;
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll';
  gap?: number;
  flexDirection?: 'row' | 'column';
  justifyContent?: string;
  alignItems?: string;
  backdropFilter?: string;
  cursor?: string;
}

/** UI 画布元素 */
export interface UIElement {
  id: string;
  name: string;
  type: UIElementType;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  content?: string;
  src?: string;
  style: UIElementStyle;
  hoverStyle?: Partial<UIElementStyle>;
  /** 图表专用配置 */
  chartConfig?: UIChartConfig;
  /** 导出用自定义 DOM id */
  domId?: string;
  /** 导出用自定义 class（空格分隔多个） */
  className?: string;
}

/** ECharts 图表配置 */
export interface UIChartConfig {
  title?: string;
  showLegend?: boolean;
  mainColor?: string;
  gridLeft?: number;
  gridRight?: number;
  gridTop?: number;
  gridBottom?: number;
  showXAxis?: boolean;
  showYAxis?: boolean;
  xAxisName?: string;
  yAxisName?: string;
  xAxisData?: string;
  yAxisMin?: number | null;
  yAxisMax?: number | null;
  axisLabelColor?: string;
  axisLineColor?: string;
  splitLineShow?: boolean;
  splitLineColor?: string;
  seriesData?: string;
  smooth?: boolean;
  lineWidth?: number;
  lineType?: 'solid' | 'dashed' | 'dotted';
  showArea?: boolean;
  areaOpacity?: number;
  showSymbol?: boolean;
  symbolSize?: number;
  barBorderRadius?: number;
  pieLabels?: string;
  pieValues?: string;
  pieRadius?: string;
  ringInnerRadius?: string;
  ringOuterRadius?: string;
  gaugeValue?: number;
  gaugeName?: string;
  gaugeMin?: number;
  gaugeMax?: number;
  showTooltip?: boolean;
  tooltipTrigger?: 'item' | 'axis';
  tooltipBgColor?: string;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  legendOrient?: 'horizontal' | 'vertical';
  symbolType?: 'circle' | 'emptyCircle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'none';
  symbolBorderColor?: string;
  symbolBorderWidth?: number;
  areaGradient?: boolean;
  areaColorStart?: string;
  areaColorEnd?: string;
  showBarLabel?: boolean;
  barWidth?: string;
  showPieLabel?: boolean;
  pieLabelPosition?: 'outside' | 'inside';
  pieRoseType?: '' | 'radius' | 'area';
  showGaugeDetail?: boolean;
  gaugeProgressColor?: string;
}

/** 画布尺寸预设 */
export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '1366 × 768', width: 1366, height: 768 },
  { label: '1440 × 900', width: 1440, height: 900 },
  { label: '375 × 812', width: 375, height: 812 },
  { label: '750 × 1334', width: 750, height: 1334 },
];

export const FONT_FAMILY_CUSTOM = '__custom__';

export const FONT_FAMILY_OPTIONS = [
  { label: '默认', value: 'inherit' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: '苹方', value: '"PingFang SC", sans-serif' },
  { label: '思源黑体', value: '"Source Han Sans SC", "Noto Sans SC", sans-serif' },
  { label: '思源宋体', value: '"Source Han Serif SC", "Noto Serif SC", serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: '仿宋', value: 'FangSong, serif' },
  { label: '华文细黑', value: '"STXihei", "Microsoft YaHei", sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Lato', value: 'Lato, sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: '等宽', value: 'Consolas, Monaco, "Courier New", monospace' },
  { label: '自定义…', value: FONT_FAMILY_CUSTOM },
];

/** 获取字体下拉框当前选中值 */
export function getFontFamilySelectValue(fontFamily?: string): string {
  if (!fontFamily || fontFamily === 'inherit') return 'inherit';
  if (fontFamily.trim() === '') return FONT_FAMILY_CUSTOM;
  const preset = FONT_FAMILY_OPTIONS.find(
    (item) => item.value === fontFamily && item.value !== FONT_FAMILY_CUSTOM
  );
  return preset ? preset.value : FONT_FAMILY_CUSTOM;
}

export const FONT_WEIGHT_OPTIONS = [
  { label: '细', value: 300 },
  { label: '常规', value: 400 },
  { label: '中等', value: 500 },
  { label: '粗体', value: 700 },
  { label: '特粗', value: 900 },
];

export const BOX_SHADOW_PRESETS = [
  { label: '无', value: '' },
  { label: '浅阴影', value: '0 2px 8px rgba(0,0,0,0.15)' },
  { label: '中等阴影', value: '0 4px 16px rgba(0,0,0,0.25)' },
  { label: '深阴影', value: '0 8px 32px rgba(0,0,0,0.4)' },
  { label: '内阴影', value: 'inset 0 2px 6px rgba(0,0,0,0.2)' },
];

/** 组件库默认配置 */
export const UI_COMPONENT_DEFAULTS: Record<
  UIElementType,
  Pick<UIElement, 'width' | 'height' | 'content' | 'style' | 'chartConfig'> & { name: string }
> = {
  container: {
    name: '容器',
    width: 300,
    height: 200,
    style: {
      overflow: 'visible',
    },
  },
  rect: {
    name: '矩形',
    width: 200,
    height: 120,
    style: {
      backgroundColor: '#3b82f6',
      borderRadius: 4,
    },
  },
  text: {
    name: '文本',
    width: 200,
    height: 40,
    content: '文本内容',
    style: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 400,
      fontFamily: '"Microsoft YaHei", sans-serif',
      textAlign: 'left',
      lineHeight: 1.5,
    },
  },
  image: {
    name: '图片',
    width: 200,
    height: 150,
    style: {
      backgroundColor: '#2a2a32',
      objectFit: 'cover',
      borderRadius: 0,
    },
  },
  button: {
    name: '按钮',
    width: 120,
    height: 40,
    content: '按钮',
    style: {
      backgroundColor: '#3b82f6',
      color: '#ffffff',
      fontSize: 14,
      fontWeight: 500,
      fontFamily: '"Microsoft YaHei", sans-serif',
      textAlign: 'center',
      borderRadius: 6,
      boxShadow: '0 2px 8px rgba(59,130,246,0.35)',
    },
  },
  input: {
    name: '输入框',
    width: 240,
    height: 36,
    content: '请输入',
    style: {
      backgroundColor: '#1e2129',
      color: '#e5e7eb',
      fontSize: 14,
      fontFamily: '"Microsoft YaHei", sans-serif',
      borderWidth: 1,
      borderColor: '#404040',
      borderStyle: 'solid',
      borderRadius: 6,
      padding: 8,
    },
  },
  echart: {
    name: '图表',
    width: 400,
    height: 280,
    content: 'line',
    style: {},
    chartConfig: {
      title: '',
      showLegend: true,
      mainColor: '#3b82f6',
      gridLeft: 40,
      gridRight: 20,
      gridTop: 40,
      gridBottom: 30,
      showXAxis: true,
      showYAxis: true,
      xAxisData: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
      seriesData: '820,932,901,934,1290,1330,1320',
      smooth: true,
      lineWidth: 2,
      lineType: 'solid',
      showArea: true,
      areaOpacity: 0.15,
      showSymbol: true,
      symbolSize: 6,
      axisLabelColor: '#9ca3af',
      axisLineColor: '#404040',
      splitLineShow: true,
      splitLineColor: '#2a2a32',
      barBorderRadius: 4,
      pieLabels: '类别A,类别B,类别C,类别D',
      pieValues: '1048,735,580,484',
      ringInnerRadius: '45%',
      ringOuterRadius: '70%',
      gaugeValue: 72,
      gaugeName: '完成率',
      gaugeMin: 0,
      gaugeMax: 100,
      showTooltip: true,
      tooltipTrigger: 'axis',
      tooltipBgColor: 'rgba(0,0,0,0.78)',
      legendPosition: 'bottom',
      legendOrient: 'horizontal',
      symbolType: 'circle',
      symbolBorderColor: '#ffffff',
      symbolBorderWidth: 0,
      areaGradient: true,
      areaColorStart: '#3b82f6',
      areaColorEnd: '#3b82f6',
      showBarLabel: false,
      barWidth: '50%',
      showPieLabel: true,
      pieLabelPosition: 'outside',
      pieRoseType: '',
      showGaugeDetail: true,
      gaugeProgressColor: '#3b82f6',
    },
  },
};

export function canHaveChildren(type: UIElementType): boolean {
  return PARENT_ELEMENT_TYPES.includes(type);
}
