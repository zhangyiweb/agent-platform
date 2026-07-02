import * as THREE from 'three';
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

const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.5 },
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

export type PostProcessRuntimeConfig = Record<string, unknown> & {
  enabled?: boolean;
  effect?: string;
};

export function collectOutlineTargets(scene: THREE.Scene): THREE.Object3D[] {
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
}

/** 将 scene.json 中的 postProcess 转为运行时扁平配置 */
export function normalizePostProcessConfig(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;
  const params = raw.params as Record<string, unknown> | undefined;
  if (params) {
    return {
      enabled: Boolean(raw.enabled),
      effect: String(raw.effect ?? 'none'),
      ...params,
    } as PostProcessRuntimeConfig;
  }
  return raw as PostProcessRuntimeConfig;
}

export function getEditorPostProcessConfig(): PostProcessRuntimeConfig | null {
  const cfg = (window as { __postProcessConfig?: PostProcessRuntimeConfig }).__postProcessConfig;
  if (!cfg?.enabled || cfg.effect === 'none') return null;
  return cfg;
}

export function updatePostProcessPass(pass: unknown, config: PostProcessRuntimeConfig, renderer: THREE.WebGLRenderer) {
  if (!pass || !config) return;
  const p = pass as Record<string, unknown>;

  if (p.threshold !== undefined && config.bloom) {
    const bloom = config.bloom as Record<string, number>;
    p.threshold = bloom.threshold;
    p.strength = bloom.intensity;
    p.radius = bloom.radius;
  }

  const uniforms = p.uniforms as Record<string, { value: THREE.Vector2 | number | boolean }> | undefined;
  const material = p.material as { fragmentShader?: string } | undefined;

  if (uniforms?.resolution && material?.fragmentShader?.includes('FXAA')) {
    const pr = renderer.getPixelRatio();
    (uniforms.resolution.value as THREE.Vector2).set(
      1 / (renderer.domElement.width * pr),
      1 / (renderer.domElement.height * pr)
    );
  }

  if (uniforms?.resolution && material?.fragmentShader?.includes('Sobel')) {
    (uniforms.resolution.value as THREE.Vector2).set(
      renderer.domElement.width,
      renderer.domElement.height
    );
  }

  if (uniforms?.amount && config.chromatic) {
    uniforms.amount.value = (config.chromatic as { amount: number }).amount;
  }

  if (uniforms?.pixelSize && config.pixelate) {
    uniforms.pixelSize.value = (config.pixelate as { size: number }).size;
    if (uniforms.resolution) {
      (uniforms.resolution.value as THREE.Vector2).set(
        renderer.domElement.width,
        renderer.domElement.height
      );
    }
  }

  if (uniforms?.darkness && config.vignette) {
    uniforms.darkness.value = (config.vignette as { darkness: number }).darkness;
  }

  if (uniforms?.intensity && config.film) {
    const film = config.film as { intensity: number; grayscale: boolean };
    uniforms.intensity.value = film.intensity;
    if (uniforms.grayscale) uniforms.grayscale.value = film.grayscale;
  }

  if (p.goWild !== undefined && config.glitch) {
    p.goWild = (config.glitch as { goWild: boolean }).goWild;
  }

  if (p.edgeStrength !== undefined && config.outline) {
    const outline = config.outline as Record<string, number>;
    p.edgeStrength = outline.edgeStrength;
    p.edgeGlow = outline.edgeGlow;
    p.edgeThickness = outline.edgeThickness;
    p.pulsePeriod = outline.pulsePeriod;
  }

  if (uniforms?.focus && config.bokeh) {
    const bokeh = config.bokeh as Record<string, number>;
    uniforms.focus.value = bokeh.focus;
    uniforms.aperture.value = bokeh.aperture;
    uniforms.maxblur.value = bokeh.maxblur;
  }

  if (p.damp !== undefined && config.afterimage) {
    p.damp = (config.afterimage as { damp: number }).damp;
  }

  if (uniforms?.radius && config.halftone) {
    const halftone = config.halftone as Record<string, number>;
    uniforms.radius.value = halftone.radius;
    uniforms.scatter.value = halftone.scatter;
    uniforms.blending.value = halftone.blending;
  }

  if (uniforms?.scale && uniforms?.angle && config.dotscreen) {
    const dotscreen = config.dotscreen as Record<string, number>;
    uniforms.scale.value = dotscreen.scale;
    uniforms.angle.value = dotscreen.angle;
  }

  const params = p.params as Record<string, number> | undefined;
  if (params && config.sao) {
    const sao = config.sao as Record<string, number>;
    params.saoBias = sao.bias;
    params.saoIntensity = sao.intensity;
    params.saoScale = sao.scale;
    params.saoKernelRadius = sao.kernelRadius;
  }

  if (p.kernelRadius !== undefined && config.ssao) {
    const ssao = config.ssao as Record<string, number>;
    p.kernelRadius = ssao.kernelRadius;
    p.minDistance = ssao.minDistance;
    p.maxDistance = ssao.maxDistance;
  }

  if (p.pixelSize !== undefined && config.pixelated) {
    p.pixelSize = (config.pixelated as { size: number }).size;
  }
}

