import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useLightStore } from '@/store/lightStore';
import {
  SearchOutlined,
  DownOutlined,
  RightOutlined,
  DeleteOutlined,
  EditOutlined,
  BulbOutlined,
  BoxPlotOutlined,
  AppstoreOutlined,
  BlockOutlined,
  CloudOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { disposeObject3DResources, findThreeObjectById } from '@/utils/sceneUtils';
import { disposeLabelAnchor } from '@/utils/sceneLabel';
import * as THREE from 'three';

interface TreeNode {
  key: string;
  id: string;
  uuid: string;
  name: string;
  type: 'model' | 'group' | 'mesh' | 'light' | 'particle' | 'label';
  children: TreeNode[];
}

function isHelperObject(obj: THREE.Object3D): boolean {
  return (
    obj.name === 'grid' ||
    obj.name === 'axes' ||
    obj.name.startsWith('helper_') ||
    obj.name === 'quarks_batched_renderer' ||
    obj.type === 'BatchedRenderer' ||
    obj.type === 'VFXBatch' ||
    obj.userData?.isLightPickProxy === true ||
    obj.userData?.isParticlePoints === true ||
    obj.userData?.isParticlePickProxy === true ||
    obj.userData?.isEditorHelper === true ||
    obj.userData?.isLabelCssObject === true ||
    obj.userData?.isLightTarget === true ||
    obj.type === 'TransformControlsGizmo' ||
    (obj.children.length === 2 && obj.children[0]?.type === 'TransformControlsGizmo') ||
    obj instanceof THREE.Light
  );
}

function TreeNodeItem({
  node,
  depth,
  expandedKeys,
  onToggleExpand,
  isNodeSelected,
  onSelect,
  onDelete,
  onRename,
}: {
  node: TreeNode;
  depth: number;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string) => void;
  isNodeSelected: (node: TreeNode) => boolean;
  onSelect: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onRename: (node: TreeNode, newName: string) => void;
}) {
  const expanded = expandedKeys.has(node.key);
  const hasChildren = node.children.length > 0;
  const selected = isNodeSelected(node);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(node.name);
    }
  }, [node.name, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== node.name) {
      onRename(node, trimmed);
    } else {
      setEditValue(node.name);
    }
    setIsEditing(false);
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(node.name || '');
    setIsEditing(true);
  };

  const icon =
    node.type === 'light' ? (
      <BulbOutlined className="text-yellow-400 scene-tree-icon" />
    ) : node.type === 'particle' ? (
      <CloudOutlined className="text-purple-400 scene-tree-icon" />
    ) : node.type === 'label' ? (
      <TagOutlined className="text-cyan-400 scene-tree-icon" />
    ) : node.type === 'mesh' ? (
      <BlockOutlined className="text-blue-400 scene-tree-icon" />
    ) : node.type === 'group' ? (
      <AppstoreOutlined className="text-gray-400 scene-tree-icon" />
    ) : (
      <BoxPlotOutlined className="text-indigo-400 scene-tree-icon" />
    );

  return (
    <div>
      <div
        onClick={() => !isEditing && onSelect(node)}
        className={`group scene-tree-row flex items-center gap-1 min-h-[26px] py-0.5 cursor-pointer transition-colors hover:bg-gray-800/80 ${
          selected ? 'bg-blue-600/25 border-l-2 border-blue-500' : 'border-l-2 border-transparent'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.key);
          }}
          className="scene-tree-chevron w-4 h-4 inline-flex items-center justify-center shrink-0 text-gray-500 hover:text-white"
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </button>

        <span className="scene-tree-icon-wrap inline-flex items-center justify-center shrink-0">
          {icon}
        </span>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setEditValue(node.name);
                setIsEditing(false);
              }
            }}
            className="scene-tree-rename-input flex-1 min-w-0 mr-1 px-1 py-0 text-white text-xs bg-gray-700 border border-blue-500 rounded focus:outline-none"
          />
        ) : (
          <span className="scene-tree-label flex-1 text-white text-xs truncate">
            {node.name || '未命名'}
          </span>
        )}

        {!isEditing && (
          <button
            type="button"
            onClick={startRename}
            className="scene-tree-rename inline-flex items-center justify-center w-5 h-5 text-gray-600 hover:text-blue-400 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="重命名"
          >
            <EditOutlined />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node);
          }}
          className="scene-tree-delete mr-2 inline-flex items-center justify-center w-5 h-5 text-gray-600 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          title="删除"
        >
          <DeleteOutlined />
        </button>
      </div>

      {expanded &&
        node.children.map((child) => (
          <TreeNodeItem
            key={child.key}
            node={child}
            depth={depth + 1}
            expandedKeys={expandedKeys}
            onToggleExpand={onToggleExpand}
            isNodeSelected={isNodeSelected}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
    </div>
  );
}

export function SceneTree() {
  const { objects, selectedIds, selectObject, removeObject, getThreeObject, deselectAll, updateObject } =
    useSceneStore();
  const { lights, selectedLightId, selectLight, removeLight, updateLight } = useLightStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const buildTreeNode = useCallback((obj: THREE.Object3D, term: string): TreeNode | null => {
    const name = obj.name || '';
    const nameMatch = !term || name.toLowerCase().includes(term.toLowerCase());

    const children: TreeNode[] = [];
    obj.children.forEach((child) => {
      if (isHelperObject(child)) return;
      const childNode = buildTreeNode(child, term);
      if (childNode) children.push(childNode);
    });

    const childMatch = children.length > 0;
    if (!nameMatch && !childMatch) return null;

    const id = obj.userData?.id || obj.userData?.businessId || obj.uuid;

    let type: TreeNode['type'] = 'model';
    if (obj.userData?.type === 'label' || obj.userData?.labelConfig) {
      type = 'label';
    } else if (obj.userData?.isParticleEmitter) {
      type = 'particle';
    } else if (obj instanceof THREE.Mesh) type = 'mesh';
    else if (obj instanceof THREE.Group || children.length > 0) type = 'group';

    return {
      key: `obj-${obj.uuid}`,
      id,
      uuid: obj.uuid,
      name: name || (type === 'mesh' ? 'Mesh' : type === 'label' ? '标签' : 'Group'),
      type,
      children: type === 'label' ? [] : children,
    };
  }, []);

  const buildSceneTree = useCallback(() => {
    const scene = (window as any).__editorScene as THREE.Scene | undefined;
    if (!scene) return;

    const nodes: TreeNode[] = [];
    const term = searchTerm.trim().toLowerCase();

    lights.forEach((light) => {
      if (!term || light.name.toLowerCase().includes(term)) {
        nodes.push({
          key: `light-${light.id}`,
          id: light.id,
          uuid: '',
          name: light.name,
          type: 'light',
          children: [],
        });
      }
    });

    scene.children.forEach((child) => {
      if (isHelperObject(child)) return;
      const rootNode = buildTreeNode(child, term);
      if (rootNode) nodes.push(rootNode);
    });

    setTreeData(nodes);
  }, [lights, searchTerm, buildTreeNode]);

  useEffect(() => {
    buildSceneTree();
    const interval = setInterval(buildSceneTree, 800);
    return () => clearInterval(interval);
  }, [buildSceneTree]);

  const isNodeSelected = useCallback(
    (node: TreeNode) => {
      if (node.type === 'light') return selectedLightId === node.id;
      return selectedIds.includes(node.id) || selectedIds.includes(node.uuid);
    },
    [selectedIds, selectedLightId]
  );

  // 选中时自动展开父级
  useEffect(() => {
    const keysToExpand = new Set<string>();

    const walk = (nodes: TreeNode[], ancestors: string[]) => {
      for (const node of nodes) {
        const path = [...ancestors, node.key];
        if (isNodeSelected(node)) {
          ancestors.forEach((k) => keysToExpand.add(k));
        }
        if (node.children.length) walk(node.children, path);
      }
    };
    walk(treeData, []);

    if (keysToExpand.size > 0) {
      setExpandedKeys((prev) => new Set([...prev, ...keysToExpand]));
    }
  }, [selectedIds, selectedLightId, treeData, isNodeSelected]);

  const handleSelect = useCallback(
    (node: TreeNode) => {
      const scene = (window as any).__editorScene as THREE.Scene | undefined;
      const transformControls = (window as any).__editorTransformControls;

      if (node.type === 'light') {
        deselectAll();
        selectLight(node.id);
        if (transformControls) {
          transformControls.detach();
        }
        return;
      }

      selectObject(node.id);
      selectLight(null);

      if (scene && transformControls) {
        const threeObj = findThreeObjectById(scene, node.id, getThreeObject);
        if (threeObj) {
          transformControls.attach(threeObj);
        } else {
          transformControls.detach();
        }
      }
    },
    [selectObject, selectLight, deselectAll, getThreeObject]
  );

  const handleDelete = useCallback(
    (node: TreeNode) => {
      if (node.type === 'light') {
        if (selectedLightId === node.id) selectLight(null);
        removeLight(node.id);
        return;
      }

      const scene = (window as any).__editorScene as THREE.Scene | undefined;
      if (!scene) return;

      const targetObj = findThreeObjectById(scene, node.id, getThreeObject);
      if (!targetObj) return;

      const transformControls = (window as any).__editorTransformControls;
      if (transformControls?.object === targetObj) transformControls.detach();

      if (selectedIds.includes(node.id) || selectedIds.includes(node.uuid)) {
        deselectAll();
      }

      targetObj.parent?.remove(targetObj);
      disposeLabelAnchor(targetObj);
      disposeObject3DResources(targetObj);

      const storeId = objects.find((o) => o.id === node.id || o.id === targetObj.uuid)?.id;
      if (storeId) {
        removeObject(storeId);
      } else if (targetObj.userData?.id) {
        removeObject(targetObj.userData.id);
      }
    },
    [selectedLightId, selectedIds, selectLight, removeLight, getThreeObject, deselectAll, objects, removeObject]
  );

  const handleRename = useCallback(
    (node: TreeNode, newName: string) => {
      if (node.type === 'light') {
        updateLight(node.id, { name: newName });
        return;
      }

      const scene = (window as any).__editorScene as THREE.Scene | undefined;
      if (!scene) return;

      const targetObj = findThreeObjectById(scene, node.id, getThreeObject);
      if (targetObj) {
        targetObj.name = newName;
      }

      const storeId = objects.find((o) => o.id === node.id || o.id === targetObj?.uuid)?.id;
      if (storeId) {
        updateObject(storeId, { name: newName });
      }
    },
    [updateLight, getThreeObject, objects, updateObject]
  );

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const objectCount = useMemo(() => {
    let count = 0;
    const countNodes = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        if (n.type !== 'light') count++;
        countNodes(n.children);
      });
    };
    countNodes(treeData);
    return count + lights.length;
  }, [treeData, lights]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="px-2 py-2 border-b border-gray-700 shrink-0">
        <div className="scene-tree-search flex items-center gap-1.5 bg-gray-800 rounded px-2 py-1.5">
          <span className="scene-tree-icon-wrap inline-flex items-center justify-center shrink-0 text-gray-500">
            <SearchOutlined />
          </span>
          <input
            type="text"
            placeholder="搜索对象..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-white text-xs leading-4 placeholder-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {treeData.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-xs">
            {searchTerm ? '未找到匹配对象' : '场景为空'}
          </div>
        ) : (
          treeData.map((node) => (
            <TreeNodeItem
              key={node.key}
              node={node}
              depth={0}
              expandedKeys={expandedKeys}
              onToggleExpand={toggleExpand}
              isNodeSelected={isNodeSelected}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))
        )}
      </div>

      <div className="px-2 py-1 border-t border-gray-700 text-[10px] text-gray-500 text-center shrink-0">
        {objectCount} 个对象
      </div>
    </div>
  );
}
