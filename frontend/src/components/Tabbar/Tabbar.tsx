// E:\3_CODING\Personally\english_practice\src\components\Tabbar\Tabbar.tsx
'use client';

import React, { useState } from 'react';
import ConvertedModal from '../ConvertedModal/ConvertedModal';

export interface TabbarProps {
  dark: boolean;
  onToggleDark: () => void;

  /** Callback ngoài (tuỳ chọn) sẽ được gọi trước khi mở modal nội bộ */
  onOpenConverted?: () => void;

  colorHex: string;
  onChangeColorHex: (hex: string) => void;

  colorOn: boolean;
  onToggleColor: () => void;

  onOpenPaste: () => void;

  /** Bật/tắt sticky (mặc định: true) */
  sticky?: boolean;
  /** Khoảng cách từ top (px) nếu muốn chừa header khác (mặc định: 0) */
  offsetTop?: number;
}

const Tabbar: React.FC<TabbarProps> = ({
  dark,
  onToggleDark,
  onOpenConverted,
  colorHex,
  onChangeColorHex,
  colorOn,
  onToggleColor,
  onOpenPaste,
  sticky = true,
  offsetTop = 0,
}) => {
  // NEW: trạng thái mở Converted Modal nội bộ
  const [showConverted, setShowConverted] = useState(false);

  const openConverted = () => {
    // nếu có callback ngoài thì gọi trước (để parent làm gì đó nếu muốn)
    onOpenConverted?.();
    setShowConverted(true);
  };

  const closeConverted = () => setShowConverted(false);

  return (
    <>
      <div
        role="toolbar"
        className={`toolbar toolbar-sticky`}
        style={
          sticky
            ? {
                position: 'sticky',
                top: offsetTop,
                zIndex: 50,
                background: 'var(--toolbar-bg, rgba(255,255,255,0.85))',
                backdropFilter: 'saturate(180%) blur(6px)',
                WebkitBackdropFilter: 'saturate(180%) blur(6px)',
                borderBottom: '1px solid var(--toolbar-border, #e5e7eb)',
                color: dark ? '#fff' : '#111',
              }
            : undefined
        }
      >
        <div className="color-wrap">
          <input
            type="color"
            id="colorPicker"
            value={colorHex}
            onChange={(e) => onChangeColorHex(e.target.value)}
          />
        </div>

        <button
          className={`toggle-btn${colorOn ? ' active' : ''}`}
          id="toggleColor"
          aria-pressed={colorOn}
          title="Bật/Tắt chế độ gõ có màu"
          onClick={onToggleColor}
        >
          {colorOn ? '🎨 ON' : '🎨 OFF'}
        </button>

        <button
          className="toggle-btn btn-small"
          id="openPaste"
          title="Paste văn bản vào vị trí con trỏ"
          onClick={onOpenPaste}
        >
          📋 Paste
        </button>

        {/* NEW: Nút nhỏ mở Converted Modal (luôn hiển thị) */}
        <button
          type="button"
          id="openConverted"
          title="Mở Converted Modal"
          aria-label="Mở Converted Modal"
          onClick={openConverted}
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            border: `1px solid ${dark ? '#333' : '#ddd'}`,
            background: dark ? '#222' : '#fff',
            color: dark ? '#fff' : '#111',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            userSelect: 'none',
            marginLeft: 8,
            fontSize: 12,
          }}
        >
          {'<>'}
        </button>

        <button
          type="button"
          onClick={onToggleDark}
          aria-pressed={dark}
          title={dark ? 'Tắt dark mode' : 'Bật dark mode'}
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            border: `1px solid ${dark ? '#333' : '#ddd'}`,
            background: dark ? '#222' : '#fff',
            color: dark ? '#fff' : '#111',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            userSelect: 'none',
            marginLeft: 8,
          }}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* NEW: Converted Modal nội bộ */}
      <ConvertedModal
        open={showConverted}
        onClose={closeConverted}
        title="Converted Modal"
        initialText=""
        autoFocus
      />
    </>
  );
};

export default Tabbar;
