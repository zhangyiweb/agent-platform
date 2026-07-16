import { useState, useEffect, useRef, useCallback } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useEditorStore } from '@/store/editorStore';
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Switch, Typography } from 'antd';
import { useEditorNotify } from '@/hooks/useEditorNotify';
import { EnvironmentHdriSection } from './EnvironmentHdriSection';
import { CameraTourPanel } from './CameraTourPanel';
import { PostProcessSettings } from './PostProcessSettings';
import {
  fetchHdriUrl,
  downloadHdrFromSource,
  DEFAULT_RESOLUTION,
  type HdriAsset,
  type HdrResolution,
  type HdrDownloadSource,
} from '@/utils/polyhaven';
import { applyHdrRotationY } from '@/utils/hdrRotation';
import { EDITOR_PROJECT_RESTORE_EVENT } from '@/utils/editorProjectImporter';

export function GlobalSettings() {
  const notify = useEditorNotify();
  const { backgroundColor, updateCamera } = useSceneStore();
  const { gridVisible, axesVisible, toggleGrid, toggleAxes } = useEditorStore();
  const [activeTab, setActiveTab] = useState<'scene' | 'environment' | 'render' | 'postprocess' | 'tour'>('scene');
  
  // 从全局配置恢复状态(防止组件重挂载时重置)
  const savedConfig = (window as any).__globalSettingsState;
  
  const [bgColor, setBgColor] = useState(savedConfig?.bgColor || backgroundColor); // 从store同步初始值
  const [fogEnabled, setFogEnabled] = useState(savedConfig?.fogEnabled ?? false);
  const [fogColor, setFogColor] = useState(savedConfig?.fogColor || '#ffffff');
  const [fogNear, setFogNear] = useState(savedConfig?.fogNear ?? 1);
  const [fogFar, setFogFar] = useState(savedConfig?.fogFar ?? 100);
  const [pixelRatio, setPixelRatio] = useState(savedConfig?.pixelRatio || '2');
  const [toneMapping, setToneMapping] = useState(savedConfig?.toneMapping || 'aces');
  const [exposure, setExposure] = useState(savedConfig?.exposure ?? 0.4);
  const [envMapIntensity, setEnvMapIntensity] = useState(savedConfig?.envMapIntensity ?? 1.0);
  const [hdrRotationY, setHdrRotationY] = useState(savedConfig?.hdrRotationY ?? 0);
  const [correctLights, setCorrectLights] = useState(savedConfig?.correctLights ?? false);
  const [cameraPosition, setCameraPosition] = useState(savedConfig?.cameraPosition || { x: 10, y: 10, z: 10 });
  const [controlsTarget, setControlsTarget] = useState(savedConfig?.controlsTarget || { x: 0, y: 0, z: 0 });
  const [cameraFov, setCameraFov] = useState(savedConfig?.cameraFov ?? 45);
  const [cameraNear, setCameraNear] = useState(savedConfig?.cameraNear ?? 0.1);
  const [cameraFar, setCameraFar] = useState(savedConfig?.cameraFar ?? 5000);
  const [antialias, setAntialias] = useState(savedConfig?.antialias ?? true);
  const [alpha, setAlpha] = useState(savedConfig?.alpha ?? true);
  const [logarithmicDepthBuffer, setLogarithmicDepthBuffer] = useState(savedConfig?.logarithmicDepthBuffer ?? true);
  const rendererRef = useRef<{antialias: boolean, alpha: boolean, logarithmicDepthBuffer: boolean} | null>(null);
  
  // HDR状态跟踪
  const [hasHDRBackground, setHasHDRBackground] = useState(savedConfig?.hasHDRBackground ?? false);
  const [hasHDREnvironment, setHasHDREnvironment] = useState(savedConfig?.hasHDREnvironment ?? false);
  const [hdrBgName, setHdrBgName] = useState<string>(savedConfig?.hdrBgName || '');
  const [hdrEnvName, setHdrEnvName] = useState<string>(savedConfig?.hdrEnvName || '');
  const hasHDRBackgroundRef = useRef(savedConfig?.hasHDRBackground ?? false);
  const bgHdriEnabledRef = useRef(savedConfig?.bgHdriEnabled ?? false);
  const envHdriEnabledRef = useRef(savedConfig?.envHdriEnabled ?? false);

  // Poly Haven HDRI
  const [bgHdriEnabled, setBgHdriEnabled] = useState(savedConfig?.bgHdriEnabled ?? false);
  const [envHdriEnabled, setEnvHdriEnabled] = useState(savedConfig?.envHdriEnabled ?? false);
  const [selectedHdriId, setSelectedHdriId] = useState<string | null>(savedConfig?.selectedHdriId ?? null);
  const [hdriResolution, setHdriResolution] = useState<HdrResolution>(savedConfig?.hdriResolution ?? DEFAULT_RESOLUTION);
  const [loadingHdriId, setLoadingHdriId] = useState<string | null>(null);
  const [hdriReady, setHdriReady] = useState(savedConfig?.hdriReady ?? false);
  const [downloadingHdr, setDownloadingHdr] = useState(false);
  const hdrTextureCache = useRef<THREE.Texture | null>(null);
  const hdrDownloadSourceRef = useRef<HdrDownloadSource | null>(null);

  useEffect(() => { bgHdriEnabledRef.current = bgHdriEnabled; }, [bgHdriEnabled]);
  useEffect(() => { envHdriEnabledRef.current = envHdriEnabled; }, [envHdriEnabled]);
  
  const isProgrammaticChange = useRef(false);
  const isUserInputChange = useRef(false);
  const isCameraInputEditingRef = useRef(false);
  
  // 同步场景中已有的 HDR 状态（仅当用户手动添加过 HDRI 时）
  useEffect(() => {
    let retryCount = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const syncHdrState = () => {
      const scene = (window as any).__editorScene as THREE.Scene | undefined;
      if (!scene) {
        if (retryCount++ < 50) {
          timer = setTimeout(syncHdrState, 100);
        }
        return;
      }

      if (scene.background && (scene.background as THREE.Texture).isTexture) {
        setHasHDRBackground(true);
        hasHDRBackgroundRef.current = true;
        hdrTextureCache.current = scene.background as THREE.Texture;
        setHdriReady(true);
      }

      if (scene.environment) {
        setHasHDREnvironment(true);
        if (!hdrTextureCache.current) {
          hdrTextureCache.current = scene.environment;
        }
        scene.environmentIntensity = envMapIntensity;
        setHdriReady(true);
      }
    };

    timer = setTimeout(syncHdrState, 100);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [envMapIntensity]);

  // 同步背景颜色到场景(只在用户主动修改bgColor时生效)
  // 重要:不要在组件挂载时自动设置,会覆盖HDR!
  const bgColorRef = useRef(bgColor); // 追踪上次设置的背景色
  
  useEffect(() => {
    // 如果颜色没变化,不要执行
    if (bgColor === bgColorRef.current) {
      return;
    }
    
    const scene = (window as any).__editorScene;
    if (!scene) return;
    
    // 使用ref检查,避免React异步更新问题
    if (hasHDRBackgroundRef.current) {
      // HDR背景存在,绝对不要覆盖!
      return;
    }
    
    // 只在纯色模式下更新背景色
    scene.background = new THREE.Color(bgColor);
    bgColorRef.current = bgColor; // 更新ref
  }, [bgColor]);

  // 实时同步视口相机 / 控制点（「场景」Tab 显示这些字段时轮询）
  useEffect(() => {
    if (activeTab !== 'scene') return;

    let rafId = 0;

    const round2 = (n: number) => parseFloat(n.toFixed(2));

    const syncFromViewport = () => {
      if (!isProgrammaticChange.current && !isUserInputChange.current && !isCameraInputEditingRef.current) {
        const camera = (window as any).__editorCamera as THREE.PerspectiveCamera | undefined;
        const controls = (window as any).__editorControls as { target: THREE.Vector3 } | undefined;

        if (camera) {
          const nextPos = {
            x: round2(camera.position.x),
            y: round2(camera.position.y),
            z: round2(camera.position.z),
          };
          setCameraPosition((prev: { x: number; y: number; z: number }) =>
            prev.x === nextPos.x && prev.y === nextPos.y && prev.z === nextPos.z ? prev : nextPos
          );
        }

        if (controls) {
          const nextTarget = {
            x: round2(controls.target.x),
            y: round2(controls.target.y),
            z: round2(controls.target.z),
          };
          setControlsTarget((prev: { x: number; y: number; z: number }) =>
            prev.x === nextTarget.x && prev.y === nextTarget.y && prev.z === nextTarget.z ? prev : nextTarget
          );
        }
      }

      rafId = requestAnimationFrame(syncFromViewport);
    };

    rafId = requestAnimationFrame(syncFromViewport);

    return () => cancelAnimationFrame(rafId);
  }, [activeTab]);

  // 同步雾效到场景
  useEffect(() => {
    const scene = (window as any).__editorScene;
    if (scene) {
      if (fogEnabled) {
        scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
      } else {
        scene.fog = null;
      }
    }
  }, [fogEnabled, fogColor, fogNear, fogFar]);

  // 同步相机位置到Three.js相机 - 只在用户手动输入时同步,避免监听器更新导致相机跳动
  useEffect(() => {
    // 只有用户手动修改输入框时才同步到相机,监听器自动更新不同步
    if (!isUserInputChange.current) {
      return;
    }
    
    const camera = (window as any).__editorCamera;
    if (camera) {
      // 标记为程序化更改,避免触发监听器导致无限循环
      isProgrammaticChange.current = true;
      
      camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
      
      const controls = (window as any).__editorControls;
      if (controls) controls.update();
      
      // 下一帧重置标志位,允许用户手动操作相机时更新UI
      requestAnimationFrame(() => {
        isProgrammaticChange.current = false;
        isUserInputChange.current = false; // 重置用户输入标志
      });
    }
  }, [cameraPosition]);

  // 同步控制点位置到 OrbitControls — 仅用户手动输入时
  useEffect(() => {
    if (!isUserInputChange.current) return;

    const controls = (window as any).__editorControls as { target: THREE.Vector3; update: () => void } | undefined;
    if (controls) {
      isProgrammaticChange.current = true;
      controls.target.set(controlsTarget.x, controlsTarget.y, controlsTarget.z);
      controls.update();

      requestAnimationFrame(() => {
        isProgrammaticChange.current = false;
        isUserInputChange.current = false;
      });
    }
  }, [controlsTarget]);

  // 同步相机其他参数(FOV, Near, Far)
  useEffect(() => {
    const camera = (window as any).__editorCamera;
    if (camera) {
      camera.fov = cameraFov;
      camera.near = cameraNear;
      camera.far = cameraFar;
      camera.updateProjectionMatrix(); // 必须调用此方法使参数生效
    }
  }, [cameraFov, cameraNear, cameraFar]);

  // 同步渲染参数
  useEffect(() => {
    const renderer = (window as any).__editorRenderer as THREE.WebGLRenderer | undefined;
    const scene = (window as any).__editorScene as THREE.Scene | undefined;

    if (renderer) {
      const toneMappingMap: Record<string, number> = {
        none: THREE.NoToneMapping,
        linear: THREE.LinearToneMapping,
        reinhard: THREE.ReinhardToneMapping,
        cineon: THREE.CineonToneMapping,
        aces: THREE.ACESFilmicToneMapping,
        custom: THREE.CustomToneMapping,
      };
      renderer.toneMapping = (toneMappingMap[toneMapping] ?? THREE.ACESFilmicToneMapping) as THREE.ToneMapping;
      renderer.toneMappingExposure = exposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }

    // Three.js r185: 环境反射强度在 Scene 上，不是 Renderer
    if (scene) {
      scene.environmentIntensity = envMapIntensity;
    }
  }, [toneMapping, exposure, envMapIntensity]);

  // HDR 水平旋转（背景 + 环境同步）
  useEffect(() => {
    const scene = (window as any).__editorScene as THREE.Scene | undefined;
    if (!scene) return;
    applyHdrRotationY(scene, hdrRotationY);
  }, [hdrRotationY]);

  // 同步CorrectLights
  useEffect(() => {
    const renderer = (window as any).__editorRenderer;
    if (renderer) {
      renderer.useLegacyLights = !correctLights;
    }
  }, [correctLights]);

  // 同步渲染参数(antialias, alpha, logarithmicDepthBuffer需要重建renderer)
  const handleRendererParamChange = useCallback(async (param: 'antialias' | 'alpha' | 'logarithmicDepthBuffer', value: boolean) => {
    // 更新state
    if (param === 'antialias') setAntialias(value);
    if (param === 'alpha') setAlpha(value);
    if (param === 'logarithmicDepthBuffer') setLogarithmicDepthBuffer(value);
    
    // 保存新配置到ref
    rendererRef.current = {
      antialias: param === 'antialias' ? value : (rendererRef.current?.antialias ?? true),
      alpha: param === 'alpha' ? value : (rendererRef.current?.alpha ?? true),
      logarithmicDepthBuffer: param === 'logarithmicDepthBuffer' ? value : (rendererRef.current?.logarithmicDepthBuffer ?? true),
    };
    
    // 调用全局函数重建renderer(会有短暂闪烁)
    const recreateRenderer = (window as any).__recreateRenderer;
    if (typeof recreateRenderer === 'function') {

      recreateRenderer(rendererRef.current);
    } else {

    }
  }, []);

  // 将 HDR 贴图应用到场景（按开关状态，可只更新背景或环境其中一项）
  const applyHdrToScene = useCallback((
    texture: THREE.Texture,
    options: { bg?: boolean; env?: boolean }
  ) => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    if (options.bg !== undefined) {
      if (options.bg) {
        scene.background = texture;
        setHasHDRBackground(true);
        hasHDRBackgroundRef.current = true;
      } else {
        scene.background = new THREE.Color(bgColor);
        setHasHDRBackground(false);
        hasHDRBackgroundRef.current = false;
      }
    }

    if (options.env !== undefined) {
      if (options.env) {
        scene.environment = texture;
        scene.environmentIntensity = envMapIntensity;
        setHasHDREnvironment(true);
      } else {
        scene.environment = null;
        setHasHDREnvironment(false);
      }
    }
  }, [bgColor, envMapIntensity]);

  const loadHdrFromUrl = useCallback((url: string): Promise<THREE.Texture> => {
    return new Promise((resolve, reject) => {
      const loader = new HDRLoader();
      loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }, []);

  // 加载HDR文件作为背景或环境
  const handleLoadHDR = useCallback(async (file: File, asBackground: boolean) => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    const loader = new HDRLoader();
    const url = URL.createObjectURL(file);

    loader.load(url, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const isFirstHdr = !hdrTextureCache.current;

      hdrTextureCache.current = texture;
      setSelectedHdriId(null);
      setHdriReady(true);
      hdrDownloadSourceRef.current = { kind: 'file', file };
      (window as any).__hdrExportSource = hdrDownloadSourceRef.current;

      if (isFirstHdr) {
        setBgHdriEnabled(true);
        setEnvHdriEnabled(true);
        bgHdriEnabledRef.current = true;
        envHdriEnabledRef.current = true;
        setHdrBgName(file.name);
        setHdrEnvName(file.name);
        applyHdrToScene(texture, { bg: true, env: true });
      } else if (asBackground) {
        setHdrBgName(file.name);
        if (bgHdriEnabledRef.current) {
          applyHdrToScene(texture, { bg: true });
        }
      } else {
        setHdrEnvName(file.name);
        if (envHdriEnabledRef.current) {
          applyHdrToScene(texture, { env: true });
        }
      }

      URL.revokeObjectURL(url);
    });
  }, [applyHdrToScene]);

  // 从 Poly Haven 选择 HDRI
  const handlePolyhavenSelect = useCallback(async (asset: HdriAsset) => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    setLoadingHdriId(asset.id);
    const isFirstHdr = !hdrTextureCache.current;
    try {
      const { url, resolution: actualRes } = await fetchHdriUrl(asset.id, hdriResolution);
      const texture = await loadHdrFromUrl(url);

      if (hdrTextureCache.current && hdrTextureCache.current !== texture) {
        hdrTextureCache.current.dispose();
      }
      hdrTextureCache.current = texture;

      const displayName = `${asset.name} (${actualRes})`;
      setSelectedHdriId(asset.id);
      setHdriReady(true);
      hdrDownloadSourceRef.current = {
        kind: 'polyhaven',
        id: asset.id,
        resolution: actualRes,
        filename: `${asset.id}_${actualRes}.hdr`,
      };
      (window as any).__hdrExportSource = hdrDownloadSourceRef.current;
      setHdrBgName(displayName);
      setHdrEnvName(displayName);

      if (isFirstHdr) {
        setBgHdriEnabled(true);
        setEnvHdriEnabled(true);
        bgHdriEnabledRef.current = true;
        envHdriEnabledRef.current = true;
        applyHdrToScene(texture, { bg: true, env: true });
      } else {
        applyHdrToScene(texture, {
          bg: bgHdriEnabledRef.current,
          env: envHdriEnabledRef.current,
        });
      }
    } catch (err) {
      console.error('HDRI 加载失败:', err);
      notify.error(err instanceof Error ? err.message : 'HDRI 加载失败，请检查网络后重试');
    } finally {
      setLoadingHdriId(null);
    }
  }, [hdriResolution, loadHdrFromUrl, applyHdrToScene]);

  const handleDownloadCurrentHdr = useCallback(async () => {
    const source = hdrDownloadSourceRef.current;
    if (!source || !hdriReady) {
      notify.warning('当前没有可下载的 HDR，请先选择或上传 HDRI');
      return;
    }

    setDownloadingHdr(true);
    try {
      await downloadHdrFromSource(source);
    } catch (err) {
      console.error('HDR 下载失败:', err);
      notify.error(err instanceof Error ? err.message : 'HDR 下载失败，请检查网络后重试');
    } finally {
      setDownloadingHdr(false);
    }
  }, [hdriReady]);

  const toggleBgHdri = useCallback((enabled?: boolean) => {
    const scene = (window as any).__editorScene;
    if (!scene || !hdrTextureCache.current) return;

    const next = enabled ?? !bgHdriEnabled;
    setBgHdriEnabled(next);
    bgHdriEnabledRef.current = next;
    if (next) {
      scene.background = hdrTextureCache.current;
      setHasHDRBackground(true);
      hasHDRBackgroundRef.current = true;
    } else {
      scene.background = new THREE.Color(bgColor);
      setHasHDRBackground(false);
      hasHDRBackgroundRef.current = false;
    }
  }, [bgHdriEnabled, bgColor]);

  const toggleEnvHdri = useCallback((enabled?: boolean) => {
    const scene = (window as any).__editorScene;
    if (!scene || !hdrTextureCache.current) return;

    const next = enabled ?? !envHdriEnabled;
    setEnvHdriEnabled(next);
    envHdriEnabledRef.current = next;
    if (next) {
      scene.environment = hdrTextureCache.current;
      scene.environmentIntensity = envMapIntensity;
      setHasHDREnvironment(true);
    } else {
      scene.environment = null;
      setHasHDREnvironment(false);
    }
  }, [envHdriEnabled, envMapIntensity]);

  // 清除HDR背景
  const handleClearBackground = useCallback(() => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    scene.background = new THREE.Color(bgColor);
    setHasHDRBackground(false);
    hasHDRBackgroundRef.current = false;
    setHdrBgName('');
    setBgHdriEnabled(false);
    bgHdriEnabledRef.current = false;
  }, [bgColor]);

  // 清除HDR环境
  const handleClearEnvironment = useCallback(() => {
    const scene = (window as any).__editorScene;
    if (!scene) return;

    scene.environment = null;
    setHasHDREnvironment(false);
    setHdrEnvName('');
    setEnvHdriEnabled(false);
    envHdriEnabledRef.current = false;
  }, []);

  // 同步全局设置状态(供组件重挂载恢复)
  useEffect(() => {
    (window as any).__globalSettingsState = {
      bgColor,
      fogEnabled,
      fogColor,
      fogNear,
      fogFar,
      pixelRatio,
      toneMapping,
      exposure,
      envMapIntensity,
      hdrRotationY,
      correctLights,
      cameraPosition,
      controlsTarget,
      cameraFov,
      cameraNear,
      cameraFar,
      antialias,
      alpha,
      logarithmicDepthBuffer,
      hasHDRBackground,
      hasHDREnvironment,
      hdrBgName,
      hdrEnvName,
      bgHdriEnabled,
      envHdriEnabled,
      selectedHdriId,
      hdriResolution,
      hdriReady,
    };
  }, [bgColor, fogEnabled, fogColor, fogNear, fogFar, pixelRatio, toneMapping, exposure, envMapIntensity, hdrRotationY, correctLights, cameraPosition, controlsTarget, cameraFov, cameraNear, cameraFar, antialias, alpha, logarithmicDepthBuffer, hasHDRBackground, hasHDREnvironment, hdrBgName, hdrEnvName, bgHdriEnabled, envHdriEnabled, selectedHdriId, hdriResolution, hdriReady]);

  // 项目导入后从 window 全局状态同步 UI
  useEffect(() => {
    const syncFromRestoredProject = () => {
      const saved = (window as any).__globalSettingsState as Record<string, unknown> | undefined;
      if (!saved) return;

      const scene = (window as any).__editorScene as THREE.Scene | undefined;
      const cachedTexture = (window as any).__hdrTextureCache as THREE.Texture | undefined;

      if (cachedTexture) {
        hdrTextureCache.current = cachedTexture;
      } else if (scene?.background && (scene.background as THREE.Texture).isTexture) {
        hdrTextureCache.current = scene.background as THREE.Texture;
      } else if (scene?.environment) {
        hdrTextureCache.current = scene.environment;
      }

      const hasBg = Boolean(saved.hasHDRBackground ?? saved.bgHdriEnabled);
      const hasEnv = Boolean(saved.hasHDREnvironment ?? saved.envHdriEnabled);
      hasHDRBackgroundRef.current = hasBg;
      bgHdriEnabledRef.current = Boolean(saved.bgHdriEnabled ?? hasBg);
      envHdriEnabledRef.current = Boolean(saved.envHdriEnabled ?? hasEnv);

      if (saved.bgColor) {
        const color = String(saved.bgColor);
        setBgColor(color);
        bgColorRef.current = color;
      }
      // 纯色背景：按恢复后的颜色写回场景（避免仍停留在旧灰底）
      if (scene && !bgHdriEnabledRef.current) {
        const color = String(
          saved.bgColor ??
            (scene.background instanceof THREE.Color
              ? `#${scene.background.getHexString()}`
              : '#000000')
        );
        scene.background = new THREE.Color(color);
        bgColorRef.current = color;
        setBgColor(color);
      }
      if (saved.fogEnabled != null) setFogEnabled(Boolean(saved.fogEnabled));
      if (saved.fogColor) setFogColor(String(saved.fogColor));
      if (saved.fogNear != null) setFogNear(Number(saved.fogNear));
      if (saved.fogFar != null) setFogFar(Number(saved.fogFar));
      if (saved.pixelRatio) setPixelRatio(String(saved.pixelRatio));
      if (saved.toneMapping) setToneMapping(String(saved.toneMapping));
      if (saved.exposure != null) setExposure(Number(saved.exposure));
      if (saved.envMapIntensity != null) setEnvMapIntensity(Number(saved.envMapIntensity));
      if (saved.hdrRotationY != null) setHdrRotationY(Number(saved.hdrRotationY));
      if (saved.correctLights != null) setCorrectLights(Boolean(saved.correctLights));
      if (saved.cameraPosition) setCameraPosition(saved.cameraPosition as { x: number; y: number; z: number });
      if (saved.controlsTarget) setControlsTarget(saved.controlsTarget as { x: number; y: number; z: number });
      if (saved.cameraFov != null) setCameraFov(Number(saved.cameraFov));
      if (saved.cameraNear != null) setCameraNear(Number(saved.cameraNear));
      if (saved.cameraFar != null) setCameraFar(Number(saved.cameraFar));
      if (saved.antialias != null) setAntialias(Boolean(saved.antialias));
      if (saved.alpha != null) setAlpha(Boolean(saved.alpha));
      if (saved.logarithmicDepthBuffer != null) setLogarithmicDepthBuffer(Boolean(saved.logarithmicDepthBuffer));
      if (saved.hasHDRBackground != null) setHasHDRBackground(Boolean(saved.hasHDRBackground));
      if (saved.hasHDREnvironment != null) setHasHDREnvironment(Boolean(saved.hasHDREnvironment));
      if (saved.hdrBgName) setHdrBgName(String(saved.hdrBgName));
      if (saved.hdrEnvName) setHdrEnvName(String(saved.hdrEnvName));
      if (saved.bgHdriEnabled != null) setBgHdriEnabled(Boolean(saved.bgHdriEnabled));
      if (saved.envHdriEnabled != null) setEnvHdriEnabled(Boolean(saved.envHdriEnabled));
      if (saved.selectedHdriId != null) setSelectedHdriId(saved.selectedHdriId as string | null);
      if (saved.hdriResolution) setHdriResolution(saved.hdriResolution as HdrResolution);
      if (saved.hdriReady != null) setHdriReady(Boolean(saved.hdriReady));

      if (scene && hdrTextureCache.current) {
        if (bgHdriEnabledRef.current) {
          scene.background = hdrTextureCache.current;
        }
        if (envHdriEnabledRef.current) {
          scene.environment = hdrTextureCache.current;
          scene.environmentIntensity = Number(saved.envMapIntensity ?? envMapIntensity);
        }
        applyHdrRotationY(scene, Number(saved.hdrRotationY ?? hdrRotationY));
      }
    };

    window.addEventListener(EDITOR_PROJECT_RESTORE_EVENT, syncFromRestoredProject);
    return () => window.removeEventListener(EDITOR_PROJECT_RESTORE_EVENT, syncFromRestoredProject);
  }, [envMapIntensity, hdrRotationY]);

  // 处理HDR文件选择

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Tab栏 */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('scene')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'scene'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          场景
        </button>
        <button
          onClick={() => setActiveTab('environment')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'environment'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          环境
        </button>
        <button
          onClick={() => setActiveTab('render')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'render'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          渲染
        </button>
        <button
          onClick={() => setActiveTab('tour')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'tour'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          漫游
        </button>
        <button
          onClick={() => setActiveTab('postprocess')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'postprocess'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          后期
        </button>
      </div>

      {/* 内容区 */}
      <div
        className={
          activeTab === 'environment' || activeTab === 'tour'
            ? 'flex-1 min-h-0 flex flex-col overflow-hidden px-3 py-3 gap-2'
            : 'flex-1 overflow-y-auto p-4 space-y-4'
        }
      >
        {/* 场景设置 */}
        {activeTab === 'scene' && (
          <>
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">背景颜色</h4>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border border-gray-600"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded font-mono"
                />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">相机位置</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-red-400 block mb-1">X</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cameraPosition.x}
                    onFocus={() => { isCameraInputEditingRef.current = true; }}
                    onBlur={() => { isCameraInputEditingRef.current = false; }}
                    onChange={(e) => {
                      isUserInputChange.current = true; // 标记为用户手动输入
                      setCameraPosition((prev: {x: number, y: number, z: number}) => ({...prev, x: parseFloat(e.target.value) || 0}))
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-green-400 block mb-1">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cameraPosition.y}
                    onFocus={() => { isCameraInputEditingRef.current = true; }}
                    onBlur={() => { isCameraInputEditingRef.current = false; }}
                    onChange={(e) => {
                      isUserInputChange.current = true; // 标记为用户手动输入
                      setCameraPosition((prev: {x: number, y: number, z: number}) => ({...prev, y: parseFloat(e.target.value) || 0}))
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-400 block mb-1">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cameraPosition.z}
                    onFocus={() => { isCameraInputEditingRef.current = true; }}
                    onBlur={() => { isCameraInputEditingRef.current = false; }}
                    onChange={(e) => {
                      isUserInputChange.current = true; // 标记为用户手动输入
                      setCameraPosition((prev: {x: number, y: number, z: number}) => ({...prev, z: parseFloat(e.target.value) || 0}))
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">控制点位置</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-red-400 block mb-1">X</label>
                  <input
                    type="number"
                    step="0.1"
                    value={controlsTarget.x}
                    onFocus={() => { isCameraInputEditingRef.current = true; }}
                    onBlur={() => { isCameraInputEditingRef.current = false; }}
                    onChange={(e) => {
                      isUserInputChange.current = true;
                      setControlsTarget((prev: {x: number, y: number, z: number}) => ({...prev, x: parseFloat(e.target.value) || 0}));
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-green-400 block mb-1">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    value={controlsTarget.y}
                    onFocus={() => { isCameraInputEditingRef.current = true; }}
                    onBlur={() => { isCameraInputEditingRef.current = false; }}
                    onChange={(e) => {
                      isUserInputChange.current = true;
                      setControlsTarget((prev: {x: number, y: number, z: number}) => ({...prev, y: parseFloat(e.target.value) || 0}));
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-400 block mb-1">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    value={controlsTarget.z}
                    onFocus={() => { isCameraInputEditingRef.current = true; }}
                    onBlur={() => { isCameraInputEditingRef.current = false; }}
                    onChange={(e) => {
                      isUserInputChange.current = true;
                      setControlsTarget((prev: {x: number, y: number, z: number}) => ({...prev, z: parseFloat(e.target.value) || 0}));
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">相机参数</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    FOV (视野): {cameraFov}°
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    value={cameraFov}
                    onChange={(e) => setCameraFov(parseFloat(e.target.value) || 75)}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Near (近裁剪): {cameraNear}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max="10"
                    step="0.01"
                    value={cameraNear}
                    onChange={(e) => setCameraNear(parseFloat(e.target.value) || 0.1)}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Far (远裁剪): {cameraFar}
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    step="10"
                    value={cameraFar}
                    onChange={(e) => setCameraFar(parseFloat(e.target.value) || 1000)}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  />
                </div>
              </div>
            </div>

            {/* 网格和坐标轴 */}
            <div className="space-y-2 pt-2 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">显示网格</span>
                <button
                  onClick={toggleGrid}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    gridVisible ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      gridVisible ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">显示坐标轴</span>
                <button
                  onClick={toggleAxes}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    axesVisible ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      axesVisible ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </>
        )}

        {/* 环境设置 */}
        {activeTab === 'environment' && (
          <div className="flex flex-col flex-1 min-h-0 gap-2">
            {/* 大气雾效 */}
            <div className="shrink-0 p-2.5 rounded-lg border border-gray-700/80 bg-gray-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <Typography.Text className="text-xs text-gray-300">大气雾效</Typography.Text>
                <Switch size="small" checked={fogEnabled} onChange={setFogEnabled} />
              </div>
              {fogEnabled && (
                <div className="space-y-2 pt-1 border-t border-gray-700/60">
                  <div>
                    <Typography.Text className="text-[10px] text-gray-500 block mb-1">雾颜色</Typography.Text>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={fogColor}
                        onChange={(e) => setFogColor(e.target.value)}
                        className="w-8 h-7 rounded cursor-pointer border border-gray-600"
                      />
                      <input
                        type="text"
                        value={fogColor}
                        onChange={(e) => setFogColor(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <Typography.Text className="text-[10px] text-gray-500 block mb-1">近处: {fogNear}</Typography.Text>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={fogNear}
                      onChange={(e) => setFogNear(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <Typography.Text className="text-[10px] text-gray-500 block mb-1">远处: {fogFar}</Typography.Text>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="1"
                      value={fogFar}
                      onChange={(e) => setFogFar(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 环境贴图强度 */}
            <div className="shrink-0 p-2.5 rounded-lg border border-gray-700/80 bg-gray-800/40">
              <Typography.Text className="text-[10px] text-gray-500 block mb-1">
                环境反射强度: {envMapIntensity.toFixed(1)}
              </Typography.Text>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={envMapIntensity}
                disabled={!envHdriEnabled || !hasHDREnvironment}
                onChange={(e) => setEnvMapIntensity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <Typography.Text className="text-[10px] text-gray-400 block mt-1 leading-relaxed">
                调节 PBR 材质的 HDR 环境反射强度；需先加载 HDRI 并开启「HDR 环境反射」。
              </Typography.Text>
            </div>

            {/* HDR 旋转 */}
            <div className="shrink-0 p-2.5 rounded-lg border border-gray-700/80 bg-gray-800/40">
              <Typography.Text className="text-[10px] text-gray-500 block mb-1">
                HDR 水平旋转: {hdrRotationY.toFixed(0)}°
              </Typography.Text>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={hdrRotationY}
                disabled={!hdriReady}
                onChange={(e) => setHdrRotationY(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <Typography.Text className="text-[10px] text-gray-400 block mt-1 leading-relaxed">
                绕垂直轴旋转天空背景与环境反射方向，用于对齐太阳/光源位置。
              </Typography.Text>
            </div>

            {/* HDRI */}
            <EnvironmentHdriSection
              hdriReady={hdriReady}
              envHdriEnabled={envHdriEnabled}
              bgHdriEnabled={bgHdriEnabled}
              hdrBgName={hdrBgName}
              hdrEnvName={hdrEnvName}
              hasHDRBackground={hasHDRBackground}
              hasHDREnvironment={hasHDREnvironment}
              selectedHdriId={selectedHdriId}
              loadingHdriId={loadingHdriId}
              hdriResolution={hdriResolution}
              onResolutionChange={setHdriResolution}
              onPolyhavenSelect={handlePolyhavenSelect}
              onToggleEnv={toggleEnvHdri}
              onToggleBg={toggleBgHdri}
              onLoadLocalHdr={handleLoadHDR}
              onClearBackground={handleClearBackground}
              onClearEnvironment={handleClearEnvironment}
              canDownloadHdr={hdriReady && !!(hasHDRBackground || hasHDREnvironment)}
              downloadingHdr={downloadingHdr}
              onDownloadHdr={handleDownloadCurrentHdr}
            />
          </div>
        )}

        {/* 渲染设置 */}
        {activeTab === 'render' && (
          <>
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">Renderer 基础设置</h4>
              <div className="space-y-2">
                {/* 抗锯齿 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">抗锯齿 (Antialias)</span>
                  <button 
                    onClick={() => handleRendererParamChange('antialias', !antialias)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      antialias ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                    title="开启后边缘更平滑,但会略微影响性能"
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      antialias ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                
                {/* 透明背景 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">透明背景 (Alpha)</span>
                  <button 
                    onClick={() => handleRendererParamChange('alpha', !alpha)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      alpha ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                    title="开启后背景可以透明,关闭后为纯色背景"
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      alpha ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                
                {/* 对数深度缓冲区 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">对数深度缓冲区 (LogarithmicDepthBuffer)</span>
                  <button 
                    onClick={() => handleRendererParamChange('logarithmicDepthBuffer', !logarithmicDepthBuffer)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      logarithmicDepthBuffer ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                    title="开启后解决大场景深度精度问题(深度闪烁)"
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      logarithmicDepthBuffer ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">色调映射 (Tone Mapping)</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">类型</label>
                  <select 
                    value={toneMapping}
                    onChange={(e) => setToneMapping(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  >
                    <option value="none">NoToneMapping (无)</option>
                    <option value="linear">LinearToneMapping (线性)</option>
                    <option value="reinhard">ReinhardToneMapping</option>
                    <option value="cineon">CineonToneMapping</option>
                    <option value="aces">ACES Filmic (推荐)</option>
                    <option value="custom">CustomToneMapping (自定义)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    曝光 (Exposure): {exposure.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.01"
                    value={exposure}
                    onChange={(e) => setExposure(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">阴影设置 (Shadow Map)</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">启用阴影</span>
                  <button className="w-10 h-5 rounded-full bg-green-500 transition-colors">
                    <div className="w-4 h-4 bg-white rounded-full transform translate-x-5 transition-transform" />
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">阴影类型</label>
                  <select 
                    defaultValue="pcf"
                    className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
                  >
                    <option value="basic">BasicShadowMap (基础)</option>
                    <option value="pcf">PCFShadowMap (PCF)</option>
                    <option value="pcfSoft">PCFSoftShadowMap (PCF软)</option>
                    <option value="vsm">VSMShadowMap (VSM)</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">输出颜色空间</h4>
              <select 
                defaultValue="srgb"
                className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              >
                <option value="srgb">SRGBColorSpace (sRGB)</option>
                <option value="linear">LinearSRGBColorSpace (线性)</option>
              </select>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">物理灯光</h4>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">启用物理CorrectLights</span>
                <button 
                  onClick={() => setCorrectLights(!correctLights)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    correctLights ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transform transition-transform ${
                      correctLights ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">像素比</h4>
              <select 
                value={pixelRatio}
                onChange={(e) => setPixelRatio(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              >
                <option value="1">1x (性能)</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x (质量)</option>
                <option value="3">3x (最高)</option>
              </select>
            </div>
          </>
        )}

        {/* 漫游编辑 */}
        {activeTab === 'tour' && (
          <CameraTourPanel />
        )}

        {/* 后期处理设置 */}
        {activeTab === 'postprocess' && (
          <PostProcessSettings />
        )}
      </div>
    </div>
  );
}
