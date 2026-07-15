import { useMemo, useState } from 'react';
import { Modal, Radio, Space, Typography } from 'antd';
import { useEditorNotify } from '@/hooks/useEditorNotify';
import { useUIEditorStore } from '@/store/uiEditorStore';
import {
  exportUIProjectPackage,
  type UIExportFormat,
} from '@/utils/uiProjectExporter';

interface UIExportModalProps {
  open: boolean;
  onClose: () => void;
}

const FORMAT_OPTIONS: { value: UIExportFormat; label: string; desc: string }[] = [
  {
    value: 'html',
    label: 'HTML',
    desc: '按画布名称生成多个 HTML，与 assets 同级，可直接浏览器预览',
  },
  {
    value: 'vue',
    label: 'Vue',
    desc: '按画布名称生成 .vue，与 assets 同级',
  },
  {
    value: 'react',
    label: 'React',
    desc: '按画布名称生成 .tsx/.css，与 assets 同级',
  },
];

export function UIExportModal({ open, onClose }: UIExportModalProps) {
  const notify = useEditorNotify();
  const [format, setFormat] = useState<UIExportFormat>('html');
  const [exporting, setExporting] = useState(false);
  const pages = useUIEditorStore((s) => s.pages);
  const pageCount = pages.length;
  const elementCount = useMemo(
    () => pages.reduce((sum, p) => sum + p.elements.length, 0),
    [pages]
  );

  const handleOk = async () => {
    const snapshot = useUIEditorStore.getState().getPagesSnapshot();
    const totalElements = snapshot.reduce((sum, p) => sum + p.elements.length, 0);
    if (totalElements === 0) {
      notify.warning('所有画布均为空，请先添加 UI 元素');
      return;
    }

    setExporting(true);
    try {
      const result = await exportUIProjectPackage(snapshot, format);
      const detail = [
        `${result.pageCount} 个页面`,
        result.imageCount > 0 ? `${result.imageCount} 张图片` : null,
      ]
        .filter(Boolean)
        .join('，');
      notify.success(`已导出 ${format.toUpperCase()} 项目包：${result.filename}（${detail}）`);
      onClose();
    } catch (error) {
      console.error(error);
      notify.error(error instanceof Error ? error.message : '项目包导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      title="导出界面"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={exporting ? '导出中…' : '开始导出'}
      cancelText="取消"
      confirmLoading={exporting}
      destroyOnHidden
      width={480}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        仅导出 UI 编排内容（不含 3D 场景）。当前共 {pageCount} 个画布、{elementCount} 个元素。
      </Typography.Paragraph>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        导出格式
      </Typography.Text>
      <Radio.Group
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {FORMAT_OPTIONS.map((opt) => (
            <Radio
              key={opt.value}
              value={opt.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '10px 12px',
                border: format === opt.value ? '1px solid #3b82f6' : '1px solid #343848',
                borderRadius: 8,
                background: format === opt.value ? 'rgba(59,130,246,0.08)' : 'transparent',
                width: '100%',
                marginInlineEnd: 0,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: '#e5e7eb' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </Modal>
  );
}
