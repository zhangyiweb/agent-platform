import { useCallback } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createExportScene } from '@/utils/sceneUtils';

export function useSceneExporter() {
  const exportGLB = useCallback(async (scene: THREE.Scene): Promise<void> => {
    const exportScene = createExportScene(scene);

    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();

      exporter.parse(
        exportScene,
        (result: ArrayBuffer | { [key: string]: unknown }) => {
          const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `scene_${Date.now()}.glb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve();
        },
        (error: ErrorEvent) => reject(error),
        { binary: true, trs: true, onlyVisible: true }
      );
    });
  }, []);

  const exportGLTF = useCallback(async (scene: THREE.Scene): Promise<void> => {
    const exportScene = createExportScene(scene);

    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();

      exporter.parse(
        exportScene,
        (result: ArrayBuffer | { [key: string]: unknown }) => {
          const json = JSON.stringify(result, null, 2);
          const blob = new Blob([json], { type: 'model/gltf+json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `scene_${Date.now()}.gltf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve();
        },
        (error: ErrorEvent) => reject(error),
        { binary: false, trs: true, onlyVisible: true }
      );
    });
  }, []);

  const exportHTML = useCallback(async (scene: THREE.Scene): Promise<void> => {
    const exportScene = createExportScene(scene);
    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (gltfData: object) => {
          const jsonStr = JSON.stringify(gltfData);
          const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
          const dataUri = `data:model/gltf+json;base64,${base64}`;

          const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>?????????</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #1a1a1a; }
    #canvas { width: 100vw; height: 100vh; display: block; }
    #info {
      position: absolute;
      top: 10px;
      left: 10px;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 14px;
      background: rgba(0,0,0,0.5);
      padding: 10px;
      border-radius: 5px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div id="info">
    ?????????<br>
    ?????? | ???? | ????
  </div>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.185.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.185.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

    const canvas = document.getElementById('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a1a');

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const loader = new GLTFLoader();
    loader.load(
      '${dataUri}',
      (gltf) => {
        scene.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        let scale = 1;
        if (maxDim > 0) {
          scale = 5 / maxDim;
          gltf.scene.scale.setScalar(scale);
        }
        gltf.scene.position.sub(center.multiplyScalar(scale));
        controls.target.copy(gltf.scene.position);
        controls.update();
      }
    );

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;

          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `scene_${Date.now()}.html`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve();
        },
        (error: ErrorEvent) => reject(error),
        { binary: false }
      );
    });
  }, []);

  const exportScreenshot = useCallback((
    renderer: THREE.WebGLRenderer,
    filename?: string
  ): void => {
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename || `screenshot_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  return {
    exportGLB,
    exportGLTF,
    exportHTML,
    exportScreenshot,
  };
}
