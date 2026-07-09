import { Input, InputNumber, Select, ColorPicker, Slider, Switch } from 'antd';
import type { SelectProps } from 'antd';
import type { UIChartConfig, UIElement } from '@/types/uiEditor';
import {
  ECHART_PRESETS,
  isCartesianChart,
  parseEchartPresetId,
  type EchartPresetId,
} from '@/config/echartPresets';
import { PropertyGroup } from './PropertyGroup';

const SELECT_POPUP_CLASSNAMES = { popup: { root: 'export-panel-select-popup' } };

const selectProps: Pick<SelectProps, 'size' | 'className' | 'classNames'> = {
  size: 'small',
  className: 'export-panel-select',
  classNames: SELECT_POPUP_CLASSNAMES,
};

const SYMBOL_OPTIONS = [
  { label: '圆点', value: 'circle' },
  { label: '空心圆', value: 'emptyCircle' },
  { label: '方形', value: 'rect' },
  { label: '圆角方', value: 'roundRect' },
  { label: '三角', value: 'triangle' },
  { label: '菱形', value: 'diamond' },
  { label: '无', value: 'none' },
];

interface EchartPropertyPanelsProps {
  element: UIElement;
  onUpdate: (patch: Partial<UIChartConfig>) => void;
}

export function EchartPropertyPanels({ element, onUpdate }: EchartPropertyPanelsProps) {
  const chartPresetId = parseEchartPresetId(element.content) as EchartPresetId;
  const chartPresetLabel = ECHART_PRESETS.find((p) => p.id === chartPresetId)?.label ?? '折线图';
  const isCartesian = isCartesianChart(chartPresetId);
  const cfg = element.chartConfig ?? {};

  return (
    <>
      <PropertyGroup title="图表">
        <div className="ui-property-row">
          <label>类型</label>
          <span className="ui-property-readonly">{chartPresetLabel}</span>
        </div>
        <div className="ui-property-row">
          <label>标题</label>
          <Input
            size="small"
            placeholder="图表标题"
            value={cfg.title ?? ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>
        <div className="ui-property-row">
          <label>主色</label>
          <ColorPicker
            size="small"
            value={cfg.mainColor || '#3b82f6'}
            onChange={(_, hex) => onUpdate({ mainColor: hex })}
          />
        </div>
      </PropertyGroup>

      <PropertyGroup title="图例">
        <div className="ui-property-row">
          <label>显示</label>
          <Switch
            size="small"
            checked={cfg.showLegend !== false}
            onChange={(checked) => onUpdate({ showLegend: checked })}
          />
        </div>
        <div className="ui-property-row">
          <label>位置</label>
          <Select
            {...selectProps}
            value={cfg.legendPosition || 'bottom'}
            onChange={(v) => onUpdate({ legendPosition: v })}
            options={[
              { label: '顶部', value: 'top' },
              { label: '底部', value: 'bottom' },
              { label: '左侧', value: 'left' },
              { label: '右侧', value: 'right' },
            ]}
            style={{ flex: 1 }}
          />
        </div>
        <div className="ui-property-row">
          <label>方向</label>
          <Select
            {...selectProps}
            value={cfg.legendOrient || 'horizontal'}
            onChange={(v) => onUpdate({ legendOrient: v })}
            options={[
              { label: '水平', value: 'horizontal' },
              { label: '垂直', value: 'vertical' },
            ]}
            style={{ flex: 1 }}
          />
        </div>
      </PropertyGroup>

      <PropertyGroup title="Tooltip">
        <div className="ui-property-row">
          <label>显示</label>
          <Switch
            size="small"
            checked={cfg.showTooltip !== false}
            onChange={(checked) => onUpdate({ showTooltip: checked })}
          />
        </div>
        <div className="ui-property-row">
          <label>触发</label>
          <Select
            {...selectProps}
            value={cfg.tooltipTrigger || (isCartesian ? 'axis' : 'item')}
            onChange={(v) => onUpdate({ tooltipTrigger: v })}
            options={[
              { label: '坐标轴', value: 'axis' },
              { label: '数据项', value: 'item' },
            ]}
            style={{ flex: 1 }}
          />
        </div>
        <div className="ui-property-row">
          <label>背景</label>
          <ColorPicker
            size="small"
            value={cfg.tooltipBgColor || 'rgba(0,0,0,0.78)'}
            onChange={(_, hex) => onUpdate({ tooltipBgColor: hex })}
          />
        </div>
      </PropertyGroup>

      {isCartesian && (
        <PropertyGroup title="数据">
          <div className="ui-property-row ui-property-row--column">
            <label>X 轴数据</label>
            <Input.TextArea
              size="small"
              rows={2}
              placeholder="逗号或换行分隔"
              value={cfg.xAxisData ?? ''}
              onChange={(e) => onUpdate({ xAxisData: e.target.value })}
            />
          </div>
          <div className="ui-property-row ui-property-row--column">
            <label>Y 轴数据</label>
            <Input.TextArea
              size="small"
              rows={2}
              placeholder="逗号或换行分隔数字"
              value={cfg.seriesData ?? ''}
              onChange={(e) => onUpdate({ seriesData: e.target.value })}
            />
          </div>
        </PropertyGroup>
      )}

      {(chartPresetId === 'pie' || chartPresetId === 'ring') && (
        <PropertyGroup title="数据">
          <div className="ui-property-row ui-property-row--column">
            <label>标签</label>
            <Input.TextArea
              size="small"
              rows={2}
              value={cfg.pieLabels ?? ''}
              onChange={(e) => onUpdate({ pieLabels: e.target.value })}
            />
          </div>
          <div className="ui-property-row ui-property-row--column">
            <label>数值</label>
            <Input.TextArea
              size="small"
              rows={2}
              value={cfg.pieValues ?? ''}
              onChange={(e) => onUpdate({ pieValues: e.target.value })}
            />
          </div>
          {chartPresetId === 'pie' && (
            <>
              <div className="ui-property-row">
                <label>半径</label>
                <Input
                  size="small"
                  value={cfg.pieRadius ?? '65%'}
                  onChange={(e) => onUpdate({ pieRadius: e.target.value })}
                />
              </div>
              <div className="ui-property-row">
                <label>玫瑰图</label>
                <Select
                  {...selectProps}
                  value={cfg.pieRoseType || ''}
                  onChange={(v) => onUpdate({ pieRoseType: v as UIChartConfig['pieRoseType'] })}
                  options={[
                    { label: '无', value: '' },
                    { label: '半径', value: 'radius' },
                    { label: '面积', value: 'area' },
                  ]}
                  style={{ flex: 1 }}
                />
              </div>
            </>
          )}
          {chartPresetId === 'ring' && (
            <>
              <div className="ui-property-row">
                <label>内径</label>
                <Input
                  size="small"
                  value={cfg.ringInnerRadius ?? '45%'}
                  onChange={(e) => onUpdate({ ringInnerRadius: e.target.value })}
                />
              </div>
              <div className="ui-property-row">
                <label>外径</label>
                <Input
                  size="small"
                  value={cfg.ringOuterRadius ?? '70%'}
                  onChange={(e) => onUpdate({ ringOuterRadius: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="ui-property-row">
            <label>标签</label>
            <Switch
              size="small"
              checked={cfg.showPieLabel !== false}
              onChange={(checked) => onUpdate({ showPieLabel: checked })}
            />
          </div>
          <div className="ui-property-row">
            <label>标签位</label>
            <Select
              {...selectProps}
              value={cfg.pieLabelPosition || 'outside'}
              onChange={(v) => onUpdate({ pieLabelPosition: v })}
              options={[
                { label: '外侧', value: 'outside' },
                { label: '内侧', value: 'inside' },
              ]}
              style={{ flex: 1 }}
            />
          </div>
        </PropertyGroup>
      )}

      {chartPresetId === 'gauge' && (
        <PropertyGroup title="数据">
          <div className="ui-property-row">
            <label>数值</label>
            <InputNumber
              size="small"
              value={cfg.gaugeValue ?? 72}
              onChange={(v) => onUpdate({ gaugeValue: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>名称</label>
            <Input
              size="small"
              value={cfg.gaugeName ?? ''}
              onChange={(e) => onUpdate({ gaugeName: e.target.value })}
            />
          </div>
          <div className="ui-property-row">
            <label>最小</label>
            <InputNumber
              size="small"
              value={cfg.gaugeMin ?? 0}
              onChange={(v) => onUpdate({ gaugeMin: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>最大</label>
            <InputNumber
              size="small"
              value={cfg.gaugeMax ?? 100}
              onChange={(v) => onUpdate({ gaugeMax: v ?? 100 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>数值显示</label>
            <Switch
              size="small"
              checked={cfg.showGaugeDetail !== false}
              onChange={(checked) => onUpdate({ showGaugeDetail: checked })}
            />
          </div>
          <div className="ui-property-row">
            <label>进度色</label>
            <ColorPicker
              size="small"
              value={cfg.gaugeProgressColor || cfg.mainColor || '#3b82f6'}
              onChange={(_, hex) => onUpdate({ gaugeProgressColor: hex })}
            />
          </div>
        </PropertyGroup>
      )}

      {isCartesian && (
        <PropertyGroup title="坐标轴">
          <div className="ui-property-row">
            <label>X 轴</label>
            <Switch
              size="small"
              checked={cfg.showXAxis !== false}
              onChange={(checked) => onUpdate({ showXAxis: checked })}
            />
          </div>
          <div className="ui-property-row">
            <label>Y 轴</label>
            <Switch
              size="small"
              checked={cfg.showYAxis !== false}
              onChange={(checked) => onUpdate({ showYAxis: checked })}
            />
          </div>
          <div className="ui-property-row">
            <label>X 名称</label>
            <Input
              size="small"
              value={cfg.xAxisName ?? ''}
              onChange={(e) => onUpdate({ xAxisName: e.target.value })}
            />
          </div>
          <div className="ui-property-row">
            <label>Y 名称</label>
            <Input
              size="small"
              value={cfg.yAxisName ?? ''}
              onChange={(e) => onUpdate({ yAxisName: e.target.value })}
            />
          </div>
          <div className="ui-property-row">
            <label>Y 最小</label>
            <InputNumber
              size="small"
              value={cfg.yAxisMin ?? undefined}
              onChange={(v) => onUpdate({ yAxisMin: v })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>Y 最大</label>
            <InputNumber
              size="small"
              value={cfg.yAxisMax ?? undefined}
              onChange={(v) => onUpdate({ yAxisMax: v })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>轴文字</label>
            <ColorPicker
              size="small"
              value={cfg.axisLabelColor || '#9ca3af'}
              onChange={(_, hex) => onUpdate({ axisLabelColor: hex })}
            />
          </div>
          <div className="ui-property-row">
            <label>轴线色</label>
            <ColorPicker
              size="small"
              value={cfg.axisLineColor || '#404040'}
              onChange={(_, hex) => onUpdate({ axisLineColor: hex })}
            />
          </div>
          <div className="ui-property-row">
            <label>网格线</label>
            <Switch
              size="small"
              checked={cfg.splitLineShow !== false}
              onChange={(checked) => onUpdate({ splitLineShow: checked })}
            />
          </div>
          <div className="ui-property-row">
            <label>网格色</label>
            <ColorPicker
              size="small"
              value={cfg.splitLineColor || '#2a2a32'}
              onChange={(_, hex) => onUpdate({ splitLineColor: hex })}
            />
          </div>
        </PropertyGroup>
      )}

      {chartPresetId === 'line' && (
        <>
          <PropertyGroup title="线条">
            <div className="ui-property-row">
              <label>平滑</label>
              <Switch
                size="small"
                checked={cfg.smooth !== false}
                onChange={(checked) => onUpdate({ smooth: checked })}
              />
            </div>
            <div className="ui-property-row">
              <label>线宽</label>
              <InputNumber
                size="small"
                min={1}
                max={12}
                value={cfg.lineWidth ?? 2}
                onChange={(v) => onUpdate({ lineWidth: v ?? 2 })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="ui-property-row">
              <label>线型</label>
              <Select
                {...selectProps}
                value={cfg.lineType || 'solid'}
                onChange={(v) => onUpdate({ lineType: v })}
                options={[
                  { label: '实线', value: 'solid' },
                  { label: '虚线', value: 'dashed' },
                  { label: '点线', value: 'dotted' },
                ]}
                style={{ flex: 1 }}
              />
            </div>
          </PropertyGroup>

          <PropertyGroup title="数据点">
            <div className="ui-property-row">
              <label>显示</label>
              <Switch
                size="small"
                checked={cfg.showSymbol !== false && cfg.symbolType !== 'none'}
                onChange={(checked) => onUpdate({ showSymbol: checked, symbolType: checked ? 'circle' : 'none' })}
              />
            </div>
            <div className="ui-property-row">
              <label>样式</label>
              <Select
                {...selectProps}
                value={cfg.symbolType || 'circle'}
                onChange={(v) => onUpdate({ symbolType: v, showSymbol: v !== 'none' })}
                options={SYMBOL_OPTIONS}
                style={{ flex: 1 }}
              />
            </div>
            <div className="ui-property-row">
              <label>大小</label>
              <InputNumber
                size="small"
                min={0}
                max={24}
                value={cfg.symbolSize ?? 6}
                onChange={(v) => onUpdate({ symbolSize: v ?? 6 })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="ui-property-row">
              <label>描边色</label>
              <ColorPicker
                size="small"
                value={cfg.symbolBorderColor || '#ffffff'}
                onChange={(_, hex) => onUpdate({ symbolBorderColor: hex })}
              />
            </div>
            <div className="ui-property-row">
              <label>描边宽</label>
              <InputNumber
                size="small"
                min={0}
                max={6}
                value={cfg.symbolBorderWidth ?? 0}
                onChange={(v) => onUpdate({ symbolBorderWidth: v ?? 0 })}
                style={{ width: '100%' }}
              />
            </div>
          </PropertyGroup>

          <PropertyGroup title="面积">
            <div className="ui-property-row">
              <label>显示</label>
              <Switch
                size="small"
                checked={cfg.showArea !== false}
                onChange={(checked) => onUpdate({ showArea: checked })}
              />
            </div>
            <div className="ui-property-row">
              <label>渐变</label>
              <Switch
                size="small"
                checked={cfg.areaGradient !== false}
                onChange={(checked) => onUpdate({ areaGradient: checked })}
              />
            </div>
            <div className="ui-property-row">
              <label>透明度</label>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={cfg.areaOpacity ?? 0.15}
                onChange={(v) => onUpdate({ areaOpacity: v })}
              />
            </div>
            <div className="ui-property-row">
              <label>起始色</label>
              <ColorPicker
                size="small"
                value={cfg.areaColorStart || cfg.mainColor || '#3b82f6'}
                onChange={(_, hex) => onUpdate({ areaColorStart: hex })}
              />
            </div>
            <div className="ui-property-row">
              <label>结束色</label>
              <ColorPicker
                size="small"
                value={cfg.areaColorEnd || cfg.mainColor || '#3b82f6'}
                onChange={(_, hex) => onUpdate({ areaColorEnd: hex })}
              />
            </div>
          </PropertyGroup>
        </>
      )}

      {chartPresetId === 'bar' && (
        <PropertyGroup title="柱状">
          <div className="ui-property-row">
            <label>圆角</label>
            <InputNumber
              size="small"
              min={0}
              max={20}
              value={cfg.barBorderRadius ?? 4}
              onChange={(v) => onUpdate({ barBorderRadius: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>柱宽</label>
            <Input
              size="small"
              placeholder="50% 或 24"
              value={cfg.barWidth ?? '50%'}
              onChange={(e) => onUpdate({ barWidth: e.target.value })}
            />
          </div>
          <div className="ui-property-row">
            <label>数值标签</label>
            <Switch
              size="small"
              checked={cfg.showBarLabel === true}
              onChange={(checked) => onUpdate({ showBarLabel: checked })}
            />
          </div>
        </PropertyGroup>
      )}

      {isCartesian && (
        <PropertyGroup title="布局">
          <div className="ui-property-row">
            <label>左</label>
            <InputNumber
              size="small"
              min={0}
              value={cfg.gridLeft ?? 40}
              onChange={(v) => onUpdate({ gridLeft: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>右</label>
            <InputNumber
              size="small"
              min={0}
              value={cfg.gridRight ?? 20}
              onChange={(v) => onUpdate({ gridRight: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>上</label>
            <InputNumber
              size="small"
              min={0}
              value={cfg.gridTop ?? 40}
              onChange={(v) => onUpdate({ gridTop: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>下</label>
            <InputNumber
              size="small"
              min={0}
              value={cfg.gridBottom ?? 30}
              onChange={(v) => onUpdate({ gridBottom: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
        </PropertyGroup>
      )}
    </>
  );
}
