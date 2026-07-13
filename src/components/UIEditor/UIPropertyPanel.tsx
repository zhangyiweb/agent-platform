import { useRef, useState, useEffect } from 'react';
import { Input, InputNumber, Select, ColorPicker, Slider, Button, Tabs } from 'antd';
import type { SelectProps } from 'antd';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { useEditorNotify } from '@/hooks/useEditorNotify';
import { CssImportModal } from './CssImportModal';
import type { ParsedCssResult } from '@/utils/uiCssParser';
import {
  BOX_SHADOW_PRESETS,
  CANVAS_PRESETS,
  FONT_FAMILY_CUSTOM,
  FONT_FAMILY_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  canHaveChildren,
  getFontFamilySelectValue,
} from '@/types/uiEditor';
import type { UIChartConfig } from '@/types/uiEditor';
import { getElementDomId } from '@/utils/uiElementDom';
import { PropertyGroup } from './PropertyGroup';
import { EchartPropertyPanels } from './EchartPropertyPanels';

const SELECT_POPUP_CLASSNAMES = { popup: { root: 'export-panel-select-popup' } };

const selectProps: Pick<SelectProps, 'size' | 'className' | 'classNames'> = {
  size: 'small',
  className: 'export-panel-select',
  classNames: SELECT_POPUP_CLASSNAMES,
};

