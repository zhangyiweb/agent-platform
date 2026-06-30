import { useState, useEffect, useCallback } from 'react';
import { Switch, Typography } from 'antd';
import type { PostProcessEffectId, PostProcessParams } from '@/types/postProcess';
import {
  DEFAULT_POST_PROCESS_PARAMS,
  POST_PROCESS_EFFECT_GROUPS,
  POST_PROCESS_PRESETS,
  mergePostProcessParams,
  buildPostProcessConfig,
} from '@/config/postProcessPresets';

const { Text } = Typography;

function loadSavedPostProcess() {
  const saved = (window as any).__globalSettingsState as Record<string, unknown> | undefined;
  const block = saved?.postProcess as {
    enabled?: boolean;
    effect?: PostProcessEffectId;
    presetId?: string;
    params?: PostProcessParams;
  } | undefined;

  if (block?.params) {
    return {
      enabled: block.enabled ?? false,
      effect: block.effect ?? 'none',
      presetId: block.presetId ?? 'custom',
      params: mergePostProcessParams(DEFAULT_POST_PROCESS_PARAMS, block.params as never),
    };
  }

  // 兼容旧版扁平字段
  return {
    enabled: (saved?.postProcessEnabled as boolean) ?? false,
    effect: (saved?.selectedEffect as PostProcessEffectId) ?? 'none',
    presetId: 'custom',
    params: mergePostProcessParams(DEFAULT_POST_PROCESS_PARAMS, {
      bloom: {
        intensity: (saved?.bloomIntensity as number) ?? DEFAULT_POST_PROCESS_PARAMS.bloom.intensity,
        radius: (saved?.bloomRadius as number) ?? DEFAULT_POST_PROCESS_PARAMS.bloom.radius,
        threshold: (saved?.bloomThreshold as number) ?? DEFAULT_POST_PROCESS_PARAMS.bloom.threshold,
      },
      vignette: { darkness: (saved?.vignetteDarkness as number) ?? DEFAULT_POST_PROCESS_PARAMS.vignette.darkness },
      film: { intensity: (saved?.filmGrain as number) ?? DEFAULT_POST_PROCESS_PARAMS.film.intensity },
      pixelate: { size: (saved?.pixelSize as number) ?? DEFAULT_POST_PROCESS_PARAMS.pixelate.size },
      glitch: { dtSize: Math.round(((saved?.glitchIntensity as number) ?? 0.5) * 128) },
      chromatic: { amount: (saved?.chromaticAmount as number) ?? DEFAULT_POST_PROCESS_PARAMS.chromatic.amount },
    }),
  };
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v: number) => v.toFixed(2),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="mb-2.5">
      <label className="text-[11px] text-gray-400 block mb-1">
        {label}: {format(value)}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
}

function EffectHint({ effect }: { effect: PostProcessEffectId }) {
  const hint = POST_PROCESS_EFFECT_GROUPS
    .flatMap((g) => g.effects)
    .find((e) => e.id === effect)?.hint;
  if (!hint) return null;
  return (
    <Text type="secondary" className="text-[10px] block mt-1.5 leading-relaxed">
      {hint}
    </Text>
  );
}

