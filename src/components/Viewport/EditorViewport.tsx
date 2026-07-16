import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SobelOperatorShader } from 'three/addons/shaders/SobelOperatorShader.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';
import { DotScreenPass } from 'three/addons/postprocessing/DotScreenPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { useSceneStore } from '@/store/sceneStore';
import { useEditorStore } from '@/store/editorStore';
import { useModelLoader } from '@/hooks/useModelLoader';
import { useLightStore } from '@/store/lightStore';
import { useHistoryStore } from '@/store/historyStore';
import { tickTextureUvAnimations } from '@/utils/textureAnimationRuntime';
import { tickParticleSystems, disposeAllParticleSystems } from '@/utils/particleScene';
import { tickEditorCameraFly } from '@/utils/cameraTourPlayer';
import { tickEditorCameraTour } from '@/components/Panels/CameraTourPanel';
import { disposeObject3DResources } from '@/utils/sceneUtils';
import {
  applyRendererLightingDefaults,
  applyDirectionalShadowSettings,
  DEFAULT_TONE_MAPPING_EXPOSURE,
} from '@/config/defaultLighting';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { resolveLabelIdFromIntersect, hitTestLabelAtClientPoint, syncLabelObjectScaleVisual, bindLabelUiInteractions } from '@/utils/sceneLabel';

const CLICK_DRAG_THRESHOLD_PX = 5;

/** 从射线命中的 Object3D 向上查找业务 ID */
function resolveBusinessId(selectedObject: THREE.Object3D): string {
  let node: THREE.Object3D | null = selectedObject;
  while (node) {
    const id = node.userData?.id ?? node.userData?.businessId;
    if (typeof id === 'string' && id) return id;
    node = node.parent;
  }

  const { objects, threeObjects } = useSceneStore.getState();
  for (const [id, threeObj] of threeObjects) {
    let matched = false;
    threeObj.traverse((child) => {
      if (child === selectedObject) matched = true;
    });
    if (matched) return id;
  }

  const byName = objects.find((obj) => obj.name === selectedObject.name);
  if (byName) return byName.id;

  return selectedObject.uuid;
}

/** 是否可用变换控制器移动的灯光 */
function isTransformableLight(light: THREE.Light): boolean {
  return !(light instanceof THREE.AmbientLight);
}

/** 从拾取对象解析灯光 ID */
function resolveLightIdFromPick(object: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (typeof node.userData?.lightId === 'string') return node.userData.lightId;
    if (node.name.startsWith('helper_')) return node.name.slice('helper_'.length);
    if (node instanceof THREE.Light && typeof node.userData?.id === 'string') return node.userData.id;
    node = node.parent;
  }
  return null;
}

/** 为可定位灯光添加不可见拾取球，便于视口点击选中 */
function ensureLightPickProxy(light: THREE.Light, lightId: string) {
  if (light instanceof THREE.AmbientLight) return;
  if (light.getObjectByName('light_pick_proxy')) return;

  const radius =
    light instanceof THREE.DirectionalLight ? 3 :
    light instanceof THREE.SpotLight ? 0.8 :
    0.5;
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  proxy.name = 'light_pick_proxy';
  proxy.userData.lightId = lightId;
  proxy.userData.isLightPickProxy = true;
  light.add(proxy);
}

function createLightHelper(light: THREE.Light): THREE.Object3D | null {
  switch (light.type) {
    case 'DirectionalLight':
      return new THREE.DirectionalLightHelper(light as THREE.DirectionalLight, 10);
    case 'PointLight':
      return new THREE.PointLightHelper(light as THREE.PointLight, 0.6);
    case 'SpotLight':
      return new THREE.SpotLightHelper(light as THREE.SpotLight);
    case 'HemisphereLight':
      return new THREE.HemisphereLightHelper(light as THREE.HemisphereLight, 1.2);
    default:
      return null;
  }
}

function disposeLightHelper(helper: THREE.Object3D) {
  const disposable = helper as unknown as { dispose?: () => void };
  disposable.dispose?.();
}

/** 平行光/聚光灯：Gizmo 挂在 target（与 Helper 重合，可拖拽照射目标） */
function getLightTransformAttachObject(light: THREE.Light): THREE.Object3D {
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
    return light.target;
  }
  return light;
}

function applyLightTargetFromConfig(light: THREE.Light, target?: [number, number, number]) {
  if (
    target &&
    (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight)
  ) {
    light.target.position.set(...target);
  }
}

function addLightTargetToScene(scene: THREE.Scene, light: THREE.Light) {
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
    light.target.userData.isLightTarget = true;
    light.target.userData.lightId = light.userData.id;
    if (light.target.parent !== scene) {
      scene.add(light.target);
    }
  }
}

function removeLightTargetFromScene(scene: THREE.Scene, light: THREE.Light) {
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
    delete light.target.userData.isLightTarget;
    delete light.target.userData.lightId;
    scene.remove(light.target);
  }
}