export function UIPropertyPanel() {
  const notify = useEditorNotify();
  const {
    elements,
    selectedId,
    canvasWidth,
    canvasHeight,
    canvasBackground,
    showGrid,
    pages,
    activePageId,
    updateElement,
    updateElementStyle,
    updateElementHoverStyle,
    reparentElement,
    setCanvasSize,
    setCanvasBackground,
    toggleGrid,
    clearCanvas,
    getChildren,
    renamePage,
  } = useUIEditorStore();

  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];
  const activePageName = activePage?.name ?? '';

  const [activeTab, setActiveTab] = useState<'canvas' | 'element'>('canvas');
  const [cssModalOpen, setCssModalOpen] = useState(false);
  const [fontCustomMode, setFontCustomMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const selected = elements.find((el) => el.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setFontCustomMode(false);
      return;
    }
    setFontCustomMode(getFontFamilySelectValue(selected.style.fontFamily) === FONT_FAMILY_CUSTOM);
  }, [selectedId, selected?.style.fontFamily]);

  useEffect(() => {
    if (selectedId) setActiveTab('element');
  }, [selectedId]);

  const handleApplyCss = (result: ParsedCssResult) => {
    if (!selected) return;

    const { elementPatch, stylePatch } = result;
    const cleanElementPatch = Object.fromEntries(
      Object.entries(elementPatch).filter(([, v]) => v !== undefined)
    );
    const cleanStylePatch = Object.fromEntries(
      Object.entries(stylePatch).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(cleanElementPatch).length > 0) {
      updateElement(selected.id, cleanElementPatch);
    }
    if (Object.keys(cleanStylePatch).length > 0) {
      updateElementStyle(selected.id, cleanStylePatch);
      const fontFamily = cleanStylePatch.fontFamily;
      if (typeof fontFamily === 'string' && getFontFamilySelectValue(fontFamily) === FONT_FAMILY_CUSTOM) {
        setFontCustomMode(true);
      }
    }

    notify.success(`已应用 ${result.applied.length} 项 CSS 属性`);
    if (result.unrecognized.length > 0) {
      notify.warning(`有 ${result.unrecognized.length} 项未能识别`);
    }
  };

  const parentOptions = elements
    .filter((el) => canHaveChildren(el.type) && el.id !== selectedId)
    .map((el) => ({ label: el.name, value: el.id }));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'src' | 'backgroundImage') => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (field === 'src') {
          updateElement(selected.id, { src: reader.result });
        } else {
          updateElementStyle(selected.id, { backgroundImage: reader.result });
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateChartConfig = (patch: Partial<UIChartConfig>) => {
    if (!selected) return;
    updateElement(selected.id, {
      chartConfig: { ...selected.chartConfig, ...patch },
    });
  };

  const isTextLike =
    selected &&
    (selected.type === 'text' || selected.type === 'button' || selected.type === 'input');

  const isEchart = selected?.type === 'echart';

  const fontSelectValue = fontCustomMode
    ? FONT_FAMILY_CUSTOM
    : selected
      ? getFontFamilySelectValue(selected.style.fontFamily)
      : 'inherit';
  const isCustomFont = fontCustomMode;

  const canvasPanel = (
    <PropertyGroup title="画布设置">
      <div className="ui-property-row">
        <label>名称</label>
        <Input
          size="small"
          value={activePageName}
          placeholder="画布名称"
          onChange={(e) => {
            if (activePageId) renamePage(activePageId, e.target.value);
          }}
          style={{ flex: 1 }}
        />
      </div>
      <div className="ui-property-row">
        <label>尺寸</label>
        <Select
          {...selectProps}
          value={`${canvasWidth}x${canvasHeight}`}
          onChange={(val) => {
            const preset = CANVAS_PRESETS.find((p) => `${p.width}x${p.height}` === val);
            if (preset) setCanvasSize(preset.width, preset.height);
          }}
          options={CANVAS_PRESETS.map((p) => ({
            label: p.label,
            value: `${p.width}x${p.height}`,
          }))}
          style={{ flex: 1 }}
        />
      </div>
      <div className="ui-property-row">
        <label>背景色</label>
        <ColorPicker
          size="small"
          value={canvasBackground}
          onChange={(_, hex) => setCanvasBackground(hex)}
        />
      </div>
      <div className="ui-property-row">
        <label>网格</label>
        <Button size="small" onClick={toggleGrid}>
          {showGrid ? '隐藏网格' : '显示网格'}
        </Button>
      </div>
      <Button size="small" danger block onClick={clearCanvas} style={{ marginTop: 8 }}>
        清空当前画布
      </Button>
    </PropertyGroup>
  );

  const elementPanel = selected ? (
    <>
      {!isEchart && (
        <Button
          size="small"
          block
          className="ui-css-import-btn"
          onClick={() => setCssModalOpen(true)}
        >
          识别蓝湖 CSS
        </Button>
      )}

      <PropertyGroup title="基础">
        <div className="ui-property-row">
          <label>名称</label>
          <Input
            size="small"
            value={selected.name}
            onChange={(e) => updateElement(selected.id, { name: e.target.value })}
          />
        </div>
        <div className="ui-property-row">
          <label>父级</label>
          <Select
            {...selectProps}
            value={selected.parentId ?? '__root__'}
            onChange={(v) => reparentElement(selected.id, v === '__root__' ? null : v)}
            options={[{ label: '根层级', value: '__root__' }, ...parentOptions]}
            style={{ flex: 1 }}
          />
        </div>
        {selected.parentId && (
          <div className="ui-property-hint">子元素坐标相对于父容器</div>
        )}
        <div className="ui-property-row">
          <label>X</label>
          <InputNumber
            size="small"
            value={selected.x}
            onChange={(v) => updateElement(selected.id, { x: v ?? 0 })}
            style={{ width: '100%' }}
          />
        </div>
        <div className="ui-property-row">
          <label>Y</label>
          <InputNumber
            size="small"
            value={selected.y}
            onChange={(v) => updateElement(selected.id, { y: v ?? 0 })}
            style={{ width: '100%' }}
          />
        </div>
        <div className="ui-property-row">
          <label>宽</label>
          <InputNumber
            size="small"
            min={10}
            value={selected.width}
            onChange={(v) => updateElement(selected.id, { width: v ?? 10 })}
            style={{ width: '100%' }}
          />
        </div>
        <div className="ui-property-row">
          <label>高</label>
          <InputNumber
            size="small"
            min={10}
            value={selected.height}
            onChange={(v) => updateElement(selected.id, { height: v ?? 10 })}
            style={{ width: '100%' }}
          />
        </div>
        <div className="ui-property-row">
          <label>透明度</label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={selected.style.opacity ?? 1}
            onChange={(v) => updateElementStyle(selected.id, { opacity: v })}
          />
        </div>
        {canHaveChildren(selected.type) && (
          <div className="ui-property-hint">子元素：{getChildren(selected.id).length} 个</div>
        )}
        {selected.type === 'container' && (
          <div className="ui-property-hint">容器仅为布局区域，默认无背景与边框</div>
        )}
      </PropertyGroup>

      <PropertyGroup title="标识">
        <div className="ui-property-row">
          <label>ID</label>
          <Input
            size="small"
            placeholder="自定义 DOM id"
            value={selected.domId ?? ''}
            onChange={(e) => updateElement(selected.id, { domId: e.target.value || undefined })}
          />
        </div>
        <div className="ui-property-row">
          <label>Class</label>
          <Input
            size="small"
            placeholder="多个 class 用空格分隔"
            value={selected.className ?? ''}
            onChange={(e) => updateElement(selected.id, { className: e.target.value || undefined })}
          />
        </div>
        <div className="ui-property-hint">
          导出预览 id：{getElementDomId(selected)}
        </div>
      </PropertyGroup>

      {isEchart && selected && (
        <EchartPropertyPanels element={selected} onUpdate={updateChartConfig} />
      )}

      {isTextLike && !isEchart && (
        <PropertyGroup title="文本">
          <div className="ui-property-row">
            <label>内容</label>
            <Input
              size="small"
              value={selected.content}
              onChange={(e) => updateElement(selected.id, { content: e.target.value })}
            />
          </div>
          <div className="ui-property-row">
            <label>字体</label>
            <Select
              {...selectProps}
              value={fontSelectValue}
              onChange={(v) => {
                if (v === FONT_FAMILY_CUSTOM) {
                  setFontCustomMode(true);
                  if (!fontCustomMode && getFontFamilySelectValue(selected.style.fontFamily) !== FONT_FAMILY_CUSTOM) {
                    updateElementStyle(selected.id, { fontFamily: '' });
                  }
                } else {
                  setFontCustomMode(false);
                  updateElementStyle(selected.id, { fontFamily: v });
                }
              }}
              options={FONT_FAMILY_OPTIONS}
              style={{ flex: 1 }}
            />
          </div>
          {isCustomFont && (
            <div className="ui-property-row">
              <label>自定义</label>
              <Input
                size="small"
                placeholder='如 "My Font", sans-serif'
                value={selected.style.fontFamily || ''}
                onChange={(e) => updateElementStyle(selected.id, { fontFamily: e.target.value })}
              />
            </div>
          )}
          <div className="ui-property-row">
            <label>字号</label>
            <InputNumber
              size="small"
              min={8}
              max={200}
              value={selected.style.fontSize ?? 14}
              onChange={(v) => updateElementStyle(selected.id, { fontSize: v ?? 14 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>字重</label>
            <Select
              {...selectProps}
              value={selected.style.fontWeight ?? 400}
              onChange={(v) => updateElementStyle(selected.id, { fontWeight: v })}
              options={FONT_WEIGHT_OPTIONS}
              style={{ flex: 1 }}
            />
          </div>
          <div className="ui-property-row">
            <label>颜色</label>
            <ColorPicker
              size="small"
              value={selected.style.color || '#ffffff'}
              onChange={(_, hex) => updateElementStyle(selected.id, { color: hex })}
            />
          </div>
          <div className="ui-property-row">
            <label>对齐</label>
            <Select
              {...selectProps}
              value={selected.style.textAlign || 'left'}
              onChange={(v) => updateElementStyle(selected.id, { textAlign: v })}
              options={[
                { label: '左对齐', value: 'left' },
                { label: '居中', value: 'center' },
                { label: '右对齐', value: 'right' },
              ]}
              style={{ flex: 1 }}
            />
          </div>
          <div className="ui-property-row">
            <label>行高</label>
            <InputNumber
              size="small"
              min={0.5}
              max={5}
              step={0.1}
              value={typeof selected.style.lineHeight === 'number' ? selected.style.lineHeight : 1.5}
              onChange={(v) => updateElementStyle(selected.id, { lineHeight: v ?? 1.5 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>字间距</label>
            <InputNumber
              size="small"
              value={selected.style.letterSpacing ?? 0}
              onChange={(v) => updateElementStyle(selected.id, { letterSpacing: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>文字阴影</label>
            <Input
              size="small"
              placeholder="0 1px 2px rgba(0,0,0,0.5)"
              value={selected.style.textShadow || ''}
              onChange={(e) => updateElementStyle(selected.id, { textShadow: e.target.value })}
            />
          </div>
        </PropertyGroup>
      )}

      {selected.type === 'image' && (
        <PropertyGroup title="图片">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleImageUpload(e, 'src')}
            className="hidden"
          />
          <Button size="small" block onClick={() => fileInputRef.current?.click()}>
            上传切图
          </Button>
          {selected.src && (
            <div className="ui-image-preview">
              <img src={selected.src} alt="preview" />
            </div>
          )}
          <div className="ui-property-row" style={{ marginTop: 8 }}>
            <label>填充</label>
            <Select
              {...selectProps}
              value={selected.style.objectFit || 'cover'}
              onChange={(v) => updateElementStyle(selected.id, { objectFit: v })}
              options={[
                { label: '覆盖', value: 'cover' },
                { label: '包含', value: 'contain' },
                { label: '拉伸', value: 'fill' },
              ]}
              style={{ flex: 1 }}
            />
          </div>
        </PropertyGroup>
      )}

      {!isEchart && (
        <PropertyGroup title="样式">
          <div className="ui-property-row">
            <label>背景色</label>
            <ColorPicker
              size="small"
              value={selected.style.backgroundColor || 'transparent'}
              onChange={(_, hex) => updateElementStyle(selected.id, { backgroundColor: hex })}
              allowClear
            />
          </div>

          <input
            ref={bgImageInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleImageUpload(e, 'backgroundImage')}
            className="hidden"
          />
          <Button
            size="small"
            block
            onClick={() => bgImageInputRef.current?.click()}
            style={{ marginBottom: 8 }}
          >
            上传背景图
          </Button>
          {selected.style.backgroundImage && (
            <div className="ui-image-preview">
              <img src={selected.style.backgroundImage} alt="bg" />
            </div>
          )}

          {selected.style.backgroundImage && (
            <>
              <div className="ui-property-row" style={{ marginTop: 8 }}>
                <label>背景尺寸</label>
                <Select
                  {...selectProps}
                  value={selected.style.backgroundSize || 'cover'}
                  onChange={(v) => updateElementStyle(selected.id, { backgroundSize: v })}
                  options={[
                    { label: '覆盖', value: 'cover' },
                    { label: '包含', value: 'contain' },
                    { label: '拉伸', value: '100% 100%' },
                    { label: '自动', value: 'auto' },
                  ]}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="ui-property-row">
                <label>背景位置</label>
                <Select
                  {...selectProps}
                  value={selected.style.backgroundPosition || 'center'}
                  onChange={(v) => updateElementStyle(selected.id, { backgroundPosition: v })}
                  options={[
                    { label: '居中', value: 'center' },
                    { label: '顶部', value: 'top center' },
                    { label: '底部', value: 'bottom center' },
                    { label: '左侧', value: 'left center' },
                    { label: '右侧', value: 'right center' },
                  ]}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="ui-property-row">
                <label>背景重复</label>
                <Select
                  {...selectProps}
                  value={selected.style.backgroundRepeat || 'no-repeat'}
                  onChange={(v) => updateElementStyle(selected.id, { backgroundRepeat: v })}
                  options={[
                    { label: '不重复', value: 'no-repeat' },
                    { label: '重复', value: 'repeat' },
                    { label: '水平重复', value: 'repeat-x' },
                    { label: '垂直重复', value: 'repeat-y' },
                  ]}
                  style={{ flex: 1 }}
                />
              </div>
            </>
          )}

          <div className="ui-property-row">
            <label>圆角</label>
            <InputNumber
              size="small"
              min={0}
              value={selected.style.borderRadius ?? 0}
              onChange={(v) => updateElementStyle(selected.id, { borderRadius: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>内边距</label>
            <InputNumber
              size="small"
              min={0}
              value={selected.style.padding ?? 0}
              onChange={(v) => updateElementStyle(selected.id, { padding: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ui-property-row">
            <label>边框宽</label>
            <InputNumber
              size="small"
              min={0}
              value={selected.style.borderWidth ?? 0}
              onChange={(v) => updateElementStyle(selected.id, { borderWidth: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          {selected.style.borderWidth ? (
            <>
              <div className="ui-property-row">
                <label>边框色</label>
                <ColorPicker
                  size="small"
                  value={selected.style.borderColor || '#404040'}
                  onChange={(_, hex) => updateElementStyle(selected.id, { borderColor: hex })}
                />
              </div>
              <div className="ui-property-row">
                <label>边框样式</label>
                <Select
                  {...selectProps}
                  value={selected.style.borderStyle || 'solid'}
                  onChange={(v) => updateElementStyle(selected.id, { borderStyle: v })}
                  options={[
                    { label: '实线', value: 'solid' },
                    { label: '虚线', value: 'dashed' },
                    { label: '点线', value: 'dotted' },
                  ]}
                  style={{ flex: 1 }}
                />
              </div>
            </>
          ) : null}

          <div className="ui-property-row">
            <label>阴影</label>
            <Select
              {...selectProps}
              value={selected.style.boxShadow || ''}
              onChange={(v) => updateElementStyle(selected.id, { boxShadow: v })}
              options={BOX_SHADOW_PRESETS}
              style={{ flex: 1 }}
            />
          </div>
          <div className="ui-property-row">
            <label>自定义</label>
            <Input
              size="small"
              placeholder="box-shadow 值"
              value={selected.style.boxShadow || ''}
              onChange={(e) => updateElementStyle(selected.id, { boxShadow: e.target.value })}
            />
          </div>

          {canHaveChildren(selected.type) && (
            <>
              <div className="ui-property-row">
                <label>溢出</label>
                <Select
                  {...selectProps}
                  value={selected.style.overflow || 'visible'}
                  onChange={(v) => updateElementStyle(selected.id, { overflow: v })}
                  options={[
                    { label: '隐藏', value: 'hidden' },
                    { label: '可见', value: 'visible' },
                    { label: '滚动', value: 'auto' },
                  ]}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="ui-property-row">
                <label>模糊背景</label>
                <Input
                  size="small"
                  placeholder="blur(8px)"
                  value={selected.style.backdropFilter || ''}
                  onChange={(e) => updateElementStyle(selected.id, { backdropFilter: e.target.value })}
                />
              </div>
            </>
          )}
        </PropertyGroup>
      )}

      {!isEchart && (
        <PropertyGroup title="Hover">
          <div className="ui-property-hint">鼠标悬停时生效，可在编辑器中直接预览</div>
          <div className="ui-property-row">
            <label>背景色</label>
            <ColorPicker
              size="small"
              value={selected.hoverStyle?.backgroundColor}
              onChange={(_, hex) => updateElementHoverStyle(selected.id, { backgroundColor: hex })}
              allowClear
            />
          </div>
          <div className="ui-property-row">
            <label>文字色</label>
            <ColorPicker
              size="small"
              value={selected.hoverStyle?.color}
              onChange={(_, hex) => updateElementHoverStyle(selected.id, { color: hex })}
              allowClear
            />
          </div>
          <div className="ui-property-row">
            <label>透明度</label>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={selected.hoverStyle?.opacity ?? 1}
              onChange={(v) => updateElementHoverStyle(selected.id, { opacity: v })}
            />
          </div>
          <div className="ui-property-row">
            <label>阴影</label>
            <Select
              {...selectProps}
              value={selected.hoverStyle?.boxShadow || ''}
              onChange={(v) => updateElementHoverStyle(selected.id, { boxShadow: v })}
              options={BOX_SHADOW_PRESETS}
              style={{ flex: 1 }}
            />
          </div>
          <div className="ui-property-row">
            <label>边框色</label>
            <ColorPicker
              size="small"
              value={selected.hoverStyle?.borderColor}
              onChange={(_, hex) => updateElementHoverStyle(selected.id, { borderColor: hex })}
              allowClear
            />
          </div>
          <div className="ui-property-row">
            <label>光标</label>
            <Select
              {...selectProps}
              value={selected.hoverStyle?.cursor || ''}
              onChange={(v) => updateElementHoverStyle(selected.id, { cursor: v || undefined })}
              options={[
                { label: '默认', value: '' },
                { label: '手型', value: 'pointer' },
                { label: '移动', value: 'move' },
              ]}
              style={{ flex: 1 }}
            />
          </div>
          <Button
            size="small"
            block
            onClick={() => updateElement(selected.id, { hoverStyle: undefined })}
          >
            清除 Hover 样式
          </Button>
        </PropertyGroup>
      )}
    </>
  ) : (
    <div className="ui-property-empty">选中画布上的元素以编辑组件属性</div>
  );

  return (
    <div className="ui-property-panel">
      <Tabs
        className="ui-property-tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'canvas' | 'element')}
        items={[
          { key: 'canvas', label: '画布', children: canvasPanel },
          { key: 'element', label: '组件', children: elementPanel },
        ]}
      />

      <CssImportModal
        open={cssModalOpen}
        onClose={() => setCssModalOpen(false)}
        onApply={handleApplyCss}
      />
    </div>
  );
}
