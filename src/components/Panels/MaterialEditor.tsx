import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { TextureAnimationSection } from './TextureAnimationSection';

interface MaterialEditorProps {
  material: THREE.Material | null;
  object3D: THREE.Object3D | null;
  onMaterialChange: (material: THREE.Material) => void;
}

// 材质类型列表 (17种)
const materialTypes = [
  'MeshBasicMaterial',
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'MeshLambertMaterial',
  'MeshPhongMaterial',
  'MeshNormalMaterial',
  'MeshMatcapMaterial',
  'MeshDepthMaterial',
  'MeshDistanceMaterial',
  'MeshToonMaterial',
  'PointsMaterial',
  'ShadowMaterial',
  'SpriteMaterial',
  'MeshBasicNodeMaterial',
  'MeshLambertNodeMaterial',
  'MeshMatcapNodeMaterial',
  'MeshNormalNodeMaterial',
  'MeshPhongNodeMaterial',
  'MeshPhysicalNodeMaterial',
  'MeshSSSNodeMaterial',
  'MeshStandardNodeMaterial',
];

export function MaterialEditor({ material, object3D, onMaterialChange }: MaterialEditorProps) {
  const [selectedType, setSelectedType] = useState<string>('MeshStandardMaterial');
  const [originalMaterial, setOriginalMaterial] = useState<THREE.Material | null>(null); // 保存初始材质
  
  // 基础参数 (所有材质通用)
  const [color, setColor] = useState<string>('#6366f1');
  const [opacity, setOpacity] = useState<number>(1.0);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [side, setSide] = useState<number>(THREE.FrontSide);
  const [flatShading, setFlatShading] = useState<boolean>(false);
  const [transparent, setTransparent] = useState<boolean>(false);
  const [depthWrite, setDepthWrite] = useState<boolean>(true);
  const [fog, setFog] = useState<boolean>(true);
  
  // 贴图参数 (MeshStandardMaterial, MeshPhysicalMaterial等)
  const [metalness, setMetalness] = useState<number>(0.5);
  const [roughness, setRoughness] = useState<number>(0.5);
  const [emissive, setEmissive] = useState<string>('#000000');
  const [emissiveIntensity, setEmissiveIntensity] = useState<number>(1);
  
  // Phong/PhongNodeMaterial特有参数
  const [specular, setSpecular] = useState<string>('#111111');
  const [shininess, setShininess] = useState<number>(30);
  const [reflectivity, setReflectivity] = useState<number>(1);
  const [refractionRatio, setRefractionRatio] = useState<number>(0.98);
  
  // Physical材质高级参数
  const [clearcoat, setClearcoat] = useState<number>(0);
  const [clearcoatRoughness, setClearcoatRoughness] = useState<number>(0);
  const [transmission, setTransmission] = useState<number>(0);
  const [thickness, setThickness] = useState<number>(0);
  const [ior, setIor] = useState<number>(1.5);
  
  // 贴图
  const [mapPreview, setMapPreview] = useState<string | null>(null);
  const [normalMapPreview, setNormalMapPreview] = useState<string | null>(null);
  const [roughnessMapPreview, setRoughnessMapPreview] = useState<string | null>(null);
  const [metalnessMapPreview, setMetalnessMapPreview] = useState<string | null>(null);
  const [emissiveMapPreview, setEmissiveMapPreview] = useState<string | null>(null);
  
  // 文件引用
  const mapFileRef = useRef<HTMLInputElement>(null);
  const normalMapFileRef = useRef<HTMLInputElement>(null);
  const roughnessMapFileRef = useRef<HTMLInputElement>(null);
  const metalnessMapFileRef = useRef<HTMLInputElement>(null);
  const emissiveMapFileRef = useRef<HTMLInputElement>(null);

  // UV 参数
  const [uvRepeatX, setUvRepeatX] = useState(1);
  const [uvRepeatY, setUvRepeatY] = useState(1);
  const [uvOffsetX, setUvOffsetX] = useState(0);
  const [uvOffsetY, setUvOffsetY] = useState(0);
  const [uvRotation, setUvRotation] = useState(0);
  const [wrapS, setWrapS] = useState<number>(THREE.RepeatWrapping);
  const [wrapT, setWrapT] = useState<number>(THREE.RepeatWrapping);

  const objectId = useMemo(() => {
    if (!object3D) return null;
    return (object3D.userData?.id || object3D.userData?.businessId || object3D.uuid) as string;
  }, [object3D]);

  // 当材质变化时,更新参数
  useEffect(() => {
    if (material) {
      const mat = material as any;
      setSelectedType(material.type);
      
      // 如果是新选中的对象,保存原始材质(用于恢复默认值)
      if (!originalMaterial || originalMaterial.uuid !== material.uuid) {
        // 克隆原始材质以保存初始状态
        setOriginalMaterial(mat.clone());
      }
      
      // 基础参数
      if (mat.color) setColor('#' + mat.color.getHexString());
      if (mat.opacity !== undefined) setOpacity(mat.opacity);
      if (mat.wireframe !== undefined) setWireframe(mat.wireframe);
      if (mat.side !== undefined) setSide(mat.side);
      if (mat.flatShading !== undefined) setFlatShading(mat.flatShading);
      if (mat.transparent !== undefined) setTransparent(mat.transparent);
      if (mat.depthWrite !== undefined) setDepthWrite(mat.depthWrite);
      if (mat.fog !== undefined) setFog(mat.fog);
      
      // Standard/Physical参数
      if (mat.metalness !== undefined) setMetalness(mat.metalness);
      if (mat.roughness !== undefined) setRoughness(mat.roughness);
      if (mat.emissive) setEmissive('#' + mat.emissive.getHexString());
      if (mat.emissiveIntensity !== undefined) setEmissiveIntensity(mat.emissiveIntensity);
      
      // Phong参数
      if (mat.specular) setSpecular('#' + mat.specular.getHexString());
      if (mat.shininess !== undefined) setShininess(mat.shininess);
      if (mat.reflectivity !== undefined) setReflectivity(mat.reflectivity);
      if (mat.refractionRatio !== undefined) setRefractionRatio(mat.refractionRatio);
      
      // Physical参数
      if (mat.clearcoat !== undefined) setClearcoat(mat.clearcoat);
      if (mat.clearcoatRoughness !== undefined) setClearcoatRoughness(mat.clearcoatRoughness);
      if (mat.transmission !== undefined) setTransmission(mat.transmission);
      if (mat.thickness !== undefined) setThickness(mat.thickness);
      if (mat.ior !== undefined) setIor(mat.ior);
      
      // 加载贴图预览
      if (mat.map) {
        setMapPreview(textureToDataUrl(mat.map));
      } else {
        setMapPreview(null);
      }
      
      if (mat.normalMap) {
        setNormalMapPreview(textureToDataUrl(mat.normalMap));
      } else {
        setNormalMapPreview(null);
      }
      
      if (mat.roughnessMap) {
        setRoughnessMapPreview(textureToDataUrl(mat.roughnessMap));
      } else {
        setRoughnessMapPreview(null);
      }
      
      if (mat.metalnessMap) {
        setMetalnessMapPreview(textureToDataUrl(mat.metalnessMap));
      } else {
        setMetalnessMapPreview(null);
      }
      
      if (mat.emissiveMap) {
        setEmissiveMapPreview(textureToDataUrl(mat.emissiveMap));
      } else {
        setEmissiveMapPreview(null);
      }

      const refTex: THREE.Texture | null =
        mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.emissiveMap || null;
      if (refTex) {
        setUvRepeatX(refTex.repeat?.x ?? 1);
        setUvRepeatY(refTex.repeat?.y ?? 1);
        setUvOffsetX(refTex.offset?.x ?? 0);
        setUvOffsetY(refTex.offset?.y ?? 0);
        setUvRotation(THREE.MathUtils.radToDeg(refTex.rotation ?? 0));
        setWrapS(refTex.wrapS ?? THREE.RepeatWrapping);
        setWrapT(refTex.wrapT ?? THREE.RepeatWrapping);
      }
    }
  }, [material]);

  const applyUvParams = useCallback((params: {
    repeatX: number; repeatY: number; offsetX: number; offsetY: number;
    rotation: number; wrapS: number; wrapT: number;
  }) => {
    if (!material) return;
    const mat = material as unknown as Record<string, unknown>;
    const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap'];
    keys.forEach((key) => {
      const tex = mat[key] as THREE.Texture | undefined;
      if (!tex) return;
      tex.wrapS = params.wrapS as THREE.Wrapping;
      tex.wrapT = params.wrapT as THREE.Wrapping;
      tex.repeat.set(params.repeatX, params.repeatY);
      tex.offset.set(params.offsetX, params.offsetY);
      tex.rotation = THREE.MathUtils.degToRad(params.rotation);
      tex.needsUpdate = true;
    });
    material.needsUpdate = true;
    onMaterialChange(material);
  }, [material, onMaterialChange]);

  const getUvParams = () => ({
    repeatX: uvRepeatX, repeatY: uvRepeatY, offsetX: uvOffsetX, offsetY: uvOffsetY,
    rotation: uvRotation, wrapS, wrapT,
  });

  const handleUvChange = (field: string, value: number) => {
    const params = getUvParams();
    switch (field) {
      case 'repeatX': params.repeatX = value; setUvRepeatX(value); break;
      case 'repeatY': params.repeatY = value; setUvRepeatY(value); break;
      case 'offsetX': params.offsetX = value; setUvOffsetX(value); break;
      case 'offsetY': params.offsetY = value; setUvOffsetY(value); break;
      case 'rotation': params.rotation = value; setUvRotation(value); break;
    }
    applyUvParams(params);
  };

  const handleWrapChange = (axis: 'S' | 'T', value: number) => {
    const params = getUvParams();
    if (axis === 'S') { params.wrapS = value; setWrapS(value); }
    else { params.wrapT = value; setWrapT(value); }
    applyUvParams(params);
  };

  const textureToDataUrl = (texture: THREE.Texture): string | null => {
    if (!texture || !texture.image) return null;
    
    const img = texture.image;
    if (img instanceof HTMLImageElement && img.src) {
      return img.src;
    }
    
    // 如果是canvas或其他类型,尝试转换
    if (img instanceof HTMLCanvasElement) {
      return img.toDataURL();
    }
    
    return null;
  };

  // 创建新材质 (支持17种材质类型)
  const createMaterial = (type: string) => {
    let newMaterial: THREE.Material;
    
    // 通用属性 (不是所有材质都支持所有这些属性)
    const baseProps: any = {
      color: new THREE.Color(color),
      opacity,
      wireframe: wireframe, // 确保使用正确的wireframe值
      side: side as THREE.Side,
      transparent: opacity < 1 || transparent, // 如果opacity<1或transparent=true则启用透明
      depthWrite,
      fog,
    };

    // 根据材质类型创建实例 (NodeMaterial 在 Three.js 0.185 中可能不可用)
    switch (type) {
      case 'MeshBasicMaterial':
        newMaterial = new THREE.MeshBasicMaterial(baseProps);
        break;
        
      case 'MeshStandardMaterial':
        newMaterial = new THREE.MeshStandardMaterial({
          ...baseProps,
          flatShading,
          metalness,
          roughness,
          emissive: new THREE.Color(emissive),
          emissiveIntensity,
        });
        break;
        
      case 'MeshPhysicalMaterial':
        newMaterial = new THREE.MeshPhysicalMaterial({
          ...baseProps,
          flatShading,
          metalness,
          roughness,
          emissive: new THREE.Color(emissive),
          emissiveIntensity,
          clearcoat,
          clearcoatRoughness,
          transmission,
          thickness,
          ior,
          reflectivity,
          // refractionRatio 不是 MeshPhysicalMaterial 的属性
        });
        break;
        
      case 'MeshLambertMaterial':
        newMaterial = new THREE.MeshLambertMaterial({
          ...baseProps,
          flatShading,
          emissive: new THREE.Color(emissive),
        });
        break;
        
      case 'MeshPhongMaterial':
        newMaterial = new THREE.MeshPhongMaterial({
          ...baseProps,
          flatShading,
          specular: new THREE.Color(specular),
          shininess,
          emissive: new THREE.Color(emissive),
          reflectivity,
          refractionRatio,
        });
        break;
        
      case 'MeshNormalMaterial':
        newMaterial = new THREE.MeshNormalMaterial({
          wireframe,
          flatShading,
          side: side as THREE.Side,
        });
        break;
        
      case 'MeshMatcapMaterial':
        newMaterial = new THREE.MeshMatcapMaterial({
          wireframe,
          flatShading,
        });
        break;
        
      case 'MeshDepthMaterial':
        newMaterial = new THREE.MeshDepthMaterial({
          wireframe,
        });
        break;
        
      case 'MeshDistanceMaterial':
        newMaterial = new THREE.MeshDistanceMaterial();
        break;
        
      case 'MeshToonMaterial':
        newMaterial = new THREE.MeshToonMaterial({
          ...baseProps,
          flatShading,
        });
        break;
        
      case 'PointsMaterial':
        newMaterial = new THREE.PointsMaterial({
          color: new THREE.Color(color),
          size: 0.1,
          transparent: transparent || opacity < 1,
          opacity,
          depthWrite,
          fog,
        });
        break;
        
      case 'ShadowMaterial':
        newMaterial = new THREE.ShadowMaterial({
          opacity,
          transparent: true,
        });
        break;
        
      case 'SpriteMaterial':
        newMaterial = new THREE.SpriteMaterial({
          color: new THREE.Color(color),
          opacity,
          fog,
        });
        break;
        
      // NodeMaterial - Three.js 0.185 可能不支持，降级到普通材质
      case 'MeshBasicNodeMaterial':
      case 'MeshStandardNodeMaterial':
      case 'MeshPhysicalNodeMaterial':
      case 'MeshLambertNodeMaterial':
      case 'MeshPhongNodeMaterial':
      case 'MeshNormalNodeMaterial':
      case 'MeshMatcapNodeMaterial':
      case 'MeshSSSNodeMaterial':
        // 降级到对应的普通材质 (NodeMaterial需要WebGPU)
        const baseType = type.replace('Node', '');
        newMaterial = createMaterial(baseType);
        break;
        
      default:
        newMaterial = new THREE.MeshStandardMaterial({
          ...baseProps,
          flatShading,
          metalness,
          roughness,
        });
    }

    return newMaterial;
  };

  // 材质类型切换
  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    const newMaterial = createMaterial(type);
    
    // 从新材质中读取参数,更新本地state,确保后续参数调整基于新材质
    const mat = newMaterial as any;
    if (mat.color) setColor('#' + mat.color.getHexString());
    if (mat.opacity !== undefined) setOpacity(mat.opacity);
    if (mat.wireframe !== undefined) setWireframe(mat.wireframe);
    if (mat.side !== undefined) setSide(mat.side);
    if (mat.flatShading !== undefined) setFlatShading(mat.flatShading);
    if (mat.transparent !== undefined) setTransparent(mat.transparent);
    if (mat.depthWrite !== undefined) setDepthWrite(mat.depthWrite);
    if (mat.fog !== undefined) setFog(mat.fog);
    if (mat.metalness !== undefined) setMetalness(mat.metalness);
    if (mat.roughness !== undefined) setRoughness(mat.roughness);
    if (mat.emissive) setEmissive('#' + mat.emissive.getHexString());
    if (mat.emissiveIntensity !== undefined) setEmissiveIntensity(mat.emissiveIntensity);
    
    if (object3D) {
      (object3D as THREE.Mesh).material = newMaterial;
      onMaterialChange(newMaterial);
    }
  };

  // 恢复默认值 - 恢复到初始材质状态
  const handleResetToDefault = () => {
    if (!originalMaterial || !object3D) return;
    
    // 克隆原始材质,避免引用问题
    const restoredMaterial = originalMaterial.clone();
    
    // 应用原始材质到对象
    (object3D as THREE.Mesh).material = restoredMaterial;
    
    // 更新本地state
    setSelectedType(restoredMaterial.type);
    const mat = restoredMaterial as any;
    if (mat.color) setColor('#' + mat.color.getHexString());
    if (mat.opacity !== undefined) setOpacity(mat.opacity);
    if (mat.wireframe !== undefined) setWireframe(mat.wireframe);
    if (mat.side !== undefined) setSide(mat.side);
    if (mat.flatShading !== undefined) setFlatShading(mat.flatShading);
    if (mat.transparent !== undefined) setTransparent(mat.transparent);
    if (mat.depthWrite !== undefined) setDepthWrite(mat.depthWrite);
    if (mat.fog !== undefined) setFog(mat.fog);
    if (mat.metalness !== undefined) setMetalness(mat.metalness);
    if (mat.roughness !== undefined) setRoughness(mat.roughness);
    if (mat.emissive) setEmissive('#' + mat.emissive.getHexString());
    if (mat.emissiveIntensity !== undefined) setEmissiveIntensity(mat.emissiveIntensity);
    
    // 通知父组件材质已更新
    onMaterialChange(restoredMaterial);
  };

  // 更新材质 - 直接修改属性而不是创建新材质
  const updateMaterial = () => {
    if (!object3D || !material) return;
    
    const mat = material as any; // 使用any类型以支持动态属性访问
    
    // 通用属性 - 所有材质都有这些属性
    if (mat.color && color) {
      mat.color.set(color);
    }
    if ('opacity' in mat) {
      mat.opacity = opacity;
    }
    if ('wireframe' in mat) {
      mat.wireframe = wireframe;
    }
    if ('side' in mat) {
      mat.side = side as THREE.Side;
    }
    if ('transparent' in mat) {
      mat.transparent = opacity < 1 || transparent;
    }
    if ('depthWrite' in mat) {
      mat.depthWrite = depthWrite;
    }
    if ('fog' in mat) {
      mat.fog = fog;
    }
    
    // MeshStandardMaterial, MeshPhysicalMaterial, MeshLambertMaterial, MeshPhongMaterial
    if (mat.emissive && emissive) {
      mat.emissive.set(emissive);
    }
    if ('emissiveIntensity' in mat) {
      mat.emissiveIntensity = emissiveIntensity;
    }
    
    // MeshStandardMaterial, MeshPhysicalMaterial
    if ('metalness' in mat) {
      mat.metalness = metalness;
    }
    if ('roughness' in mat) {
      mat.roughness = roughness;
    }
    
    // MeshPhysicalMaterial
    if ('clearcoat' in mat) {
      mat.clearcoat = clearcoat;
    }
    if ('clearcoatRoughness' in mat) {
      mat.clearcoatRoughness = clearcoatRoughness;
    }
    if ('transmission' in mat) {
      mat.transmission = transmission;
    }
    if ('thickness' in mat) {
      mat.thickness = thickness;
    }
    if ('ior' in mat) {
      mat.ior = ior;
    }
    if ('reflectivity' in mat) {
      mat.reflectivity = reflectivity;
    }
    
    // MeshPhongMaterial
    if (mat.specular && specular) {
      mat.specular.set(specular);
    }
    if ('shininess' in mat) {
      mat.shininess = shininess;
    }
    if ('refractionRatio' in mat) {
      mat.refractionRatio = refractionRatio;
    }
    
    // flatShading - 部分材质支持
    if ('flatShading' in mat) {
      mat.flatShading = flatShading;
      mat.needsUpdate = true; // flatShading 变化需要重新编译着色器
    }
    
    mat.needsUpdate = true; // 标记材质需要更新
    
    // 通知父组件材质已更新(触发useEffect重新同步)
    onMaterialChange(material);
    
    // 如果是Group模型,需要更新所有使用相同材质的mesh
    if (object3D instanceof THREE.Group) {
      object3D.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material === material) {
          (child as THREE.Mesh).material = material;
        }
      });
    }
    
    onMaterialChange(material);
  };

  // 各种参数变化处理
  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    updateMaterial();
  };

  const handleMetalnessChange = (value: number) => {
    setMetalness(value);
    setTimeout(updateMaterial, 0);
  };

  const handleRoughnessChange = (value: number) => {
    setRoughness(value);
    setTimeout(updateMaterial, 0);
  };

  const handleOpacityChange = (value: number) => {
    setOpacity(value);
    updateMaterial();
  };

  // 贴图上传处理
  const handleMapUpload = (type: 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap') => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !material) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const texture = new THREE.Texture(img);
          texture.needsUpdate = true;
          
          const mat = material as any;
          mat[type] = texture;
          mat.needsUpdate = true;
          
          // 设置预览图
          const previewUrl = event.target?.result as string;
          switch(type) {
            case 'map': setMapPreview(previewUrl); break;
            case 'normalMap': setNormalMapPreview(previewUrl); break;
            case 'roughnessMap': setRoughnessMapPreview(previewUrl); break;
            case 'metalnessMap': setMetalnessMapPreview(previewUrl); break;
            case 'emissiveMap': setEmissiveMapPreview(previewUrl); break;
          }
          
          onMaterialChange(material);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
      
      // 清空input value,允许重复选择同一文件
      e.target.value = '';
    };
  };

  // 移除贴图
  const handleRemoveMap = (type: 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap') => {
    if (!material) return;
    const mat = material as any;
    mat[type] = null;
    mat.needsUpdate = true;
    
    switch(type) {
      case 'map': setMapPreview(null); break;
      case 'normalMap': setNormalMapPreview(null); break;
      case 'roughnessMap': setRoughnessMapPreview(null); break;
      case 'metalnessMap': setMetalnessMapPreview(null); break;
      case 'emissiveMap': setEmissiveMapPreview(null); break;
    }
    
    onMaterialChange(material);
  };

  const handleEmissiveChange = (newColor: string) => {
    setEmissive(newColor);
    setTimeout(updateMaterial, 0);
  };

  const handleEmissiveIntensityChange = (value: number) => {
    setEmissiveIntensity(value);
    setTimeout(updateMaterial, 0);
  };

  const handleWireframeChange = (value: boolean) => {
    setWireframe(value);
    // 直接更新材质,不使用setTimeout
    if (material) {
      const mat = material as any;
      if ('wireframe' in mat) {
        mat.wireframe = value;
        mat.needsUpdate = true;
      }
    }
  };

  const handleFlatShadingChange = (value: boolean) => {
    setFlatShading(value);
    setTimeout(() => {
      updateMaterial();
    }, 0);
  };

  const handleTransparentChange = (value: boolean) => {
    setTransparent(value);
    setTimeout(() => {
      updateMaterial();
    }, 0);
  };

  const handleDepthWriteChange = (value: boolean) => {
    setDepthWrite(value);
    setTimeout(() => {
      updateMaterial();
    }, 0);
  };

  const handleFogChange = (value: boolean) => {
    setFog(value);
    setTimeout(() => {
      updateMaterial();
    }, 0);
  };

  const handleClearcoatChange = (value: number) => {
    setClearcoat(value);
    setTimeout(updateMaterial, 0);
  };

  const handleClearcoatRoughnessChange = (value: number) => {
    setClearcoatRoughness(value);
    setTimeout(updateMaterial, 0);
  };

  const handleTransmissionChange = (value: number) => {
    setTransmission(value);
    setTimeout(updateMaterial, 0);
  };

  const handleThicknessChange = (value: number) => {
    setThickness(value);
    setTimeout(updateMaterial, 0);
  };

  const handleIorChange = (value: number) => {
    setIor(value);
    setTimeout(updateMaterial, 0);
  };

  if (!material || !object3D) {
    return (
      <div className="p-4">
        <p className="text-xs text-gray-500 text-center">未选择材质</p>
      </div>
    );
  }

  const isPhysical = selectedType === 'MeshPhysicalMaterial';
  const hasMetalnessRoughness = ['MeshStandardMaterial', 'MeshPhysicalMaterial'].includes(selectedType);
  const hasEmissive = ['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial'].includes(selectedType);
  const hasPhongParams = ['MeshPhongMaterial'].includes(selectedType);
  const hasColor = !['MeshNormalMaterial', 'MeshDepthMaterial', 'MeshDistanceMaterial', 'ShadowMaterial'].includes(selectedType);
  const hasFlatShadingSupport = ['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial', 'MeshMatcapMaterial'].includes(selectedType);
  const hasFogSupport = !['MeshNormalMaterial', 'MeshDepthMaterial', 'MeshDistanceMaterial'].includes(selectedType);

  return (
    <div className="p-4 space-y-4">
      {/* 材质类型选择 */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">材质类型 (Material Type)</label>
        <select
          value={selectedType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-gray-700 text-white border border-gray-600 rounded focus:outline-none focus:border-blue-500"
        >
          {materialTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        {selectedType.includes('Node') && (
          <p className="text-xs text-yellow-500 mt-1">⚠️ NodeMaterial需要WebGPU支持,已降级到普通材质</p>
        )}
      </div>

      {/* 基础颜色 */}
      {hasColor && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">颜色 (Color)</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-10 h-8 rounded cursor-pointer border border-gray-600"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded font-mono"
            />
          </div>
        </div>
      )}

      {/* 金属度和粗糙度 */}
      {hasMetalnessRoughness && (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              金属度 (Metalness): {metalness.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={metalness}
              onChange={(e) => handleMetalnessChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              粗糙度 (Roughness): {roughness.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={roughness}
              onChange={(e) => handleRoughnessChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </>
      )}

      {/* 自发光 */}
      {hasEmissive && (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">自发光颜色 (Emissive)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={emissive}
                onChange={(e) => handleEmissiveChange(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-600"
              />
              <input
                type="text"
                value={emissive}
                onChange={(e) => handleEmissiveChange(e.target.value)}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              自发光强度 (Emissive Intensity): {emissiveIntensity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={emissiveIntensity}
              onChange={(e) => handleEmissiveIntensityChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </>
      )}

      {/* 贴图上传 */}
      {(selectedType === 'MeshStandardMaterial' || selectedType === 'MeshPhysicalMaterial') && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-gray-300 mb-3">贴图 (Textures)</h4>
          
          {/* 基础贴图 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-2">基础贴图 (Map)</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={mapFileRef}
                accept="image/*"
                onChange={handleMapUpload('map')}
                className="hidden"
              />
              <button
                onClick={() => mapFileRef.current?.click()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                {mapPreview ? '更换贴图' : '上传贴图'}
              </button>
              {mapPreview && (
                <button
                  onClick={() => handleRemoveMap('map')}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
            {mapPreview && (
              <div className="mt-2">
                <img src={mapPreview} alt="Map" className="w-20 h-20 object-cover rounded border border-gray-600" />
              </div>
            )}
          </div>

          {/* 法线贴图 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-2">法线贴图 (Normal Map)</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={normalMapFileRef}
                accept="image/*"
                onChange={handleMapUpload('normalMap')}
                className="hidden"
              />
              <button
                onClick={() => normalMapFileRef.current?.click()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                {normalMapPreview ? '更换贴图' : '上传贴图'}
              </button>
              {normalMapPreview && (
                <button
                  onClick={() => handleRemoveMap('normalMap')}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
            {normalMapPreview && (
              <div className="mt-2">
                <img src={normalMapPreview} alt="Normal Map" className="w-20 h-20 object-cover rounded border border-gray-600" />
              </div>
            )}
          </div>

          {/* 粗糙度贴图 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-2">粗糙度贴图 (Roughness Map)</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={roughnessMapFileRef}
                accept="image/*"
                onChange={handleMapUpload('roughnessMap')}
                className="hidden"
              />
              <button
                onClick={() => roughnessMapFileRef.current?.click()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                {roughnessMapPreview ? '更换贴图' : '上传贴图'}
              </button>
              {roughnessMapPreview && (
                <button
                  onClick={() => handleRemoveMap('roughnessMap')}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
            {roughnessMapPreview && (
              <div className="mt-2">
                <img src={roughnessMapPreview} alt="Roughness Map" className="w-20 h-20 object-cover rounded border border-gray-600" />
              </div>
            )}
          </div>

          {/* 金属度贴图 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-2">金属度贴图 (Metalness Map)</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={metalnessMapFileRef}
                accept="image/*"
                onChange={handleMapUpload('metalnessMap')}
                className="hidden"
              />
              <button
                onClick={() => metalnessMapFileRef.current?.click()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                {metalnessMapPreview ? '更换贴图' : '上传贴图'}
              </button>
              {metalnessMapPreview && (
                <button
                  onClick={() => handleRemoveMap('metalnessMap')}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
            {metalnessMapPreview && (
              <div className="mt-2">
                <img src={metalnessMapPreview} alt="Metalness Map" className="w-20 h-20 object-cover rounded border border-gray-600" />
              </div>
            )}
          </div>

          {/* 自发光贴图 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-2">自发光贴图 (Emissive Map)</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={emissiveMapFileRef}
                accept="image/*"
                onChange={handleMapUpload('emissiveMap')}
                className="hidden"
              />
              <button
                onClick={() => emissiveMapFileRef.current?.click()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                {emissiveMapPreview ? '更换贴图' : '上传贴图'}
              </button>
              {emissiveMapPreview && (
                <button
                  onClick={() => handleRemoveMap('emissiveMap')}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
            {emissiveMapPreview && (
              <div className="mt-2">
                <img src={emissiveMapPreview} alt="Emissive Map" className="w-20 h-20 object-cover rounded border border-gray-600" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* UV 设置 */}
      {hasColor && (
        <div className="mb-4 pt-3 border-t border-gray-700">
          <h4 className="text-xs font-medium text-gray-300 mb-3">UV 变换</h4>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">重复 U</label>
              <input
                type="number"
                step="0.1"
                min="0.01"
                value={uvRepeatX}
                onChange={(e) => handleUvChange('repeatX', parseFloat(e.target.value) || 1)}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">重复 V</label>
              <input
                type="number"
                step="0.1"
                min="0.01"
                value={uvRepeatY}
                onChange={(e) => handleUvChange('repeatY', parseFloat(e.target.value) || 1)}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">偏移 U</label>
              <input
                type="number"
                step="0.01"
                value={uvOffsetX}
                onChange={(e) => handleUvChange('offsetX', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">偏移 V</label>
              <input
                type="number"
                step="0.01"
                value={uvOffsetY}
                onChange={(e) => handleUvChange('offsetY', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
          </div>
          <div className="mb-2">
            <label className="text-[10px] text-gray-500 block mb-0.5">
              旋转 (°): {uvRotation.toFixed(1)}
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={uvRotation}
              onChange={(e) => handleUvChange('rotation', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">包裹 U</label>
              <select
                value={wrapS}
                onChange={(e) => handleWrapChange('S', parseInt(e.target.value))}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              >
                <option value={THREE.RepeatWrapping}>重复</option>
                <option value={THREE.ClampToEdgeWrapping}>拉伸</option>
                <option value={THREE.MirroredRepeatWrapping}>镜像</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">包裹 V</label>
              <select
                value={wrapT}
                onChange={(e) => handleWrapChange('T', parseInt(e.target.value))}
                className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded"
              >
                <option value={THREE.RepeatWrapping}>重复</option>
                <option value={THREE.ClampToEdgeWrapping}>拉伸</option>
                <option value={THREE.MirroredRepeatWrapping}>镜像</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">同步应用于所有已加载贴图</p>
        </div>
      )}

      <TextureAnimationSection objectId={objectId} material={material} />

      {/* Phong参数 */}
      {hasPhongParams && (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">高光颜色 (Specular)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={specular}
                onChange={(e) => {
                  setSpecular(e.target.value);
                  setTimeout(updateMaterial, 0);
                }}
                className="w-10 h-8 rounded cursor-pointer border border-gray-600"
              />
              <input
                type="text"
                value={specular}
                onChange={(e) => {
                  setSpecular(e.target.value);
                  setTimeout(updateMaterial, 0);
                }}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              光泽度 (Shininess): {shininess.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={shininess}
              onChange={(e) => {
                setShininess(parseFloat(e.target.value));
                setTimeout(updateMaterial, 0);
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </>
      )}

      {/* 透明度 */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">
          透明度 (Opacity): {opacity.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={opacity}
          onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Physical材质高级参数 */}
      {isPhysical && (
        <div className="pt-2 border-t border-gray-700">
          <h5 className="text-xs font-semibold text-gray-400 mb-2">Physical 高级参数</h5>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                清漆层 (Clearcoat): {clearcoat.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={clearcoat}
                onChange={(e) => handleClearcoatChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                清漆粗糙度 (Clearcoat Roughness): {clearcoatRoughness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={clearcoatRoughness}
                onChange={(e) => handleClearcoatRoughnessChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                透射 (Transmission): {transmission.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={transmission}
                onChange={(e) => handleTransmissionChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                厚度 (Thickness): {thickness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={thickness}
                onChange={(e) => handleThicknessChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                折射率 (IOR): {ior.toFixed(2)}
              </label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={ior}
                onChange={(e) => handleIorChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* 反射率和折射率 (Physical & Phong) */}
      {(isPhysical || hasPhongParams) && (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              反射率 (Reflectivity): {reflectivity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={reflectivity}
              onChange={(e) => {
                setReflectivity(parseFloat(e.target.value));
                setTimeout(updateMaterial, 0);
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              折射率比例 (Refraction Ratio): {refractionRatio.toFixed(3)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={refractionRatio}
              onChange={(e) => {
                setRefractionRatio(parseFloat(e.target.value));
                setTimeout(updateMaterial, 0);
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </>
      )}

      {/* 开关按钮区域 */}
      <div className="pt-2 border-t border-gray-700 space-y-3">
        <h5 className="text-xs font-semibold text-gray-400">渲染选项</h5>
        
        {/* 线框模式 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">线框模式 (Wireframe)</span>
          <button
            onClick={() => handleWireframeChange(!wireframe)}
            className={`w-10 h-5 rounded-full transition-colors ${wireframe ? 'bg-blue-500' : 'bg-gray-600'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${wireframe ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* 平面着色 */}
        {hasFlatShadingSupport && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">平面着色 (Flat Shading)</span>
            <button
              onClick={() => handleFlatShadingChange(!flatShading)}
              className={`w-10 h-5 rounded-full transition-colors ${flatShading ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${flatShading ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}

        {/* 深度写入 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">深度写入 (Depth Write)</span>
          <button
            onClick={() => handleDepthWriteChange(!depthWrite)}
            className={`w-10 h-5 rounded-full transition-colors ${depthWrite ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${depthWrite ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* 雾效 */}
        {hasFogSupport && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">受雾影响 (Fog)</span>
            <button
              onClick={() => {
                setFog(!fog);
                updateMaterial();
              }}
              className={`w-10 h-5 rounded-full transition-colors ${fog ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${fog ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}
      </div>

      {/* 恢复默认值按钮 */}
      <div className="pt-4 border-t border-gray-700">
        <button
          onClick={handleResetToDefault}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
        >
          恢复默认值 (Reset to Default)
        </button>
      </div>
    </div>
  );
}
