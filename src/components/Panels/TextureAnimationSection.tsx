import { Switch } from 'antd';
import { useAnimationStore } from '@/store/animationStore';
import { DEFAULT_TEXTURE_UV_ANIMATION } from '@/types/textureAnimation';
import type { TextureAnimationTarget } from '@/types/textureAnimation';
import * as THREE from 'three';

interface TextureAnimationSectionProps {
  objectId: string | null;
  material: THREE.Material | null;
}

export function TextureAnimationSection({ objectId, material }: TextureAnimationSectionProps) {
  const stored = useAnimationStore((s) =>
    objectId ? s.textureUvAnimations[objectId] : undefined
  );
  const setTextureUvAnimation = useAnimationStore((s) => s.setTextureUvAnimation);

  const mat = material as THREE.MeshStandardMaterial | null;
  const hasMap = Boolean(mat?.map);

  if (!objectId || !hasMap) {
    return (
      <div className="mb-4 pt-3 border-t border-gray-700">
        <h4 className="text-xs font-medium text-gray-300 mb-2">贴图动画</h4>
        <p className="text-[10px] text-gray-500">
          请先为对象上传漫反射贴图（map），再配置 UV 偏移动画。
        </p>
      </div>
    );
  }

  const anim = { ...DEFAULT_TEXTURE_UV_ANIMATION, ...stored };

  const update = (updates: Parameters<typeof setTextureUvAnimation>[1]) => {
    setTextureUvAnimation(objectId, updates);
  };

  return (
    <div className="mb-4 pt-3 border-t border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-gray-300">贴图动画（UV 偏移）</h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">启用</span>
          <Switch
            size="small"
            checked={anim.enabled}
            onChange={(checked) => update({ enabled: checked })}
          />
        </div>
      </div>

      <p className="text-[10px] text-gray-500 mb-3">
        按时间持续移动贴图 UV 偏移，适合水面、传送带等效果。建议将 UV 包裹设为「重复」。
      </p>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">速度 U / 秒</label>
          <input
            type="number"
            step="0.01"
            value={anim.speedU}
            disabled={!anim.enabled}
            onChange={(e) => update({ speedU: parseFloat(e.target.value) || 0 })}
            className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">速度 V / 秒</label>
          <input
            type="number"
            step="0.01"
            value={anim.speedV}
            disabled={!anim.enabled}
            onChange={(e) => update({ speedV: parseFloat(e.target.value) || 0 })}
            className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-500 block mb-0.5">作用贴图</label>
        <select
          value={anim.target}
          disabled={!anim.enabled}
          onChange={(e) => update({ target: e.target.value as TextureAnimationTarget })}
          className="w-full px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded disabled:opacity-50"
        >
          <option value="map">漫反射贴图 (map)</option>
          <option value="all">全部贴图</option>
        </select>
      </div>
    </div>
  );
}
