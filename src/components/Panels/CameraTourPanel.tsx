import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Button, Input, Select, Switch, Typography, Modal, App } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  FileTextOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  HolderOutlined,
  AimOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useTourStore, createDefaultStopFields } from '@/store/tourStore';
import { useSceneStore } from '@/store/sceneStore';
import {
  CameraTourPlayer,
  captureCurrentCameraState,
  startEditorCameraFly,
  cancelEditorCameraFly,
} from '@/utils/cameraTourPlayer';
import { buildCameraTourJsonPreview, downloadCameraTourJson } from '@/utils/cameraTourJson';
import {
  syncTourPathVisual,
  removeTourPathVisual,
  isSceneCaptureVisualsLocked,
} from '@/utils/cameraTourVisual';
import type { CameraTourMode, CameraTourStop } from '@/types/cameraTour';
import { DEFAULT_SPLINE_DURATION, normalizeCameraTour } from '@/types/cameraTour';
import * as THREE from 'three';

const { Text } = Typography;

function formatVec3(v: { x: number; y: number; z: number }) {
  return `(${v.x}, ${v.y}, ${v.z})`;
}

interface StopCardProps {
  stop: CameraTourStop;
  index: number;
  total: number;
  tourMode: CameraTourMode;
  isDragging: boolean;
  isDragOver: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<CameraTourStop>) => void;
  onGoToView: () => void;
  onCaptureView: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
}