function createEffectPass(
  effectName: string,
  config: PostProcessRuntimeConfig,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
) {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;

  switch (effectName) {
    case 'bloom': {
      const bloom = (config.bloom ?? {}) as Record<string, number>;
      return new UnrealBloomPass(
        new THREE.Vector2(width, height),
        bloom.intensity || 1.0,
        bloom.radius || 0.4,
        bloom.threshold || 0.85
      );
    }
    case 'fxaa': {
      const pass = new ShaderPass(FXAAShader);
      const pr = renderer.getPixelRatio();
      pass.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
      return pass;
    }
    case 'sobel': {
      const pass = new ShaderPass(SobelOperatorShader);
      pass.uniforms.resolution.value.set(width, height);
      return pass;
    }
    case 'chromatic': {
      const pass = new ShaderPass(chromaticAberrationShader);
      if (config.chromatic) {
        pass.uniforms.amount.value = (config.chromatic as { amount: number }).amount || 0.002;
      }
      return pass;
    }
    case 'pixelate': {
      const pixelate = (config.pixelate ?? {}) as { size?: number };
      return new ShaderPass({
        ...pixelationShader,
        uniforms: {
          ...pixelationShader.uniforms,
          pixelSize: { value: pixelate.size || 2.0 },
          resolution: { value: new THREE.Vector2(width, height) },
        },
      });
    }
    case 'vignette': {
      const vignette = (config.vignette ?? {}) as { darkness?: number };
      return new ShaderPass({
        ...vignetteShader,
        uniforms: {
          ...vignetteShader.uniforms,
          darkness: { value: vignette.darkness || 0.5 },
        },
      });
    }
    case 'film': {
      const film = (config.film ?? {}) as { intensity?: number; grayscale?: boolean };
      return new FilmPass(film.intensity ?? 0.25, film.grayscale ?? false);
    }
    case 'glitch': {
      const glitch = (config.glitch ?? {}) as { dtSize?: number; goWild?: boolean };
      const pass = new GlitchPass(glitch.dtSize ?? 64);
      pass.goWild = glitch.goWild ?? false;
      return pass;
    }
    case 'outline': {
      const outline = (config.outline ?? {}) as Record<string, number>;
      const pass = new OutlinePass(new THREE.Vector2(width, height), scene, camera, collectOutlineTargets(scene));
      pass.edgeStrength = outline.edgeStrength ?? 3.0;
      pass.edgeGlow = outline.edgeGlow ?? 0.5;
      pass.edgeThickness = outline.edgeThickness ?? 1.0;
      pass.pulsePeriod = outline.pulsePeriod ?? 0;
      pass.visibleEdgeColor.set(0x00aaff);
      pass.hiddenEdgeColor.set(0x190a05);
      return pass;
    }
    case 'bokeh': {
      const bokeh = (config.bokeh ?? {}) as Record<string, number>;
      return new BokehPass(scene, camera, {
        focus: bokeh.focus ?? 1.0,
        aperture: bokeh.aperture ?? 0.0001,
        maxblur: bokeh.maxblur ?? 0.01,
      });
    }
    case 'afterimage': {
      const afterimage = (config.afterimage ?? {}) as { damp?: number };
      return new AfterimagePass(afterimage.damp ?? 0.88);
    }
    case 'halftone': {
      const halftone = (config.halftone ?? {}) as Record<string, number>;
      return new HalftonePass({
        radius: halftone.radius ?? 4,
        rotateR: (-15 * Math.PI) / 180,
        rotateG: (45 * Math.PI) / 180,
        rotateB: (30 * Math.PI) / 180,
        scatter: halftone.scatter ?? 0.2,
        blending: halftone.blending ?? 1,
        shape: 1,
      });
    }
    case 'dotscreen': {
      const dotscreen = (config.dotscreen ?? {}) as Record<string, number>;
      return new DotScreenPass(
        new THREE.Vector2(0, 0),
        dotscreen.angle ?? 0.785,
        dotscreen.scale ?? 0.8
      );
    }
    case 'sao': {
      const sao = (config.sao ?? {}) as Record<string, number>;
      const pass = new SAOPass(scene, camera, new THREE.Vector2(width, height));
      pass.params.saoBias = sao.bias || 0.5;
      pass.params.saoIntensity = sao.intensity || 0.000005;
      pass.params.saoScale = sao.scale || 10;
      pass.params.saoKernelRadius = sao.kernelRadius || 40;
      pass.params.saoMinResolution = sao.minResolution || 0;
      return pass;
    }
    case 'ssao': {
      const ssao = (config.ssao ?? {}) as Record<string, number>;
      const pass = new SSAOPass(scene, camera, width, height);
      pass.kernelRadius = ssao.kernelRadius || 8;
      pass.minDistance = ssao.minDistance || 0.005;
      pass.maxDistance = ssao.maxDistance || 0.1;
      return pass;
    }
    case 'pixelated': {
      const pixelated = (config.pixelated ?? {}) as { size?: number };
      return new RenderPixelatedPass(pixelated.size ?? 6, scene, camera);
    }
    default:
      return null;
  }
}

export interface PostProcessPipeline {
  composer: EffectComposer;
  effectPass: unknown;
  effectName: string;
  render: () => void;
  setSize: (width: number, height: number) => void;
  updateConfig: (config: PostProcessRuntimeConfig) => void;
  dispose: () => void;
}

export function createPostProcessPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  effectName: string,
  config: PostProcessRuntimeConfig
): PostProcessPipeline | null {
  if (!effectName || effectName === 'none') return null;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const effectPass = createEffectPass(effectName, config, renderer, scene, camera);
  if (!effectPass) {
    composer.dispose();
    return null;
  }

  composer.addPass(effectPass);
  composer.addPass(new OutputPass());

  return {
    composer,
    effectPass,
    effectName,
    render: () => composer.render(),
    setSize: (width, height) => composer.setSize(width, height),
    updateConfig: (nextConfig) => updatePostProcessPass(effectPass, nextConfig, renderer),
    dispose: () => composer.dispose(),
  };
}
