import {
  Button,
  ColorPicker,
  Input,
  InputNumber,
  Select,
  Slider,
  Switch,
  Upload,
} from 'antd';
import type {
  ButtonProps,
  InputNumberProps,
  InputProps,
  SelectProps,
  SliderSingleProps,
  SwitchProps,
  UploadProps,
} from 'antd';
import type { ReactNode } from 'react';

export const PANEL_SELECT_CLASS = 'panel-select';
export const panelSelectClassNames = { popup: { root: 'panel-select-popup' } };

export function PanelSelect({ className, classNames, ...props }: SelectProps) {
  return (
    <Select
      size="small"
      className={[PANEL_SELECT_CLASS, 'w-full', className].filter(Boolean).join(' ')}
      classNames={{
        ...panelSelectClassNames,
        ...classNames,
        popup: {
          ...panelSelectClassNames.popup,
          ...classNames?.popup,
        },
      }}
      {...props}
    />
  );
}

export function PanelInputNumber({ className, ...props }: InputNumberProps) {
  return (
    <InputNumber
      size="small"
      className={['!w-full', className].filter(Boolean).join(' ')}
      controls={false}
      {...props}
    />
  );
}

export function PanelInput(props: InputProps) {
  return <Input size="small" {...props} />;
}

export function PanelSlider(props: SliderSingleProps) {
  return <Slider className="panel-slider" {...props} />;
}

export function PanelSwitch(props: SwitchProps) {
  return <Switch size="small" {...props} />;
}

export function PanelButton({ block = true, size = 'small', ...props }: ButtonProps) {
  return <Button size={size} block={block} {...props} />;
}

interface PanelColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
  showHexInput?: boolean;
}

export function PanelColorField({ value, onChange, showHexInput = true }: PanelColorFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <ColorPicker
        size="small"
        value={value}
        onChange={(_, hex) => onChange(hex)}
        showText={false}
      />
      {showHexInput && (
        <PanelInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono"
        />
      )}
    </div>
  );
}

interface PanelSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export function PanelSliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
}: PanelSliderRowProps) {
  return (
    <div className="mb-2.5">
      <label className="text-[11px] text-gray-400 block mb-1">
        {label}: {format(value)}
      </label>
      <PanelSlider min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  );
}

interface PanelFileButtonProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onFiles: (files: FileList) => void;
  children: ReactNode;
  type?: ButtonProps['type'];
  className?: string;
  block?: boolean;
}

/** 文件选择按钮（底层使用 Upload，不展示文件列表） */
export function PanelFileButton({
  accept,
  multiple,
  disabled,
  loading,
  onFiles,
  children,
  type = 'primary',
  className,
  block = true,
}: PanelFileButtonProps) {
  const uploadProps: UploadProps = {
    accept,
    multiple,
    showUploadList: false,
    disabled: disabled || loading,
    beforeUpload: (file, fileList) => {
      const isLast = fileList.indexOf(file) === fileList.length - 1;
      if (!isLast) return false;
      const dt = new DataTransfer();
      fileList.forEach((item) => dt.items.add(item));
      onFiles(dt.files);
      return false;
    },
  };

  return (
    <Upload {...uploadProps}>
      <Button type={type} block={block} disabled={disabled} loading={loading} className={className}>
        {children}
      </Button>
    </Upload>
  );
}
