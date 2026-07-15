import { Button, ColorPicker, Input, InputNumber, Select, Slider } from 'antd';
import { useSceneStore } from '@/store/sceneStore';
import { useTourStore } from '@/store/tourStore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { listChildNodeNames, readNodeTransform } from '@/runtime/sceneApi';
import {
  DEFAULT_CAMERA_DURATION,
  DEFAULT_TRANSFORM_DURATION,
  UI_ACTION_TRIGGER_OPTIONS,
  UI_ACTION_TYPE_OPTIONS,
  VISIBILITY_MODE_OPTIONS,
  createEmptyUIAction,
  resolveActionTargetIds,
  type UIAction,
  type UIActionType,
  type UIActionTrigger,
  type VisibilityMode,
} from '@/types/uiInteraction';
import { PropertyGroup } from './PropertyGroup';

const selectProps = {
  size: 'small' as const,
  className: 'export-panel-select',
  classNames: { popup: { root: 'export-panel-select-popup' } },
};

/** 按动作类型区分卡片色调，方便一眼分辨 */
const ACTION_TONE: Record<UIActionType, string> = {
  'object.setVisible': 'teal',
  'object.select': 'sky',
  'object.focus': 'amber',
  'object.setMaterial': 'violet',
  'object.setTransform': 'cyan',
  'camera.set': 'amber',
  'ui.setVisible': 'rose',
  'tour.play': 'lime',
  'tour.pause': 'lime',
  'tour.stop': 'lime',
  custom: 'slate',
};

interface UIInteractionPanelProps {
  elementId: string;
  actions?: UIAction[];
}

