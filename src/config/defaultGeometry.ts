import * as THREE from 'three';
import type { MaterialParams } from '@/types/scene';

/** 基础几何体默认材质（与材质编辑器初始值一致） */
export const DEFAULT_PRIMITIVE_MATERIAL: Required<MaterialParams> & {
  wireframe: boolean;
  side: THREE.Side;
} = {
  color: '#f5f5f0',
  metalness: 0.05,
  roughness: 0.65,
  opacity: 1,
  emissive: '#000000',
  emissiveIntensity: 0,
  wireframe: false,
  side: THREE.FrontSide,
};

/** 线框 / 边缘线默认颜色 */
export const DEFAULT_LINE_COLOR = '#e8e8e8';

export type PrimitiveGeometryType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'plane'
  | 'cone'
  | 'capsule'
  | 'circle'
  | 'dodecahedron'
  | 'icosahedron'
  | 'octahedron'
  | 'tetrahedron'
  | 'torus'
  | 'torusKnot'
  | 'ring'
  | 'edges'
  | 'wireframe';

export interface PrimitivePreset {
  name: string;
  kind: 'mesh' | 'line';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  castShadow: boolean;
  receiveShadow: boolean;
  material?: Partial<typeof DEFAULT_PRIMITIVE_MATERIAL>;
  createObject: () => THREE.Object3D;
}

export function createDefaultMeshMaterial(
  overrides?: Partial<typeof DEFAULT_PRIMITIVE_MATERIAL>
): THREE.MeshStandardMaterial {
  const opts = { ...DEFAULT_PRIMITIVE_MATERIAL, ...overrides };
  return new THREE.MeshStandardMaterial({
    color: opts.color,
    metalness: opts.metalness,
    roughness: opts.roughness,
    opacity: opts.opacity,
    transparent: opts.opacity < 1,
    emissive: opts.emissive,
    emissiveIntensity: opts.emissiveIntensity,
    wireframe: opts.wireframe,
    side: opts.side,
  });
}

export function createDefaultLineMaterial(color = DEFAULT_LINE_COLOR): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color });
}

const MESH_DEFAULTS = {
  position: [0, 0.5, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
  castShadow: true,
  receiveShadow: true,
};

const FLAT_DEFAULTS = {
  position: [0, 0, 0] as [number, number, number],
  rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
  castShadow: true,
  receiveShadow: true,
  material: { side: THREE.DoubleSide } as Partial<typeof DEFAULT_PRIMITIVE_MATERIAL>,
};

export const PRIMITIVE_PRESETS: Record<PrimitiveGeometryType, PrimitivePreset> = {
  box: {
    name: '立方体',
    kind: 'mesh',
    ...MESH_DEFAULTS,
    createObject: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createDefaultMeshMaterial()),
  },
  sphere: {
    name: '球体',
    kind: 'mesh',
    ...MESH_DEFAULTS,
    createObject: () =>
      new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), createDefaultMeshMaterial()),
  },
  cylinder: {
    name: '圆柱体',
    kind: 'mesh',
    ...MESH_DEFAULTS,
    createObject: () =>
      new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), createDefaultMeshMaterial()),
  },
  plane: {
    name: '平面',
    kind: 'mesh',
    ...FLAT_DEFAULTS,
    createObject: () =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        createDefaultMeshMaterial(FLAT_DEFAULTS.material)
      ),
  },
  cone: {
    name: '圆锥体',
    kind: 'mesh',
    ...MESH_DEFAULTS,
    createObject: () =>
      new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), createDefaultMeshMaterial()),
  },
  capsule: {
    name: '胶囊体',
    kind: 'mesh',
    position: [0, 0.6, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 16, 32), createDefaultMeshMaterial()),
  },
  circle: {
    name: '圆形',
    kind: 'mesh',
    ...FLAT_DEFAULTS,
    createObject: () =>
      new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 32),
        createDefaultMeshMaterial(FLAT_DEFAULTS.material)
      ),
  },
  dodecahedron: {
    name: '十二面体',
    kind: 'mesh',
    position: [0, 0.6, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), createDefaultMeshMaterial()),
  },
  icosahedron: {
    name: '二十面体',
    kind: 'mesh',
    position: [0, 0.6, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(new THREE.IcosahedronGeometry(0.6), createDefaultMeshMaterial()),
  },
  octahedron: {
    name: '八面体',
    kind: 'mesh',
    position: [0, 0.6, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(new THREE.OctahedronGeometry(0.6), createDefaultMeshMaterial()),
  },
  tetrahedron: {
    name: '四面体',
    kind: 'mesh',
    position: [0, 0.6, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(new THREE.TetrahedronGeometry(0.6), createDefaultMeshMaterial()),
  },
  torus: {
    name: '圆环体',
    kind: 'mesh',
    position: [0, 0.2, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.2, 16, 100), createDefaultMeshMaterial()),
  },
  torusKnot: {
    name: '圆环结',
    kind: 'mesh',
    position: [0, 0.35, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
    createObject: () =>
      new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.4, 0.15, 100, 16),
        createDefaultMeshMaterial()
      ),
  },
  ring: {
    name: '圆环',
    kind: 'mesh',
    ...FLAT_DEFAULTS,
    createObject: () =>
      new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.6, 32),
        createDefaultMeshMaterial(FLAT_DEFAULTS.material)
      ),
  },
  edges: {
    name: '硬边线',
    kind: 'line',
    ...MESH_DEFAULTS,
    castShadow: false,
    receiveShadow: false,
    createObject: () =>
      new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        createDefaultLineMaterial()
      ),
  },
  wireframe: {
    name: '三角线框',
    kind: 'mesh',
    ...MESH_DEFAULTS,
    castShadow: false,
    receiveShadow: false,
    createObject: () =>
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        createDefaultMeshMaterial({ wireframe: true })
      ),
  },
};

export function createPrimitiveObject(type: PrimitiveGeometryType): {
  object: THREE.Object3D;
  preset: PrimitivePreset;
} {
  const preset = PRIMITIVE_PRESETS[type];
  const object = preset.createObject();
  object.position.set(...preset.position);
  object.rotation.set(...preset.rotation);
  object.scale.set(...preset.scale);

  if (object instanceof THREE.Mesh) {
    object.castShadow = preset.castShadow;
    object.receiveShadow = preset.receiveShadow;
  }

  return { object, preset };
}
