import { useState, useEffect, useMemo } from 'react';
import { Input, Select, Spin, Empty, Button, Tooltip } from 'antd';
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import {
  fetchAllHdris,
  fetchHdriCategories,
  HDR_RESOLUTIONS,
  type HdriAsset,
  type HdriCategory,
  type HdrResolution,
} from '@/utils/polyhaven';

interface HdriPickerProps {
  resolution: HdrResolution;
  onResolutionChange: (res: HdrResolution) => void;
  selectedId: string | null;
  loadingId: string | null;
  onSelect: (asset: HdriAsset) => void;
  canDownload?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
}

export function HdriPicker({
  resolution,
  onResolutionChange,
  selectedId,
  loadingId,
  onSelect,
  canDownload = false,
  downloading = false,
  onDownload,
}: HdriPickerProps) {
  const [hdris, setHdris] = useState<HdriAsset[]>([]);
  const [categories, setCategories] = useState<HdriCategory[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    Promise.all([fetchAllHdris(), fetchHdriCategories()])
      .then(([assets, cats]) => {
        if (cancelled) return;
        setHdris(assets);
        setCategories(cats);
      })
      .catch((err) => {
        if (!cancelled) {
          setListError(err instanceof Error ? err.message : '加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hdris.filter((item) => {
      const matchCategory =
        category === 'all' ||
        item.categories.includes(category) ||
        item.tags.includes(category);
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });
  }, [hdris, search, category]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* 筛选栏 */}
      <div className="shrink-0 flex gap-1.5">
        <Select
          size="small"
          value={resolution}
          onChange={onResolutionChange}
          className="flex-1 hdri-select"
          classNames={{ popup: { root: 'hdri-select-dropdown' } }}
          options={HDR_RESOLUTIONS.map((r) => ({ value: r, label: r.toUpperCase() }))}
        />
        <Select
          size="small"
          value={category}
          onChange={setCategory}
          className="flex-1 hdri-select"
          classNames={{ popup: { root: 'hdri-select-dropdown' } }}
          options={[
            { value: 'all', label: '全部分类' },
            ...categories.map((c) => ({ value: c.name, label: `${c.label} (${c.count})` })),
          ]}
        />
        <Tooltip title={canDownload ? '下载当前场景的 HDR' : '请先应用 HDRI'}>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={downloading}
            disabled={!canDownload || downloading}
            onClick={onDownload}
            className="hdri-download-btn shrink-0"
          />
        </Tooltip>
      </div>

      <Input
        size="small"
        placeholder="搜索 HDRI..."
        prefix={<SearchOutlined className="text-gray-500" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="shrink-0 hdri-search"
        allowClear
      />

      {/* 列表 — 填满剩余空间 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {listLoading && (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-gray-500 gap-2">
            <Spin size="small" />
            <span>正在从 Poly Haven 加载...</span>
          </div>
        )}

        {listError && (
          <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-xs text-red-300">
            {listError}
          </div>
        )}

        {!listLoading && !listError && (
          <>
            <div className="shrink-0 text-[10px] text-gray-600 mb-1.5 px-0.5">
              共 {filtered.length} 个 · 点击应用
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto hdri-grid-scroll pr-0.5">
              {filtered.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的 HDRI" className="py-8" />
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {filtered.map((item) => {
                    const isSelected = selectedId === item.id;
                    const isLoading = loadingId === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item)}
                        disabled={!!loadingId}
                        className={`
                          hdri-thumb relative rounded-md overflow-hidden border text-left transition-all
                          ${isSelected
                            ? 'border-blue-500 ring-1 ring-blue-500/50'
                            : 'border-gray-700/80 hover:border-gray-500'
                          }
                          ${loadingId && !isLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                        title={item.name}
                      >
                        <div className="aspect-[2/1] bg-gray-800 relative">
                          <img
                            src={item.thumbnail_url}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              if (item.fallback_thumbnail) {
                                (e.target as HTMLImageElement).src = item.fallback_thumbnail;
                              }
                            }}
                          />
                          {isLoading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <Spin size="small" />
                            </div>
                          )}
                          {isSelected && !isLoading && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                              ✓
                            </div>
                          )}
                        </div>
                        <div className="px-1.5 py-0.5 bg-gray-900/90 border-t border-gray-800">
                          <div className="text-[10px] text-gray-300 truncate leading-tight">{item.name}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
