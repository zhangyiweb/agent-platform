import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { getEchartOption, parseEchartPresetId } from '@/config/echartPresets';
import type { UIChartConfig } from '@/types/uiEditor';

interface EchartRendererProps {
  elementId: string;
  presetId?: string;
  chartConfig?: UIChartConfig;
}

export function EchartRenderer({ elementId, presetId, chartConfig }: EchartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const option = getEchartOption(parseEchartPresetId(presetId), chartConfig);
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [elementId, presetId, chartConfig]);

  return (
    <div
      ref={containerRef}
      className="ui-echart-canvas"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
