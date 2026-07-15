import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useHistoryStore } from '@/store/historyStore';
import { useSceneStore } from '@/store/sceneStore';
import type { TransformSnapshot } from '@/store/historyStore';
import { findThreeObjectById } from '@/utils/sceneUtils';
import * as THREE from 'three';

function applyTransformSnapshot(snapshot: TransformSnapshot) {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene) return;

  const { getThreeObject, updateObject } = useSceneStore.getState();
  const threeObj = findThreeObjectById(scene, snapshot.objectId, getThreeObject);

  if (threeObj) {
    threeObj.position.set(...snapshot.position);
    threeObj.rotation.set(...snapshot.rotation);
    threeObj.scale.set(...snapshot.scale);
    updateObject(snapshot.objectId, {
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
    });
  }
}

export function useKeyboardShortcuts() {
  const { setTool, toggleGrid, toggleAxes, editorMode, setEditorMode } = useEditorStore();
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const { selectedIds, removeObject, getThreeObject } = useSceneStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape' && editorMode === 'preview') {
        setEditorMode('scene');
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'q':
          setTool('select');
          break;
        case 'w':
          setTool('move');
          break;
        case 'e':
          setTool('rotate');
          break;
        case 'r':
          setTool('scale');
          break;
        case 'g':
          toggleGrid();
          break;
        case 'h':
          toggleAxes();
          break;
        case 'delete':
        case 'backspace':
          if (selectedIds.length > 0) {
            e.preventDefault();
            const transformControls = (window as any).__editorTransformControls;
            if (transformControls) {
              transformControls.detach();
            }

            const scene = (window as any).__editorScene as THREE.Scene | undefined;

            selectedIds.forEach((id) => {
              if (scene) {
                const threeObj = findThreeObjectById(scene, id, getThreeObject);
                if (threeObj?.parent) {
                  threeObj.parent.remove(threeObj);
                }
              }
              removeObject(id);
            });
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (canUndo()) {
              const entry = undo();
              if (entry) {
                applyTransformSnapshot(entry.before);
              }
            }
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (canRedo()) {
              const entry = redo();
              if (entry) {
                applyTransformSnapshot(entry.after);
              }
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    setTool,
    toggleGrid,
    toggleAxes,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedIds,
    removeObject,
    getThreeObject,
    editorMode,
    setEditorMode,
  ]);
}