function Vec3Inputs({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value?: { x: number; y: number; z: number };
  fallback: { x: number; y: number; z: number };
  onChange: (v: { x: number; y: number; z: number }) => void;
}) {
  return (
    <div className="ui-property-vec3">
      <div className="ui-property-vec3-label">{label}</div>
      <div className="ui-property-vec3-axes">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="ui-property-vec3-axis">
            <span>{axis.toUpperCase()}</span>
            <InputNumber
              size="small"
              controls={false}
              value={value?.[axis]}
              placeholder={String(fallback[axis])}
              onChange={(v) =>
                onChange({
                  x: value?.x ?? fallback.x,
                  y: value?.y ?? fallback.y,
                  z: value?.z ?? fallback.z,
                  [axis]: Number(v) || 0,
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function UIInteractionPanel({ elementId, actions = [] }: UIInteractionPanelProps) {
  const updateElement = useUIEditorStore((s) => s.updateElement);
  const elements = useUIEditorStore((s) => s.elements);
  const objects = useSceneStore((s) => s.objects);
  const tours = useTourStore((s) => s.tours);

  const objectOptions = objects
    .filter((o) => o.type === 'mesh' || o.type === 'group' || o.type === 'particle')
    .map((o) => ({ label: `${o.name}`, value: o.id }));

  const uiOptions = elements.map((el) => ({
    label: el.id === elementId ? `${el.name}（自身）` : `${el.name}（${el.type}）`,
    value: el.id,
  }));

  const tourOptions = tours.map((t) => ({
    label: `${t.name}${t.stops.length === 0 ? '（无站点）' : ''}`,
    value: t.id,
  }));

  const setActions = (next: UIAction[]) => {
    updateElement(elementId, { actions: next.length > 0 ? next : undefined });
  };

  /** 始终基于 store 最新 actions，避免连续更新互相覆盖（如选模型后同步变换丢掉 targetId） */
  const getLatestActions = (): UIAction[] => {
    const el = useUIEditorStore.getState().elements.find((e) => e.id === elementId);
    return el?.actions ?? actions;
  };

  const updateAction = (index: number, patch: Partial<UIAction>) => {
    const current = getLatestActions();
    const next = current.map((a, i) => (i === index ? { ...a, ...patch } : a));
    setActions(next);
  };

  const updateParams = (index: number, paramsPatch: NonNullable<UIAction['params']>) => {
    const current = getLatestActions()[index];
    if (!current) return;
    updateAction(index, { params: { ...current.params, ...paramsPatch } });
  };

  const metaOf = (type: UIActionType) =>
    UI_ACTION_TYPE_OPTIONS.find((o) => o.value === type) ?? UI_ACTION_TYPE_OPTIONS[0];

  const captureCamera = (index: number) => {
    const camera = window.__editorCamera;
    const controls = window.__editorControls;
    if (!camera || !controls) return;
    updateParams(index, {
      position: {
        x: Number(camera.position.x.toFixed(3)),
        y: Number(camera.position.y.toFixed(3)),
        z: Number(camera.position.z.toFixed(3)),
      },
      target: {
        x: Number(controls.target.x.toFixed(3)),
        y: Number(controls.target.y.toFixed(3)),
        z: Number(controls.target.z.toFixed(3)),
      },
    });
  };

  const syncTransformFromModel = (index: number, objectId?: string, nodeName?: string) => {
    if (!objectId) return;
    const transform = readNodeTransform(objectId, nodeName);
    const current = getLatestActions()[index];
    updateAction(index, {
      targetId: objectId,
      params: {
        ...current?.params,
        ...(transform
          ? {
              position: transform.position,
              rotation: transform.rotation,
              scale: transform.scale,
            }
          : {}),
        nodeName: nodeName || undefined,
        duration: current?.params?.duration ?? DEFAULT_TRANSFORM_DURATION,
      },
    });
  };

  const cameraDefaultsFromView = () => {
    const camera = window.__editorCamera;
    const controls = window.__editorControls;
    if (camera && controls) {
      return {
        position: {
          x: Number(camera.position.x.toFixed(3)),
          y: Number(camera.position.y.toFixed(3)),
          z: Number(camera.position.z.toFixed(3)),
        },
        target: {
          x: Number(controls.target.x.toFixed(3)),
          y: Number(controls.target.y.toFixed(3)),
          z: Number(controls.target.z.toFixed(3)),
        },
      };
    }
    return {
      position: { x: 10, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 },
    };
  };

  if (!elementId) {
    return <div className="ui-property-empty">选中组件后在此配置场景交互</div>;
  }

  return (
    <PropertyGroup title="场景交互">
      {actions.map((action, index) => {
        const meta = metaOf(action.type === 'object.focus' ? 'camera.set' : action.type);
        const actionType = action.type === 'object.focus' ? 'camera.set' : action.type;
        const tone = ACTION_TONE[actionType] ?? ACTION_TONE.custom;
        const nodeOptions = action.targetId ? listChildNodeNames(action.targetId) : [];

        return (
          <div
            key={action.id}
            className={`ui-action-card ui-action-card--${tone}`}
          >
            <div className="ui-action-card-head">
              <span className="ui-action-card-badge">{meta.label}</span>
              <span className="ui-action-card-index">#{index + 1}</span>
            </div>
            <div className="ui-property-row">
              <label>事件</label>
              <Select
                {...selectProps}
                value={action.trigger || 'click'}
                style={{ flex: 1, minWidth: 0 }}
                options={UI_ACTION_TRIGGER_OPTIONS}
                onChange={(trigger: UIActionTrigger) => updateAction(index, { trigger })}
              />
            </div>

            <div className="ui-property-row">
              <label>动作</label>
              <Select
                {...selectProps}
                value={actionType}
                style={{ flex: 1, minWidth: 0 }}
                options={UI_ACTION_TYPE_OPTIONS.map((o) => ({
                  label: o.label,
                  value: o.value,
                }))}
                onChange={(type: UIActionType) => {
                  const nextMeta = metaOf(type);
                  const cam = type === 'camera.set' ? cameraDefaultsFromView() : null;
                  updateAction(index, {
                    type,
                    targetId:
                      nextMeta.targetKind === 'none' || nextMeta.targetKind === 'ui'
                        ? undefined
                        : nextMeta.targetKind === meta.targetKind
                          ? action.targetId
                          : undefined,
                    targetIds: nextMeta.targetKind === 'ui' ? action.targetIds : undefined,
                    params: {
                      visibilityMode: action.params?.visibilityMode ?? 'toggle',
                      duration:
                        type === 'camera.set'
                          ? (action.params?.duration ?? DEFAULT_CAMERA_DURATION)
                          : type === 'object.setTransform'
                            ? (action.params?.duration ?? DEFAULT_TRANSFORM_DURATION)
                            : action.params?.duration,
                      ...(cam
                        ? { position: cam.position, target: cam.target }
                        : type === 'object.setTransform'
                          ? {
                              duration:
                                action.params?.duration ?? DEFAULT_TRANSFORM_DURATION,
                            }
                          : {
                              position: action.params?.position,
                              target: action.params?.target,
                              rotation: action.params?.rotation,
                              scale: action.params?.scale,
                              nodeName: action.params?.nodeName,
                              color: action.params?.color,
                              metalness: action.params?.metalness,
                              roughness: action.params?.roughness,
                              opacity: action.params?.opacity,
                              emissive: action.params?.emissive,
                              fn: action.params?.fn,
                            }),
                    },
                  });
                  if (type === 'object.setTransform' && action.targetId) {
                    setTimeout(
                      () => syncTransformFromModel(index, action.targetId, action.params?.nodeName),
                      0
                    );
                  }
                }}
              />
            </div>

            {meta.targetKind === 'object' && (
              <div className="ui-property-row">
                <label>模型</label>
                <Select
                  {...selectProps}
                  showSearch
                  optionFilterProp="label"
                  value={action.targetId}
                  placeholder="选择场景对象"
                  style={{ flex: 1, minWidth: 0 }}
                  options={objectOptions}
                  onChange={(v) => {
                    if (actionType === 'object.setTransform') {
                      // 一次写入 targetId + 变换，避免二次更新覆盖
                      syncTransformFromModel(index, v, undefined);
                    } else {
                      updateAction(index, { targetId: v });
                    }
                  }}
                />
              </div>
            )}

            {meta.targetKind === 'ui' && (
              <div className="ui-property-row">
                <label>面板</label>
                <Select
                  {...selectProps}
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={resolveActionTargetIds(action)}
                  placeholder="可多选 UI 元素"
                  style={{ flex: 1, minWidth: 0 }}
                  options={uiOptions}
                  onChange={(ids: string[]) =>
                    updateAction(index, {
                      targetIds: ids,
                      targetId: ids[0],
                    })
                  }
                />
              </div>
            )}

            {meta.targetKind === 'tour' && (
              <div className="ui-property-row">
                <label>漫游</label>
                <Select
                  {...selectProps}
                  allowClear
                  value={action.targetId}
                  placeholder="默认当前激活路线"
                  style={{ flex: 1, minWidth: 0 }}
                  options={tourOptions}
                  onChange={(v) => updateAction(index, { targetId: v || undefined })}
                />
              </div>
            )}

            {(actionType === 'object.setVisible' || actionType === 'ui.setVisible') && (
              <div className="ui-property-row">
                <label>显隐</label>
                <Select
                  {...selectProps}
                  value={(action.params?.visibilityMode as VisibilityMode) || 'toggle'}
                  style={{ flex: 1, minWidth: 0 }}
                  options={VISIBILITY_MODE_OPTIONS}
                  onChange={(visibilityMode: VisibilityMode) =>
                    updateParams(index, { visibilityMode })
                  }
                />
              </div>
            )}

            {actionType === 'camera.set' && (
              <>
                <div className="ui-property-row">
                  <label>过渡(秒)</label>
                  <InputNumber
                    size="small"
                    min={0}
                    max={30}
                    step={0.1}
                    value={action.params?.duration ?? DEFAULT_CAMERA_DURATION}
                    onChange={(v) =>
                      updateParams(index, { duration: Number(v) || DEFAULT_CAMERA_DURATION })
                    }
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
                <Vec3Inputs
                  label="相机终点位置"
                  value={action.params?.position}
                  fallback={{ x: 10, y: 10, z: 10 }}
                  onChange={(position) => updateParams(index, { position })}
                />
                <Vec3Inputs
                  label="注视目标点"
                  value={action.params?.target}
                  fallback={{ x: 0, y: 0, z: 0 }}
                  onChange={(target) => updateParams(index, { target })}
                />
                <Button size="small" block onClick={() => captureCamera(index)}>
                  从当前视角填入
                </Button>
              </>
            )}

            {(actionType === 'object.setMaterial' || actionType === 'object.setTransform') && (
              <div className="ui-property-row">
                <label>子节点</label>
                <Select
                  {...selectProps}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={action.params?.nodeName}
                  placeholder="空=整个模型"
                  style={{ flex: 1, minWidth: 0 }}
                  options={nodeOptions.map((n) => ({ label: n, value: n }))}
                  onChange={(v) => {
                    if (actionType === 'object.setTransform' && action.targetId) {
                      syncTransformFromModel(index, action.targetId, v || undefined);
                    } else {
                      updateParams(index, { nodeName: v || undefined });
                    }
                  }}
                />
              </div>
            )}

            {actionType === 'object.setTransform' && action.targetId && (
              <Button
                size="small"
                block
                onClick={() =>
                  syncTransformFromModel(index, action.targetId, action.params?.nodeName)
                }
              >
                同步当前模型变换
              </Button>
            )}

            {actionType === 'object.setMaterial' && (
              <>
                <div className="ui-property-row">
                  <label>颜色</label>
                  <ColorPicker
                    size="small"
                    value={action.params?.color || '#ffffff'}
                    onChange={(_, hex) => updateParams(index, { color: hex })}
                  />
                </div>
                <div className="ui-property-row">
                  <label>自发光</label>
                  <ColorPicker
                    size="small"
                    value={action.params?.emissive || '#000000'}
                    onChange={(_, hex) => updateParams(index, { emissive: hex })}
                  />
                </div>
                <div className="ui-property-row">
                  <label>金属度</label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={action.params?.metalness ?? 0.5}
                    onChange={(v) => updateParams(index, { metalness: v })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
                <div className="ui-property-row">
                  <label>粗糙度</label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={action.params?.roughness ?? 0.5}
                    onChange={(v) => updateParams(index, { roughness: v })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
                <div className="ui-property-row">
                  <label>透明度</label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={action.params?.opacity ?? 1}
                    onChange={(v) => updateParams(index, { opacity: v })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              </>
            )}

            {actionType === 'object.setTransform' && (
              <>
                <Vec3Inputs
                  label="位置"
                  value={action.params?.position}
                  fallback={{ x: 0, y: 0, z: 0 }}
                  onChange={(position) => updateParams(index, { position })}
                />
                <Vec3Inputs
                  label="旋转°"
                  value={action.params?.rotation}
                  fallback={{ x: 0, y: 0, z: 0 }}
                  onChange={(rotation) => updateParams(index, { rotation })}
                />
                <Vec3Inputs
                  label="缩放"
                  value={action.params?.scale}
                  fallback={{ x: 1, y: 1, z: 1 }}
                  onChange={(scale) => updateParams(index, { scale })}
                />
                <div className="ui-property-row">
                  <label>过渡(秒)</label>
                  <InputNumber
                    size="small"
                    min={0}
                    max={30}
                    step={0.1}
                    value={action.params?.duration ?? DEFAULT_TRANSFORM_DURATION}
                    onChange={(v) =>
                      updateParams(index, {
                        duration: typeof v === 'number' ? v : DEFAULT_TRANSFORM_DURATION,
                      })
                    }
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              </>
            )}

            {actionType === 'custom' && (
              <div className="ui-property-row">
                <label>函数名</label>
                <Input
                  size="small"
                  value={action.params?.fn || ''}
                  placeholder="window 上的函数名"
                  onChange={(e) => updateParams(index, { fn: e.target.value.trim() })}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </div>
            )}

            <Button
              size="small"
              danger
              block
              onClick={() => setActions(actions.filter((_, i) => i !== index))}
            >
              删除此动作
            </Button>
          </div>
        );
      })}

      <Button
        size="small"
        block
        type="dashed"
        onClick={() => setActions([...actions, createEmptyUIAction()])}
      >
        + 添加交互
      </Button>
    </PropertyGroup>
  );
}
