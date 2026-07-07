import { useState, useEffect, useRef } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useLightStore } from '@/store/lightStore';
import * as THREE from 'three';
import { MaterialEditor } from './MaterialEditor';
import { GlobalSettings } from './GlobalSettings';
import { ParticleEditor } from './ParticleEditor';
import { syncParticleRootVisibility } from '@/utils/particleScene';

export function PropertyPanel() {
  const { selectedIds, objects, updateObject, getThreeObject } = useSceneStore();
  const { selectedLightId, lights, updateLight } = useLightStore();
  const [activeTab, setActiveTab] = useState<'details' | 'material'>('details');
  const objectRef = useRef<THREE.Object3D | null>(null);
  const [currentMaterial, setCurrentMaterial] = useState<THREE.Material | null>(null);
  const [objectVisible, setObjectVisible] = useState(true);
  const isLightInputEditingRef = useRef(false);
  const [lightLiveTransform, setLightLiveTransform] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);

  // 获取选中的第一个对象
  const selectedObject = selectedIds.length > 0 
    ? objects.find(obj => obj.id === selectedIds[0])
    : null;
  
  // 获取选中的灯光 - 直接从lights数组中查找,确保是最新数据
  const selectedLight = selectedLightId 
    ? lights.find(l => l.id === selectedLightId)
    : null;

  // 当选中对象变化时,更新材质引用和对象引用
  useEffect(() => {
    if (selectedIds.length > 0) {
      // 策略1: 从store获取(注册的组件)
      let threeObj = getThreeObject(selectedIds[0]);
      
      // 策略2: 如果store中没有,直接从场景中查找(支持子mesh)
      if (!threeObj) {
        const scene = (window as any).__editorScene;
        if (scene) {
          scene.traverse((child: THREE.Object3D) => {
            if (child.uuid === selectedIds[0]) {
              threeObj = child;
            }
          });
        }
      }
      
      objectRef.current = threeObj || null;

      const currentSelected =
        selectedIds.length > 0 ? objects.find((obj) => obj.id === selectedIds[0]) : null;

      if (currentSelected?.type === 'particle') {
        setObjectVisible(currentSelected.visible);
      } else if (threeObj) {
        setObjectVisible(threeObj.visible);
      } else if (currentSelected) {
        setObjectVisible(currentSelected.visible);
      } else {
        setObjectVisible(true);
      }

      // 获取材质 - 支持Mesh和Group/模型
      if (threeObj) {
        let mat: THREE.Material | null = null;
        
        if (threeObj instanceof THREE.Mesh) {
          // 直接是Mesh,获取材质(可能是数组)
          const material = threeObj.material;
          if (Array.isArray(material)) {
            mat = material[0] || null; // 如果是多材质,取第一个
          } else {
            mat = material as THREE.Material;
          }
        } else if (threeObj instanceof THREE.Line || threeObj instanceof THREE.LineSegments) {
          mat = threeObj.material as THREE.Material;
        } else if (threeObj instanceof THREE.Group || threeObj instanceof THREE.Object3D) {
          // 是Group或Object3D,查找第一个有材质的Mesh
          threeObj.traverse((child) => {
            if (!mat && child instanceof THREE.Mesh && child.material) {
              const childMat = child.material;
              if (Array.isArray(childMat)) {
                mat = childMat[0] || null;
              } else {
                mat = childMat as THREE.Material;
              }
            }
          });
        }
        
        if (mat) {
          setCurrentMaterial(mat);
          // 不自动切换Tab,保持用户当前选择的状态
          // 强制更新:使用setTimeout确保state更新后重新渲染
          setTimeout(() => {
            setCurrentMaterial(mat);
          }, 0);
        } else {
          setCurrentMaterial(null);
        }
      } else {
        objectRef.current = null;
        setCurrentMaterial(null);
      }
    } else {
      objectRef.current = null;
      setCurrentMaterial(null);
    }
  }, [selectedIds, getThreeObject, objects, selectedObject?.visible, selectedObject?.id]);

  const handleVisibilityToggle = () => {
    const storeId =
      selectedObject?.id ||
      objects.find((obj) => getThreeObject(obj.id) === objectRef.current)?.id;

    if (!storeId) return;

    const sceneObj = objects.find((obj) => obj.id === storeId);
    const nextVisible = !(sceneObj?.visible ?? objectRef.current?.visible ?? true);

    if (objectRef.current) {
      objectRef.current.visible = nextVisible;
    }

    setObjectVisible(nextVisible);
    updateObject(storeId, { visible: nextVisible });

    if (selectedObject?.type === 'particle') {
      syncParticleRootVisibility(storeId);
    }
  };

  // 实时同步灯光坐标（Gizmo 拖拽时更新右侧面板）
  useEffect(() => {
    if (!selectedLightId || selectedIds.length > 0) {
      setLightLiveTransform(null);
      return;
    }

    let rafId = 0;
    const round2 = (n: number) => parseFloat(n.toFixed(2));

    const syncFromScene = () => {
      if (!isLightInputEditingRef.current) {
        const scene = (window as any).__editorScene as THREE.Scene | undefined;
        const threeLight = scene?.children.find(
          (child): child is THREE.Light =>
            child instanceof THREE.Light && child.userData?.id === selectedLightId
        );

        if (threeLight) {
          const next = {
            position: [
              round2(threeLight.position.x),
              round2(threeLight.position.y),
              round2(threeLight.position.z),
            ] as [number, number, number],
            target: [0, 0, 0] as [number, number, number],
          };

          if (
            threeLight instanceof THREE.DirectionalLight ||
            threeLight instanceof THREE.SpotLight
          ) {
            next.target = [
              round2(threeLight.target.position.x),
              round2(threeLight.target.position.y),
              round2(threeLight.target.position.z),
            ];
          }

          setLightLiveTransform((prev) => {
            if (
              prev &&
              prev.position[0] === next.position[0] &&
              prev.position[1] === next.position[1] &&
              prev.position[2] === next.position[2] &&
              prev.target[0] === next.target[0] &&
              prev.target[1] === next.target[1] &&
              prev.target[2] === next.target[2]
            ) {
              return prev;
            }
            return next;
          });
        }
      }

      rafId = requestAnimationFrame(syncFromScene);
    };

    rafId = requestAnimationFrame(syncFromScene);
    return () => cancelAnimationFrame(rafId);
  }, [selectedLightId, selectedIds]);

  // 处理灯光属性变化 - 直接同步到Three.js场景
  const handleLightUpdate = (id: string, updates: Partial<any>) => {
    // 更新store
    updateLight(id, updates);
    
    // 立即同步到Three.js场景
    const scene = (window as any).__editorScene;
    if (!scene) return;
    
    const threeLight = scene.children.find(
      (child: any) => child.isLight && child.userData.id === id
    );
    
    if (threeLight) {
      if (updates.color) {
        threeLight.color.set(updates.color);
      }
      if (updates.intensity !== undefined) {
        threeLight.intensity = updates.intensity;
      }
      if (updates.enabled !== undefined) threeLight.visible = updates.enabled;
      if (updates.position && threeLight.position) {
        threeLight.position.set(...updates.position);
      }
      if (
        updates.target &&
        (threeLight instanceof THREE.DirectionalLight || threeLight instanceof THREE.SpotLight)
      ) {
        threeLight.target.position.set(updates.target[0], updates.target[1], updates.target[2]);
      }
      
      // 阴影开关 (DirectionalLight和SpotLight)
      if (updates.castShadow !== undefined && threeLight instanceof THREE.DirectionalLight) {
        threeLight.castShadow = updates.castShadow;
      }
      
      // 阴影贴图尺寸 (仅DirectionalLight)
      if (threeLight instanceof THREE.DirectionalLight) {
        if (updates.shadowMapWidth !== undefined) {
          threeLight.shadow.mapSize.width = updates.shadowMapWidth;
          threeLight.shadow.mapSize.height = updates.shadowMapHeight || updates.shadowMapWidth;
          threeLight.shadow.map?.dispose(); // 重新生成阴影贴图
          threeLight.shadow.map = null;
        }
        
        // 阴影相机参数 (相机更新后需要调用updateMatrixWorld)
        const shadowCameraUpdated = 
          updates.shadowCameraNear !== undefined ||
          updates.shadowCameraFar !== undefined ||
          updates.shadowCameraLeft !== undefined ||
          updates.shadowCameraRight !== undefined ||
          updates.shadowCameraTop !== undefined ||
          updates.shadowCameraBottom !== undefined;
        
        if (shadowCameraUpdated) {
          if (updates.shadowCameraNear !== undefined) {
            threeLight.shadow.camera.near = updates.shadowCameraNear;
          }
          if (updates.shadowCameraFar !== undefined) {
            threeLight.shadow.camera.far = updates.shadowCameraFar;
          }
          if (updates.shadowCameraLeft !== undefined) {
            threeLight.shadow.camera.left = updates.shadowCameraLeft;
          }
          if (updates.shadowCameraRight !== undefined) {
            threeLight.shadow.camera.right = updates.shadowCameraRight;
          }
          if (updates.shadowCameraTop !== undefined) {
            threeLight.shadow.camera.top = updates.shadowCameraTop;
          }
          if (updates.shadowCameraBottom !== undefined) {
            threeLight.shadow.camera.bottom = updates.shadowCameraBottom;
          }
          
          // 更新阴影相机矩阵使其生效
          threeLight.shadow.camera.updateProjectionMatrix();
          threeLight.shadow.map?.dispose();
          threeLight.shadow.map = null;
        }
        
        // 阴影偏差和柔和度 (直接设置即可)
        if (updates.shadowBias !== undefined) {
          threeLight.shadow.bias = updates.shadowBias;
        }
        if (updates.shadowRadius !== undefined) {
          threeLight.shadow.radius = updates.shadowRadius;
        }
      }
    }
  };

  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedIds[0] || !objectRef.current) return;
    
    const newPos = [...objectRef.current.position.toArray()] as [number, number, number];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newPos[axisIndex] = value;
    
    updateObject(selectedIds[0], {
      position: newPos,
    });
    
    objectRef.current.position.set(...newPos);
  };

  const handleRotationChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedIds[0] || !objectRef.current) return;
    
    const newRot = [...objectRef.current.rotation.toArray()] as [number, number, number];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newRot[axisIndex] = value;
    
    updateObject(selectedIds[0], {
      rotation: newRot,
    });
    
    objectRef.current.rotation.set(...newRot);
  };

  const handleScaleChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedIds[0] || !objectRef.current) return;
    
    const newScale = [...objectRef.current.scale.toArray()] as [number, number, number];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newScale[axisIndex] = value;
    
    updateObject(selectedIds[0], {
      scale: newScale,
    });
    
    objectRef.current.scale.set(...newScale);
  };

  // 没有选中任何对象 - 显示全局设置
  // 但如果selectedIds有值(选中了子mesh),也显示属性面板
  if (!selectedObject && !selectedLight && selectedIds.length === 0) {
    return <GlobalSettings />;
  }

  // 选中灯光 - 显示灯光调试面板
  if (selectedLight && selectedIds.length === 0) {
    const displayPosition =
      lightLiveTransform?.position ?? selectedLight.position ?? [0, 0, 0];
    const displayTarget =
      lightLiveTransform?.target ?? selectedLight.target ?? [0, 0, 0];

    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 uppercase">
            灯光属性
          </h3>
          <p className="text-xs text-white mt-1">{selectedLight.name}</p>
          <p className="text-xs text-blue-400 mt-0.5">{selectedLight.type}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 颜色 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">颜色 (Color)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedLight.color}
                onChange={(e) => handleLightUpdate(selectedLight.id, { color: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer border border-gray-600"
              />
              <input
                type="text"
                value={selectedLight.color}
                onChange={(e) => handleLightUpdate(selectedLight.id, { color: e.target.value })}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded font-mono"
              />
            </div>
          </div>

          {/* 强度 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              强度 (Intensity): {selectedLight.intensity.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={selectedLight.intensity}
              onChange={(e) => handleLightUpdate(selectedLight.id, { intensity: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* 位置 */}
          {(selectedLight.position || lightLiveTransform) && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                {selectedLight.type === 'directional' ? '光源位置 (Sun Position)' : '位置 (Position)'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map((axis, idx) => (
                  <div key={axis}>
                    <label className={`text-xs block mb-1 ${
                      idx === 0 ? 'text-red-400' : idx === 1 ? 'text-green-400' : 'text-blue-400'
                    }`}>
                      {axis.toUpperCase()}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={displayPosition[idx]}
                      onFocus={() => { isLightInputEditingRef.current = true; }}
                      onBlur={() => { isLightInputEditingRef.current = false; }}
                      onChange={(e) => {
                        const newPos = [...displayPosition] as [number, number, number];
                        newPos[idx] = parseFloat(e.target.value);
                        handleLightUpdate(selectedLight.id, { position: newPos });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 照射目标（平行光 / 聚光灯，Gizmo 拖拽此项） */}
          {(selectedLight.type === 'directional' || selectedLight.type === 'spot') && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">照射目标 (Target)</label>
              <div className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map((axis, idx) => (
                  <div key={axis}>
                    <label className={`text-xs block mb-1 ${
                      idx === 0 ? 'text-red-400' : idx === 1 ? 'text-green-400' : 'text-blue-400'
                    }`}>
                      {axis.toUpperCase()}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={displayTarget[idx]}
                      onFocus={() => { isLightInputEditingRef.current = true; }}
                      onBlur={() => { isLightInputEditingRef.current = false; }}
                      onChange={(e) => {
                        const newTarget = [...displayTarget] as [number, number, number];
                        newTarget[idx] = parseFloat(e.target.value);
                        handleLightUpdate(selectedLight.id, { target: newTarget });
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                视口 Gizmo 拖拽此项；光源位置请在上方调整太阳距离
              </p>
            </div>
          )}

          {/* 阴影开关 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">投射阴影 (Cast Shadow)</span>
            <button
              onClick={() => handleLightUpdate(selectedLight.id, { castShadow: !selectedLight.castShadow })}
              className={`w-10 h-5 rounded-full transition-colors ${
                selectedLight.castShadow ? 'bg-green-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                  selectedLight.castShadow ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* 阴影参数区域 (仅DirectionalLight和SpotLight) */}
          {selectedLight.castShadow && selectedLight.type === 'directional' && (
            <div className="pt-2 border-t border-gray-700 space-y-3">
              <h5 className="text-xs font-semibold text-gray-400">阴影参数 (Shadow)</h5>
              
              {/* 阴影贴图尺寸 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">阴影贴图尺寸 (Map Size)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">宽度</label>
                    <select
                      value={selectedLight.shadowMapWidth || 2048}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowMapWidth: parseInt(e.target.value), shadowMapHeight: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    >
                      <option value={1024}>1024 x 1024</option>
                      <option value={2048}>2048 x 2048</option>
                      <option value={4096}>4096 x 4096</option>
                      <option value={8192}>8192 x 8192</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 阴影相机裁剪面 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">阴影相机裁剪面 (Camera)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Near</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={selectedLight.shadowCameraNear || 0.5}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowCameraNear: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Far</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={selectedLight.shadowCameraFar || 5000}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowCameraFar: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              {/* 阴影相机边界 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">阴影相机边界 (Bounds)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Left</label>
                    <input
                      type="number"
                      step="100"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={selectedLight.shadowCameraLeft || -2000}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowCameraLeft: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Right</label>
                    <input
                      type="number"
                      step="100"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={selectedLight.shadowCameraRight || 2000}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowCameraRight: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Top</label>
                    <input
                      type="number"
                      step="100"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={selectedLight.shadowCameraTop || 2000}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowCameraTop: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Bottom</label>
                    <input
                      type="number"
                      step="100"
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                      value={selectedLight.shadowCameraBottom || -2000}
                      onChange={(e) => handleLightUpdate(selectedLight.id, { shadowCameraBottom: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              {/* 阴影偏差 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  阴影偏差 (Bias): {(selectedLight.shadowBias || -0.0003).toFixed(4)}
                </label>
                <input
                  type="range"
                  min="-0.001"
                  max="0"
                  step="0.0001"
                  value={selectedLight.shadowBias || -0.0003}
                  onChange={(e) => handleLightUpdate(selectedLight.id, { shadowBias: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* 阴影柔和度 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  阴影柔和度 (Radius): {(selectedLight.shadowRadius || 2).toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={selectedLight.shadowRadius || 2}
                  onChange={(e) => handleLightUpdate(selectedLight.id, { shadowRadius: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isParticle = selectedObject?.type === 'particle';

  // 选中粒子发射器 — 详情与粒子参数合并为单页
  if (isParticle && selectedObject) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-3 border-b border-gray-700">
            <div>
              <label className="text-xs text-gray-400 block mb-1">名称</label>
              <input
                type="text"
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                value={selectedObject.name}
                onChange={(e) => updateObject(selectedObject.id, { name: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">可见</span>
              <button
                type="button"
                onClick={handleVisibilityToggle}
                className={`w-10 h-5 rounded-full transition-colors ${
                  objectVisible ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                    objectVisible ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
          <ParticleEditor objectId={selectedObject.id} />
        </div>
      </div>
    );
  }

  // 选中模型对象 - 显示Tab页
  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Tab页 */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'details'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          详情
        </button>
        <button
          onClick={() => setActiveTab('material')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'material'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          材质
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {/* 详情标签 */}
        {activeTab === 'details' && (selectedObject || objectRef.current) && (
          <div className="p-4 space-y-4">
            {/* 名称 */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">名称</label>
              <input
                type="text"
                value={selectedObject?.name || objectRef.current?.name || ''}
                onChange={(e) => {
                  // 策略1: 更新store中的对象
                  if (selectedObject) {
                    updateObject(selectedObject.id, { name: e.target.value });
                  }
                  // 策略2: 直接更新Three.js对象(支持子mesh)
                  if (objectRef.current) {
                    objectRef.current.name = e.target.value;
                  }
                }}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>

            {/* 位置 */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">位置 (Position)</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-red-400 block mb-1">X</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.position.x.toFixed(2) || '0'}
                    onChange={(e) => handlePositionChange('x', parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-green-400 block mb-1">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.position.y.toFixed(2) || '0'}
                    onChange={(e) => handlePositionChange('y', parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-400 block mb-1">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.position.z.toFixed(2) || '0'}
                    onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* 旋转 */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">旋转 (Rotation)</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-red-400 block mb-1">X</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.rotation.x.toFixed(2) || '0'}
                    onChange={(e) => handleRotationChange('x', parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-green-400 block mb-1">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.rotation.y.toFixed(2) || '0'}
                    onChange={(e) => handleRotationChange('y', parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-400 block mb-1">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.rotation.z.toFixed(2) || '0'}
                    onChange={(e) => handleRotationChange('z', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* 缩放 */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">缩放 (Scale)</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-red-400 block mb-1">X</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.scale.x.toFixed(2) || '1'}
                    onChange={(e) => handleScaleChange('x', parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-green-400 block mb-1">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.scale.y.toFixed(2) || '1'}
                    onChange={(e) => handleScaleChange('y', parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-400 block mb-1">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                    value={objectRef.current?.scale.z.toFixed(2) || '1'}
                    onChange={(e) => handleScaleChange('z', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* 可见性 */}
            {(selectedObject || objectRef.current) && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">可见</span>
                <button
                  type="button"
                  onClick={handleVisibilityToggle}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    objectVisible ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      objectVisible ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 材质标签 */}
        {activeTab === 'material' && (
          <MaterialEditor 
            material={currentMaterial}
            object3D={objectRef.current}
            onMaterialChange={(material) => {
              // 更新currentMaterial,触发useEffect重新同步参数
              setCurrentMaterial(material);
            }}
          />
        )}
      </div>
    </div>
  );
}
