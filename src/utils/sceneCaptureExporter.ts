import JSZip from 'jszip';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import * as THREE from 'three';
import type { CameraTour } from '@/types/cameraTour';
import { normalizeCameraTour } from '@/types/cameraTour';
import { CameraTourPlayer } from '@/utils/cameraTourPlayer';
import { getSplineDuration } from '@/utils/cameraTourSpline';
import {
  lockSceneCaptureVisuals,
  removeTourPathVisual,
  resetSceneCaptureVisualsLock,
  stripTourPathVisualForRender,
  syncTourPathVisual,
} from '@/utils/cameraTourVisual';
import { useTourStore } from '@/store/tourStore';
import {
  hideEditorHelpersForCapture,
  restoreEditorHelpersAfterCapture,
  syncEditorGridAxesVisibility,
} from '@/utils/sceneUtils';
import {
  createPostProcessPipeline,
  getEditorPostProcessConfig,
  type PostProcessPipeline,
} from '@/utils/postProcessComposer';

export interface CaptureScreenshotOptions {
  width?: number;
  height?: number;
  transparent?: boolean;
  filename?: string;
}

export interface RecordTourOptions {
  width?: number;
  height?: number;
  transparent?: boolean;
  fps?: number;
  /** webm / mp4：视频；frames：PNG 帧序列 ZIP */
  format: 'webm' | 'mp4' | 'frames';
  tour: CameraTour;
  onProgress?: (progress: number) => void;
}

interface EditorCaptureContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sourceRenderer: THREE.WebGLRenderer;
}

const MAX_CAPTURE_SIZE = 8192;

function getEditorCaptureContext(): EditorCaptureContext | null {
  const scene = (window as { __editorScene?: THREE.Scene }).__editorScene;
  const camera = (window as { __editorCamera?: THREE.PerspectiveCamera }).__editorCamera;
  const sourceRenderer = (window as { __editorRenderer?: THREE.WebGLRenderer }).__editorRenderer;
  if (!scene || !camera || !sourceRenderer) return null;
  return { scene, camera, sourceRenderer };
}

function clampCaptureSize(value: number, fallback: number): number {
  return Math.max(64, Math.min(MAX_CAPTURE_SIZE, value || fallback));
}

/** VP9 编码要求宽高为偶数 */
function toEvenSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(64, width - (width % 2)),
    height: Math.max(64, height - (height % 2)),
  };
}

function estimateTourDuration(tour: CameraTour, fromTourStart = false): number {
  const normalized = normalizeCameraTour(tour);
  if (normalized.stops.length === 0) return 0;

  if (normalized.mode === 'spline') {
    return getSplineDuration(normalized);
  }

  let total = 0;
  normalized.stops.forEach((stop, index) => {
    if (!fromTourStart || index > 0) {
      total += Math.max(stop.transitionTime, 0.001);
    }
    total += stop.dwellTime;
  });
  return total;
}

function createCaptureRenderer(
  sourceRenderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  transparent: boolean
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: transparent,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = sourceRenderer.shadowMap.enabled;
  renderer.shadowMap.type = sourceRenderer.shadowMap.type;
  renderer.shadowMap.autoUpdate = true;
  renderer.toneMapping = sourceRenderer.toneMapping;
  renderer.toneMappingExposure = sourceRenderer.toneMappingExposure;
  renderer.outputColorSpace = sourceRenderer.outputColorSpace;
  return renderer;
}

function applyCaptureClearColor(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  transparent: boolean
) {
  if (transparent) {
    renderer.setClearColor(0x000000, 0);
  } else if (scene.background instanceof THREE.Color) {
    renderer.setClearColor(scene.background, 1);
  } else {
    renderer.setClearColor(0x1a1a1a, 1);
  }
}

interface CaptureRenderContext {
  renderer: THREE.WebGLRenderer;
  postPipeline: PostProcessPipeline | null;
  renderFrame: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    transparent: boolean,
    stripTourVisuals?: boolean
  ) => void;
  dispose: () => void;
}

