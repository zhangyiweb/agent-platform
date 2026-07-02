/** 导出项目包中的 postProcess.js（与编辑器后期管线一致） */
export function buildPostProcessJs(): string {
  return `import * as THREE from 'three';
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
  vertexShader: \`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  \`,
  fragmentShader: \`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;
    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      gl_FragColor = texture2D(tDiffuse, coord);
    }
  \`,
};

const chromaticAberrationShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.002 } },
  vertexShader: \`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  \`,
  fragmentShader: \`
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
  \`,
};

const vignetteShader = {
  uniforms: { tDiffuse: { value: null }, darkness: { value: 0.5 } },
  vertexShader: \`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  \`,
  fragmentShader: \`
    uniform sampler2D tDiffuse;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(darkness);
      float vig = 1.0 - dot(uv, uv);
      gl_FragColor = vec4(texel.rgb * vig, texel.a);
    }
  \`,
};

export function normalizePostProcessConfig(raw) {
  if (!raw) return null;
  if (raw.params) {
    return { enabled: Boolean(raw.enabled), effect: String(raw.effect ?? 'none'), ...raw.params };
  }
  return raw;
}

function collectOutlineTargets(scene) {
  const targets = [];
  scene.traverse((child) => {
    if (child.isMesh && child.name !== 'grid' && child.name !== 'axes' && !child.name.startsWith('helper_')) {
      targets.push(child);
    }
  });
  return targets;
}

function updatePostProcessPass(pass, config, renderer) {
  if (!pass || !config) return;
  if (pass.threshold !== undefined && config.bloom) {
    pass.threshold = config.bloom.threshold;
    pass.strength = config.bloom.intensity;
    pass.radius = config.bloom.radius;
  }
  if (pass.uniforms?.resolution && pass.material?.fragmentShader?.includes('FXAA')) {
    const pr = renderer.getPixelRatio();
    pass.uniforms.resolution.value.set(1 / (renderer.domElement.width * pr), 1 / (renderer.domElement.height * pr));
  }
  if (pass.uniforms?.resolution && pass.material?.fragmentShader?.includes('Sobel')) {
    pass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
  }
  if (pass.uniforms?.amount && config.chromatic) pass.uniforms.amount.value = config.chromatic.amount;
  if (pass.uniforms?.pixelSize && config.pixelate) {
    pass.uniforms.pixelSize.value = config.pixelate.size;
    if (pass.uniforms.resolution) pass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
  }
  if (pass.uniforms?.darkness && config.vignette) pass.uniforms.darkness.value = config.vignette.darkness;
  if (pass.uniforms?.intensity && config.film) {
    pass.uniforms.intensity.value = config.film.intensity;
    if (pass.uniforms.grayscale) pass.uniforms.grayscale.value = config.film.grayscale;
  }
  if (pass.goWild !== undefined && config.glitch) pass.goWild = config.glitch.goWild;
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
  if (pass.damp !== undefined && config.afterimage) pass.damp = config.afterimage.damp;
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
  if (pass.pixelSize !== undefined && config.pixelated) pass.pixelSize = config.pixelated.size;
}

function createEffectPass(effectName, config, renderer, scene, camera) {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  switch (effectName) {
    case 'bloom':
      return new UnrealBloomPass(
        new THREE.Vector2(width, height),
        config.bloom?.intensity ?? 1,
        config.bloom?.radius ?? 0.4,
        config.bloom?.threshold ?? 0.85
      );
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
      pass.uniforms.amount.value = config.chromatic?.amount ?? 0.002;
      return pass;
    }
    case 'pixelate':
      return new ShaderPass({
        ...pixelationShader,
        uniforms: {
          ...pixelationShader.uniforms,
          pixelSize: { value: config.pixelate?.size ?? 2 },
          resolution: { value: new THREE.Vector2(width, height) },
        },
      });
    case 'vignette':
      return new ShaderPass({
        ...vignetteShader,
        uniforms: { ...vignetteShader.uniforms, darkness: { value: config.vignette?.darkness ?? 0.5 } },
      });
    case 'film':
      return new FilmPass(config.film?.intensity ?? 0.25, config.film?.grayscale ?? false);
    case 'glitch': {
      const pass = new GlitchPass(config.glitch?.dtSize ?? 64);
      pass.goWild = config.glitch?.goWild ?? false;
      return pass;
    }
    case 'outline': {
      const pass = new OutlinePass(new THREE.Vector2(width, height), scene, camera, collectOutlineTargets(scene));
      pass.edgeStrength = config.outline?.edgeStrength ?? 3;
      pass.edgeGlow = config.outline?.edgeGlow ?? 0.5;
      pass.edgeThickness = config.outline?.edgeThickness ?? 1;
      pass.pulsePeriod = config.outline?.pulsePeriod ?? 0;
      pass.visibleEdgeColor.set(0x00aaff);
      pass.hiddenEdgeColor.set(0x190a05);
      return pass;
    }
    case 'bokeh':
      return new BokehPass(scene, camera, {
        focus: config.bokeh?.focus ?? 1,
        aperture: config.bokeh?.aperture ?? 0.0001,
        maxblur: config.bokeh?.maxblur ?? 0.01,
      });
    case 'afterimage':
      return new AfterimagePass(config.afterimage?.damp ?? 0.88);
    case 'halftone':
      return new HalftonePass({
        radius: config.halftone?.radius ?? 4,
        rotateR: -15 * Math.PI / 180,
        rotateG: 45 * Math.PI / 180,
        rotateB: 30 * Math.PI / 180,
        scatter: config.halftone?.scatter ?? 0.2,
        blending: config.halftone?.blending ?? 1,
        shape: 1,
      });
    case 'dotscreen':
      return new DotScreenPass(new THREE.Vector2(0, 0), config.dotscreen?.angle ?? 0.785, config.dotscreen?.scale ?? 0.8);
    case 'sao': {
      const pass = new SAOPass(scene, camera, new THREE.Vector2(width, height));
      pass.params.saoBias = config.sao?.bias ?? 0.5;
      pass.params.saoIntensity = config.sao?.intensity ?? 0.000005;
      pass.params.saoScale = config.sao?.scale ?? 10;
      pass.params.saoKernelRadius = config.sao?.kernelRadius ?? 40;
      return pass;
    }
    case 'ssao': {
      const pass = new SSAOPass(scene, camera, width, height);
      pass.kernelRadius = config.ssao?.kernelRadius ?? 8;
      pass.minDistance = config.ssao?.minDistance ?? 0.005;
      pass.maxDistance = config.ssao?.maxDistance ?? 0.1;
      return pass;
    }
    case 'pixelated':
      return new RenderPixelatedPass(config.pixelated?.size ?? 6, scene, camera);
    default:
      return null;
  }
}

export function createPostProcessPipeline(renderer, scene, camera, config) {
  if (!config?.enabled || !config.effect || config.effect === 'none') return null;
  const effectPass = createEffectPass(config.effect, config, renderer, scene, camera);
  if (!effectPass) return null;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(effectPass);
  composer.addPass(new OutputPass());

  return {
    composer,
    effectPass,
    config,
    render() {
      updatePostProcessPass(effectPass, config, renderer);
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
    },
    dispose() {
      composer.dispose();
    },
  };
}
`;
}
