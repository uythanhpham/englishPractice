'use client';

import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import './InputModal.css';

export interface InputModalProps {
  open: boolean;
  title?: string;
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  autoFocus?: boolean;

  percentValue?: number | undefined;
  onPercentChange?: (val: number | undefined) => void;
  percentLabel?: string;
  percentMin?: number;
  percentMax?: number;
  percentStep?: number;

  onReceiveConverted?: (text: string) => void;

  /** (Tuỳ chọn) Endpoint BE — mặc định như cũ */
  convertApiUrl?: string;

  /** (Tuỳ chọn) mode khởi tạo, mặc định 0 */
  initialMode?: 0 | 1;
}

const InputModal = React.forwardRef<HTMLTextAreaElement, InputModalProps>(
  (
    {
      open,
      title = 'Dán văn bản',
      value,
      onChange,
      onClose,
      onConfirm,
      placeholder = 'Paste văn bản của bạn vào đây…',
      confirmLabel = 'Chèn (Ctrl/Cmd+Enter)',
      cancelLabel = 'Hủy',
      autoFocus = true,

      percentValue,
      onPercentChange,
      percentLabel = 'Tỉ lệ (%)',
      percentMin = 0,
      percentMax = 100,
      percentStep = 1,

      onReceiveConverted,

      convertApiUrl = 'http://localhost:8000/api/convert',
      initialMode = 0,
    },
    ref
  ) => {
    const localTARef = useRef<HTMLTextAreaElement>(null);
    const labelledId = 'input-modal-title';

    const [internalPercent, setInternalPercent] = useState<string>('');
    const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

    // === NEW: state cho mode (0/1) ===
    const [mode, setMode] = useState<0 | 1>(initialMode);

    useImperativeHandle(ref, () => localTARef.current as HTMLTextAreaElement);

    useEffect(() => {
      if (open && autoFocus) {
        const t = setTimeout(() => localTARef.current?.focus(), 0);
        return () => clearTimeout(t);
      }
    }, [open, autoFocus]);

    useEffect(() => {
      if (open) {
        setInternalPercent(
          percentValue !== undefined && !Number.isNaN(percentValue) ? String(percentValue) : ''
        );
        setSendStatus('idle');

        // Khi mở modal, default mode = initialMode (mặc định 0)
        setMode(initialMode ?? 0);
      }
    }, [open, percentValue, initialMode]);

    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

    const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleSend = async () => {
      try {
        setSendStatus('sending');

        const pctNumRaw =
          internalPercent === '' ? 0 : Number.isNaN(Number(internalPercent)) ? 0 : Number(internalPercent);
        const pctNum = clamp(pctNumRaw, percentMin ?? 0, percentMax ?? 100);

        const res = await fetch(convertApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: value,
            percent: pctNum,
            seed: Date.now(),
            mode, // === NEW: gửi mode lên BE ===
          }),
        });

        if (!res.ok) throw new Error('Gửi thất bại');

        const data = await res.json();
        console.log('Kết quả từ BE:', data);

        setSendStatus('success');

        if (onReceiveConverted && data?.converted) {
          onReceiveConverted(data.converted);
        }

        setTimeout(() => setSendStatus('idle'), 3000);
      } catch (err) {
        console.error(err);
        setSendStatus('error');
        setTimeout(() => setSendStatus('idle'), 3000);
      }
    };

    if (!open) return null;

    return (
      <div
        className="modal-backdrop"
        aria-modal="true"
        role="dialog"
        aria-labelledby={labelledId}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal">
          <div className="modal-header">
            <strong id={labelledId}>{title}</strong>
          </div>

          <div className="modal-body">
            <div className="percent-row">
              <label htmlFor="percentInput">{percentLabel}</label>
              <input
                id="percentInput"
                type="number"
                min={percentMin}
                max={percentMax}
                step={percentStep}
                value={internalPercent}
                onChange={(e) => {
                  const raw = e.target.value;
                  setInternalPercent(raw);

                  if (onPercentChange) {
                    if (raw === '') {
                      onPercentChange(undefined);
                    } else {
                      const num = Number(raw);
                      onPercentChange(Number.isNaN(num) ? undefined : num);
                    }
                  }
                }}
                placeholder={`${percentMin}-${percentMax}`}
              />
              <span className="percent-suffix">%</span>
            </div>

            {/* NEW: hàng chọn Mode 0/1 */}
            <div
              className="mode-row"
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
            >
              <label style={{ minWidth: 80 }}>Mode</label>
              <button
                type="button"
                className="toggle-btn btn-small"
                onClick={() => setMode((m) => (m === 0 ? 1 : 0))}
                title="Chuyển giữa mode 0 và 1"
              >
                Mode: <b>{mode}</b>
              </button>
              <div style={{ fontSize: 12, color: '#666' }}>
                {mode === 0
                  ? 'Thay ngẫu nhiên theo từ (\\w+)'
                  : 'Thay theo cụm <...> rồi gỡ dấu < >'}
              </div>
            </div>

            <textarea
              ref={localTARef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 1
                  ? 'Nhập chuỗi dạng "<Tóm lại>, <mặc dù> <...>" để xử lý theo cụm'
                  : placeholder
              }
            />
          </div>

          <div className="modal-actions">
            <div className="action-left">
              <button className="toggle-btn btn-small" onClick={onClose}>
                {cancelLabel}
              </button>
            </div>

            <div className="action-center">
              <button className="toggle-btn btn-large main-send-btn" onClick={handleSend}>
                {sendStatus === 'sending' && '⏳ Đang gửi…'}
                {sendStatus === 'success' && '✅ Đã gửi'}
                {sendStatus === 'error' && '❌ Lỗi'}
                {sendStatus === 'idle' && '🚀 Gửi đến Server'}
              </button>
            </div>

            <div className="action-right">
              <button className="toggle-btn btn-small" onClick={onConfirm}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

InputModal.displayName = 'InputModal';
export default InputModal;