function createCaptureRenderContext(
  sourceRenderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  transparent: boolean
): CaptureRenderContext {
  const renderer = createCaptureRenderer(sourceRenderer, width, height, transparent);
  const postConfig = getEditorPostProcessConfig();
  const postPipeline =
    postConfig && postConfig.effect
      ? createPostProcessPipeline(renderer, scene, camera, String(postConfig.effect), postConfig)
      : null;

  if (postPipeline) {
    postPipeline.setSize(width, height);
  }

  return {
    renderer,
    postPipeline,
    renderFrame(sceneToRender, cameraToRender, transparentFlag, stripTourVisuals = false) {
      if (stripTourVisuals) {
        stripTourPathVisualForRender(sceneToRender);
      }
      applyCaptureClearColor(renderer, sceneToRender, transparentFlag);

      if (postPipeline && postConfig) {
        postPipeline.updateConfig(postConfig);
        postPipeline.render();
      } else {
        renderer.render(sceneToRender, cameraToRender);
      }
    },
    dispose() {
      postPipeline?.dispose();
      renderer.dispose();
    },
  };
}

function createTourRecordControls(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  return {
    target,
    enabled: true,
    update: () => {
      camera.lookAt(target);
    },
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('截图生成失败'));
    }, type);
  });
}

function calcVideoBitrate(width: number, height: number, fps: number): number {
  const pixels = width * height;
  const base = pixels * fps * 0.12;
  return Math.max(12_000_000, Math.min(80_000_000, Math.round(base)));
}

async function resolveWebmEncoderConfig(
  width: number,
  height: number,
  fps: number
): Promise<{ muxCodec: 'V_VP9' | 'V_VP8'; config: VideoEncoderConfig }> {
  const bitrate = calcVideoBitrate(width, height, fps);
  const candidates = [
    { codec: 'vp09.00.10.08', muxCodec: 'V_VP9' as const },
    { codec: 'vp8', muxCodec: 'V_VP8' as const },
  ];

  for (const candidate of candidates) {
    const config: VideoEncoderConfig = {
      codec: candidate.codec,
      width,
      height,
      bitrate,
      framerate: fps,
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) {
      return {
        muxCodec: candidate.muxCodec,
        config: support.config ?? config,
      };
    }
  }

  throw new Error('当前浏览器不支持 WebM 视频编码，请改用其他格式');
}

async function resolveMp4EncoderConfig(
  width: number,
  height: number,
  fps: number
): Promise<VideoEncoderConfig> {
  const bitrate = calcVideoBitrate(width, height, fps);
  const candidates = ['avc1.42E01E', 'avc1.4D401E', 'avc1.640028'];

  for (const codec of candidates) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) {
      return support.config ?? config;
    }
  }

  throw new Error('当前浏览器不支持 MP4 编码');
}

/** 检测当前浏览器是否支持 H.264 MP4 导出 */
export async function isMp4ExportSupported(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const { width, height } = toEvenSize(1920, 1080);
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42E01E',
      width,
      height,
      bitrate: 12_000_000,
      framerate: 30,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

/** 离屏逐帧渲染并用 WebCodecs 编码，保证时间轴与帧率准确 */
async function encodeVideoFromCanvas(
  canvas: HTMLCanvasElement,
  renderFrame: (frameIndex: number) => boolean,
  width: number,
  height: number,
  fps: number,
  totalFrames: number,
  container: 'webm' | 'mp4',
  onProgress?: (progress: number) => void
): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('当前浏览器不支持 WebCodecs，请改用「PNG 帧序列」导出');
  }

  const { width: evenWidth, height: evenHeight } = toEvenSize(width, height);
  const frameDurationUs = Math.round(1_000_000 / fps);

  let videoEncoder: VideoEncoder;
  let finalizeMuxer: () => void;
  let getBuffer: () => ArrayBuffer;
  let mimeType: string;

  if (container === 'mp4') {
    const encoderConfig = await resolveMp4EncoderConfig(evenWidth, evenHeight, fps);
    const muxer = new Mp4Muxer({
      target: new Mp4ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: evenWidth,
        height: evenHeight,
      },
      fastStart: 'in-memory',
    });
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        throw error;
      },
    });
    videoEncoder.configure(encoderConfig);
    finalizeMuxer = () => muxer.finalize();
    getBuffer = () => muxer.target.buffer;
    mimeType = 'video/mp4';
  } else {
    const { muxCodec, config: encoderConfig } = await resolveWebmEncoderConfig(
      evenWidth,
      evenHeight,
      fps
    );
    const muxer = new WebmMuxer({
      target: new WebmArrayBufferTarget(),
      video: {
        codec: muxCodec,
        width: evenWidth,
        height: evenHeight,
        frameRate: fps,
      },
    });
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        throw error;
      },
    });
    videoEncoder.configure(encoderConfig);
    finalizeMuxer = () => muxer.finalize();
    getBuffer = () => muxer.target.buffer;
    mimeType = 'video/webm';
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const shouldContinue = renderFrame(frame);
    if (!shouldContinue) break;

    const videoFrame = new VideoFrame(canvas, {
      timestamp: frame * frameDurationUs,
      duration: frameDurationUs,
    });
    videoEncoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
    videoFrame.close();

    onProgress?.(Math.min(1, (frame + 1) / totalFrames));

    if (frame % 4 === 3) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  await videoEncoder.flush();
  finalizeMuxer();
  return new Blob([getBuffer()], { type: mimeType });
}

