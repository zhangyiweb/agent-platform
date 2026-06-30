import { useCallback } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { enableMeshShadows } from '@/config/defaultLighting';

export function useModelLoader() {
  const { addObject, registerThreeObject } = useSceneStore();

  const loadModel = useCallback(async (
    file: File,
    scene: THREE.Scene
  ): Promise<THREE.Group | null> => {  // 返回模型对象,用于自动聚焦
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      
      // 配置Draco解码器 - 用于加载压缩的GLB/GLTF模型
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);
      
      const url = URL.createObjectURL(file);

      loader.load(
        url,
        (gltf: { scene: THREE.Group }) => {
          const model = gltf.scene;
          
          // 生成唯一ID
          const modelId = `model_${Date.now()}`;
          model.name = file.name.replace(/\.[^/.]+$/, ''); // 移除扩展名
          model.userData.id = modelId;

          enableMeshShadows(model);

          // 计算原始包围盒和尺寸(仅用于日志显示)
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          
          // 不修改位置和缩放 - 完全保持建模软件中的原始状态
          // 导入进来什么样就是什么样
          

          
          // 添加到场景
          scene.add(model);

          // 添加到状态管理 - 记录正确的变换值
          addObject({
            id: modelId,
            name: model.name,
            type: 'mesh',
            visible: true,
            position: [model.position.x, model.position.y, model.position.z],
            rotation: [model.rotation.x, model.rotation.y, model.rotation.z],
            scale: [model.scale.x, model.scale.y, model.scale.z],
          });

          registerThreeObject(modelId, model);

          // 清理URL
          URL.revokeObjectURL(url);
          
          resolve(model); // 返回模型对象
        },
        (progress: ProgressEvent) => {
          // 加载进度回调
        },
        (error: unknown) => {
          URL.revokeObjectURL(url);
          reject(error);
        }
      );
    });
  }, [addObject, registerThreeObject]);

  const handleFileImport = useCallback(async (
    files: FileList | File[],
    scene: THREE.Scene
  ) => {
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    
    for (const file of fileArray) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (['glb', 'gltf'].includes(ext || '')) {
        try {
          const model = await loadModel(file, scene);
          
          if (model) {

          }
        } catch (error) {

        }
      } else {
        // 不支持的格式
      }
    }
  }, [loadModel]);

  return {
    loadModel,
    handleFileImport,
  };
}
