import { useMemo } from 'react';
import { Input, InputNumber, Select, ColorPicker, Segmented, App, Button } from 'antd';
import type { Color } from 'antd/es/color-picker';
import { ReloadOutlined } from '@ant-design/icons';
import { useSceneStore } from '@/store/sceneStore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import type { SceneLabelConfig, SceneLabelContentMode } from '@/types/sceneLabel';
import {
  SCENE_LABEL_MODE_OPTIONS,
  createDefaultLabelConfig,
  resolveLabelScale,
} from '@/types/sceneLabel';
import { syncLabelObject, syncLabelObjectScaleVisual } from '@/utils/sceneLabel';

interface LabelEditorProps {
  objectId: string;
}

function colorToCss(c: Color | string): string {
  if (typeof c === 'string') return c;
  return c.toRgbString();
}

export function LabelEditor({ objectId }: LabelEditorProps) {
  const { message } = App.useApp();
  const sceneObj = useSceneStore((s) => s.objects.find((o) => o.id === objectId));
  const updateObject = useSceneStore((s) => s.updateObject);
  const getThreeObject = useSceneStore((s) => s.getThreeObject);

  const pages = useUIEditorStore((s) => s.pages);
  const pageOptions = useMemo(
    () =>
      pages.map((p) => ({
        value: p.id,
        label: `${p.name}（${p.canvasWidth}×${p.canvasHeight}）`,
      })),
    [pages]
  );

  const cfg: SceneLabelConfig = {
    ...createDefaultLabelConfig(sceneObj?.label?.mode ?? 'css2d'),
    ...sceneObj?.label,
    scale: resolveLabelScale(sceneObj?.label),
  };

  const modeMeta = SCENE_LABEL_MODE_OPTIONS.find((o) => o.value === cfg.mode);
  const three = getThreeObject(objectId);
  const scaleXYZ: [number, number, number] = three
    ? [three.scale.x, three.scale.y, three.scale.z]
    : (sceneObj?.scale ?? [1, 1, 1]);

  const apply = (patch: Partial<SceneLabelConfig>) => {
    const next: SceneLabelConfig = {
      ...cfg,
      ...patch,
      scale: resolveLabelScale({ ...cfg, ...patch }),
    };
    updateObject(objectId, { label: next });
    const obj = getThreeObject(objectId);
    if (obj) {
      try {
        syncLabelObject(obj, next);
      } catch (err) {
        console.error(err);
        message.error('标签更新失败');
      }
    }
  };

  const setAxisValue = (
    kind: 'position' | 'scale',
    axisIndex: number,
    value: number
  ) => {
    const fallback = kind === 'position' ? ([0, 0, 0] as [number, number, number]) : ([1, 1, 1] as [number, number, number]);
    const current =
      kind === 'position'
        ? ([...(sceneObj?.position ?? fallback)] as [number, number, number])
        : ([...scaleXYZ] as [number, number, number]);
    current[axisIndex] = value;
    updateObject(objectId, { [kind]: current });
    const obj = getThreeObject(objectId);
    if (!obj) return;
    if (kind === 'position') {
      obj.position.set(current[0], current[1], current[2]);
    } else {
      obj.scale.set(current[0], current[1], current[2]);
      syncLabelObjectScaleVisual(obj);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="text-xs text-gray-400 block mb-1">名称</label>
        <Input
          size="small"
          value={sceneObj?.name ?? ''}
          onChange={(e) => {
            const name = e.target.value;
            updateObject(objectId, { name });
            const obj = getThreeObject(objectId);
            if (obj) obj.name = name;
          }}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">渲染模式</label>
        <div className="px-2 py-1.5 text-xs text-cyan-300 bg-gray-800 border border-gray-700 rounded">
          {modeMeta?.label ?? cfg.mode}
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          {modeMeta?.desc ?? '由组件库添加时决定，不可更改'}
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">内容来源</label>
        <Segmented
          block
          size="small"
          value={cfg.contentMode}
          options={[
            { label: '文案', value: 'text' },
            { label: 'UI 页面', value: 'uiPage' },
          ]}
          onChange={(v) => apply({ contentMode: v as SceneLabelContentMode })}
        />
      </div>

      {cfg.contentMode === 'text' ? (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">文案</label>
            <Input.TextArea
              rows={3}
              size="small"
              value={cfg.text}
              onChange={(e) => apply({ text: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">字号</label>
              <InputNumber
                className="w-full"
                size="small"
                min={8}
                max={96}
                value={cfg.fontSize}
                onChange={(v) => apply({ fontSize: Number(v) || 14 })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">内边距</label>
              <InputNumber
                className="w-full"
                size="small"
                min={0}
                max={64}
                value={cfg.padding}
                onChange={(v) => apply({ padding: Number(v) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">文字色</label>
              <ColorPicker
                size="small"
                showText
                value={cfg.color}
                onChange={(c) => apply({ color: colorToCss(c) })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">背景色</label>
              <ColorPicker
                size="small"
                showText
                value={cfg.backgroundColor}
                onChange={(c) => apply({ backgroundColor: colorToCss(c) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">圆角</label>
              <InputNumber
                className="w-full"
                size="small"
                min={0}
                max={48}
                value={cfg.borderRadius}
                onChange={(v) => apply({ borderRadius: Number(v) || 0 })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">边框宽</label>
              <InputNumber
                className="w-full"
                size="small"
                min={0}
                max={8}
                value={cfg.borderWidth}
                onChange={(v) => apply({ borderWidth: Number(v) || 0 })}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">边框色</label>
            <ColorPicker
              size="small"
              showText
              value={cfg.borderColor}
              onChange={(c) => apply({ borderColor: colorToCss(c) })}
            />
          </div>
        </>
      ) : (
        <div>
          <label className="text-xs text-gray-400 block mb-1">绑定 UI 编排页面</label>
          <Select
            key={`ui-pages-${pages.map((p) => p.id).join('-')}`}
            className="w-full"
            size="small"
            allowClear
            placeholder={pageOptions.length ? '选择页面' : '请先在 UI 编排中创建页面'}
            value={cfg.uiPageId}
            options={pageOptions}
            onChange={(uiPageId) => apply({ uiPageId: uiPageId || undefined })}
          />
          <p className="text-[10px] text-gray-500 mt-1">
            嵌入该页 HTML/CSS。改完 UI 后点下方刷新即可同步。
          </p>
          {cfg.uiPageId && (
            <Button
              size="small"
              className="mt-2"
              icon={<ReloadOutlined />}
              onClick={() => apply({})}
            >
              刷新页面内容
            </Button>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 block mb-1">位置</label>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <div key={axis}>
              <label className="text-xs text-gray-500 block mb-0.5">{axis.toUpperCase()}</label>
              <InputNumber
                className="w-full"
                size="small"
                step={0.1}
                value={sceneObj?.position?.[i] ?? 0}
                onChange={(v) => setAxisValue('position', i, Number(v) || 0)}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">缩放</label>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <div key={axis}>
              <label className="text-xs text-gray-500 block mb-0.5">{axis.toUpperCase()}</label>
              <InputNumber
                className="w-full"
                size="small"
                min={0.01}
                step={0.1}
                value={Number(scaleXYZ[i].toFixed(3))}
                onChange={(v) => setAxisValue('scale', i, Number(v) || 1)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
