import { useState } from 'react';
import { Switch, Typography, Upload, Button, Space } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, GlobalOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { HdriPicker } from './HdriPicker';
import type { HdriAsset, HdrResolution } from '@/utils/polyhaven';

const { Text } = Typography;

interface EnvironmentHdriSectionProps {
  hdriReady: boolean;
  envHdriEnabled: boolean;
  bgHdriEnabled: boolean;
  hdrBgName: string;
  hdrEnvName: string;
  hasHDRBackground: boolean;
  hasHDREnvironment: boolean;
  selectedHdriId: string | null;
  loadingHdriId: string | null;
  hdriResolution: HdrResolution;
  onResolutionChange: (res: HdrResolution) => void;
  onPolyhavenSelect: (asset: HdriAsset) => void;
  onToggleEnv: (enabled: boolean) => void;
  onToggleBg: (enabled: boolean) => void;
  onLoadLocalHdr: (file: File, asBackground: boolean) => void;
  onClearBackground: () => void;
  onClearEnvironment: () => void;
  canDownloadHdr?: boolean;
  downloadingHdr?: boolean;
  onDownloadHdr?: () => void;
}

export function EnvironmentHdriSection({
  hdriReady,
  envHdriEnabled,
  bgHdriEnabled,
  hdrBgName,
  hdrEnvName,
  hasHDRBackground,
  hasHDREnvironment,
  selectedHdriId,
  loadingHdriId,
  hdriResolution,
  onResolutionChange,
  onPolyhavenSelect,
  onToggleEnv,
  onToggleBg,
  onLoadLocalHdr,
  onClearBackground,
  onClearEnvironment,
  canDownloadHdr,
  downloadingHdr,
  onDownloadHdr,
}: EnvironmentHdriSectionProps) {
  const [hdriSourceTab, setHdriSourceTab] = useState<'online' | 'local'>('online');
  const currentName = hdrBgName || hdrEnvName;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* 环境 / 背景开关 */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-2.5 py-1.5 bg-gray-800/80 rounded-lg border border-gray-700/80">
        <div className="flex items-center gap-2">
          <Text className="text-[11px] text-gray-400">环境光照</Text>
          <Switch size="small" checked={envHdriEnabled} disabled={!hdriReady} onChange={onToggleEnv} />
        </div>
        <div className="w-px h-3.5 bg-gray-600" />
        <div className="flex items-center gap-2">
          <Text className="text-[11px] text-gray-400">天空背景</Text>
          <Switch size="small" checked={bgHdriEnabled} disabled={!hdriReady} onChange={onToggleBg} />
        </div>
      </div>

      {currentName && (
        <Text className="shrink-0 text-[10px] text-gray-500 truncate px-0.5" title={currentName}>
          当前: {currentName}
        </Text>
      )}

      {/* 自定义 Tab 切换 */}
      <div className="shrink-0 hdri-pill-tabs">
        <button
          type="button"
          className={`hdri-pill-tab ${hdriSourceTab === 'online' ? 'active' : ''}`}
          onClick={() => setHdriSourceTab('online')}
        >
          <GlobalOutlined />
          <span>Poly Haven</span>
        </button>
        <button
          type="button"
          className={`hdri-pill-tab ${hdriSourceTab === 'local' ? 'active' : ''}`}
          onClick={() => setHdriSourceTab('local')}
        >
          <FolderOpenOutlined />
          <span>本地文件</span>
        </button>
      </div>

      {/* Tab 内容 — 占满剩余高度 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {hdriSourceTab === 'online' ? (
          <HdriPicker
            resolution={hdriResolution}
            onResolutionChange={onResolutionChange}
            selectedId={selectedHdriId}
            loadingId={loadingHdriId}
            onSelect={onPolyhavenSelect}
            canDownload={canDownloadHdr}
            downloading={downloadingHdr}
            onDownload={onDownloadHdr}
          />
        ) : (
          <div className="h-full overflow-y-auto space-y-2.5 pr-0.5">
            <LocalHdrUpload
              label="HDR 背景"
              active={hasHDRBackground}
              fileName={hasHDRBackground ? hdrBgName : ''}
              onUpload={(f) => onLoadLocalHdr(f, true)}
              onClear={onClearBackground}
            />
            <LocalHdrUpload
              label="HDR 环境"
              active={hasHDREnvironment}
              fileName={hasHDREnvironment ? hdrEnvName : ''}
              onUpload={(f) => onLoadLocalHdr(f, false)}
              onClear={onClearEnvironment}
            />
            <Text type="secondary" className="text-[10px] block px-0.5">
              支持 .hdr / .exr，可分别上传背景与环境贴图
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}

function LocalHdrUpload({
  label,
  active,
  fileName,
  onUpload,
  onClear,
}: {
  label: string;
  active: boolean;
  fileName: string;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className={`p-2.5 rounded-lg border transition-colors ${
      active ? 'border-blue-500/50 bg-blue-950/20' : 'border-gray-700/80 bg-gray-800/50'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <Text className="text-xs text-gray-300">{label}</Text>
        {active && fileName && (
          <Text className="text-[10px] text-blue-400 truncate max-w-[110px]" title={fileName}>
            {fileName}
          </Text>
        )}
      </div>
      <Space size={6}>
        <Upload
          accept=".hdr,.exr"
          showUploadList={false}
          beforeUpload={(file) => {
            onUpload(file);
            return false;
          }}
        >
          <Button size="small" type={active ? 'default' : 'primary'} ghost={active} icon={<CloudUploadOutlined />}>
            {active ? '更换' : '上传'}
          </Button>
        </Upload>
        {active && (
          <Button size="small" danger ghost icon={<DeleteOutlined />} onClick={onClear} />
        )}
      </Space>
    </div>
  );
}
