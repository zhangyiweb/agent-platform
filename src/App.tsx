import { useState, useEffect, useCallback } from 'react'
import { useSceneStore } from '@/store/sceneStore'
import { useEditorStore } from '@/store/editorStore'
import { useLightStore } from '@/store/lightStore'
import { EditorViewport } from '@/components/Viewport/EditorViewport'
import { SceneTree } from '@/components/Panels/SceneTree'
import { ComponentLibrary } from '@/components/Panels/ComponentLibrary'
import { PropertyPanel } from '@/components/Panels/PropertyPanel'
import { Toolbar } from '@/components/Toolbar/MainToolbar'
import { GizmoToolbar } from '@/components/Toolbar/GizmoToolbar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import * as THREE from 'three'
import './App.css'

function App() {
  // 启用键盘快捷键
  useKeyboardShortcuts();
  
  const { selectedIds, objects } = useSceneStore();
  const { lights } = useLightStore();
  const { currentTool } = useEditorStore();
  
  // 统计信息
  const [fps, setFps] = useState(60);
  const [objectCount, setObjectCount] = useState(0);
  const [triangleCount, setTriangleCount] = useState(0);
  const [vertexCount, setVertexCount] = useState(0);
  
  // 计算场景统计信息
  const updateSceneStats = useCallback(() => {
    const scene = (window as any).__editorScene;
    if (!scene) return;
    
    // 如果场景还没有初始化完成,不统计
    if (!(window as any).__sceneInitialized) return;
    
    // 如果场景没有子对象,直接返回0
    if (scene.children.length === 0) {
      setObjectCount(0);
      setTriangleCount(0);
      setVertexCount(0);
      return;
    }
    
    let triangles = 0;
    let vertices = 0;
    let objCount = 0;
    
    // 只遍历顶级对象(不递归到子对象)
    scene.children.forEach((child: THREE.Object3D) => {
      // 跳过helper和grid等辅助对象以及默认灯光和TransformControls gizmo
      if (child.name === 'grid' || 
          child.name === 'axes' || 
          child.name.startsWith('helper_') ||
          child.userData?.isLightTarget === true ||
          child instanceof THREE.Light ||
          child.type === 'TransformControlsGizmo' || // TransformControls的gizmo助手
          (child.children.length === 2 && child.children[0]?.type === 'TransformControlsGizmo')) { // 包含gizmo的Object3D
        return;
      }
      
      objCount++;
      
      // 递归计算所有子对象的三角面和顶点数(但对象数只计顶级)
      child.traverse((descendant: THREE.Object3D) => {
        if (descendant instanceof THREE.Mesh) {
          const geometry = descendant.geometry;
          if (geometry.index) {
            triangles += geometry.index.count / 3;
          } else if (geometry.attributes.position) {
            triangles += geometry.attributes.position.count / 3;
          }
          vertices += geometry.attributes.position?.count || 0;
        }
      });
    });
    
    // 对象数 = 顶级对象数 + 灯光数(排除辅助对象)
    setObjectCount(objCount + lights.length);
    setTriangleCount(Math.floor(triangles));
    setVertexCount(vertices);
  }, [lights]);
  
  // 每秒更新统计信息
  useEffect(() => {
    updateSceneStats();
    const interval = setInterval(() => {
      // 每次统计前都重新获取场景对象,确保是最新的
      updateSceneStats();
    }, 1000);
    return () => clearInterval(interval);
  }, [updateSceneStats]);
  
  // 简化的FPS计算(基于渲染间隔)
  useEffect(() => {
    let lastTime = performance.now();
    let frames = 0;
    
    const countFrame = () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frames);
        frames = 0;
        lastTime = now;
      }
      requestAnimationFrame(countFrame);
    };
    
    requestAnimationFrame(countFrame);
  }, []);
  
  const selectedObject = selectedIds.length > 0 
    ? objects.find(obj => obj.id === selectedIds[0])
    : null;

  return (
    <div className="app-container">
      {/* 顶部工具栏 */}
      <Toolbar />

      {/* 主内容区 */}
      <div className="main-content">
        {/* 左侧面板 - 上下结构 */}
        <aside className="scene-tree" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* 上部: 场景树 */}
          <div style={{ height: '50%', overflow: 'hidden' }}>
            <SceneTree />
          </div>
          
          {/* 下部: 组件库 */}
          <div style={{ height: '50%', overflow: 'hidden' }}>
            <ComponentLibrary />
          </div>
        </aside>

        {/* 中间3D视口 */}
        <main className="viewport">
          <EditorViewport />
        </main>

        {/* 右侧属性面板 */}
        <aside className="property-panel">
          <PropertyPanel />
        </aside>
      </div>

      {/* 底部状态栏 */}
      <footer className="status-bar">
        <div className="flex items-center gap-4">
          <span>工具: {currentTool}</span>
          {selectedObject && (
            <span>选中: {selectedObject.name}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>对象数: {objects.length}</span>
          <span>FPS: {fps}</span>
          <span>对象: {objectCount}</span>
          <span>三角面: {triangleCount.toLocaleString()}</span>
          <span>顶点: {vertexCount.toLocaleString()}</span>
        </div>
      </footer>

      {/* Gizmo工具栏 - 固定在屏幕下方 */}
      <GizmoToolbar />
    </div>
  )
}

export default App
