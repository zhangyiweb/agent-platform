import { useState } from 'react';
import { Modal, Input, Button, Tag } from 'antd';
import { parseLanhuCss } from '@/utils/uiCssParser';

const { TextArea } = Input;

interface CssImportModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (result: ReturnType<typeof parseLanhuCss>) => void;
}

export function CssImportModal({ open, onClose, onApply }: CssImportModalProps) {
  const [cssText, setCssText] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseLanhuCss> | null>(null);

  const handleParse = () => {
    const result = parseLanhuCss(cssText);
    setPreview(result);
    return result;
  };

  const handleApply = () => {
    const result = preview ?? handleParse();
    if (result.applied.length === 0) return;
    onApply(result);
    setCssText('');
    setPreview(null);
    onClose();
  };

  const handleClose = () => {
    setPreview(null);
    onClose();
  };

  return (
    <Modal
      title="识别蓝湖 CSS"
      open={open}
      onCancel={handleClose}
      width={520}
      className="ui-css-import-modal"
      footer={[
        <Button key="cancel" onClick={handleClose}>
          取消
        </Button>,
        <Button key="parse" onClick={handleParse}>
          预览识别
        </Button>,
        <Button key="apply" type="primary" onClick={handleApply} disabled={!cssText.trim()}>
          应用到选中组件
        </Button>,
      ]}
    >
      <p className="ui-css-import-hint">
        从蓝湖复制 CSS 代码粘贴到下方，支持尺寸、位置、字体、颜色、背景、边框、阴影等属性。
      </p>
      <TextArea
        rows={10}
        value={cssText}
        onChange={(e) => {
          setCssText(e.target.value);
          setPreview(null);
        }}
        placeholder={`width: 200px;\nheight: 40px;\nfont-size: 16px;\ncolor: #FFFFFF;\nfont-family: PingFangSC-Regular, PingFang SC;\nbackground: rgba(59,130,246,0.15);\nborder-radius: 4px;`}
        className="ui-css-import-textarea"
      />

      {preview && (
        <div className="ui-css-import-preview">
          <div className="ui-css-import-preview-title">
            已识别 {preview.applied.length} 项
            {preview.unrecognized.length > 0 && (
              <span className="ui-css-import-skip"> · 跳过 {preview.unrecognized.length} 项</span>
            )}
          </div>
          <div className="ui-css-import-tags">
            {preview.applied.map((item) => (
              <Tag key={item} color="blue" className="ui-css-tag">
                {item}
              </Tag>
            ))}
          </div>
          {preview.unrecognized.length > 0 && (
            <div className="ui-css-import-unrecognized">
              {preview.unrecognized.map((item) => (
                <Tag key={item} className="ui-css-tag">
                  {item}
                </Tag>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
