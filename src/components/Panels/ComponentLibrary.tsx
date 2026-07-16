import { useState } from 'react';
import { useLightStore } from '@/store/lightStore';
import { useSceneStore } from '@/store/sceneStore';
import {
  createPrimitiveObject,
  type PrimitiveGeometryType,
} from '@/config/defaultGeometry';
import { createParticleEmitter } from '@/utils/particleScene';
import { getParticleSpawnTransform } from '@/particles/quarksAdapter';
import { PARTICLE_PRESETS } from '@/particles/particlePresets';
import type { ParticlePresetId } from '@/types/particle';
import type { SceneLabelMode } from '@/types/sceneLabel';
import { createDefaultLabelConfig, SCENE_LABEL_MODE_OPTIONS } from '@/types/sceneLabel';
import { createLabelAnchor } from '@/utils/sceneLabel';

export function ComponentLibrary() {
  const { addLight, selectLight } = useLightStore();
  const { addSceneObject, selectObject, deselectAll } = useSceneStore();
  const [activeTab, setActiveTab] = useState<'geometry' | 'lights' | 'particles' | 'labels'>('geometry');

  const handleAddLight = (type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere') => {
    const lightConfigs: Record<string, any> = {
      ambient: {
        name: '环境光',
        type: 'ambient',
        color: '#ffffff',
        intensity: 0.5,
        castShadow: false,
      },
      directional: {
        name: '平行光',
        type: 'directional',
        color: '#ffffff',
        intensity: 1.0,
        position: [5, 10, 7.5],
        target: [0, 0, 0],
        castShadow: true,
      },
      point: {
        name: '点光源',
        type: 'point',
        color: '#ffffff',
        intensity: 1.0,
        position: [0, 5, 0],
        castShadow: true,
        distance: 10,
      },
      spot: {
        name: '聚光灯',
        type: 'spot',
        color: '#ffffff',
        intensity: 1.0,
        position: [0, 5, 0],
        target: [0, 0, 0],
        castShadow: true,
        distance: 10,
        angle: 0.5,
        penumbra: 0.5,
      },
      hemisphere: {
        name: '半球光',
        type: 'hemisphere',
        color: '#ffffff',
        intensity: 0.5,
        groundColor: '#444444',
        position: [0, 10, 0],
      },
    };

    const lightId = addLight({
      ...lightConfigs[type],
      enabled: true,
    });

    deselectAll();
    selectLight(lightId);
  };

  const handleAddGeometry = (type: PrimitiveGeometryType) => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    const { object, preset } = createPrimitiveObject(type);
    const id = `geometry_${Date.now()}`;

    object.name = preset.name;
    object.userData.id = id;
    object.userData.geometryType = type;

    scene.add(object);

    addSceneObject({
      id,
      name: preset.name,
      type: 'mesh',
      visible: true,
      position: [...preset.position],
      rotation: [...preset.rotation],
      scale: [...preset.scale],
    });

    useSceneStore.getState().registerThreeObject(id, object);

    selectLight(null);
    selectObject(id);

    const transformControls = (window as any).__editorTransformControls;
    if (transformControls) {
      transformControls.attach(object);
    }
  };

  const handleAddLabel = (mode: SceneLabelMode) => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    const meta = SCENE_LABEL_MODE_OPTIONS.find((o) => o.value === mode);
    const id = `label_${Date.now()}`;
    const name = meta?.label ?? '标签';
    const label = createDefaultLabelConfig(mode);
    label.text = name;

    const anchor = createLabelAnchor(id, name, label);
    anchor.position.set(0, 2, 0);
    scene.add(anchor);

    addSceneObject({
      id,
      name,
      type: 'label',
      visible: true,
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      label,
    });

    useSceneStore.getState().registerThreeObject(id, anchor);

    selectLight(null);
    selectObject(id);

    const transformControls = (window as any).__editorTransformControls;
    if (transformControls) {
      transformControls.attach(anchor);
    }
  };

  const handleAddParticle = (presetId: ParticlePresetId) => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    const preset = PARTICLE_PRESETS.find((p) => p.id === presetId);
    const id = `particle_${Date.now()}`;
    const name = preset?.label ?? '粒子发射器';

    const spawnPos = getParticleSpawnTransform(presetId);

    const root = createParticleEmitter(scene, id, name, { preset: presetId }, {
      position: spawnPos,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    addSceneObject({
      id,
      name,
      type: 'particle',
      visible: true,
      position: spawnPos,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    useSceneStore.getState().registerThreeObject(id, root);

    selectLight(null);
    selectObject(id);

    const transformControls = (window as any).__editorTransformControls;
    if (transformControls) {
      transformControls.attach(root);
    }
  };

  const lightItems: { type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'; label: string }[] = [
    { type: 'ambient', label: '环境光' },
    { type: 'directional', label: '平行光' },
    { type: 'point', label: '点光源' },
    { type: 'spot', label: '聚光灯' },
    { type: 'hemisphere', label: '半球光' },
  ];

  const geometryItems: { type: PrimitiveGeometryType; label: string }[] = [
    { type: 'box', label: '立方体' },
    { type: 'sphere', label: '球体' },
    { type: 'cylinder', label: '圆柱体' },
    { type: 'plane', label: '平面' },
    { type: 'cone', label: '圆锥体' },
    { type: 'capsule', label: '胶囊体' },
    { type: 'circle', label: '圆形' },
    { type: 'ring', label: '圆环' },
    { type: 'torus', label: '圆环体' },
    { type: 'torusKnot', label: '圆环结' },
    { type: 'dodecahedron', label: '十二面体' },
    { type: 'icosahedron', label: '二十面体' },
    { type: 'octahedron', label: '八面体' },
    { type: 'tetrahedron', label: '四面体' },
    { type: 'edges', label: '硬边线' },
    { type: 'wireframe', label: '三角线框' },
  ];

  const itemButtonClass =
    'px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded transition-colors';

  const tabClass = (tab: typeof activeTab) =>
    `flex-1 px-2 py-2 text-xs font-medium transition-colors ${
      activeTab === tab
        ? 'text-white border-b-2 border-blue-500 bg-gray-800'
        : 'text-gray-400 hover:text-white'
    }`;

  return (
    <div className="h-full flex flex-col bg-gray-900 border-t border-gray-700">
      <div className="flex border-b border-gray-700">
        <button type="button" onClick={() => setActiveTab('lights')} className={tabClass('lights')}>
          灯光
        </button>
        <button type="button" onClick={() => setActiveTab('geometry')} className={tabClass('geometry')}>
          几何体
        </button>
        <button type="button" onClick={() => setActiveTab('particles')} className={tabClass('particles')}>
          粒子
        </button>
        <button type="button" onClick={() => setActiveTab('labels')} className={tabClass('labels')}>
          标签
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'lights' && (
          <div className="grid grid-cols-2 gap-2">
            {lightItems.map(({ type, label }) => (
              <button key={type} type="button" onClick={() => handleAddLight(type)} className={itemButtonClass}>
                {label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'geometry' && (
          <div className="grid grid-cols-2 gap-2">
            {geometryItems.map(({ type, label }) => (
              <button key={type} type="button" onClick={() => handleAddGeometry(type)} className={itemButtonClass}>
                {label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'particles' && (
          <div>
            <p className="text-[10px] text-gray-500 mb-2">
              基于 <strong className="text-purple-300">three.quarks</strong> 插件库，支持烟雾、火焰、魔法等高级 VFX，可在右侧属性面板自定义参数或导入 JSON。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PARTICLE_PRESETS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleAddParticle(id)}
                  className={itemButtonClass}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'labels' && (
          <div>
            <p className="text-[10px] text-gray-500 mb-2">
              HTML 标签：CSS2D / CSS3D / CSS3DSprite。可绑定「UI 编排」页面，把界面嵌进场景标签。
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SCENE_LABEL_MODE_OPTIONS.map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleAddLabel(value)}
                  className={`${itemButtonClass} text-left !py-2`}
                >
                  <div className="text-xs font-medium text-white">{label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
