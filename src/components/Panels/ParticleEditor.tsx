import { Switch, Button, App } from 'antd';
import { useState } from 'react';
import { useParticleStore } from '@/store/particleStore';
import { useSceneStore } from '@/store/sceneStore';
import { DEFAULT_PARTICLE_CONFIG } from '@/types/particle';
import { syncParticleConfig } from '@/utils/particleScene';
import {
  exportParticleConfigJson,
  parseCustomParticleJson,
} from '@/particles/quarksAdapter';
import type { ParticleEmitterConfig } from '@/types/particle';
import { getParticleEmitSizeMeta } from '@/particles/particleEmitMeta';

interface ParticleEditorProps {
  objectId: string;
}

function NumberField({
  label,
  value,
  step = 0.1,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 block mb-0.5">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
      />
    </div>
  );
}

export function ParticleEditor({ objectId }: ParticleEditorProps) {
  const { message } = App.useApp();
  const stored = useParticleStore((s) => s.emitters[objectId]);
  const config = stored ?? DEFAULT_PARTICLE_CONFIG;
  const [jsonDraft, setJsonDraft] = useState('');
  const emitMeta = getParticleEmitSizeMeta(config.emitShape, config.preset);

  const update = (updates: Partial<ParticleEmitterConfig>) => {
    const next = { ...config, ...updates };
    syncParticleConfig(objectId, next);
    if (updates.enabled !== undefined) {
      useSceneStore.getState().updateObject(objectId, { visible: updates.enabled });
    }
  };

  const handleExportJson = async () => {
    const text = exportParticleConfigJson({ ...config, preset: 'custom' });
    try {
      await navigator.clipboard.writeText(text);
      message.success('粒子配置已复制到剪贴板');
    } catch {
      setJsonDraft(text);
      message.info('已填入下方文本框，请手动复制');
    }
  };

  const handleImportJson = () => {
    const text = jsonDraft.trim();
    if (!text) {
      message.warning('请先粘贴 JSON');
      return;
    }

    const parsed = parseCustomParticleJson(text);
    if (!parsed) {
      message.error('无法识别的 JSON 格式');
      return;
    }

    if (parsed.kind === 'quarks') {
      syncParticleConfig(objectId, {
        ...config,
        preset: 'custom',
        customQuarksJson: parsed.json,
      });
      message.success('已应用 Quarks 原生效果 JSON');
      return;
    }

    syncParticleConfig(objectId, {
      ...config,
      ...parsed.config,
      preset: 'custom',
    });
    message.success('已应用自定义粒子配置');
  };

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-300">粒子发射器</h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">启用</span>
          <Switch size="small" checked={config.enabled} onChange={(v) => update({ enabled: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="最大粒子数"
          value={config.maxParticles}
          step={50}
          min={50}
          max={15000}
          onChange={(v) => update({ maxParticles: Math.round(v) })}
        />
        <NumberField
          label="发射速率 / 秒"
          value={config.emissionRate}
          step={5}
          min={0}
          onChange={(v) => update({ emissionRate: v })}
        />
        <NumberField
          label="寿命最小 (秒)"
          value={config.lifetimeMin}
          step={0.1}
          min={0.1}
          onChange={(v) => update({ lifetimeMin: v })}
        />
        <NumberField
          label="寿命最大 (秒)"
          value={config.lifetimeMax}
          step={0.1}
          min={0.1}
          onChange={(v) => update({ lifetimeMax: v })}
        />
        <NumberField
          label="起始大小"
          value={config.sizeStart}
          step={0.05}
          min={0.01}
          onChange={(v) => update({ sizeStart: v })}
        />
        <NumberField
          label="结束大小"
          value={config.sizeEnd}
          step={0.05}
          min={0.01}
          onChange={(v) => update({ sizeEnd: v })}
        />
        <NumberField
          label="速度最小"
          value={config.speedMin}
          step={0.1}
          onChange={(v) => update({ speedMin: v })}
        />
        <NumberField
          label="速度最大"
          value={config.speedMax}
          step={0.1}
          onChange={(v) => update({ speedMax: v })}
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-500 block mb-1">发射形状</label>
        <select
          value={config.emitShape}
          onChange={(e) =>
            update({ emitShape: e.target.value as ParticleEmitterConfig['emitShape'] })
          }
          className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
        >
          <option value="point">点</option>
          <option value="sphere">球体</option>
          <option value="box">平面网格</option>
          <option value="cone">锥形</option>
        </select>
      </div>

      {(config.emitShape !== 'point') && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1.5">{emitMeta.note}</p>
          <div className={`grid gap-2 ${emitMeta.showY ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <NumberField
              label={emitMeta.x}
              value={config.emitSize[0]}
              step={0.5}
              min={0.1}
              onChange={(v) => {
                const s = [...config.emitSize] as [number, number, number];
                s[0] = v;
                if (config.emitShape === 'sphere' || config.emitShape === 'cone') {
                  s[1] = v;
                  s[2] = v;
                }
                update({ emitSize: s });
              }}
            />
            {emitMeta.showY && (
              <NumberField
                label={emitMeta.y}
                value={config.emitSize[1]}
                step={0.1}
                min={0.01}
                onChange={(v) => {
                  const s = [...config.emitSize] as [number, number, number];
                  s[1] = v;
                  update({ emitSize: s });
                }}
              />
            )}
            {!emitMeta.showY && config.emitShape === 'box' && (
              <NumberField
                label={emitMeta.z}
                value={config.emitSize[2]}
                step={0.5}
                min={0.1}
                onChange={(v) => {
                  const s = [...config.emitSize] as [number, number, number];
                  s[2] = v;
                  update({ emitSize: s });
                }}
              />
            )}
            {emitMeta.showY && (
              <NumberField
                label={emitMeta.z}
                value={config.emitSize[2]}
                step={0.1}
                min={0.01}
                onChange={(v) => {
                  const s = [...config.emitSize] as [number, number, number];
                  s[2] = v;
                  update({ emitSize: s });
                }}
              />
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">起始颜色</label>
          <input
            type="color"
            value={config.colorStart}
            onChange={(e) => update({ colorStart: e.target.value })}
            className="w-full h-7 rounded cursor-pointer bg-gray-700 border border-gray-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">结束颜色</label>
          <input
            type="color"
            value={config.colorEnd}
            onChange={(e) => update({ colorEnd: e.target.value })}
            className="w-full h-7 rounded cursor-pointer bg-gray-700 border border-gray-600"
          />
        </div>
        <NumberField
          label="起始透明度"
          value={config.opacityStart}
          step={0.05}
          min={0}
          max={1}
          onChange={(v) => update({ opacityStart: v })}
        />
        <NumberField
          label="结束透明度"
          value={config.opacityEnd}
          step={0.05}
          min={0}
          max={1}
          onChange={(v) => update({ opacityEnd: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="湍流强度"
          value={config.turbulence}
          step={0.1}
          min={0}
          max={5}
          onChange={(v) => update({ turbulence: v })}
        />
        <NumberField
          label="扩散角 (弧度)"
          value={config.spread}
          step={0.1}
          min={0}
          max={3.14}
          onChange={(v) => update({ spread: v })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="重力 X"
          value={config.gravity[0]}
          step={0.1}
          onChange={(v) => {
            const g = [...config.gravity] as [number, number, number];
            g[0] = v;
            update({ gravity: g });
          }}
        />
        <NumberField
          label="重力 Y"
          value={config.gravity[1]}
          step={0.1}
          onChange={(v) => {
            const g = [...config.gravity] as [number, number, number];
            g[1] = v;
            update({ gravity: g });
          }}
        />
        <NumberField
          label="重力 Z"
          value={config.gravity[2]}
          step={0.1}
          onChange={(v) => {
            const g = [...config.gravity] as [number, number, number];
            g[2] = v;
            update({ gravity: g });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">混合模式</label>
          <select
            value={config.blendMode}
            onChange={(e) =>
              update({ blendMode: e.target.value as ParticleEmitterConfig['blendMode'] })
            }
            className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
          >
            <option value="normal">正常（烟雾）</option>
            <option value="additive">加法（火焰/火花）</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">粒子贴图</label>
          <select
            value={config.texture}
            onChange={(e) =>
              update({ texture: e.target.value as ParticleEmitterConfig['texture'] })
            }
            className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
          >
            <option value="smoke">烟雾团块</option>
            <option value="soft">柔和光斑</option>
            <option value="spark">火花星芒</option>
            <option value="custom">自定义贴图</option>
          </select>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 -mt-2">
        混合模式与贴图的可选项列表相同，但<strong className="text-gray-400">每个发射器各自保存</strong>当前选中值，互不影响。
      </p>

      {config.texture === 'custom' && (
        <div className="space-y-2">
          <label className="text-[10px] text-gray-500 block">上传粒子贴图（PNG/JPG，建议带透明通道）</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="w-full text-[10px] text-gray-400"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              update({ texture: 'custom', customTextureUrl: url });
              message.success('贴图已应用');
            }}
          />
          {config.customTextureUrl && (
            <div className="flex items-center gap-2">
              <img
                src={config.customTextureUrl}
                alt="粒子贴图预览"
                className="w-10 h-10 object-cover rounded border border-gray-600"
              />
              <button
                type="button"
                className="text-[10px] text-red-400 hover:underline"
                onClick={() => update({ customTextureUrl: undefined, texture: 'soft' })}
              >
                清除自定义贴图
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-700">
        <span className="text-[10px] text-gray-500">显示发射区域辅助</span>
        <Switch
          size="small"
          checked={config.showHelper}
          onChange={(v) => update({ showHelper: v })}
        />
      </div>

      <div className="pt-3 border-t border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-gray-300">自定义 JSON</h4>
          <span className="text-[10px] text-purple-400">three.quarks</span>
        </div>
        <p className="text-[10px] text-gray-500">
          支持导出/导入本编辑器配置 JSON，或粘贴{' '}
          <a
            href="https://demo.quarks.art/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            quarks.art
          </a>{' '}
          导出的原生效果 JSON（含 version + shape 字段）。
        </p>
        <div className="flex gap-2">
          <Button size="small" onClick={handleExportJson}>
            导出配置
          </Button>
          <Button size="small" type="primary" onClick={handleImportJson}>
            应用 JSON
          </Button>
          {config.customQuarksJson && (
            <Button
              size="small"
              danger
              onClick={() => update({ customQuarksJson: undefined })}
            >
              清除 Quarks JSON
            </Button>
          )}
        </div>
        <textarea
          value={jsonDraft}
          onChange={(e) => setJsonDraft(e.target.value)}
          placeholder='粘贴粒子配置 JSON 或 Quarks 效果 JSON…'
          className="w-full h-28 px-2 py-1 text-[10px] font-mono bg-gray-800 text-gray-200 border border-gray-600 rounded resize-y"
        />
      </div>
    </div>
  );
}
