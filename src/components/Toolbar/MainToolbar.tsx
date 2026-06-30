import { useState, useRef } from 'react';
import { useModelLoader } from '@/hooks/useModelLoader';
import { ExportPanel } from '@/components/Panels/ExportPanel';

export function Toolbar() {
  const [showExport, setShowExport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleFileImport } = useModelLoader();

  // 处理导入 - 直接打开系统文件选择器
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  // 文件选择后的处理
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const scene = (window as any).__editorScene;
      if (scene) {
        await handleFileImport(files, scene);
      }
    }
    // 清空input,允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理导出 - 从EditorViewport获取引用 (通过全局变量)
  const handleExport = () => {
    setShowExport(true);
  };

  // 导出完成后回调
  const handleExportComplete = () => {
    setShowExport(false);
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

        <div className="toolbar-right">
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 导入按钮 */}
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

          {/* 导出按钮 */}
          <button 
            onClick={handleExport}
            className="toolbar-btn btn-export"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 10V2M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 10V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>导出</span>
          </button>
        </div>
      </div>

      {/* 导出面板 */}
      {showExport && (
        <ExportPanel
          onClose={handleExportComplete}
        />
      )}
    </header>
  );
}
