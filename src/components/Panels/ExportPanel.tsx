import { useState, useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, ConfigProvider, InputNumber, App, Progress, Select } from 'antd';
import * as THREE from 'three';
import { useSceneExporter } from '@/hooks/useSceneExporter';
import { downloadSceneConfig } from '@/utils/sceneConfigExporter';
import { exportProjectPackage } from '@/utils/projectPackageExporter';
import {
  captureScreenshot,
  isMp4ExportSupported,
  recordCameraTour,
} from '@/utils/sceneCaptureExporter';
import { useTourStore } from '@/store/tourStore';
import { getExportableTours } from '@/utils/cameraTourJson';

interface ExportPanelProps {
  onClose: () => void;
}

declare global {
  interface Window {
    __editorScene?: THREE.Scene;
    __editorRenderer?: THREE.WebGLRenderer;
  }
}

type RecordFormat = 'webm' | 'mp4' | 'frames';

interface TileTheme {
  bg: string;
  border: string;
  accent: string;
  progress?: string;
}

const THEMES = {
  purple: {
    bg: 'bg-purple-500/[0.07]',
    border: 'border-purple-500/25',
    accent: 'text-purple-400',
    progress: '#a855f7',
  },
  orange: {
    bg: 'bg-orange-500/[0.07]',
    border: 'border-orange-500/25',
    accent: 'text-orange-400',
  },
  blue: {
    bg: 'bg-blue-500/[0.07]',
    border: 'border-blue-500/25',
    accent: 'text-blue-400',
  },
  pink: {
    bg: 'bg-pink-500/[0.07]',
    border: 'border-pink-500/25',
    accent: 'text-pink-400',
    progress: '#ec4899',
  },
  teal: {
    bg: 'bg-teal-500/[0.07]',
    border: 'border-teal-500/25',
    accent: 'text-teal-400',
  },
} satisfies Record<string, TileTheme>;

const EXPORT_SELECT_CLASS = 'export-panel-select';
const exportSelectClassNames = { popup: { root: 'export-panel-select-popup' } };

const exportFormTheme = {
  components: {
    Select: {
      selectorBg: '#161922',
      colorBgContainer: '#161922',
      colorBgElevated: '#1e2129',
      colorBorder: '#343848',
      colorText: '#e5e7eb',
      colorTextPlaceholder: '#9ca3af',
      optionSelectedBg: '#343b4d',
      optionActiveBg: '#2a3040',
      controlHeight: 28,
      fontSize: 12,
    },
    InputNumber: {
      colorBgContainer: '#161922',
      colorBorder: '#343848',
      colorText: '#e5e7eb',
      controlHeight: 28,
      fontSize: 12,
    },
    Button: {
      controlHeight: 36,
      fontSize: 13,
    },
  },
};

const inputClass =
  'w-full px-2 py-1.5 text-xs bg-[#161922] text-gray-200 border border-[#343848] rounded focus:outline-none focus:border-[#5a6070] transition-colors';

const labelClass = 'block text-[10px] text-gray-500 mb-1';

const RECORD_SIZE_MIN = 64;
const RECORD_SIZE_MAX = 8192;

const RECORD_RESOLUTION_PRESETS = [
  { id: '1280x720', label: '1280 × 720（720P）', width: 1280, height: 720 },
  { id: '1920x1080', label: '1920 × 1080（1080P）', width: 1920, height: 1080 },
  { id: '2560x1440', label: '2560 × 1440（2K）', width: 2560, height: 1440 },
  { id: '3840x2160', label: '3840 × 2160（4K）', width: 3840, height: 2160 },
  { id: '1080x1920', label: '1080 × 1920（竖屏）', width: 1080, height: 1920 },
  { id: '1080x1080', label: '1080 × 1080（方形）', width: 1080, height: 1080 },
] as const;

function clampRecordSize(value: number): number {
  return Math.max(RECORD_SIZE_MIN, Math.min(RECORD_SIZE_MAX, Math.round(value)));
}

function matchRecordResolutionPreset(width: number, height: number): string {
  const matched = RECORD_RESOLUTION_PRESETS.find((p) => p.width === width && p.height === height);
  return matched?.id ?? 'custom';
}

const recordResolutionOptions = [
  ...RECORD_RESOLUTION_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
  })),
  { value: 'custom', label: '自定义' },
];

