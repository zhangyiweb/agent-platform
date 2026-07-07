import { buildObjectIdRestoreScript } from '@/utils/exportSceneRestore';
import { buildTextureUvNormalizeScript } from '@/utils/textureUvUtils';
import {
  EXPORT_PACKAGE_DEFAULT_CAMERA_POSITION,
  EXPORT_PACKAGE_DEFAULT_CONTROLS_TARGET,
} from '@/config/exportDefaults';

const THREE_VERSION = '0.184.0';
const QUARKS_VERSION = '0.17.1';

export function buildIndexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="./css/style.css" />
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/",
      "three.quarks": "https://unpkg.com/three.quarks@${QUARKS_VERSION}/dist/three.quarks.esm.js",
      "postprocessing": "https://unpkg.com/postprocessing@6.38.2/build/index.js"
    }
  }
  </script>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div id="loading">加载场景中…</div>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
`;
}

export function buildStyleCss(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0f0f0f;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

#canvas {
  display: block;
  width: 100vw;
  height: 100vh;
}

#loading {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  color: #e5e7eb;
  font-size: 14px;
  z-index: 20;
  transition: opacity 0.3s;
}

#loading.hidden {
  opacity: 0;
  pointer-events: none;
}
`;
}

export function buildMainJs(hasCameraTour = false): string {
  const restoreScript = buildObjectIdRestoreScript();
  const normalizeScript = buildTextureUvNormalizeScript();
  const defaultCamera = JSON.stringify(EXPORT_PACKAGE_DEFAULT_CAMERA_POSITION);
  const defaultTarget = JSON.stringify(EXPORT_PACKAGE_DEFAULT_CONTROLS_TARGET);
  return `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createPostProcessPipeline, normalizePostProcessConfig } from './postProcess.js';
import { createParticleEmitters, tickParticleEmitters } from './particleRuntime.js';
${hasCameraTour ? "import { createCameraTourController } from './cameraTour.js';\n" : ''}

const canvas = document.getElementById('canvas');
const loadingEl = document.getElementById('loading');

const DEFAULT_CAMERA_POSITION = ${defaultCamera};
const DEFAULT_CONTROLS_TARGET = ${defaultTarget};

const TONE_MAPPING = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function parseColor(hex) {
  return new THREE.Color(hex || '#ffffff');
}

function createLight(data) {
  const color = parseColor(data.color);
  let light = null;

  switch (data.type) {
    case 'AmbientLight':
      light = new THREE.AmbientLight(color, data.intensity ?? 1);
      break;
    case 'DirectionalLight': {
      light = new THREE.DirectionalLight(color, data.intensity ?? 1);
      light.castShadow = Boolean(data.castShadow);
      if (data.shadow?.mapSize) {
        light.shadow.mapSize.set(
          data.shadow.mapSize.width ?? 2048,
          data.shadow.mapSize.height ?? 2048
        );
      }
      if (data.shadow?.camera) {
        const cam = data.shadow.camera;
        Object.assign(light.shadow.camera, {
          left: cam.left,
          right: cam.right,
          top: cam.top,
          bottom: cam.bottom,
          near: cam.near,
          far: cam.far,
        });
        light.shadow.camera.updateProjectionMatrix();
      }
      break;
    }
    case 'PointLight':
      light = new THREE.PointLight(color, data.intensity ?? 1, data.distance ?? 0, data.decay ?? 2);
      light.castShadow = Boolean(data.castShadow);
      break;
    case 'SpotLight': {
      light = new THREE.SpotLight(color, data.intensity ?? 1, data.distance ?? 0, data.angle ?? Math.PI / 3, data.penumbra ?? 0, data.decay ?? 2);
      light.castShadow = Boolean(data.castShadow);
      if (data.target) {
        light.target.position.set(data.target.x, data.target.y, data.target.z);
      }
      break;
    }
    case 'HemisphereLight':
      light = new THREE.HemisphereLight(
        color,
        parseColor(data.groundColor || '#444444'),
        data.intensity ?? 1
      );
      break;
    default:
      return null;
  }

  if (!light) return null;
  light.name = data.name || data.type;
  light.visible = data.enabled !== false;
  if (data.position) {
    light.position.set(data.position.x, data.position.y, data.position.z);
  }
  return light;
}

async function loadHdr(path) {
  const loader = new HDRLoader();
  return new Promise((resolve, reject) => {
    loader.load(path, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      resolve(texture);
    }, undefined, reject);
  });
}

async function loadModel(path) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

function findObjectById(root, id) {
  let found = null;
  root.traverse((child) => {
    if (found) return;
    const cid = child.userData?.id || child.userData?.businessId || child.userData?.editorId;
    if (cid === id) found = child;
  });
  return found;
}

${restoreScript}

${normalizeScript}

function tickTextureUvAnimations(root, animations, delta) {
  if (!animations || delta <= 0) return;
  const keysAll = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap'];

  Object.entries(animations).forEach(([objectId, cfg]) => {
    if (!cfg?.enabled) return;
    if (!cfg.speedU && !cfg.speedV) return;
    const object = findObjectById(root, objectId);
    if (!object) return;
    const keys = cfg.target === 'all' ? keysAll : ['map'];

    object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        keys.forEach((key) => {
          const tex = mat[key];
          if (!tex) return;
          tex.offset.x += (cfg.speedU || 0) * delta;
          tex.offset.y += (cfg.speedV || 0) * delta;
        });
      });
    });
  });
}

async function bootstrap() {
  const config = await fetch('./config/scene.json').then((r) => r.json());
  const assets = config.assets || {};
  const rendererCfg = config.renderer || {};
  const cameraCfg = config.camera || {};
  const controlsCfg = config.controls || {};
  const sceneCfg = config.scene || {};

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: rendererCfg.antialias !== false,
    alpha: rendererCfg.alpha !== false,
    logarithmicDepthBuffer: rendererCfg.logarithmicDepthBuffer !== false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, Number(rendererCfg.pixelRatio) || 2)
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = rendererCfg.shadowMapEnabled !== false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = TONE_MAPPING[rendererCfg.toneMapping] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = rendererCfg.toneMappingExposure ?? 0.4;
  if (rendererCfg.correctLights === true) {
    renderer.useLegacyLights = false;
  }

  const scene = new THREE.Scene();

  if (sceneCfg.fog?.enabled) {
    scene.fog = new THREE.Fog(
      parseColor(sceneCfg.fog.color),
      sceneCfg.fog.near ?? 1,
      sceneCfg.fog.far ?? 100
    );
  }

  let hdrTexture = null;
  if (assets.hdr) {
    try {
      hdrTexture = await loadHdr('./' + assets.hdr);
    } catch (err) {
      console.warn('HDR 加载失败，将使用纯色背景', err);
    }
  }

  if (sceneCfg.background?.type === 'texture' && hdrTexture && config.editor?.settings?.bgHdriEnabled !== false) {
    scene.background = hdrTexture;
  } else if (sceneCfg.background?.type === 'color' && sceneCfg.background.value) {
    scene.background = parseColor(sceneCfg.background.value);
  } else {
    scene.background = parseColor(config.editor?.settings?.bgColor || '#1a1a1a');
  }

  if (sceneCfg.environment?.enabled && hdrTexture && config.editor?.settings?.envHdriEnabled !== false) {
    scene.environment = hdrTexture;
    scene.environmentIntensity = sceneCfg.environment.intensity ?? 1;
  }

  const hdrRotationY = sceneCfg.environment?.rotationY
    ?? sceneCfg.background?.rotationY
    ?? config.editor?.settings?.hdrRotationY
    ?? 0;
  if (hdrTexture && hdrRotationY) {
    const rad = THREE.MathUtils.degToRad(hdrRotationY);
    scene.environmentRotation.set(0, rad, 0);
    scene.backgroundRotation.set(0, rad, 0);
  }

  const camera = new THREE.PerspectiveCamera(
    cameraCfg.fov ?? 45,
    window.innerWidth / window.innerHeight,
    cameraCfg.near ?? 0.1,
    cameraCfg.far ?? 5000
  );
  const camPos = cameraCfg.position ?? DEFAULT_CAMERA_POSITION;
  camera.position.set(camPos.x, camPos.y, camPos.z);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = controlsCfg.enableDamping !== false;
  controls.dampingFactor = controlsCfg.dampingFactor ?? 0.05;
  const ctrlTarget = controlsCfg.target ?? DEFAULT_CONTROLS_TARGET;
  controls.target.set(ctrlTarget.x, ctrlTarget.y, ctrlTarget.z);
  controls.update();

  const lights = config.runtimeLights?.length ? config.runtimeLights : [];
  for (const lightData of lights) {
    const light = createLight(lightData);
    if (!light) continue;
    scene.add(light);
    if (light.target) scene.add(light.target);
  }

  if (assets.model) {
    const gltf = await loadModel('./' + assets.model);
    scene.add(gltf.scene);
    restoreEditorObjectIds(gltf.scene, config.editor?.objects || []);
    normalizeModelTextureUvs(gltf.scene);
    applyTextureUvStates(gltf.scene, config.editor?.textureUvStates || {});
    prepareTextureAnimations(gltf.scene, config.editor?.textureUvAnimations || {});
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  const textureUvAnimations = config.editor?.textureUvAnimations || {};
  const particleSystems = createParticleEmitters(
    scene,
    config.editor?.objects || [],
    config.editor?.particles || {}
  );
  const timer = new THREE.Timer();
  timer.connect(document);

  const postProcessConfig = normalizePostProcessConfig(config.postProcess);
  let postPipeline = postProcessConfig
    ? createPostProcessPipeline(renderer, scene, camera, postProcessConfig)
    : null;

  ${hasCameraTour ? `// 相机漫游工具包（详见 js/cameraTour.js、docs/camera-tour-guide.md）
  let cameraTour = null;
  try {
    cameraTour = createCameraTourController({
      camera,
      controls,
      configUrl: './config/camera-tour.json',
    });
    await cameraTour.ready;
    window.cameraTour = cameraTour;
    const loaded = cameraTour.getTour();
    if (loaded) {
      const modeLabel = loaded.mode === 'spline' ? '一镜到底' : '站点漫游';
      console.info(
        '[cameraTour] 已加载「' + loaded.name + '」',
        modeLabel,
        loaded.stops.length + ' 个漫游点'
      );
      console.info('[cameraTour] 试播: window.cameraTour.play()');
    }
  } catch (err) {
    console.warn('漫游配置加载失败', err);
  }
` : ''}
  function animate() {
    requestAnimationFrame(animate);
    timer.update();
    const delta = timer.getDelta();
    tickTextureUvAnimations(scene, textureUvAnimations, delta);
    tickParticleEmitters(particleSystems, delta);
    ${hasCameraTour ? `if (cameraTour?.isActive()) {
      cameraTour.update(delta);
    } else {
      controls.update();
    }` : 'controls.update();'}
    if (postPipeline) {
      postPipeline.render();
    } else {
      renderer.render(scene, camera);
    }
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    postPipeline?.setSize(window.innerWidth, window.innerHeight);
  });

  hideLoading();
}

bootstrap().catch((err) => {
  console.error(err);
  loadingEl.textContent = '场景加载失败，请查看控制台';
});
`;
}