function StopCard({
  stop,
  index,
  total,
  tourMode,
  isDragging,
  isDragOver,
  onMove,
  onRemove,
  onUpdate,
  onGoToView,
  onCaptureView,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: StopCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(stop.name);

  useEffect(() => {
    if (!isRenaming) setNameDraft(stop.name);
  }, [stop.name, isRenaming]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(stop.name);
    setIsRenaming(true);
  };

  const commitRename = () => {
    const name = nameDraft.trim() || stop.name;
    onUpdate({ name });
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setNameDraft(stop.name);
    setIsRenaming(false);
  };

  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        if (isRenaming) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      className={`
        p-2 rounded-lg border space-y-1.5 transition-opacity cursor-grab active:cursor-grabbing
        ${isDragging ? 'opacity-40 border-gray-600 bg-gray-800/30' : 'border-gray-700/80 bg-gray-800/50'}
        ${isDragOver && !isDragging ? 'border-blue-500/60 ring-1 ring-blue-500/30' : ''}
      `}
    >
      <div className="flex items-center gap-1 min-w-0">
        <HolderOutlined className="text-gray-500 shrink-0 text-xs" />
        {isRenaming ? (
          <>
            <span className="text-xs text-gray-400 shrink-0">{index + 1}.</span>
            <Input
              size="small"
              className="flex-1 min-w-0"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onPressEnter={commitRename}
              placeholder="漫游点名称"
              autoFocus
              onMouseDown={(e) => e.stopPropagation()}
            />
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={commitRename}
              onMouseDown={(e) => e.stopPropagation()}
              title="确认"
            />
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={cancelRename}
              onMouseDown={(e) => e.stopPropagation()}
              title="取消"
            />
          </>
        ) : (
          <>
            <Text className="text-xs text-gray-200 truncate flex-1 min-w-0" title={stop.name}>
              {index + 1}. {stop.name}
            </Text>
            <Button
              size="small"
              type="text"
              className="!text-gray-400 hover:!text-white shrink-0"
              icon={<EditOutlined />}
              onClick={startRename}
              onMouseDown={(e) => e.stopPropagation()}
              title="重命名"
            />
            {tourMode !== 'spline' && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                  stop.type === 'focus' ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-700/80 text-gray-400'
                }`}
              >
                {stop.type === 'focus' ? '设备' : '路径'}
              </span>
            )}
          </>
        )}
      </div>

      <div className="space-y-0.5 pl-4">
        <Text className="text-[10px] text-gray-400 block font-mono leading-relaxed">
          相机坐标 {formatVec3(stop.position)}
        </Text>
        <Text className="text-[10px] text-gray-400 block font-mono leading-relaxed">
          目标点 {formatVec3(stop.target)}
        </Text>
      </div>

      {stop.objectName && (
        <Text className="text-[10px] text-blue-400 block pl-4">设备: {stop.objectName}</Text>
      )}

      <div className="flex gap-1.5 pl-4">
        <Button
          size="small"
          className="flex-1 !text-xs"
          icon={<AimOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onGoToView();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          跳转视角
        </Button>
        <Button
          size="small"
          className="flex-1 !text-xs"
          icon={<SyncOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onCaptureView();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          更新视角
        </Button>
      </div>

      {tourMode === 'stop' && (
        <div className="grid grid-cols-2 gap-1.5 pl-4">
          <div>
            <Text className="text-[10px] text-gray-500">飞入(秒)</Text>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={stop.transitionTime}
              onChange={(e) => onUpdate({ transitionTime: parseFloat(e.target.value) || 0.1 })}
              className="w-full px-1.5 py-0.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
            />
          </div>
          <div>
            <Text className="text-[10px] text-gray-500">停留(秒)</Text>
            <input
              type="number"
              min={0}
              step={0.5}
              value={stop.dwellTime}
              onChange={(e) => onUpdate({ dwellTime: parseFloat(e.target.value) || 0 })}
              className="w-full px-1.5 py-0.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
            />
          </div>
        </div>
      )}

      <div className="flex gap-1 justify-end tour-stop-actions">
        <Button
          size="small"
          type="text"
          className="!text-gray-300 hover:!text-white"
          icon={<ArrowUpOutlined />}
          disabled={index === 0}
          onClick={() => onMove('up')}
        />
        <Button
          size="small"
          type="text"
          className="!text-gray-300 hover:!text-white"
          icon={<ArrowDownOutlined />}
          disabled={index === total - 1}
          onClick={() => onMove('down')}
        />
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
        />
      </div>
    </div>
  );
}

export function CameraTourPanel() {
  const { message } = App.useApp();
  const {
    tours,
    activeTourId,
    getActiveTour,
    setActiveTourId,
    addTour,
    removeTour,
    renameTour,
    setTourLoop,
    setTourMode,
    setSplineDuration,
    addStop,
    updateStop,
    removeStop,
    moveStop,
    reorderStop,
    setPreviewPlaying,
    ensureDefaultTour,
    dedupeTours,
  } = useTourStore();

  const { selectedIds, objects } = useSceneStore();
  const playerRef = useRef<CameraTourPlayer | null>(null);
  const [playerUiState, setPlayerUiState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState('');
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const activeTourRaw = getActiveTour();
  const activeTour = activeTourRaw ? normalizeCameraTour(activeTourRaw) : null;

  const tourVisualKey = useMemo(() => {
    const tour = tours.find((t) => t.id === activeTourId);
    if (!tour) return '';
    const normalized = normalizeCameraTour(tour);
    return [
      normalized.id,
      normalized.mode,
      normalized.loop,
      normalized.splineDuration,
      normalized.stops
        .map(
          (s) =>
            `${s.id}:${s.name}:${s.position.x},${s.position.y},${s.position.z}:${s.target.x},${s.target.y},${s.target.z}:${s.transitionTime}:${s.dwellTime}:${s.type}`
        )
        .join('|'),
    ].join('#');
  }, [activeTourId, tours]);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    dedupeTours();
    ensureDefaultTour();
  }, [dedupeTours, ensureDefaultTour]);

  useEffect(() => {
    const scene = (window as { __editorScene?: THREE.Scene }).__editorScene;
    if (!scene || isSceneCaptureVisualsLocked()) return;

    const tour = tours.find((t) => t.id === activeTourId) ?? null;
    syncTourPathVisual(scene, tour ? normalizeCameraTour(tour) : null);
    return () => {
      if (isSceneCaptureVisualsLocked()) return;
      removeTourPathVisual(scene);
    };
  }, [activeTourId, tourVisualKey, tours]);

  const ensurePlayer = useCallback(() => {
    const camera = (window as { __editorCamera?: THREE.PerspectiveCamera }).__editorCamera;
    const controls = (window as {
      __editorControls?: { target: THREE.Vector3; update: () => void; enabled: boolean };
    }).__editorControls;
    const tour = getActiveTour();
    if (!camera || !controls || !tour) return null;
    const normalizedTour = normalizeCameraTour(tour);

    if (!playerRef.current) {
      playerRef.current = new CameraTourPlayer(camera, controls, normalizedTour, {
        onComplete: () => {
          setPreviewPlaying(false);
          setPlayerUiState('idle');
        },
        onStateChange: (state) => {
          if (state === 'idle') {
            setPreviewPlaying(false);
            setPlayerUiState('idle');
          } else if (state === 'paused') {
            setPlayerUiState('paused');
          } else {
            setPlayerUiState('playing');
          }
        },
      });
    } else {
      playerRef.current.setTour(normalizedTour);
    }
    bindEditorTourPlayer(playerRef.current);
    return playerRef.current;
  }, [getActiveTour, setPreviewPlaying]);

  const handleAddStop = () => {
    const tour = getActiveTour();
    const captured = captureCurrentCameraState();
    if (!tour || !captured) {
      message.warning('请先在场景中调整好视角');
      return;
    }

    const normalized = normalizeCameraTour(tour);
    const index = tour.stops.length + 1;

    if (normalized.mode === 'spline') {
      addStop(
        tour.id,
        createDefaultStopFields({
          name: `漫游点 ${index}`,
          type: 'waypoint',
          position: captured.position,
          target: captured.target,
        })
      );
      message.success('已添加曲线关键帧');
      return;
    }

    const selected = selectedIds[0] ? objects.find((o) => o.id === selectedIds[0]) : null;

    if (selected) {
      addStop(
        tour.id,
        createDefaultStopFields({
          name: `漫游点 ${index} · ${selected.name}`,
          type: 'focus',
          position: captured.position,
          target: captured.target,
          objectId: selected.id,
          objectName: selected.name,
        })
      );
      message.success(`已添加漫游点（绑定设备：${selected.name}）`);
      return;
    }

    addStop(
      tour.id,
      createDefaultStopFields({
        name: `漫游点 ${index}`,
        type: 'waypoint',
        position: captured.position,
        target: captured.target,
      })
    );
    message.success('已添加漫游点');
  };

  const handlePreviewPlay = () => {
    cancelEditorCameraFly();
    const player = ensurePlayer();
    const tour = activeTour;
    if (!player || !tour?.stops.length) {
      message.warning('请先添加漫游点');
      return;
    }
    if (tour.mode === 'spline' && tour.stops.length < 2) {
      message.warning('一镜到底至少需要 2 个漫游点');
      return;
    }
    if (player.getState() === 'paused') {
      player.resume();
    } else {
      player.play();
    }
    setPreviewPlaying(true);
    setPlayerUiState('playing');
  };

  const handlePreviewPause = () => {
    playerRef.current?.pause();
    setPlayerUiState('paused');
  };

  const handlePreviewStop = () => {
    playerRef.current?.stop();
    bindEditorTourPlayer(null);
    setPreviewPlaying(false);
    setPlayerUiState('idle');
    const scene = (window as { __editorScene?: THREE.Scene }).__editorScene;
    if (scene && activeTour) syncTourPathVisual(scene, activeTour);
  };

  const handleGoToStopView = useCallback(
    (stop: CameraTourStop) => {
      if (playerUiState !== 'idle') {
        playerRef.current?.stop();
        bindEditorTourPlayer(null);
        setPreviewPlaying(false);
        setPlayerUiState('idle');
      }
      cancelEditorCameraFly();
      if (!startEditorCameraFly(stop.position, stop.target, stop.transitionTime)) {
        message.warning('场景未就绪，请稍后再试');
        return;
      }
      message.success(`正在前往「${stop.name}」`);
    },
    [playerUiState, setPreviewPlaying]
  );

  const handleCaptureStopView = useCallback(
    (stop: CameraTourStop) => {
      const tour = getActiveTour();
      const captured = captureCurrentCameraState();
      if (!tour || !captured) {
        message.warning('无法读取当前视角');
        return;
      }
      updateStop(tour.id, stop.id, {
        position: captured.position,
        target: captured.target,
      });
      message.success(`已更新「${stop.name}」的视角`);
    },
    [getActiveTour, updateStop]
  );

  const openExportModal = () => {
    const tour = getActiveTour();
    if (!tour?.stops.length) {
      message.warning('当前路线没有漫游点');
      return;
    }
    setExportPreview(buildCameraTourJsonPreview(tour));
    setExportModalOpen(true);
  };

  const confirmExportJson = () => {
    const tour = getActiveTour();
    if (!tour) return;
    downloadCameraTourJson(tour);
    setExportModalOpen(false);
    message.success('漫游 JSON 已下载');
  };

  const handleRemoveTour = () => {
    if (!activeTourId) return;
    const isLastTour = tours.length <= 1;
    removeTour(activeTourId);
    handlePreviewStop();
    const scene = (window as { __editorScene?: THREE.Scene }).__editorScene;
    if (scene) {
      syncTourPathVisual(scene, useTourStore.getState().getActiveTour());
    }
    message.success(isLastTour ? '已清空当前漫游路线' : '已删除漫游路线');
  };

  const startRename = () => {
    if (!activeTour) return;
    setRenameDraft(activeTour.name);
    setIsRenaming(true);
  };

  const commitRename = () => {
    if (!activeTour) return;
    const name = renameDraft.trim() || activeTour.name;
    renameTour(activeTour.id, name);
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameDraft('');
  };

  const handleDrop = (toIndex: number) => {
    if (!activeTour || dragFromIndex === null || dragFromIndex === toIndex) {
      setDragFromIndex(null);
      setDragOverIndex(null);
      return;
    }
    reorderStop(activeTour.id, dragFromIndex, toIndex);
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  useEffect(() => {
    setIsRenaming(false);
  }, [activeTourId]);

  return (
    <div className="flex flex-col gap-3 p-3 h-full min-h-0 overflow-hidden">
      <div className="shrink-0">
        <Text className="text-xs text-gray-400 block mb-1.5">漫游路线</Text>
        <div className="flex gap-1.5">
          {isRenaming ? (
            <>
              <Input
                size="small"
                className="flex-1"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onPressEnter={commitRename}
                placeholder="路线名称"
                autoFocus
              />
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={commitRename} title="确认" />
              <Button size="small" icon={<CloseOutlined />} onClick={cancelRename} title="取消" />
            </>
          ) : (
            <>
              <Select
                size="small"
                className="flex-1"
                value={activeTourId ?? tours[0]?.id}
                onChange={setActiveTourId}
                options={tours.map((t) => ({ value: t.id, label: t.name }))}
              />
              <Button size="small" icon={<EditOutlined />} onClick={startRename} title="重命名" disabled={!activeTour} />
              <Button size="small" icon={<PlusOutlined />} onClick={() => addTour()} title="新建路线" />
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleRemoveTour}
                title={tours.length <= 1 ? '清空当前路线' : '删除当前路线'}
              />
            </>
          )}
        </div>
      </div>

      {activeTour && (
        <>
          <div className="shrink-0">
            <Text className="text-xs text-gray-400 block mb-1.5">漫游方式</Text>
            <Select
              size="small"
              className="w-full"
              value={activeTour.mode}
              onChange={(v) => {
                setTourMode(activeTour.id, v);
                handlePreviewStop();
              }}
              options={[
                { value: 'stop', label: '站点漫游（逐站看设备）' },
                { value: 'spline', label: '一镜到底（曲线参观）' },
              ]}
            />
            <Text className="text-[10px] text-gray-500 leading-relaxed block mt-1.5">
              {activeTour.mode === 'stop'
                ? '逐站飞入并停留，适合聚焦设备查看。'
                : '关键点用平滑曲线连接，相机沿路径连续移动，适合园区/厂区整体参观。'}
            </Text>
          </div>

          <div className="shrink-0 flex items-center justify-between">
            <Text className="text-xs text-gray-400">循环播放</Text>
            <Switch
              size="small"
              checked={activeTour.loop}
              onChange={(v) => setTourLoop(activeTour.id, v)}
            />
          </div>

          {activeTour.mode === 'spline' && (
            <div className="shrink-0">
              <Text className="text-[10px] text-gray-500 block mb-1">全程时长(秒)</Text>
              <input
                type="number"
                min={1}
                step={1}
                value={activeTour.splineDuration ?? DEFAULT_SPLINE_DURATION}
                onChange={(e) =>
                  setSplineDuration(activeTour.id, parseFloat(e.target.value) || DEFAULT_SPLINE_DURATION)
                }
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
          )}
        </>
      )}

      <div className="shrink-0">
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleAddStop} block>
          添加漫游点（当前视角）
        </Button>
        <Text className="text-[10px] text-gray-500 leading-relaxed block mt-2">
          {activeTour?.mode === 'spline'
            ? '沿路径添加关键帧，场景中青色曲线为漫游轨迹。可拖动排序、跳转/更新视角。'
            : '选中设备后添加会绑定设备名。可拖动排序、跳转/更新视角。'}
        </Text>
      </div>

      <div className="shrink-0 flex gap-1.5 flex-wrap">
        {playerUiState === 'playing' ? (
          <Button size="small" icon={<PauseCircleOutlined />} onClick={handlePreviewPause}>
            暂停
          </Button>
        ) : (
          <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={handlePreviewPlay}>
            {playerUiState === 'paused' ? '继续' : '预览'}
          </Button>
        )}
        <Button size="small" icon={<StopOutlined />} onClick={handlePreviewStop}>
          停止
        </Button>
        <Button size="small" icon={<FileTextOutlined />} onClick={openExportModal}>
          查看 JSON
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Text className="text-xs text-gray-400 shrink-0 mb-1.5">
          漫游点列表 ({activeTour?.stops.length ?? 0})
        </Text>
        <div className="flex-1 min-h-0 overflow-y-auto hdri-grid-scroll pr-0.5 space-y-2">
          {activeTour?.stops.map((stop, index) => (
            <StopCard
              key={stop.id}
              stop={stop}
              index={index}
              total={activeTour.stops.length}
              tourMode={activeTour.mode}
              isDragging={dragFromIndex === index}
              isDragOver={dragOverIndex === index}
              onMove={(dir) => moveStop(activeTour.id, stop.id, dir)}
              onRemove={() => removeStop(activeTour.id, stop.id)}
              onUpdate={(updates) => updateStop(activeTour.id, stop.id, updates)}
              onGoToView={() => handleGoToStopView(stop)}
              onCaptureView={() => handleCaptureStopView(stop)}
              onDragStart={setDragFromIndex}
              onDragOver={setDragOverIndex}
              onDragEnd={() => {
                setDragFromIndex(null);
                setDragOverIndex(null);
              }}
              onDrop={handleDrop}
            />
          ))}
          {activeTour && activeTour.stops.length === 0 && (
            <Text className="text-xs text-gray-500 block py-8 text-center">暂无漫游点，请点击上方按钮添加</Text>
          )}
        </div>
      </div>

      <Modal
        title={
          <div>
            <div className="text-base font-semibold text-gray-100">漫游 JSON 数据</div>
            <div className="text-xs font-normal text-gray-500 mt-0.5">含字段说明注释，确认后可下载标准 JSON 文件</div>
          </div>
        }
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        width={720}
        centered
        destroyOnHidden
        className="texture-picker-modal"
        styles={{
          content: {
            background: '#141419',
            borderRadius: 12,
            border: '1px solid #2e2e38',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45)',
            padding: 0,
            overflow: 'hidden',
          },
          header: {
            background: 'linear-gradient(180deg, #1c1c24 0%, #141419 100%)',
            borderBottom: '1px solid #2a2a34',
            marginBottom: 0,
            padding: '16px 20px 14px',
          },
          body: { padding: '16px 20px', background: '#141419' },
          footer: {
            background: '#141419',
            borderTop: '1px solid #2a2a34',
            padding: '12px 20px 16px',
          },
        }}
        footer={[
          <Button key="cancel" onClick={() => setExportModalOpen(false)}>
            取消
          </Button>,
          <Button key="export" type="primary" icon={<DownloadOutlined />} onClick={confirmExportJson}>
            下载 JSON
          </Button>,
        ]}
      >
        <pre className="max-h-[min(60vh,480px)] overflow-auto rounded-lg bg-[#0f1117] border border-[#2e2e38] p-3 text-[11px] text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-all hdri-grid-scroll">
          {exportPreview}
        </pre>
      </Modal>
    </div>
  );
}

/** 供 EditorViewport 调用的预览播放器 tick */
export function tickEditorCameraTour(delta: number) {
  const player = (window as { __editorTourPlayer?: CameraTourPlayer }).__editorTourPlayer;
  if (!player) return false;
  const state = player.getState();
  if (state === 'playing' || state === 'dwelling') {
    player.update(delta);
    return true;
  }
  if (state === 'paused') return true;
  return false;
}

export function bindEditorTourPlayer(player: CameraTourPlayer | null) {
  (window as { __editorTourPlayer?: CameraTourPlayer | null }).__editorTourPlayer = player;
}
