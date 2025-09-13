// E:\3_CODING\Personally\english_practice\frontend\src\components\ConvertedModal\ConvertedModal.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ConvertedModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Prefill nội dung (tuỳ chọn) */
  initialText?: string;
  /** Tự focus vào khung nhập khi mở (mặc định true) */
  autoFocus?: boolean;
}

const ConvertedModal: React.FC<ConvertedModalProps> = ({
  open,
  onClose,
  title = 'Converted Modal',
  initialText = '',
  autoFocus = true,
}) => {
  const labelledId = 'converted-modal-title';
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'err'>('idle');

  // Tránh lặp vô hạn khi tự bọc selection
  const wrappingRef = useRef(false);

  // Focus khi mở
  useEffect(() => {
    if (!open) return;
    if (!autoFocus) return;
    const t = setTimeout(() => {
      contentRef.current?.focus();
      placeCaretEnd(contentRef.current!);
    }, 0);
    return () => clearTimeout(t);
  }, [open, autoFocus]);

  // Prefill nội dung khi mở
  useEffect(() => {
    if (!open) return;
    if (!contentRef.current) return;
    setPlainText(contentRef.current, initialText);
    placeCaretEnd(contentRef.current);
  }, [open, initialText]);

  // Lắng nghe việc bôi đen (selection) để tự bọc bằng <...>
  useEffect(() => {
    if (!open) return;

    const onSelectionChange = () => {
      if (wrappingRef.current) return;

      const root = contentRef.current;
      if (!root) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      // Selection phải nằm trong editor
      const anchor = sel.anchorNode;
      const focus = sel.focusNode;
      if (!anchor || !focus) return;
      if (!root.contains(anchor) || !root.contains(focus)) return;
      if (sel.isCollapsed) return;

      // Lấy range & text
      const range = sel.getRangeAt(0);
      const selectedText = range.toString();
      if (!selectedText) return;

      // Bọc bằng <...> bằng cách thay nội dung range = text node mới
      wrappingRef.current = true;
      try {
        range.deleteContents();
        const node = document.createTextNode(`<${selectedText}>`);
        range.insertNode(node);

        // Đưa caret về sau đoạn vừa chèn để tránh bọc tiếp
        const r = document.createRange();
        r.setStartAfter(node);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } finally {
        // Trả cờ về false sau microtask
        setTimeout(() => (wrappingRef.current = false), 0);
      }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [open]);

  // Paste: chỉ nhận text thuần, chèn vào caret
  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    insertPlainTextAtCaret(text.replace(/\r\n?/g, '\n'));
  };

  // Đóng modal khi nhấn ESC
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Sao chép toàn bộ nội dung (đã bảo đảm không còn '><' dính nhau)
  const handleCopyAll = async () => {
    try {
      const raw = contentRef.current?.innerText ?? '';
      const fixed = ensureBetweenAnglePairs(raw); // thêm 1 space giữa mọi '><'
      await navigator.clipboard.writeText(fixed);
      setCopied('ok');
      setTimeout(() => setCopied('idle'), 2000);
    } catch {
      setCopied('err');
      setTimeout(() => setCopied('idle'), 2000);
    }
  };

  if (!open) return null;

  return (
    <div
      className="converted-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        className="converted-modal"
        style={{
          width: 'min(960px, 92vw)',
          maxHeight: '82vh',
          background: '#fff',
          color: '#111',
          borderRadius: 12,
          boxShadow: '0 10px 28px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="converted-modal-header"
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <strong id={labelledId} style={{ fontSize: 14 }}>
            {title}
          </strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleCopyAll}
              title="Copy toàn bộ (tự thêm khoảng trắng giữa mọi '><')"
              style={btnStyle()}
            >
              {copied === 'ok' ? '✅ Copied' : copied === 'err' ? '❌ Lỗi' : '📄 Copy all'}
            </button>
            <button type="button" onClick={onClose} style={btnStyle()}>
              ✖
            </button>
          </div>
        </div>

        <div
          className="converted-modal-body"
          style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div
            style={{
              fontSize: 12,
              color: '#6b7280',
              lineHeight: 1.5,
            }}
          >
            Ctrl/Cmd+V để dán văn bản. Sau đó, bất kỳ phần văn bản nào bạn bôi đen sẽ tự động
            được bọc bằng <code>&lt;</code> ở đầu và <code>&gt;</code> ở cuối. Khi bấm{' '}
            <b>Copy all</b>, hệ thống sẽ chèn một dấu cách giữa mọi cặp <code>&gt;&lt;</code> dính liền.
          </div>

          <div
            ref={contentRef}
            className="converted-editor"
            contentEditable
            suppressContentEditableWarning
            onPaste={handlePaste}
            style={{
              minHeight: 260,
              maxHeight: '58vh',
              overflow: 'auto',
              padding: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              outline: 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
            }}
            aria-label="Converted editor"
          />
        </div>
      </div>
    </div>
  );
};

/* ===================== Helpers ===================== */

function btnStyle(): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1.2,
  };
}

function setPlainText(container: HTMLElement, text: string) {
  // Dùng textContent để tránh interpret HTML
  container.textContent = text.replace(/\r\n?/g, '\n');
}

function placeCaretEnd(container?: HTMLElement | null) {
  if (!container) return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertPlainTextAtCaret(text: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  // đặt caret sau node
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Đảm bảo giữa mọi cặp '><' luôn có ÍT NHẤT một ký tự.
 * Ở đây theo yêu cầu, nếu thấy '><' liền nhau thì chèn một dấu cách ở giữa.
 */
function ensureBetweenAnglePairs(s: string): string {
  // Thay mọi '><' thành '> <'
  return s.replace(/></g, '> <');
}

export default ConvertedModal;
