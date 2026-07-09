import type { UIElementType } from '@/types/uiEditor';
import { UI_COMPONENT_DEFAULTS } from '@/types/uiEditor';
import { ECHART_PRESETS } from '@/config/echartPresets';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { DRAG_TYPE } from './UICanvas';

const BASIC_COMPONENTS: { type: UIElementType; icon: string; label: string }[] = [
  { type: 'container', icon: '▢', label: '容器' },
  { type: 'text', icon: 'T', label: '文本' },
  { type: 'image', icon: '🖼', label: '图片' },
  { type: 'button', icon: '⬚', label: '按钮' },
  { type: 'input', icon: '▭', label: '输入框' },
];

export function ComponentPalette() {
  const addElement = useUIEditorStore((s) => s.addElement);

  const handleDragStart = (e: React.DragEvent, type: UIElementType) => {
    e.dataTransfer.setData(DRAG_TYPE, type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleClick = (type: UIElementType) => {
    addElement(type);
  };

  const handleAddEchart = (presetId: string) => {
    const id = addElement('echart');
    useUIEditorStore.getState().updateElement(id, { content: presetId });
  };

  return (
    <div className="ui-palette">
      <div className="ui-panel-header">
        <span>组件库</span>
        <span className="ui-panel-hint">拖拽到画布</span>
      </div>
      <div className="ui-palette-grid">
        {BASIC_COMPONENTS.map(({ type, icon, label }) => (
          <div
            key={type}
            className="ui-palette-item"
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => handleClick(type)}
            title={`添加${UI_COMPONENT_DEFAULTS[type].name}`}
          >
            <span className="ui-palette-icon">{icon}</span>
            <span className="ui-palette-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="ui-palette-section-title">ECharts 图表</div>
      <div className="ui-palette-grid">
        {ECHART_PRESETS.map(({ id, icon, label }) => (
          <div
            key={id}
            className="ui-palette-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, 'echart');
              e.dataTransfer.setData('application/ui-echart-preset', id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => handleAddEchart(id)}
            title={`添加${label}`}
          >
            <span className="ui-palette-icon">{icon}</span>
            <span className="ui-palette-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