function ExportTile({
  icon,
  title,
  desc,
  theme,
  children,
  action,
  placeholder,
}: {
  icon: string;
  title: string;
  desc: string;
  theme: TileTheme;
  children?: ReactNode;
  action?: ReactNode;
  placeholder?: boolean;
}) {
  if (placeholder) {
    return (
      <div className="h-[300px] rounded-xl border border-dashed border-[#3a3f4f]/50 bg-[#1a1d26]/40 flex flex-col items-center justify-center gap-2">
        <span className="text-2xl opacity-30">＋</span>
        <span className="text-xs text-gray-600">更多导出功能</span>
      </div>
    );
  }

  return (
    <div
      className={`h-[300px] rounded-xl border ${theme.border} ${theme.bg} flex flex-col overflow-hidden`}
    >
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-lg leading-none">{icon}</span>
          <div className="min-w-0">
            <h3 className={`text-sm font-medium truncate ${theme.accent}`}>{title}</h3>
            <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{desc}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-2">
        {children}
      </div>

      {action && (
        <div className="shrink-0 px-4 py-3 border-t border-[#343848]/50 bg-[#1a1d26]/30">
          {action}
        </div>
      )}
    </div>
  );
}

function TileButton({
  onClick,
  disabled,
  loading,
  children,
  color = '#1677ff',
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
  color?: string;
}) {
  return (
    <Button
      type="primary"
      block
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      style={
        {
          background: color,
          borderColor: color,
          boxShadow: 'none',
        } as CSSProperties
      }
    >
      {children}
    </Button>
  );
}

