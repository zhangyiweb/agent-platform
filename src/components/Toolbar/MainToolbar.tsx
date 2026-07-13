import { useState, useRef } from 'react';
import { Modal } from 'antd';
import { useEditorNotify } from '@/hooks/useEditorNotify';
import { useEditorStore } from '@/store/editorStore';
import { useModelLoader } from '@/hooks/useModelLoader';
import { ExportPanel } from '@/components/Panels/ExportPanel';
import { ModelPickerModal } from '@/components/Panels/ModelPickerModal';
import { UIExportModal } from '@/components/UIEditor/UIExportModal';
import { saveEditorProject } from '@/utils/editorProjectExporter';
import {
  hasEditorSceneContent,
  importEditorProjectJson,
  importEditorProjectZip,
} from '@/utils/editorProjectImporter';
import { saveUIEditorProject } from '@/utils/uiEditorProjectExporter';
import { importUIEditorProjectJson, importUIEditorProjectZip } from '@/utils/uiEditorProjectImporter';
import {
  DEFAULT_MODEL_RESOLUTION,
  type ModelAsset,
  type ModelResolution,
} from '@/utils/polyhaven';
import { useUIEditorStore } from '@/store/uiEditorStore';

export function Toolbar() {
  const notify = useEditorNotify();
  const { editorMode, setEditorMode } = useEditorStore();
  const [showExport, setShowExport] = useState(false);
  const [showUIExport, setShowUIExport] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelResolution, setModelResolution] = useState<ModelResolution>(DEFAULT_MODEL_RESOLUTION);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const { handleFileImport, loadPolyhavenModel } = useModelLoader();

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const scene = (window as any).__editorScene;
      if (scene) {
        await handleFileImport(files, scene);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePolyhavenModelSelect = async (asset: ModelAsset) => {
    const scene = (window as any).__editorScene;
    if (!scene) {
      notify.error('场景尚未初始化');
      return;
    }

    setLoadingModelId(asset.id);
    try {
      await loadPolyhavenModel(asset, scene, modelResolution);
      setSelectedModelId(asset.id);
      notify.success(`已导入模型：${asset.name}`);
      setModelModalOpen(false);
    } catch (error) {
      console.error(error);
      notify.error(error instanceof Error ? error.message : '模型加载失败');
    } finally {
      setLoadingModelId(null);
    }
  };

  const handleExportProject = () => {
    setShowUIExport(true);
  };

  const handleExportComplete = () => {
    setShowExport(false);
  };

  const handleSaveProject = async () => {
    setSavingProject(true);
    try {
      if (editorMode === 'ui') {
        const result = await saveUIEditorProject();
        const parts = [
          result.pageCount > 1 ? `${result.pageCount} 个画布` : null,
          result.imageCount > 0 ? `${result.imageCount} 张图片` : null,
        ].filter(Boolean);
        const detail = parts.length > 0 ? `（${parts.join('，')}）` : '';
        notify.success(`UI 项目已保存：${result.filename}${detail}`);
      } else {
        const result = await saveEditorProject();
        notify.success(`项目已保存：${result.filename}`);
      }
    } catch (error) {
      console.error(error);
      notify.error(error instanceof Error ? error.message : '项目保存失败');
    } finally {
      setSavingProject(false);
    }
  };

  const handleOpenProjectClick = () => {
    projectInputRef.current?.click();
  };

  const runProjectImport = async (file: File) => {
    setOpeningProject(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (editorMode === 'ui') {
        if (ext === 'zip') {
          await importUIEditorProjectZip(file);
        } else if (ext === 'json') {
          await importUIEditorProjectJson(file);
        } else {
          throw new Error('仅支持 .zip UI 项目包或 .json UI 配置');
        }
      } else {
        if (ext === 'zip') {
          await importEditorProjectZip(file);
        } else if (ext === 'json') {
          await importEditorProjectJson(file);
        } else {
          throw new Error('仅支持 .zip 项目包或 .json 场景配置');
        }
      }
      notify.success(`项目已打开：${file.name}`);
    } catch (error) {
      console.error(error);
      notify.error(error instanceof Error ? error.message : '项目打开失败');
    } finally {
      setOpeningProject(false);
    }
  };

  const handleProjectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const openFile = async () => {
      await runProjectImport(file);
      if (projectInputRef.current) {
        projectInputRef.current.value = '';
      }
    };

    const hasUnsavedContent =
      editorMode === 'ui' ? useUIEditorStore.getState().hasContent() : hasEditorSceneContent();

    if (hasUnsavedContent) {
      Modal.confirm({
        title: '打开项目',
        content: editorMode === 'ui'
          ? '当前 UI 画布尚未保存，打开项目将覆盖现有 UI 内容。是否继续？'
          : '当前场景尚未保存，打开项目将覆盖现有内容。是否继续？',
        okText: '继续打开',
        cancelText: '取消',
        onOk: openFile,
        onCancel: () => {
          if (projectInputRef.current) {
            projectInputRef.current.value = '';
          }
        },
      });
    } else {
      await openFile();
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-bg"></div>
      <div className="toolbar-content">
        <div className="toolbar-left">
          <div className="logo-wrapper">
            <div className="logo-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M14 10L20 13V19L14 22L8 19V13L14 10Z" fill="currentColor" opacity="0.3"/>
                <circle cx="14" cy="16" r="3" fill="currentColor"/>
              </svg>
            </div>
            <div className="logo-text">
              <h1 className="logo-title">3D Editor</h1>
              <span className="logo-subtitle">数字孪生平台</span>
            </div>
          </div>
        </div>

        <div className="toolbar-center">
          <div className="editor-mode-switch">
            <button
              type="button"
              className={`editor-mode-btn ${editorMode === 'scene' ? 'active' : ''}`}
              onClick={() => setEditorMode('scene')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4L8 1L14 4V12L8 15L2 12V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 1V15" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 4L14 4" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span>场景编辑</span>
            </button>
            <button
              type="button"
              className={`editor-mode-btn ${editorMode === 'ui' ? 'active' : ''}`}
              onClick={() => setEditorMode('ui')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 5H14" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="4" y="7" width="4" height="2" rx="0.5" fill="currentColor" opacity="0.5"/>
                <rect x="4" y="10" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>
              </svg>
              <span>UI 编排</span>
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={projectInputRef}
            type="file"
            accept=".zip,.json"
            onChange={handleProjectFileSelect}
            className="hidden"
          />

          {editorMode === 'scene' ? (
            <>
              <button
                onClick={handleOpenProjectClick}
                disabled={openingProject}
                className="toolbar-btn btn-import"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4H14V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 7H11M5 10H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>{openingProject ? '打开中…' : '打开项目'}</span>
              </button>

              <button
                onClick={handleSaveProject}
                disabled={savingProject}
                className="toolbar-btn btn-import"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 13H13V5L10 2H3V13Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M6 2V5H10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M5 9H11M5 11H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>{savingProject ? '保存中…' : '保存项目'}</span>
              </button>

              <button
                onClick={handleImport}
                className="toolbar-btn btn-import"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2V10M8 2L5 5M8 2L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 10V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>导入模型</span>
              </button>

              <button
                onClick={() => setModelModalOpen(true)}
                disabled={!!loadingModelId}
                className="toolbar-btn btn-import"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 13V6L8 3L13 6V13H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M3 9H13" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <span>模型库</span>
              </button>

              <button
                onClick={() => setShowExport(true)}
                className="toolbar-btn btn-export"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 10V2M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 10V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>导出</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleOpenProjectClick}
                disabled={openingProject}
                className="toolbar-btn btn-import"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4H14V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 7H11M5 10H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>{openingProject ? '打开中…' : '打开项目'}</span>
              </button>

              <button
                onClick={handleSaveProject}
                disabled={savingProject}
                className="toolbar-btn btn-import"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 13H13V5L10 2H3V13Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M6 2V5H10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M5 9H11M5 11H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>{savingProject ? '保存中…' : '保存项目'}</span>
              </button>

              <button
                onClick={handleExportProject}
                className="toolbar-btn btn-export"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 2H10L13 5V13C13 13.5523 12.5523 14 12 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2Z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M6 2V5H10" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 8H9M5 10H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>导出项目</span>
              </button>
            </>
          )}
        </div>
      </div>

      <ModelPickerModal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        resolution={modelResolution}
        onResolutionChange={setModelResolution}
        selectedId={selectedModelId}
        loadingId={loadingModelId}
        onSelect={handlePolyhavenModelSelect}
      />

      {showExport && editorMode === 'scene' && (
        <ExportPanel onClose={handleExportComplete} />
      )}

      <UIExportModal open={showUIExport} onClose={() => setShowUIExport(false)} />
    </header>
  );
}
