import type { UIChartConfig } from '@/types/uiEditor';

/** ECharts 图表预设类型 */
export type EchartPresetId = 'line' | 'bar' | 'pie' | 'gauge' | 'ring';

export const ECHART_PRESETS: { id: EchartPresetId; label: string; icon: string }[] = [
  { id: 'line', label: '折线图', icon: '📈' },
  { id: 'bar', label: '柱状图', icon: '📊' },
  { id: 'pie', label: '饼图', icon: '🥧' },
  { id: 'ring', label: '环形图', icon: '⭕' },
  { id: 'gauge', label: '仪表盘', icon: '🎯' },
];

const DEFAULT_X = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_LINE_Y = [820, 932, 901, 934, 1290, 1330, 1320];
const DEFAULT_BAR_Y = [120, 200, 150, 80, 70, 110, 130];
const DEFAULT_PIE_LABELS = ['类别A', '类别B', '类别C', '类别D'];
const DEFAULT_PIE_VALUES = [1048, 735, 580, 484];
const DEFAULT_RING_LABELS = ['直接访问', '邮件营销', '联盟广告', '视频广告'];
const DEFAULT_RING_VALUES = [335, 310, 234, 135];

function parseStringList(value?: string, fallback: string[] = []): string[] {
  if (!value?.trim()) return fallback;
  return value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
}

function parseNumberList(value?: string, fallback: number[] = []): number[] {
  if (!value?.trim()) return fallback;
  const nums = value.split(/[,，\n]/).map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  return nums.length > 0 ? nums : fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildAreaStyle(config: UIChartConfig | undefined, mainColor: string) {
  if (config?.showArea === false) return undefined;

  const opacity = config?.areaOpacity ?? 0.15;
  if (config?.areaGradient !== false) {
    const start = config?.areaColorStart || mainColor;
    const end = config?.areaColorEnd || mainColor;
    return {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: hexToRgba(start, Math.min(opacity * 2.5, 0.65)) },
          { offset: 1, color: hexToRgba(end, 0.02) },
        ],
      },
    };
  }

  return { color: hexToRgba(mainColor, opacity) };
}

function buildLegend(config: UIChartConfig | undefined, darkText: string) {
  if (config?.showLegend === false) return { show: false };

  const pos = config?.legendPosition || 'bottom';
  const legend: Record<string, unknown> = {
    show: true,
    orient: config?.legendOrient || 'horizontal',
    textStyle: { color: darkText },
  };

  if (pos === 'top') legend.top = 8;
  if (pos === 'bottom') legend.bottom = 0;
  if (pos === 'left') {
    legend.left = 0;
    legend.top = 'middle';
  }
  if (pos === 'right') {
    legend.right = 0;
    legend.top = 'middle';
  }

  return legend;
}

function buildTooltip(
  config: UIChartConfig | undefined,
  presetId: EchartPresetId
) {
  if (config?.showTooltip === false) return { show: false };

  const isCartesian = presetId === 'line' || presetId === 'bar';
  return {
    show: true,
    trigger: config?.tooltipTrigger || (isCartesian ? 'axis' : 'item'),
    backgroundColor: config?.tooltipBgColor || 'rgba(0,0,0,0.78)',
    borderColor: 'transparent',
    textStyle: { color: '#f3f4f6', fontSize: 12 },
    axisPointer: isCartesian ? { type: 'line' } : undefined,
  };
}

function buildLineSymbol(config: UIChartConfig | undefined, mainColor: string) {
  const symbolType = config?.symbolType || 'circle';
  const showSymbol = config?.showSymbol !== false && symbolType !== 'none';

  return {
    showSymbol,
    symbol: symbolType === 'none' ? 'circle' : symbolType,
    symbolSize: config?.symbolSize ?? 6,
    itemStyle: {
      color: mainColor,
      borderColor: config?.symbolBorderColor || '#ffffff',
      borderWidth: config?.symbolBorderWidth ?? 0,
    },
  };
}

function buildCartesianAxes(presetId: 'line' | 'bar', config?: UIChartConfig) {
  const darkText = config?.axisLabelColor || '#9ca3af';
  const axisLine = config?.axisLineColor || '#404040';
  const splitColor = config?.splitLineColor || '#2a2a32';
  const yData = parseNumberList(
    config?.seriesData,
    presetId === 'bar' ? DEFAULT_BAR_Y : DEFAULT_LINE_Y
  );

  const yAxis: Record<string, unknown> = {
    type: 'value',
    show: config?.showYAxis !== false,
    name: config?.yAxisName || '',
    nameTextStyle: { color: darkText },
    splitLine: {
      show: config?.splitLineShow !== false,
      lineStyle: { color: splitColor },
    },
    axisLabel: { color: darkText },
    axisLine: { show: true, lineStyle: { color: axisLine } },
  };

  if (config?.yAxisMin !== undefined && config.yAxisMin !== null) yAxis.min = config.yAxisMin;
  if (config?.yAxisMax !== undefined && config.yAxisMax !== null) yAxis.max = config.yAxisMax;

  return {
    yData,
    xAxis: {
      type: 'category',
      show: config?.showXAxis !== false,
      data: parseStringList(config?.xAxisData, DEFAULT_X),
      name: config?.xAxisName || '',
      nameTextStyle: { color: darkText },
      axisLine: { show: true, lineStyle: { color: axisLine } },
      axisLabel: { color: darkText },
    },
    yAxis,
  };
}