export function PostProcessSettings() {
  const [enabled, setEnabled] = useState(() => loadSavedPostProcess().enabled);
  const [effect, setEffect] = useState<PostProcessEffectId>(() => loadSavedPostProcess().effect);
  const [presetId, setPresetId] = useState(() => loadSavedPostProcess().presetId);
  const [params, setParams] = useState<PostProcessParams>(() => loadSavedPostProcess().params);

  const patchParams = useCallback(<K extends keyof PostProcessParams>(
    key: K,
    patch: Partial<PostProcessParams[K]>
  ) => {
    setPresetId('custom');
    setParams((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = POST_PROCESS_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    if (id !== 'custom') {
      setEffect(preset.effect);
      setParams(mergePostProcessParams(DEFAULT_POST_PROCESS_PARAMS, preset.params));
    }
  }, []);

  const handleEffectChange = (next: PostProcessEffectId) => {
    setPresetId('custom');
    setEffect(next);
  };

  useEffect(() => {
    const config = buildPostProcessConfig(enabled, effect, presetId, params);
    (window as any).__postProcessConfig = config;

    const prev = (window as any).__globalSettingsState ?? {};
    (window as any).__globalSettingsState = {
      ...prev,
      postProcess: { enabled, effect, presetId, params },
    };
  }, [enabled, effect, presetId, params]);

  const renderParams = () => {
    switch (effect) {
      case 'bloom':
        return (
          <>
            <SliderRow label="强度 (strength)" value={params.bloom.intensity} min={0} max={3} step={0.05}
              onChange={(v) => patchParams('bloom', { intensity: v })} />
            <SliderRow label="半径 (radius)" value={params.bloom.radius} min={0} max={1} step={0.01}
              onChange={(v) => patchParams('bloom', { radius: v })} />
            <SliderRow label="阈值 (threshold)" value={params.bloom.threshold} min={0} max={1} step={0.01}
              onChange={(v) => patchParams('bloom', { threshold: v })} />
          </>
        );
      case 'vignette':
        return (
          <SliderRow label="暗度 (darkness)" value={params.vignette.darkness} min={0} max={1.2} step={0.01}
            onChange={(v) => patchParams('vignette', { darkness: v })} />
        );
      case 'film':
        return (
          <>
            <SliderRow label="颗粒强度 (intensity)" value={params.film.intensity} min={0} max={1} step={0.01}
              onChange={(v) => patchParams('film', { intensity: v })} />
            <label className="flex items-center justify-between text-[11px] text-gray-400 py-1">
              <span>黑白 (grayscale)</span>
              <Switch size="small" checked={params.film.grayscale}
                onChange={(v) => patchParams('film', { grayscale: v })} />
            </label>
          </>
        );
      case 'chromatic':
        return (
          <SliderRow label="色差量 (amount)" value={params.chromatic.amount} min={0} max={0.02} step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(v) => patchParams('chromatic', { amount: v })} />
        );
      case 'pixelate':
        return (
          <SliderRow label="像素块 (pixelSize)" value={params.pixelate.size} min={1} max={24} step={0.5}
            format={(v) => v.toFixed(1)}
            onChange={(v) => patchParams('pixelate', { size: v })} />
        );
      case 'glitch':
        return (
          <>
            <SliderRow label="块大小 (dtSize)" value={params.glitch.dtSize} min={8} max={128} step={8}
              format={(v) => String(Math.round(v))}
              onChange={(v) => patchParams('glitch', { dtSize: Math.round(v) })} />
            <label className="flex items-center justify-between text-[11px] text-gray-400 py-1">
              <span>增强模式 (goWild)</span>
              <Switch size="small" checked={params.glitch.goWild}
                onChange={(v) => patchParams('glitch', { goWild: v })} />
            </label>
          </>
        );
      case 'outline':
        return (
          <>
            <SliderRow label="边缘强度 (edgeStrength)" value={params.outline.edgeStrength} min={0.5} max={10} step={0.1}
              onChange={(v) => patchParams('outline', { edgeStrength: v })} />
            <SliderRow label="发光 (edgeGlow)" value={params.outline.edgeGlow} min={0} max={3} step={0.05}
              onChange={(v) => patchParams('outline', { edgeGlow: v })} />
            <SliderRow label="线宽 (edgeThickness)" value={params.outline.edgeThickness} min={0.5} max={4} step={0.1}
              onChange={(v) => patchParams('outline', { edgeThickness: v })} />
            <SliderRow label="脉冲周期 (pulsePeriod)" value={params.outline.pulsePeriod} min={0} max={5} step={0.1}
              format={(v) => (v === 0 ? '关闭' : v.toFixed(1))}
              onChange={(v) => patchParams('outline', { pulsePeriod: v })} />
          </>
        );
      case 'bokeh':
        return (
          <>
            <SliderRow label="对焦距离 (focus)" value={params.bokeh.focus} min={0.1} max={100} step={0.5}
              onChange={(v) => patchParams('bokeh', { focus: v })} />
            <SliderRow label="光圈 (aperture)" value={params.bokeh.aperture} min={0.000001} max={0.0001} step={0.000001}
              format={(v) => v.toExponential(1)}
              onChange={(v) => patchParams('bokeh', { aperture: v })} />
            <SliderRow label="最大模糊 (maxblur)" value={params.bokeh.maxblur} min={0.001} max={0.05} step={0.001}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchParams('bokeh', { maxblur: v })} />
          </>
        );
      case 'afterimage':
        return (
          <SliderRow label="残影强度 (damp)" value={params.afterimage.damp} min={0.5} max={0.99} step={0.01}
            onChange={(v) => patchParams('afterimage', { damp: v })} />
        );
      case 'halftone':
        return (
          <>
            <SliderRow label="网点半径 (radius)" value={params.halftone.radius} min={1} max={12} step={0.5}
              onChange={(v) => patchParams('halftone', { radius: v })} />
            <SliderRow label="散射 (scatter)" value={params.halftone.scatter} min={0} max={1} step={0.05}
              onChange={(v) => patchParams('halftone', { scatter: v })} />
            <SliderRow label="混合 (blending)" value={params.halftone.blending} min={0} max={1} step={0.05}
              onChange={(v) => patchParams('halftone', { blending: v })} />
          </>
        );
      case 'dotscreen':
        return (
          <>
            <SliderRow label="点阵密度 (scale)" value={params.dotscreen.scale} min={0.2} max={2} step={0.05}
              onChange={(v) => patchParams('dotscreen', { scale: v })} />
            <SliderRow label="角度 (angle)" value={params.dotscreen.angle} min={0} max={3.14} step={0.05}
              format={(v) => `${((v * 180) / Math.PI).toFixed(0)}°`}
              onChange={(v) => patchParams('dotscreen', { angle: v })} />
          </>
        );
      case 'sao':
        return (
          <>
            <SliderRow label="偏移 (bias)" value={params.sao.bias} min={0} max={2} step={0.05}
              onChange={(v) => patchParams('sao', { bias: v })} />
            <SliderRow label="强度 (intensity)" value={params.sao.intensity} min={0.000001} max={0.00005} step={0.000001}
              format={(v) => v.toExponential(1)}
              onChange={(v) => patchParams('sao', { intensity: v })} />
            <SliderRow label="范围 (scale)" value={params.sao.scale} min={1} max={30} step={1}
              format={(v) => String(Math.round(v))}
              onChange={(v) => patchParams('sao', { scale: v })} />
            <SliderRow label="核半径 (kernelRadius)" value={params.sao.kernelRadius} min={8} max={64} step={2}
              format={(v) => String(Math.round(v))}
              onChange={(v) => patchParams('sao', { kernelRadius: v })} />
          </>
        );
      case 'ssao':
        return (
          <>
            <SliderRow label="采样半径 (kernelRadius)" value={params.ssao.kernelRadius} min={4} max={32} step={1}
              format={(v) => String(Math.round(v))}
              onChange={(v) => patchParams('ssao', { kernelRadius: v })} />
            <SliderRow label="最近距离 (minDistance)" value={params.ssao.minDistance} min={0.001} max={0.02} step={0.001}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchParams('ssao', { minDistance: v })} />
            <SliderRow label="最远距离 (maxDistance)" value={params.ssao.maxDistance} min={0.02} max={0.3} step={0.01}
              onChange={(v) => patchParams('ssao', { maxDistance: v })} />
          </>
        );
      case 'pixelated':
        return (
          <SliderRow label="像素尺寸 (pixelSize)" value={params.pixelated.size} min={2} max={16} step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => patchParams('pixelated', { size: Math.round(v) })} />
        );
      case 'fxaa':
      case 'sobel':
      case 'none':
        return (
          <Text type="secondary" className="text-[10px] block">
            此效果无需额外参数，或参数由渲染器自动处理。
          </Text>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2.5 py-2 bg-gray-800/80 rounded-lg border border-gray-700/80">
        <Text className="text-xs text-gray-200">启用后期处理</Text>
        <Switch size="small" checked={enabled} onChange={setEnabled} />
      </div>

      {enabled && (
        <>
          {/* 预设 */}
          <div>
            <Text className="text-[11px] text-gray-400 block mb-1.5">快速预设</Text>
            <div className="flex flex-wrap gap-1.5">
              {POST_PROCESS_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.description}
                  onClick={() => applyPreset(preset.id)}
                  className={`px-2 py-1 rounded-md text-[10px] border transition-colors ${
                    presetId === preset.id
                      ? 'bg-blue-600/90 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* 效果选择 */}
          <div>
            <Text className="text-[11px] text-gray-400 block mb-1.5">后期效果</Text>
            <select
              value={effect}
              onChange={(e) => handleEffectChange(e.target.value as PostProcessEffectId)}
              className="w-full px-2.5 py-1.5 text-xs bg-gray-800 text-white border border-gray-600 rounded-lg focus:border-blue-500 focus:outline-none"
            >
              {POST_PROCESS_EFFECT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.effects.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <EffectHint effect={effect} />
          </div>

          {/* 参数 */}
          {effect !== 'none' && (
            <div className="p-2.5 rounded-lg border border-gray-700/80 bg-gray-800/40">
              <Text className="text-[11px] text-gray-300 block mb-2">效果参数</Text>
              {renderParams()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
