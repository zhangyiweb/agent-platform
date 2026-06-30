import {
  AimOutlined,
  DragOutlined,
  ExpandOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useEditorStore } from '@/store/editorStore';
import type { EditorTool } from '@/types/scene';

const tools: { value: EditorTool; label: string; icon: React.ReactNode; key: string }[] = [
  { value: 'select', label: '选择', icon: <AimOutlined />, key: 'Q' },
  { value: 'move', label: '移动', icon: <DragOutlined />, key: 'W' },
  { value: 'rotate', label: '旋转', icon: <ReloadOutlined />, key: 'E' },
  { value: 'scale', label: '缩放', icon: <ExpandOutlined />, key: 'R' },
];

export function GizmoToolbar() {
  const { currentTool, setTool } = useEditorStore();

  return (
    <div className="gizmo-toolbar-wrap">
      <div className="gizmo-toolbar" role="toolbar" aria-label="变换工具">
        {tools.map((tool) => {
          const isActive = currentTool === tool.value;
          return (
            <button
              key={tool.value}
              type="button"
              className={`gizmo-btn ${isActive ? 'active' : ''}`}
              onClick={() => setTool(tool.value)}
              title={`${tool.label} (${tool.key})`}
              aria-pressed={isActive}
            >
              {tool.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