export function EditorViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const css2dRendererRef = useRef<CSS2DRenderer | null>(null);
  const css3dRendererRef = useRef<CSS3DRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gizmoHelperRef = useRef<THREE.Object3D | null>(null);
  const animationFrameRef = useRef<number>(0);
  const timerRef = useRef(new THREE.Timer());
  const renderLoopActiveRef = useRef(false);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const initializedRef = useRef(false); // 防止React严格模式下重复初始化
  const composerRef = useRef<EffectComposer | null>(null); // 后期处理Composer
  const currentPassRef = useRef<any>(null); // 当前后期处理Pass
  const currentEffectRef = useRef<string | null>(null); // 当前效果名称
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const pointerDownRef = useRef({ x: 0, y: 0 });
  const gizmoWasDraggingRef = useRef(false);
  const isLightTransformDraggingRef = useRef(false);

  const { camera, backgroundColor, objects, selectedIds, selectObject, deselectAll, updateObject, registerThreeObject, addObject } = useSceneStore();
  const { gridVisible, axesVisible, currentTool, editorMode } = useEditorStore();
  const { handleFileImport } = useModelLoader();
  const handleFileImportRef = useRef(handleFileImport);
  handleFileImportRef.current = handleFileImport;
  const { lights } = useLightStore();
  const { selectedLightId, selectLight, updateLight } = useLightStore();
  const lightsRef = useRef<Map<string, THREE.Light>>(new Map());
  const lightHelpersRef = useRef<Map<string, any>>(new Map());

  // 像素化Shader
  const pixelationShader = {
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      pixelSize: { value: 2.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform float pixelSize;
      varying vec2 vUv;
      void main() {
        vec2 dxy = pixelSize / resolution;
        vec2 coord = dxy * floor(vUv / dxy);
        gl_FragColor = texture2D(tDiffuse, coord);
      }
    `,
  };

  // 色差Shader
  const chromaticAberrationShader = {
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 0.002 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float amount;
      varying vec2 vUv;
      void main() {
        vec2 offset = amount * (vUv - vec2(0.5));
        float r = texture2D(tDiffuse, vUv + offset).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - offset).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `,
  };

  // 收集场景中可描边的 Mesh（排除辅助对象）
  const collectOutlineTargets = (scene: THREE.Scene): THREE.Object3D[] => {
    const targets: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.name !== 'grid' &&
        child.name !== 'axes' &&
        !child.name.startsWith('helper_')
      ) {
        targets.push(child);
      }
    });
    return targets;
  };

  // 更新 Pass 参数（实时同步 UI）
  const updatePassParams = (pass: any, config: any, renderer: THREE.WebGLRenderer) => {
    if (!pass || !config) return;

    if (pass.threshold !== undefined && config.bloom) {
      pass.threshold = config.bloom.threshold;
      pass.strength = config.bloom.intensity;
      pass.radius = config.bloom.radius;
    }

    if (pass.uniforms?.resolution && pass.material?.fragmentShader?.includes('FXAA')) {
      const pr = renderer.getPixelRatio();
      pass.uniforms.resolution.value.set(
        1 / (renderer.domElement.width * pr),
        1 / (renderer.domElement.height * pr)
      );
    }

    if (pass.uniforms?.resolution && pass.material?.fragmentShader?.includes('Sobel')) {
      pass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    }

    if (pass.uniforms?.amount && config.chromatic) {
      pass.uniforms.amount.value = config.chromatic.amount;
    }

    if (pass.uniforms?.pixelSize && config.pixelate) {
      pass.uniforms.pixelSize.value = config.pixelate.size;
      if (pass.uniforms.resolution) {
        pass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
      }
    }

    if (pass.uniforms?.darkness && config.vignette) {
      pass.uniforms.darkness.value = config.vignette.darkness;
    }

    if (pass.uniforms?.intensity && config.film) {
      pass.uniforms.intensity.value = config.film.intensity;
      pass.uniforms.grayscale.value = config.film.grayscale;
    }

    if (pass.goWild !== undefined && config.glitch) {
      pass.goWild = config.glitch.goWild;
    }

    if (pass.edgeStrength !== undefined && config.outline) {
      pass.edgeStrength = config.outline.edgeStrength;
      pass.edgeGlow = config.outline.edgeGlow;
      pass.edgeThickness = config.outline.edgeThickness;
      pass.pulsePeriod = config.outline.pulsePeriod;
    }

    if (pass.uniforms?.focus && config.bokeh) {
      pass.uniforms.focus.value = config.bokeh.focus;
      pass.uniforms.aperture.value = config.bokeh.aperture;
      pass.uniforms.maxblur.value = config.bokeh.maxblur;
    }

    if (pass.damp !== undefined && config.afterimage) {
      pass.damp = config.afterimage.damp;
    }

    if (pass.uniforms?.radius && config.halftone) {
      pass.uniforms.radius.value = config.halftone.radius;
      pass.uniforms.scatter.value = config.halftone.scatter;
      pass.uniforms.blending.value = config.halftone.blending;
    }

    if (pass.uniforms?.scale && pass.uniforms?.angle && config.dotscreen) {
      pass.uniforms.scale.value = config.dotscreen.scale;
      pass.uniforms.angle.value = config.dotscreen.angle;
    }

    if (pass.params && config.sao) {
      pass.params.saoBias = config.sao.bias;
      pass.params.saoIntensity = config.sao.intensity;
      pass.params.saoScale = config.sao.scale;
      pass.params.saoKernelRadius = config.sao.kernelRadius;
    }

    if (pass.kernelRadius !== undefined && config.ssao) {
      pass.kernelRadius = config.ssao.kernelRadius;
      pass.minDistance = config.ssao.minDistance;
      pass.maxDistance = config.ssao.maxDistance;
    }

    if (pass.pixelSize !== undefined && config.pixelated) {
      pass.pixelSize = config.pixelated.size;
    }
  };

  // 动态重建Renderer - 用于修改antialias/alpha/logarithmicDepthBuffer参数
  const recreateRenderer = useCallback((params: {antialias: boolean, alpha: boolean, logarithmicDepthBuffer: boolean}) => {
    if (!containerRef.current || !sceneRef.current || !cameraRef.current) return;

    const oldRenderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const transformControls = transformControlsRef.current;

    // 保留旧 renderer 的运行时设置（重建后恢复）
    const savedPixelRatio = oldRenderer?.getPixelRatio() ?? Math.min(window.devicePixelRatio, 2);
    const savedToneMapping = oldRenderer?.toneMapping ?? THREE.ACESFilmicToneMapping;
    const savedToneMappingExposure = oldRenderer?.toneMappingExposure ?? DEFAULT_TONE_MAPPING_EXPOSURE;
    const savedUseLegacyLights = (oldRenderer as { useLegacyLights?: boolean } | null)?.useLegacyLights ?? false;

    // 移除旧 renderer 的 DOM
    if (oldRenderer && containerRef.current.contains(oldRenderer.domElement)) {
      containerRef.current.removeChild(oldRenderer.domElement);
      oldRenderer.dispose();
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: params.antialias,
      alpha: params.alpha,
      logarithmicDepthBuffer: params.logarithmicDepthBuffer,
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(savedPixelRatio);
    renderer.toneMapping = savedToneMapping;
    renderer.toneMappingExposure = savedToneMappingExposure;
    (renderer as { useLegacyLights?: boolean }).useLegacyLights = savedUseLegacyLights;
    applyRendererLightingDefaults(renderer, savedToneMappingExposure);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.zIndex = '1';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    (window as any).__editorRenderer = renderer;

    // CSS 渲染层保持在 WebGL 画布之上
    const css2d = css2dRendererRef.current;
    const css3d = css3dRendererRef.current;
    if (css2d?.domElement) {
      containerRef.current.appendChild(css2d.domElement);
    }
    if (css3d?.domElement) {
      containerRef.current.appendChild(css3d.domElement);
    }

    // 重绑 OrbitControls（保留 target / 阻尼等内部状态，勿 dispose 后重建）
    if (controls) {
      controls.disconnect();
      controls.connect(renderer.domElement);
    }

    renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
    });

    // 重绑 TransformControls 到新 canvas（保留已 attach 的对象）
    if (transformControls) {
      const attachedObject = transformControls.object;
      transformControls.disconnect();
      transformControls.connect(renderer.domElement);
      if (attachedObject) {
        transformControls.attach(attachedObject);
      }
      (window as any).__editorTransformControls = transformControls;
    }

    // EffectComposer 绑定旧 renderer，需在下帧由渲染循环重建
    if (composerRef.current) {
      composerRef.current.dispose();
      composerRef.current = null;
      currentPassRef.current = null;
    }

    const clickHandler = (window as any).__editorClickHandler;
    const dragOverHandler = (window as any).__editorDragOverHandler;
    const dropHandler = (window as any).__editorDropHandler;

    if (clickHandler) {
      renderer.domElement.addEventListener('click', clickHandler);
    }
    if (dragOverHandler) {
      renderer.domElement.addEventListener('dragover', dragOverHandler);
    }
    if (dropHandler) {
      renderer.domElement.addEventListener('drop', dropHandler);
    }
  }, []);
  
  // 将recreateRenderer暴露到全局,供GlobalSettings使用
  useEffect(() => {
    (window as any).__recreateRenderer = recreateRenderer;
  }, [recreateRenderer]);

  // 初始化场景
  const initScene = useCallback(() => {
    if (!containerRef.current) return;
    
    // 防止重复初始化；若场景已被卸载则允许重新创建
    if (initializedRef.current && sceneRef.current) {
      return;
    }
    initializedRef.current = true;

    // 清理旧的全局引用(防止使用旧场景对象)
    disposeAllParticleSystems();
    delete (window as any).__editorScene;
    delete (window as any).__sceneInitialized;

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    sceneRef.current = scene;

    // 创建相机
    const initialCamera = useSceneStore.getState().camera;
    const cameraObj = new THREE.PerspectiveCamera(
      initialCamera.fov,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      initialCamera.near,
      initialCamera.far
    );
    cameraObj.position.set(16.28, 7.4, 15.79); // 初始相机坐标
    cameraRef.current = cameraObj;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({
      antialias: true, // 抗锯齿
      alpha: true, // 透明背景
      logarithmicDepthBuffer: true, // 对数深度缓冲区,解决大场景深度精度问题
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    applyRendererLightingDefaults(renderer, DEFAULT_TONE_MAPPING_EXPOSURE);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // CSS2D / CSS3D 叠加层：必须让子节点也 pointer-events:none，
    // 否则默认 auto 的子元素会挡住 WebGL 画布，导致无法选中/拖动 Gizmo
    const mountCssOverlay = (dom: HTMLElement, zIndex: string) => {
      dom.classList.add('editor-css-overlay');
      dom.style.position = 'absolute';
      dom.style.inset = '0';
      dom.style.width = '100%';
      dom.style.height = '100%';
      dom.style.pointerEvents = 'none';
      dom.style.overflow = 'hidden';
      dom.style.zIndex = zIndex;
      if (!dom.querySelector('style[data-editor-css-overlay]')) {
        const style = document.createElement('style');
        style.setAttribute('data-editor-css-overlay', '1');
        style.textContent =
          '.editor-css-overlay, .editor-css-overlay * { pointer-events: none !important; }' +
          '.editor-css-overlay.is-preview-interactive .scene-label-ui-root .ui-interactive,' +
          '.editor-css-overlay.is-preview-interactive .scene-label-ui-root .ui-interactive * {' +
          'pointer-events: auto !important; cursor: pointer; }';
        dom.appendChild(style);
      }
      containerRef.current!.appendChild(dom);
    };

    // 画布垫底，HTML 标签叠在上面（仅视觉；事件穿透到 canvas）
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.zIndex = '1';

    const css2d = new CSS2DRenderer();
    css2d.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    mountCssOverlay(css2d.domElement, '2');
    css2dRendererRef.current = css2d;

    const css3d = new CSS3DRenderer();
    css3d.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    mountCssOverlay(css3d.domElement, '3');
    css3dRendererRef.current = css3d;

    // 添加轨道控制器
    const controls = new OrbitControls(cameraObj, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 3.33, 0); // 初始控制点位置
    controls.update();
    controlsRef.current = controls;
    
    renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
    });
    
    // 监听相机变化 - 实时更新GlobalSettings中的坐标显示
    controls.addEventListener('change', () => {
      // 更新全局相机位置和控制点信息,供GlobalSettings读取
      (window as any).__editorCameraPosition = {
        x: cameraObj.position.x,
        y: cameraObj.position.y,
        z: cameraObj.position.z
      };
      (window as any).__editorControlsTarget = {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z
      };
    });

    // 设置全局引用 - 供PropertyPanel等组件使用
    (window as any).__editorScene = scene;
    (window as any).__editorRenderer = renderer;
    (window as any).__editorCamera = cameraObj;
    (window as any).__editorControls = controls;

    // 清空场景 - 移除所有旧对象(防止刷新时累积)
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((child) => {
      toRemove.push(child);
    });
    toRemove.forEach((child) => scene.remove(child));

    // 标记场景初始化完成（HDR 环境反射需用户手动加载，默认无 scene.environment）
    (window as any).__sceneInitialized = true;

    // 添加网格辅助 - 紫色主题,更大更美观
    const gridHelper = new THREE.GridHelper(1000, 50, 0x9333ea, 0x581c87);
    gridHelper.name = 'grid';
    scene.add(gridHelper);

    // 添加坐标轴辅助
    const axesHelper = new THREE.AxesHelper(1000);
    axesHelper.name = 'axes';
    scene.add(axesHelper);

    // 添加变换控制器 (Gizmo)
    const transformControls = new TransformControls(cameraObj, renderer.domElement);
    let transformStartState: {position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3} | null = null; // 记录拖拽前的状态
    let transformObjectId: string | null = null; // 记录被操作的对象ID
    
    transformControls.addEventListener('dragging-changed', (event: any) => {
      // 拖拽Gizmo时完全禁用OrbitControls,实现互斥
      controls.enabled = !event.value;

      const attached = transformControls.object;
      if (attached) {
        const { selectedLightId: activeLightId } = useLightStore.getState();
        const activeLight = activeLightId ? lightsRef.current.get(activeLightId) : null;
        if (
          activeLight &&
          (attached === activeLight ||
            attached === getLightTransformAttachObject(activeLight))
        ) {
          isLightTransformDraggingRef.current = event.value;
        }
      }
      
      // 拖拽开始时记录初始状态
      if (event.value && transformControls.object) {
        const obj = transformControls.object;
        transformStartState = {
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          scale: obj.scale.clone(),
        };
        
        // 查找对象ID
        const scene = sceneRef.current;
        if (scene) {
          scene.traverse((child: THREE.Object3D) => {
            if (child === obj) {
              // 从store中查找ID
              const store = useSceneStore.getState();
              store.objects.forEach(o => {
                const threeObj = store.getThreeObject(o.id);
                if (threeObj === obj) {
                  transformObjectId = o.id;
                }
              });
            }
          });
        }
      }
      
      // 如果从拖拽变为不拖拽,标记刚刚完成拖拽,并记录历史
      if (!event.value && transformStartState && transformObjectId) {
        gizmoWasDraggingRef.current = true;
        
        const obj = transformControls.object;
        if (obj) {
          const endState = {
            position: [obj.position.x, obj.position.y, obj.position.z],
            rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            scale: [obj.scale.x, obj.scale.y, obj.scale.z],
          };
          
          const startState = {
            position: [transformStartState.position.x, transformStartState.position.y, transformStartState.position.z],
            rotation: [transformStartState.rotation.x, transformStartState.rotation.y, transformStartState.rotation.z],
            scale: [transformStartState.scale.x, transformStartState.scale.y, transformStartState.scale.z],
          };
          
          // 记录到历史 - 根据实际变化确定操作类型
          const hasMoved = startState.position[0] !== endState.position[0] || 
                          startState.position[1] !== endState.position[1] || 
                          startState.position[2] !== endState.position[2];
          const hasRotated = startState.rotation[0] !== endState.rotation[0] || 
                            startState.rotation[1] !== endState.rotation[1] || 
                            startState.rotation[2] !== endState.rotation[2];
          const hasScaled = startState.scale[0] !== endState.scale[0] || 
                           startState.scale[1] !== endState.scale[1] || 
                           startState.scale[2] !== endState.scale[2];
          
          if (hasMoved || hasRotated || hasScaled) {
            const actionType = hasMoved ? 'move' : (hasRotated ? 'rotate' : 'scale');

            const before = {
              objectId: transformObjectId,
              position: startState.position as [number, number, number],
              rotation: startState.rotation as [number, number, number],
              scale: startState.scale as [number, number, number],
            };
            const after = {
              objectId: transformObjectId,
              position: endState.position as [number, number, number],
              rotation: endState.rotation as [number, number, number],
              scale: endState.scale as [number, number, number],
            };

            useSceneStore.getState().updateObject(transformObjectId, {
              position: after.position,
              rotation: after.rotation,
              scale: after.scale,
            });

            if (hasScaled) {
              syncLabelObjectScaleVisual(obj);
            }

            useHistoryStore.getState().push({
              type: actionType,
              description: `${actionType} object`,
              before,
              after,
              objectId: transformObjectId,
            });
          }
        }
        
        // 100ms后重置标志,让后续点击正常工作
        setTimeout(() => {
          gizmoWasDraggingRef.current = false;
        }, 100);
        
        // 清空临时状态
        transformStartState = null;
        transformObjectId = null;
      }
    });
    
    // Three.js 0.185: 必须将 getHelper() 返回的 Object3D 添加到 scene 才能渲染 Gizmo
    const gizmoHelper = transformControls.getHelper();
    scene.add(gizmoHelper);
    
    transformControlsRef.current = transformControls;
    
    // 将TransformControls暴露到全局,供键盘快捷键使用
    (window as any).__editorTransformControls = transformControls;
    gizmoHelperRef.current = gizmoHelper; // 保存gizmoHelper引用用于点击检测
    
    // 高亮管理 - 用于导入模型的选中效果(已禁用)
    const highlightedMaterials = new Map<THREE.Material, {emissive: THREE.Color, emissiveIntensity: number}>();
    
    // 应用高亮效果 - 已禁用,不再使用选中色
    (window as any).__applyHighlight = function(group: THREE.Group) {
      // 不做任何操作,已禁用高亮
    };
    
    // 清除高亮效果 - 恢复原始材质状态(支持Group和单个Mesh)
    (window as any).__clearHighlight = function() {
      // 清除Group的高亮
      highlightedMaterials.forEach((original, material) => {
        const mat = material as any;
        if (mat.emissive) {
          mat.emissive.copy(original.emissive);
          mat.emissiveIntensity = original.emissiveIntensity;
          mat.needsUpdate = true;
        }
      });
      highlightedMaterials.clear();
      
      // 清除单个Mesh的高亮
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as any;
          if (mat && !Array.isArray(mat) && mat._originalHighlight) {
            mat.emissive.copy(mat._originalHighlight.emissive);
            mat.emissiveIntensity = mat._originalHighlight.intensity;
            mat.needsUpdate = true;
            delete mat._originalHighlight;
          }
        }
      });
    };

    // 设置默认工具
    transformControls.setMode('translate');

    // 注册示例立方体到store (已删除)
    // registerThreeObject('cube_default', cube);

    // 点击事件处理 (对象选择)
    const handleClick = (event: MouseEvent) => {
      // 联动预览：禁止选中模型/标签，仅允许 UI / 标签内交互
      if (useEditorStore.getState().editorMode === 'preview') return;

      const renderer = rendererRef.current;
      const cameraObj = cameraRef.current;
      const scene = sceneRef.current;
      const transformControls = transformControlsRef.current;
      if (!renderer || !cameraObj || !scene || !transformControls) return;

      const dragDx = event.clientX - pointerDownRef.current.x;
      const dragDy = event.clientY - pointerDownRef.current.y;
      if (Math.sqrt(dragDx * dragDx + dragDy * dragDy) > CLICK_DRAG_THRESHOLD_PX) return;

      if (transformControls.dragging || gizmoWasDraggingRef.current) return;

      // 优先：按标签 HTML 屏幕矩形命中（CSS3D / 大 UI 页不依赖小拾取球）
      const labelHitId = hitTestLabelAtClientPoint(event.clientX, event.clientY);
      if (labelHitId) {
        const anchor = useSceneStore.getState().getThreeObject(labelHitId);
        if (anchor) {
          useLightStore.getState().selectLight(null);
          useSceneStore.getState().selectObject(labelHitId);
          transformControls.attach(anchor);
          return;
        }
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraObj);
      
      // 获取场景中所有可点击的网格对象 (排除Gizmo、网格、坐标轴)
      const clickableObjects: THREE.Object3D[] = [];
      const gizmoHelper = gizmoHelperRef.current;
      
      scene.traverse((child) => {
        if (child.name === 'grid' || child.name === 'axes') return;

        const isLightPick = child.userData?.isLightPickProxy === true;
        const isLightHelper = child.name.startsWith('helper_');
        const isHelperLine =
          (child instanceof THREE.Line || child instanceof THREE.LineSegments) &&
          child.parent?.name?.startsWith('helper_');
        const isSceneObject =
          (child instanceof THREE.Mesh || child instanceof THREE.Group) &&
          !(child instanceof THREE.Light);

        if (isLightPick || isLightHelper || isHelperLine) {
          clickableObjects.push(child);
          return;
        }

        if (isSceneObject) {
          let isGizmo = false;
          if (gizmoHelper) {
            let current: THREE.Object3D | null = child;
            while (current) {
              if (current === gizmoHelper) {
                isGizmo = true;
                break;
              }
              current = current.parent;
            }
          }

          if (!isGizmo) {
            clickableObjects.push(child);
          }
        }
      });

      const intersects = raycasterRef.current.intersectObjects(clickableObjects, true);

      if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        const lightId = resolveLightIdFromPick(hitObject);

        if (lightId) {
          const light = lightsRef.current.get(lightId);
          if (light && isTransformableLight(light)) {
            useSceneStore.getState().deselectAll();
            useLightStore.getState().selectLight(lightId);
            transformControls.attach(getLightTransformAttachObject(light));
            transformControls.setMode('translate');
            return;
          }
        }

        const labelId = resolveLabelIdFromIntersect(hitObject);
        if (labelId) {
          const anchor = useSceneStore.getState().getThreeObject(labelId);
          if (anchor) {
            useLightStore.getState().selectLight(null);
            useSceneStore.getState().selectObject(labelId);
            transformControls.attach(anchor);
            return;
          }
        }

        let selectedObject = hitObject;
        
        while (selectedObject.parent && 
               !(selectedObject instanceof THREE.Mesh) && 
               !(selectedObject instanceof THREE.Group)) {
          selectedObject = selectedObject.parent;
        }
        
        selectedObject.visible = true;
        transformControls.attach(selectedObject);

        const businessId = resolveBusinessId(selectedObject);
        useLightStore.getState().selectLight(null);
        useSceneStore.getState().selectObject(businessId);
      } else {
        const { selectedIds: currentSelectedIds, deselectAll: clearSelection } = useSceneStore.getState();
        const currentSelectedLightId = useLightStore.getState().selectedLightId;

        if (currentSelectedIds.length > 0 || currentSelectedLightId) {
          transformControls.detach();
          if ((window as any).__clearHighlight) {
            (window as any).__clearHighlight();
          }
          clearSelection();
          useLightStore.getState().selectLight(null);
        }
      }
    };

    renderer.domElement.addEventListener('click', handleClick);

    // 拖拽导入处理
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        await handleFileImportRef.current(files, scene);
      }
    };

    renderer.domElement.addEventListener('dragover', handleDragOver);
    renderer.domElement.addEventListener('drop', handleDrop);
    
    // 将事件处理函数暴露到全局,供recreateRenderer使用
    (window as any).__editorClickHandler = handleClick;
    (window as any).__editorDragOverHandler = handleDragOver;
    (window as any).__editorDropHandler = handleDrop;

    }, []);

  // 应用后期处理效果
  const applyPostProcessEffect = useCallback((effectName: string, config: any) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    
    // 销毁旧的composer
    if (composerRef.current) {
      composerRef.current.dispose();
      composerRef.current = null;
      currentPassRef.current = null;
    }
    
    // 如果选择"无"效果,不创建composer
    if (effectName === 'none') {
      composerRef.current = null;
      return;
    }
    
    // 创建EffectComposer
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;
    
    // 添加RenderPass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    let pass: any = null;

    // 根据效果名称创建对应的Pass
    switch (effectName) {
      case 'bloom':
        pass = new UnrealBloomPass(
          new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
          config.bloom.intensity || 1.0,
          config.bloom.radius || 0.4,
          config.bloom.threshold || 0.85
        );
        break;

      case 'fxaa':
        pass = new ShaderPass(FXAAShader);
        pass.uniforms['resolution'].value.set(
          1 / (renderer.domElement.width * renderer.getPixelRatio()),
          1 / (renderer.domElement.height * renderer.getPixelRatio())
        );
        break;

      case 'sobel':
        pass = new ShaderPass(SobelOperatorShader);
        pass.uniforms['resolution'].value.set(
          renderer.domElement.width,
          renderer.domElement.height
        );
        break;

      case 'chromatic':
        pass = new ShaderPass(chromaticAberrationShader);
        if (config.chromatic) {
          pass.uniforms['amount'].value = config.chromatic.amount || 0.002;
        }
        break;

      case 'pixelate':
        pass = new ShaderPass({
          ...pixelationShader,
          uniforms: {
            ...pixelationShader.uniforms,
            pixelSize: { value: config.pixelate.size || 2.0 },
            resolution: { value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height) },
          },
        });
        break;

      case 'vignette':
        const vignetteShader = {
          uniforms: {
            tDiffuse: { value: null },
            darkness: { value: config.vignette?.darkness || 0.5 },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float darkness;
            varying vec2 vUv;
            void main() {
              vec4 texel = texture2D(tDiffuse, vUv);
              vec2 uv = (vUv - vec2(0.5)) * vec2(darkness);
              float vig = 1.0 - dot(uv, uv);
              gl_FragColor = vec4(texel.rgb * vig, texel.a);
            }
          `,
        };
        pass = new ShaderPass(vignetteShader);
        break;

      case 'film':
        pass = new FilmPass(
          config.film?.intensity ?? 0.25,
          config.film?.grayscale ?? false
        );
        break;

      case 'glitch':
        pass = new GlitchPass(config.glitch?.dtSize ?? 64);
        pass.goWild = config.glitch?.goWild ?? false;
        break;

      case 'outline':
        pass = new OutlinePass(
          new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
          scene,
          camera,
          collectOutlineTargets(scene)
        );
        if (config.outline) {
          pass.edgeStrength = config.outline.edgeStrength ?? 3.0;
          pass.edgeGlow = config.outline.edgeGlow ?? 0.5;
          pass.edgeThickness = config.outline.edgeThickness ?? 1.0;
          pass.pulsePeriod = config.outline.pulsePeriod ?? 0;
          pass.visibleEdgeColor.set(0x00aaff);
          pass.hiddenEdgeColor.set(0x190a05);
        }
        break;

      case 'bokeh':
        pass = new BokehPass(scene, camera, {
          focus: config.bokeh?.focus ?? 1.0,
          aperture: config.bokeh?.aperture ?? 0.0001,
          maxblur: config.bokeh?.maxblur ?? 0.01,
        });
        break;

      case 'afterimage':
        pass = new AfterimagePass(config.afterimage?.damp ?? 0.88);
        break;

      case 'halftone':
        pass = new HalftonePass({
          radius: config.halftone?.radius ?? 4,
          rotateR: -15 * Math.PI / 180,
          rotateG: 45 * Math.PI / 180,
          rotateB: 30 * Math.PI / 180,
          scatter: config.halftone?.scatter ?? 0.2,
          blending: config.halftone?.blending ?? 1,
          shape: 1,
        });
        break;

      case 'dotscreen':
        pass = new DotScreenPass(
          new THREE.Vector2(0, 0),
          config.dotscreen?.angle ?? 0.785,
          config.dotscreen?.scale ?? 0.8
        );
        break;

      case 'sao':
        pass = new SAOPass(
          scene,
          camera,
          new THREE.Vector2(renderer.domElement.width, renderer.domElement.height)
        );
        if (config.sao) {
          pass.params.saoBias = config.sao.bias || 0.5;
          pass.params.saoIntensity = config.sao.intensity || 0.000005;
          pass.params.saoScale = config.sao.scale || 10;
          pass.params.saoKernelRadius = config.sao.kernelRadius || 40;
          pass.params.saoMinResolution = config.sao.minResolution || 0;
        }
        break;

      case 'ssao':
        pass = new SSAOPass(scene, camera, renderer.domElement.width, renderer.domElement.height);
        if (config.ssao) {
          pass.kernelRadius = config.ssao.kernelRadius || 8;
          pass.minDistance = config.ssao.minDistance || 0.005;
          pass.maxDistance = config.ssao.maxDistance || 0.1;
        }
        break;

      case 'pixelated':
        pass = new RenderPixelatedPass(
          config.pixelated?.size ?? 6,
          scene,
          camera
        );
        break;

      case 'none':
      default:
        composerRef.current = null;
        return;
    }
    
    if (pass) {
      composer.addPass(pass);
      currentPassRef.current = pass;
      
      // 添加OutputPass(色调映射和sRGB转换)
      const outputPass = new OutputPass();
      composer.addPass(outputPass);
    }
  }, []);

  // 渲染循环 - 添加对后期处理状态变化的监控(使用useRef避免依赖变化导致重建)
  const postProcessEnabledRef = useRef<boolean>(false);
  const postProcessEffectRef = useRef<string>('none');
  const postProcessGlitchDtRef = useRef<number>(64);
  
  const animate = useCallback(() => {
    if (!renderLoopActiveRef.current) return;
    animationFrameRef.current = requestAnimationFrame(animate);
    
    timerRef.current.update();
    const delta = timerRef.current.getDelta();

    const tourActive = tickEditorCameraTour(delta);
    const flyActive = tickEditorCameraFly(delta);
    if (controlsRef.current && !tourActive && !flyActive) {
      controlsRef.current.update();
    }
    
    // TransformControls 在 r184 中由渲染循环自动更新，无需手动调用 update
    
    // 更新灯光Helper
    lightHelpersRef.current.forEach((helper) => {
      if (helper.update) {
        helper.update();
      }
    });
    
    // 贴图 UV 偏移动画
    if (sceneRef.current) {
      tickTextureUvAnimations(
        sceneRef.current,
        delta,
        useSceneStore.getState().getThreeObject
      );
      tickParticleSystems(delta);
    }

    // 检查后期处理配置变化(从全局读取)
    const postConfig = (window as any).__postProcessConfig;
    if (postConfig && postConfig.enabled) {
      const glitchDt = postConfig.glitch?.dtSize ?? 64;
      const needUpdate =
        postConfig.effect !== postProcessEffectRef.current ||
        !composerRef.current ||
        (postConfig.effect === 'glitch' && glitchDt !== postProcessGlitchDtRef.current);
      
      if (needUpdate && postConfig.effect !== 'none') {
        applyPostProcessEffect(postConfig.effect, postConfig);
        postProcessEffectRef.current = postConfig.effect;
        postProcessGlitchDtRef.current = glitchDt;
        postProcessEnabledRef.current = true;
      }
      
      if (composerRef.current && currentPassRef.current && rendererRef.current) {
        updatePassParams(currentPassRef.current, postConfig, rendererRef.current);
      }
      
      // 使用composer渲染
      if (composerRef.current) {
        composerRef.current.render();
      }
    } else {
      // 未启用后期处理,使用普通renderer
      if (postProcessEnabledRef.current || composerRef.current) {
        if (composerRef.current) {
          composerRef.current.dispose();
        }
        composerRef.current = null;
        currentPassRef.current = null;
        postProcessEnabledRef.current = false;
        postProcessEffectRef.current = 'none';
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }

    if (sceneRef.current && cameraRef.current) {
      css3dRendererRef.current?.render(sceneRef.current, cameraRef.current);
      css2dRendererRef.current?.render(sceneRef.current, cameraRef.current);
    }
  }, [applyPostProcessEffect]);

  const lastViewportSizeRef = useRef({ w: 0, h: 0 });

  // 窗口大小调整（尺寸未变则跳过，避免 ResizeObserver ↔ setSize 死循环卡死）
  const handleResize = useCallback(() => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (width < 2 || height < 2) return;
    if (width === lastViewportSizeRef.current.w && height === lastViewportSizeRef.current.h) {
      return;
    }
    lastViewportSizeRef.current = { w: width, h: height };

    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
    css2dRendererRef.current?.setSize(width, height);
    css3dRendererRef.current?.setSize(width, height);

    if (composerRef.current) {
      composerRef.current.setSize(width, height);
    }
  }, []);

  // 从 UI 编排切回场景/预览时，display:none → 可见后需强制重算尺寸，否则画布塌成纯色
  useEffect(() => {
    if (editorMode !== 'scene' && editorMode !== 'preview') return;
    // 允许重算：清掉缓存尺寸
    lastViewportSizeRef.current = { w: 0, h: 0 };
    const kick = () => handleResize();
    kick();
    const t1 = window.setTimeout(kick, 50);
    const t2 = window.setTimeout(kick, 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [editorMode, handleResize]);

  // 视口尺寸变化（侧栏显隐等）：防抖，避免预览切换布局时风暴
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handleResize(), 32);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [handleResize]);

  // 初始化与渲染循环（仅挂载一次，避免重复创建 WebGL 上下文）
  useEffect(() => {
    timerRef.current.connect(document);
    initScene();
    renderLoopActiveRef.current = true;
    animate();
    window.addEventListener('resize', handleResize);

    return () => {
      renderLoopActiveRef.current = false;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      timerRef.current.disconnect();

      lightHelpersRef.current.forEach((helper) => disposeLightHelper(helper));
      lightHelpersRef.current.clear();
      lightsRef.current.clear();

      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
        transformControlsRef.current.disconnect();
        transformControlsRef.current.dispose();
        transformControlsRef.current = null;
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
        currentPassRef.current = null;
      }

      const scene = sceneRef.current;
      sceneRef.current = null;

      if (scene) {
        const lightsInScene: THREE.Light[] = [];
        scene.traverse((child) => {
          if (child instanceof THREE.Light) {
            lightsInScene.push(child);
          }
        });
        lightsInScene.forEach((light) => removeLightTargetFromScene(scene, light));

        const children = [...scene.children];
        children.forEach((child) => {
          disposeObject3DResources(child);
          scene.remove(child);
        });
      }

      delete (window as any).__editorScene;
      delete (window as any).__editorRenderer;
      delete (window as any).__editorCamera;
      delete (window as any).__editorControls;
      delete (window as any).__editorTransformControls;
      delete (window as any).__sceneInitialized;
      disposeAllParticleSystems();
      initializedRef.current = false;

      if (rendererRef.current) {
        if (containerRef.current?.contains(rendererRef.current.domElement)) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
        rendererRef.current = null;
      }

      const removeCssDom = (el: HTMLElement | null | undefined) => {
        if (el && containerRef.current?.contains(el)) {
          containerRef.current.removeChild(el);
        }
      };
      removeCssDom(css2dRendererRef.current?.domElement);
      removeCssDom(css3dRendererRef.current?.domElement);
      css2dRendererRef.current = null;
      css3dRendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 视口生命周期内只初始化一次
  }, []);

  // 控制网格、坐标轴、灯光 Helper、变换 Gizmo（联动预览中全部隐藏）
  useEffect(() => {
    if (!sceneRef.current) return;
    const isPreview = editorMode === 'preview';

    const grid = sceneRef.current.getObjectByName('grid');
    const axes = sceneRef.current.getObjectByName('axes');
    if (grid) grid.visible = !isPreview && gridVisible;
    if (axes) axes.visible = !isPreview && axesVisible;

    sceneRef.current.traverse((child) => {
      if (child.name === 'grid' || child.name === 'axes') return;
      const isHelper =
        child.name.startsWith('helper_') || child.userData?.isEditorHelper === true;
      if (isHelper) {
        child.visible = !isPreview;
      }
    });

    const tc = transformControlsRef.current;
    if (tc) {
      tc.visible = !isPreview;
      tc.enabled = !isPreview;
      if (isPreview) {
        tc.detach();
        useSceneStore.getState().deselectAll();
        useLightStore.getState().selectLight(null);
      }
    }

    // 预览：标签内 UI 可点击；编辑：全部穿透到画布
    css2dRendererRef.current?.domElement.classList.toggle('is-preview-interactive', isPreview);
    css3dRendererRef.current?.domElement.classList.toggle('is-preview-interactive', isPreview);

    if (isPreview) {
      // 重新绑定标签内交互（UI 编排改完动作后进入预览即生效）
      const { objects, getThreeObject } = useSceneStore.getState();
      objects.forEach((obj) => {
        if (obj.type !== 'label' || !obj.label?.uiPageId) return;
        const anchor = getThreeObject(obj.id);
        if (!anchor) return;
        anchor.traverse((child) => {
          if (!child.userData?.isLabelCssObject && child.name !== 'label_css_object') return;
          const el =
            (child as { element?: HTMLElement }).element ||
            null;
          if (!el) return;
          const root = el.querySelector('.scene-label-ui-root') as HTMLElement | null;
          if (root && obj.label?.uiPageId) {
            bindLabelUiInteractions(root, obj.label.uiPageId);
          }
        });
      });
    }
  }, [gridVisible, axesVisible, editorMode]);

  // 更新TransformControls工具模式
  useEffect(() => {
    if (!transformControlsRef.current) return;

    const { selectedLightId: activeLightId } = useLightStore.getState();
    if (activeLightId && selectedIds.length === 0) {
      transformControlsRef.current.setMode('translate');
      return;
    }

    const modeMap: Record<string, 'translate' | 'rotate' | 'scale'> = {
      select: 'translate',
      move: 'translate',
      rotate: 'rotate',
      scale: 'scale',
    };

    transformControlsRef.current.setMode(modeMap[currentTool]);
  }, [currentTool, selectedIds]);

  // 监听TransformControls变化,更新属性面板
  useEffect(() => {
    const transformControls = transformControlsRef.current;
    if (!transformControls) return;

    const onChange = () => {
      const object = transformControls.object;
      if (!object) return;

      const { selectedIds: currentSelectedIds, updateObject: syncObject } = useSceneStore.getState();
      const { selectedLightId: currentLightId, updateLight: syncLight } = useLightStore.getState();

      if (currentLightId && currentSelectedIds.length === 0) {
        const light = lightsRef.current.get(currentLightId);
        if (!light) return;

        if (
          (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) &&
          object === light.target
        ) {
          syncLight(currentLightId, {
            target: [object.position.x, object.position.y, object.position.z],
          });
        } else {
          syncLight(currentLightId, {
            position: [object.position.x, object.position.y, object.position.z],
          });
        }

        const helper = lightHelpersRef.current.get(currentLightId);
        if (helper?.update) helper.update();
        return;
      }

      if (currentSelectedIds.length > 0) {
        syncObject(currentSelectedIds[0], {
          position: [object.position.x, object.position.y, object.position.z],
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
        });
      }
    };

    transformControls.addEventListener('change', onChange);

    return () => {
      transformControls.removeEventListener('change', onChange);
    };
  }, [selectedIds, updateObject, updateLight]);

  // 选中灯光时附加变换控制器
  useEffect(() => {
    const transformControls = transformControlsRef.current;
    if (!transformControls) return;

    if (selectedLightId && selectedIds.length === 0) {
      const light = lightsRef.current.get(selectedLightId);
      if (light && isTransformableLight(light)) {
        transformControls.attach(getLightTransformAttachObject(light));
        transformControls.setMode('translate');
      } else {
        transformControls.detach();
      }
    }
  }, [selectedLightId, selectedIds, lights]);

  // 灯光同步 - 根据lightStore创建/更新Three.js灯光
  useEffect(() => {
    if (!sceneRef.current) return;

    // 移除不在lightStore中的灯光
    lightsRef.current.forEach((light, id) => {
      if (!lights.find(l => l.id === id)) {
        removeLightTargetFromScene(sceneRef.current!, light);
        sceneRef.current!.remove(light);
        lightsRef.current.delete(id);
      }
    });

    // 创建或更新灯光
    lights.forEach((lightConfig) => {
      let light = lightsRef.current.get(lightConfig.id);

      // 如果灯光不存在,创建新灯光
      if (!light) {
        switch (lightConfig.type) {
          case 'ambient':
            light = new THREE.AmbientLight(
              new THREE.Color(lightConfig.color),
              lightConfig.intensity
            );
            break;

          case 'directional': {
            const dirLight = new THREE.DirectionalLight(
              new THREE.Color(lightConfig.color),
              lightConfig.intensity
            );
            if (lightConfig.position) {
              dirLight.position.set(...lightConfig.position);
            }
            applyDirectionalShadowSettings(dirLight, lightConfig);
            applyLightTargetFromConfig(dirLight, lightConfig.target);
            light = dirLight;
            break;
          }

          case 'point':
            light = new THREE.PointLight(
              new THREE.Color(lightConfig.color),
              lightConfig.intensity,
              lightConfig.distance || 10
            );
            if (lightConfig.position) {
              light.position.set(...lightConfig.position);
            }
            if (lightConfig.castShadow) {
              (light as THREE.PointLight).castShadow = true;
            }
            break;

          case 'spot':
            light = new THREE.SpotLight(
              new THREE.Color(lightConfig.color),
              lightConfig.intensity,
              lightConfig.distance || 10,
              lightConfig.angle || 0.5,
              lightConfig.penumbra || 0.5
            );
            if (lightConfig.position) {
              light.position.set(...lightConfig.position);
            }
            if (lightConfig.castShadow) {
              (light as THREE.SpotLight).castShadow = true;
            }
            applyLightTargetFromConfig(light as THREE.SpotLight, lightConfig.target);
            break;

          case 'hemisphere':
            light = new THREE.HemisphereLight(
              new THREE.Color(lightConfig.color),
              new THREE.Color(lightConfig.groundColor || '#444444'),
              lightConfig.intensity
            );
            if (lightConfig.position) {
              light.position.set(...lightConfig.position);
            }
            break;
        }

        if (light) {
          light.name = lightConfig.name;
          light.userData.id = lightConfig.id;
          light.visible = lightConfig.enabled !== false;
          ensureLightPickProxy(light, lightConfig.id);
          sceneRef.current!.add(light);
          addLightTargetToScene(sceneRef.current!, light);
          lightsRef.current.set(lightConfig.id, light);
        }
      } else {
        // 更新现有灯光
        if (light instanceof THREE.HemisphereLight) {
          light.color.set(lightConfig.color);
          light.groundColor.set(lightConfig.groundColor || '#444444');
        } else {
          light.color.set(lightConfig.color);
        }
        light.intensity = lightConfig.intensity;
        light.visible = lightConfig.enabled !== false;
        ensureLightPickProxy(light, lightConfig.id);

        if (light instanceof THREE.DirectionalLight) {
          applyDirectionalShadowSettings(light, lightConfig);
        }

        if (!isLightTransformDraggingRef.current) {
          if (lightConfig.position && !(light instanceof THREE.AmbientLight)) {
            light.position.set(...lightConfig.position);
          }
          applyLightTargetFromConfig(light, lightConfig.target);
        }

        addLightTargetToScene(sceneRef.current!, light);
      }
    });
  }, [lights]);

  // 灯光 Helper — 仅选中灯光时显示（环境光无 Helper）
  useEffect(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    lightHelpersRef.current.forEach((helper) => {
      scene.remove(helper);
      disposeLightHelper(helper);
    });
    lightHelpersRef.current.clear();

    if (!selectedLightId || selectedIds.length > 0) return;

    const lightConfig = lights.find((l) => l.id === selectedLightId);
    if (!lightConfig || lightConfig.type === 'ambient') return;

    const light = lightsRef.current.get(selectedLightId);
    if (!light) return;

    const helper = createLightHelper(light);
    if (!helper) return;

    helper.name = `helper_${selectedLightId}`;
    scene.add(helper);
    lightHelpersRef.current.set(selectedLightId, helper);
    (helper as unknown as { update?: () => void }).update?.();
  }, [lights, selectedLightId, selectedIds]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ position: 'relative' }}
    />
  );
}