function buildPieData(config?: UIChartConfig, presetId: 'pie' | 'ring' = 'pie') {
  const labels = parseStringList(
    config?.pieLabels,
    presetId === 'ring' ? DEFAULT_RING_LABELS : DEFAULT_PIE_LABELS
  );
  const values = parseNumberList(
    config?.pieValues,
    presetId === 'ring' ? DEFAULT_RING_VALUES : DEFAULT_PIE_VALUES
  );
  const len = Math.min(labels.length, values.length);
  return Array.from({ length: len }, (_, i) => ({ name: labels[i], value: values[i] }));
}

export function getEchartOption(
  presetId: EchartPresetId,
  config?: UIChartConfig
): Record<string, unknown> {
  const darkText = config?.axisLabelColor || '#9ca3af';
  const axisLine = config?.axisLineColor || '#404040';
  const mainColor = config?.mainColor || '#3b82f6';
  const grid = {
    left: config?.gridLeft ?? 40,
    right: config?.gridRight ?? 20,
    top: config?.gridTop ?? 40,
    bottom: config?.gridBottom ?? 30,
  };

  let option: Record<string, unknown>;

  switch (presetId) {
    case 'bar': {
      const { xAxis, yAxis, yData } = buildCartesianAxes('bar', config);
      const radius = config?.barBorderRadius ?? 4;
      option = {
        backgroundColor: 'transparent',
        grid,
        xAxis,
        yAxis,
        series: [
          {
            type: 'bar',
            data: yData,
            barWidth: config?.barWidth || '50%',
            itemStyle: { color: mainColor, borderRadius: [radius, radius, 0, 0] },
            label: {
              show: config?.showBarLabel === true,
              position: 'top',
              color: darkText,
              fontSize: 11,
            },
          },
        ],
      };
      break;
    }
    case 'pie':
      option = {
        backgroundColor: 'transparent',
        series: [
          {
            type: 'pie',
            radius: config?.pieRadius || '65%',
            roseType: config?.pieRoseType || undefined,
            data: buildPieData(config, 'pie'),
            label: {
              show: config?.showPieLabel !== false,
              position: config?.pieLabelPosition || 'outside',
              color: darkText,
            },
            emphasis: {
              label: { show: true, fontSize: 13, fontWeight: 'bold' },
            },
          },
        ],
      };
      break;
    case 'ring':
      option = {
        backgroundColor: 'transparent',
        series: [
          {
            type: 'pie',
            radius: [config?.ringInnerRadius || '45%', config?.ringOuterRadius || '70%'],
            data: buildPieData(config, 'ring'),
            label: {
              show: config?.showPieLabel !== false,
              position: config?.pieLabelPosition || 'outside',
              color: darkText,
            },
            emphasis: {
              label: { show: true, fontSize: 13, fontWeight: 'bold' },
            },
          },
        ],
      };
      break;
    case 'gauge':
      option = {
        backgroundColor: 'transparent',
        series: [
          {
            type: 'gauge',
            min: config?.gaugeMin ?? 0,
            max: config?.gaugeMax ?? 100,
            progress: {
              show: true,
              width: 12,
              itemStyle: { color: config?.gaugeProgressColor || mainColor },
            },
            axisLine: { lineStyle: { width: 12, color: [[1, '#2a2a32']] } },
            axisTick: { show: false },
            splitLine: { length: 8, lineStyle: { color: axisLine } },
            axisLabel: { color: darkText, distance: 20 },
            anchor: { show: true, size: 16, itemStyle: { color: mainColor } },
            pointer: { itemStyle: { color: mainColor } },
            detail: {
              show: config?.showGaugeDetail !== false,
              valueAnimation: true,
              fontSize: 24,
              color: '#e5e7eb',
              offsetCenter: [0, '70%'],
            },
            data: [{ value: config?.gaugeValue ?? 72, name: config?.gaugeName || '完成率' }],
            title: { color: darkText },
          },
        ],
      };
      break;
    case 'line':
    default: {
      const { xAxis, yAxis, yData } = buildCartesianAxes('line', config);
      const lineWidth = config?.lineWidth ?? 2;
      const symbol = buildLineSymbol(config, mainColor);
      const series: Record<string, unknown> = {
        type: 'line',
        smooth: config?.smooth !== false,
        data: yData,
        lineStyle: { color: mainColor, width: lineWidth, type: config?.lineType || 'solid' },
        ...symbol,
      };
      const areaStyle = buildAreaStyle(config, mainColor);
      if (areaStyle) series.areaStyle = areaStyle;

      option = {
        backgroundColor: 'transparent',
        grid,
        xAxis,
        yAxis,
        series: [series],
      };
      break;
    }
  }

  if (config?.title) {
    option.title = { text: config.title, left: 'center', textStyle: { color: '#e5e7eb', fontSize: 14 } };
  }

  option.tooltip = buildTooltip(config, presetId);

  if (presetId === 'pie' || presetId === 'ring' || presetId === 'bar' || presetId === 'line') {
    option.legend = buildLegend(config, darkText);
  }

  return option;
}

export function parseEchartPresetId(content?: string): EchartPresetId {
  const id = (content || 'line') as EchartPresetId;
  return ECHART_PRESETS.some((p) => p.id === id) ? id : 'line';
}

export function getEchartOptionJson(presetId: EchartPresetId, config?: UIChartConfig): string {
  return JSON.stringify(getEchartOption(presetId, config));
}

export function isCartesianChart(presetId: EchartPresetId): boolean {
  return presetId === 'line' || presetId === 'bar';
}