interface SceneCaptureFinalizeParams {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  helperSnapshot: Map<THREE.Object3D, boolean>;
  prevBg: THREE.Color | THREE.Texture | null;
  prevAspect: number;
  tour?: CameraTour | null;
  captureContext?: CaptureRenderContext | null;
  player?: CameraTourPlayer | null;
}

/** 无论录制/截图成功与否，都必须执行以恢复编辑器辅助显示 */
function finalizeSceneCapture({
  scene,
  camera,
  helperSnapshot,
  prevBg,
  prevAspect,
  tour,
  captureContext,
  player,
}: SceneCaptureFinalizeParams) {
  try {
    player?.stop();
  } catch {
    // 忽略播放器停止异常，确保后续恢复逻辑继续执行
  }

  scene.background = prevBg;
  camera.aspect = prevAspect;
  camera.updateProjectionMatrix();
  restoreEditorHelpersAfterCapture(helperSnapshot);
  syncEditorGridAxesVisibility(scene);
  resetSceneCaptureVisualsLock();

  const tourToSync = tour ?? useTourStore.getState().getActiveTour();
  syncTourPathVisual(scene, tourToSync ? normalizeCameraTour(tourToSync) : null);

  try {
    captureContext?.dispose();
  } catch {
    // 忽略 dispose 异常
  }
}