export function buildReadme(exportTime: string): string {
  return `# 数字孪生导出项目

由数字孪生平台于 ${exportTime} 导出，可直接用编辑器二次开发。

## 目录结构

\`\`\`
├── index.html          # 入口页面
├── css/style.css       # 样式
├── js/
│   ├── main.js         # Three.js 场景启动脚本（ES Module）
│   └── cameraTour.js   # 相机漫游工具包（无 UI，支持站点/一镜到底两种模式）
├── config/
│   ├── scene.json           # 相机、灯光、雾效、渲染器、后期等完整配置
│   ├── camera-tour.json     # 当前激活漫游路线（main.js 默认加载）
│   ├── camera-tour-index.json # 全部漫游路线索引（如有）
│   └── camera-tours/        # 各条漫游路线 JSON（如有）
├── docs/
│   └── camera-tour-guide.md # 漫游配置字段说明与 API 速查
├── assets/
│   ├── models/scene.glb
│   ├── textures/
│   └── hdr/
└── README.md
\`\`\`

## 快速预览

用任意静态服务器打开根目录（不要直接双击 index.html，ES Module 需要 HTTP）：

\`\`\`bash
# Node.js
npx serve .

# 或 Python
python -m http.server 8080
\`\`\`

浏览器访问 \`http://localhost:8080\`（端口以终端提示为准）。

## 二次开发说明

- **改模型**：替换 \`assets/models/scene.glb\`，或在 \`js/main.js\` 中加载更多资源。
- **改灯光 / 相机**：编辑 \`config/scene.json\`，\`runtimeLights\` 为场景中实际灯光数据。默认相机位置 \`(15, 10, 15)\`，控制点 \`(0, 0, 0)\`。
- **改 HDR**：替换 \`assets/hdr/\` 下文件，并更新 \`scene.json\` 中 \`assets.hdr\` 路径。
- **贴图 / UV**：\`editor.textureUvStates\` 保存各对象 repeat/offset/wrap 等参数；加载 GLB 后会规范化出厂默认包裹为「重复」，并写入 \`scene.json\` 中的 UV 状态。从 Poly Haven 应用的贴图会额外写入 \`assets.textures\` 目录，并在 \`scene.json\` 的 \`assets.textures\` 中记录路径与来源。
- **Poly Haven 模型**：\`editor.polyhavenModels\` 记录从模型库导入的资产 id 与分辨率；模型几何与贴图已打包进 \`scene.glb\`，贴图原件另存于 \`assets/textures/\`。
- **相机漫游工具包**（\`js/cameraTour.js\` + \`config/camera-tour*.json\`）：
  - **站点漫游** \`tour.mode = "stop"\`：逐站飞入、停留，适合看设备。
  - **一镜到底** \`tour.mode = "spline"\`：Catmull-Rom 样条连续漫游，适合园区/厂区参观；\`tour.splineDuration\` 为全程秒数。
  - \`config/camera-tour.json\` 为当前激活路线；多条路线时见 \`camera-tour-index.json\` 与 \`camera-tours/\` 目录。
  - \`waypoints[]\` 含漫游点名称、相机坐标、目标点；\`route.curveSamples\` 为曲线采样（spline 模式）。
  - 加载后控制台执行 \`window.cameraTour.play()\` 试播；完整 API 见 \`js/cameraTour.js\` 顶部注释与 \`docs/camera-tour-guide.md\`。
  - 切换路线：\`await window.cameraTour.loadConfig('./config/camera-tours/路线id.json')\`
- **后期处理**：\`config/scene.json\` 的 \`postProcess\` 节保存编辑器后期参数，\`js/postProcess.js\` 与 \`main.js\` 已自动接入 EffectComposer。

## 依赖

运行时通过 importmap 从 jsDelivr 加载 Three.js r${THREE_VERSION}、从 unpkg 加载 postprocessing，无需本地 npm install 即可预览。
生产环境建议改为本地依赖或打包工具（Vite / Webpack）。
`;
}