export function ExportPanel({ onClose }: ExportPanelProps) {
  const { message } = App.useApp();
  const { exportGLB } = useSceneExporter();
  const { tours, activeTourId } = useTourStore();
  const [exporting, setExporting] = useState(false);
  const [configExporting, setConfigExporting] = useState(false);
  const [packageExporting, setPackageExporting] = useState(false);
  const [screenshotExporting, setScreenshotExporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const [mp4Supported, setMp4Supported] = useState(false);

  const [shotWidth, setShotWidth] = useState(1920);
  const [shotHeight, setShotHeight] = useState(1080);
  const [shotTransparent, setShotTransparent] = useState(false);
  const [useViewportSize, setUseViewportSize] = useState(true);

  const [recordWidth, setRecordWidth] = useState(1920);
  const [recordHeight, setRecordHeight] = useState(1080);
  const [recordResolutionPreset, setRecordResolutionPreset] = useState('1920x1080');
  const [recordTransparent, setRecordTransparent] = useState(false);
  const [recordFps, setRecordFps] = useState(60);
  const [recordFormat, setRecordFormat] = useState<RecordFormat>('webm');
  const [selectedTourId, setSelectedTourId] = useState<string>('');

  const exportableTours = useMemo(() => getExportableTours(tours), [tours]);

  useEffect(() => {
    const r = window.__editorRenderer || null;
    const s = window.__editorScene || null;
    setScene(s);
    setRenderer(r);
    if (r) {
      setShotWidth(r.domElement.width);
      setShotHeight(r.domElement.height);
    }
  }, []);

  useEffect(() => {
    isMp4ExportSupported().then((supported) => {
      setMp4Supported(supported);
      if (supported) setRecordFormat('mp4');
    });
  }, []);

  useEffect(() => {
    if (activeTourId && exportableTours.some((t) => t.id === activeTourId)) {
      setSelectedTourId(activeTourId);
    } else if (exportableTours[0]) {
      setSelectedTourId(exportableTours[0].id);
    }
  }, [activeTourId, exportableTours]);

  const applyRecordSize = (width: number, height: number) => {
    const w = clampRecordSize(width);
    const h = clampRecordSize(height);
    setRecordWidth(w);
    setRecordHeight(h);
    setRecordResolutionPreset(matchRecordResolutionPreset(w, h));
  };

  const handleRecordWidthChange = (value: number | null) => {
    if (value == null) return;
    applyRecordSize(value, recordHeight);
  };

  const handleRecordHeightChange = (value: number | null) => {
    if (value == null) return;
    applyRecordSize(recordWidth, value);
  };

  const handleRecordResolutionPresetChange = (presetId: string) => {
    if (presetId === 'custom') {
      setRecordResolutionPreset('custom');
      return;
    }
    const preset = RECORD_RESOLUTION_PRESETS.find((p) => p.id === presetId);
    if (preset) applyRecordSize(preset.width, preset.height);
  };

  const handleExportConfig = () => {
    setConfigExporting(true);
    try {
      downloadSceneConfig();
      message.success('场景配置已导出');
    } catch (error) {
      console.error('配置导出失败:', error);
      message.error(error instanceof Error ? error.message : '配置导出失败');
    } finally {
      setConfigExporting(false);
    }
  };

  const handleExportGLB = async () => {
    if (!scene) return;
    setExporting(true);
    try {
      await exportGLB(scene);
      message.success('GLB 已导出');
    } catch (error) {
      console.error('GLB 导出失败:', error);
      message.error('GLB 导出失败，请查看控制台');
    } finally {
      setExporting(false);
    }
  };

  const handleScreenshot = async () => {
    if (!renderer) return;
    setScreenshotExporting(true);
    try {
      await captureScreenshot({
        width: useViewportSize ? renderer.domElement.width : shotWidth,
        height: useViewportSize ? renderer.domElement.height : shotHeight,
        transparent: shotTransparent,
      });
      message.success('截图已导出');
    } catch (error) {
      console.error('截图失败:', error);
      message.error(error instanceof Error ? error.message : '截图导出失败');
    } finally {
      setScreenshotExporting(false);
    }
  };

  const handleRecordTour = async () => {
    const tour = exportableTours.find((t) => t.id === selectedTourId);
    if (!tour) {
      message.warning('请先创建并配置漫游路线');
      return;
    }

    setRecording(true);
    setRecordProgress(0);
    try {
      await recordCameraTour({
        tour,
        width: recordWidth,
        height: recordHeight,
        transparent: recordTransparent,
        fps: recordFps,
        format: recordFormat,
        onProgress: setRecordProgress,
      });
      const label =
        recordFormat === 'frames' ? '帧序列' : recordFormat === 'mp4' ? 'MP4' : 'WebM';
      message.success(`漫游视频已导出（${label}）`);
    } catch (error) {
      console.error('漫游录制失败:', error);
      message.error(error instanceof Error ? error.message : '漫游录制失败');
    } finally {
      setRecording(false);
      setRecordProgress(0);
    }
  };

  const handleExportProjectPackage = async () => {
    if (!scene) return;
    setPackageExporting(true);
    try {
      const result = await exportProjectPackage();
      const detail = [
        result.hasModel ? '含模型' : '无模型',
        result.hasHdr ? '含 HDR' : '无 HDR',
        result.hasTextures ? `含 ${result.textureCount} 张贴图` : '无外部贴图',
        result.polyhavenModelCount > 0 ? `Poly Haven 模型 ${result.polyhavenModelCount} 个` : null,
        result.hasCameraTour
          ? `含漫游「${result.cameraTourName}」(${
              result.cameraTourMode === 'spline' ? '一镜到底' : '站点'
            }${result.cameraTourCount > 1 ? ` 等${result.cameraTourCount}条` : ''})`
          : null,
      ].filter(Boolean).join(' · ');
      message.success(`项目包已导出（${detail}）`);
    } catch (error) {
      console.error('项目包导出失败:', error);
      message.error(error instanceof Error ? error.message : '项目包导出失败');
    } finally {
      setPackageExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-5">
      <div className="w-full max-w-6xl rounded-2xl border border-[#3a3f4f]/70 bg-[#1c1f28] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#3a3f4f]/50">
          <h2 className="text-sm font-semibold text-gray-100">导出场景</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-[#2a2d38] hover:text-gray-200 transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <ConfigProvider theme={exportFormTheme}>
          <div className="grid grid-cols-3 gap-4">
            <ExportTile
              icon="🚀"
              title="项目包"
              desc="完整 HTML 可运行项目，含 GLB、贴图/HDR、漫游工具包"
              theme={THEMES.purple}
              action={
                <TileButton
                  onClick={handleExportProjectPackage}
                  disabled={!scene}
                  loading={packageExporting}
                  color="#9333ea"
                >
                  导出 ZIP
                </TileButton>
              }
            />

            <ExportTile
              icon="📸"
              title="截图"
              desc="导出当前场景 PNG，支持自定义分辨率与透明背景"
              theme={THEMES.orange}
              action={
                <TileButton
                  onClick={handleScreenshot}
                  disabled={!renderer}
                  loading={screenshotExporting}
                  color="#ea580c"
                >
                  导出 PNG
                </TileButton>
              }
            >
              <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useViewportSize}
                  onChange={(e) => setUseViewportSize(e.target.checked)}
                  className="rounded"
                />
                使用视口尺寸
              </label>
              {!useViewportSize && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>宽 (px)</label>
                    <input
                      type="number"
                      min={64}
                      max={8192}
                      value={shotWidth}
                      onChange={(e) => setShotWidth(Number(e.target.value) || 1920)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>高 (px)</label>
                    <input
                      type="number"
                      min={64}
                      max={8192}
                      value={shotHeight}
                      onChange={(e) => setShotHeight(Number(e.target.value) || 1080)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shotTransparent}
                  onChange={(e) => setShotTransparent(e.target.checked)}
                  className="rounded"
                />
                透明背景
              </label>
            </ExportTile>

            <ExportTile
              icon="📦"
              title="GLB 模型"
              desc="单文件包含全部模型与材质，适合跨平台使用"
              theme={THEMES.blue}
              action={
                <TileButton
                  onClick={handleExportGLB}
                  disabled={!scene}
                  loading={exporting}
                  color="#2563eb"
                >
                  导出 GLB
                </TileButton>
              }
            />

            <ExportTile
              icon="🎬"
              title="漫游录制"
              desc="按漫游路线离屏渲染，不含网格与坐标轴"
              theme={THEMES.pink}
              action={
                <div className="space-y-2">
                  {recording && (
                    <Progress
                      percent={Math.round(recordProgress * 100)}
                      size="small"
                      strokeColor={THEMES.pink.progress}
                      showInfo={false}
                    />
                  )}
                  <TileButton
                    onClick={handleRecordTour}
                    disabled={exportableTours.length === 0}
                    loading={recording}
                    color="#db2777"
                  >
                    开始录制
                  </TileButton>
                </div>
              }
            >
              <div>
                <label className={labelClass}>漫游路线</label>
                <Select
                  size="small"
                  className={`${EXPORT_SELECT_CLASS} w-full`}
                  classNames={exportSelectClassNames}
                  value={selectedTourId || undefined}
                  onChange={setSelectedTourId}
                  disabled={exportableTours.length === 0}
                  placeholder="暂无路线"
                  options={exportableTours.map((tour) => ({
                    value: tour.id,
                    label: tour.name,
                  }))}
                />
              </div>
              <div>
                <label className={labelClass}>分辨率</label>
                <Select
                  size="small"
                  className={`${EXPORT_SELECT_CLASS} w-full`}
                  classNames={exportSelectClassNames}
                  value={recordResolutionPreset}
                  onChange={handleRecordResolutionPresetChange}
                  options={recordResolutionOptions}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>宽 (px)</label>
                  <InputNumber
                    size="small"
                    className="!w-full"
                    min={RECORD_SIZE_MIN}
                    max={RECORD_SIZE_MAX}
                    value={recordWidth}
                    controls={false}
                    onChange={handleRecordWidthChange}
                  />
                </div>
                <div>
                  <label className={labelClass}>高 (px)</label>
                  <InputNumber
                    size="small"
                    className="!w-full"
                    min={RECORD_SIZE_MIN}
                    max={RECORD_SIZE_MAX}
                    value={recordHeight}
                    controls={false}
                    onChange={handleRecordHeightChange}
                  />
                </div>
                <div>
                  <label className={labelClass}>帧率</label>
                  <InputNumber
                    size="small"
                    className="!w-full"
                    min={1}
                    max={60}
                    value={recordFps}
                    controls={false}
                    onChange={(v) => {
                      if (v != null) setRecordFps(v);
                    }}
                  />
                </div>
                <div>
                  <label className={labelClass}>格式</label>
                  <Select
                    size="small"
                    className={`${EXPORT_SELECT_CLASS} w-full`}
                    classNames={exportSelectClassNames}
                    value={recordFormat}
                    onChange={(v) => setRecordFormat(v)}
                    options={[
                      ...(mp4Supported
                        ? [{ value: 'mp4' as const, label: 'MP4 视频', disabled: recordTransparent }]
                        : []),
                      { value: 'webm' as const, label: 'WebM 视频' },
                      { value: 'frames' as const, label: 'PNG 帧序列' },
                    ]}
                  />
                </div>
              </div>
              <Checkbox
                checked={recordTransparent}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRecordTransparent(checked);
                  if (checked && recordFormat === 'mp4') setRecordFormat('webm');
                }}
                className="!text-[11px] !text-gray-400"
              >
                透明背景
              </Checkbox>
            </ExportTile>

            <ExportTile
              icon="⚙️"
              title="场景配置"
              desc="导出 JSON，含相机、灯光、雾效等参数"
              theme={THEMES.teal}
              action={
                <TileButton
                  onClick={handleExportConfig}
                  disabled={!scene}
                  loading={configExporting}
                  color="#0d9488"
                >
                  导出 JSON
                </TileButton>
              }
            />

            <ExportTile
              icon=""
              title=""
              desc=""
              theme={THEMES.teal}
              placeholder
            />
          </div>
          </ConfigProvider>
        </div>
      </div>
    </div>
  );
}