/** 自定义分辨率截图（支持透明背景） */
export async function captureScreenshot(options: CaptureScreenshotOptions = {}): Promise<void> {
  const ctx = getEditorCaptureContext();
  if (!ctx) throw new Error('场景尚未初始化');

  const { scene, camera, sourceRenderer } = ctx;
  const width = clampCaptureSize(options.width ?? sourceRenderer.domElement.width, 1920);
  const height = clampCaptureSize(options.height ?? sourceRenderer.domElement.height, 1080);
  const transparent = Boolean(options.transparent);

  const prevAspect = camera.aspect;
  const prevBg = scene.background;
  const tourForRestore = useTourStore.getState().getActiveTour();
  const helperSnapshot = hideEditorHelpersForCapture(scene);
  lockSceneCaptureVisuals();
  removeTourPathVisual(scene);

  let captureContext: CaptureRenderContext | null = null;

  try {
    captureContext = createCaptureRenderContext(sourceRenderer, scene, camera, width, height, transparent);
    const captureRenderer = captureContext.renderer;

    if (transparent) {
      scene.background = null;
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    captureContext.renderFrame(scene, camera, transparent, true);
    const blob = await canvasToBlob(captureRenderer.domElement);
    const suffix = transparent ? 'transparent' : 'screenshot';
    downloadBlob(blob, options.filename ?? `${suffix}_${width}x${height}_${Date.now()}.png`);
  } finally {
    finalizeSceneCapture({
      scene,
      camera,
      helperSnapshot,
      prevBg,
      prevAspect,
      tour: tourForRestore,
      captureContext,
    });
  }
}

/** 按漫游路线录制 WebM / MP4 视频或 PNG 帧序列 */
export async function recordCameraTour(options: RecordTourOptions): Promise<void> {
  const ctx = getEditorCaptureContext();
  if (!ctx) throw new Error('场景尚未初始化');

  const { scene, camera, sourceRenderer } = ctx;
  const tour = normalizeCameraTour(options.tour);
  if (tour.stops.length === 0) {
    throw new Error('当前漫游路线没有站点');
  }
  if (tour.mode === 'spline' && tour.stops.length < 2) {
    throw new Error('一镜到底模式至少需要 2 个漫游点');
  }

  const width = clampCaptureSize(options.width ?? 1920, 1920);
  const height = clampCaptureSize(options.height ?? 1080, 1080);
  const transparent = Boolean(options.transparent);
  const fps = Math.max(1, Math.min(60, options.fps ?? 60));
  const duration = estimateTourDuration(tour, true);
  if (duration <= 0) throw new Error('无法计算漫游时长');

  const totalFrames = Math.ceil(duration * fps);
  const prevAspect = camera.aspect;
  const prevBg = scene.background;
  const helperSnapshot = hideEditorHelpersForCapture(scene);
  lockSceneCaptureVisuals();
  removeTourPathVisual(scene);

  let captureContext: CaptureRenderContext | null = null;
  let player: CameraTourPlayer | null = null;

  try {
    const recordCamera = new THREE.PerspectiveCamera(
      camera.fov,
      width / height,
      camera.near,
      camera.far
    );
    recordCamera.position.copy(camera.position);
    recordCamera.rotation.copy(camera.rotation);

    const controlsTarget = new THREE.Vector3();
    const controls = createTourRecordControls(recordCamera, controlsTarget);
    player = new CameraTourPlayer(recordCamera, controls, tour, {});

    captureContext = createCaptureRenderContext(sourceRenderer, scene, recordCamera, width, height, transparent);
    const captureRenderer = captureContext.renderer;

    player.playFromTourStart();

    if (transparent) {
      scene.background = null;
    }

    const renderTourFrame = (frameIndex: number): boolean => {
      if (player!.getState() === 'idle' && frameIndex > 0) return false;
      if (frameIndex > 0) player!.update(1 / fps);
      captureContext!.renderFrame(scene, recordCamera, transparent, true);
      return true;
    };

    if (options.format === 'frames') {
      const frames: Blob[] = [];

      for (let frame = 0; frame < totalFrames; frame++) {
        if (!renderTourFrame(frame)) break;
        frames.push(await canvasToBlob(captureRenderer.domElement));
        options.onProgress?.(Math.min(1, (frame + 1) / totalFrames));

        if (frame % 4 === 3) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const zip = new JSZip();
      const folder = zip.folder(`camera-tour-frames-${Date.now()}`);
      if (!folder) throw new Error('无法创建帧序列目录');

      frames.forEach((blob, index) => {
        folder.file(`frame_${String(index).padStart(5, '0')}.png`, blob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `camera-tour-frames_${width}x${height}.zip`);
      return;
    }

    if (options.format === 'mp4' && transparent) {
      throw new Error('MP4 格式不支持透明背景，请关闭透明背景或改用 WebM / 帧序列');
    }

    const container = options.format === 'mp4' ? 'mp4' : 'webm';
    const videoBlob = await encodeVideoFromCanvas(
      captureRenderer.domElement,
      renderTourFrame,
      width,
      height,
      fps,
      totalFrames,
      container,
      options.onProgress
    );
    const ext = container === 'mp4' ? 'mp4' : 'webm';
    downloadBlob(videoBlob, `camera-tour_${width}x${height}_${Date.now()}.${ext}`);
  } finally {
    finalizeSceneCapture({
      scene,
      camera,
      helperSnapshot,
      prevBg,
      prevAspect,
      tour,
      captureContext,
      player,
    });
  }
}
