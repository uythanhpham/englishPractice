// E:\3_CODING\Personally\english_practice\src\components\PictureFrame\PictureFrame.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PictureFrameProps {
  className?: string;
  initialSrc?: string;

  /** Kích thước khung cố định (mặc định TO hơn). */
  width?: number | string;   // default 960
  height?: number | string;  // default 420

  /** Callback khi có ảnh mới (paste/drop). */
  onChange?: (file: File, dataUrl: string) => void;
  /** Callback khi xoá ảnh. */
  onClear?: () => void;

  /** Giới hạn dung lượng (bytes) — mặc định 5MB. */
  maxBytes?: number;
  /** Cho phép kéo-thả ảnh (mặc định true). */
  enableDrop?: boolean;

  /** Sticky ngay dưới Tabbar */
  sticky?: boolean;
  /** Nên khớp với chiều cao Tabbar để không bị che (default 56). */
  stickyOffsetTop?: number;
  /** < Tabbar (50) để không đè (default 45). */
  stickyZIndex?: number;

  /** Giới hạn zoom (so với mức “fit”). */
  minZoom?: number; // 0.25 = 25%
  maxZoom?: number; // 8 = 800%
  /** Reset về fit khi đổi ảnh mới (default true). */
  resetOnNewImage?: boolean;

  /** Chừa khoảng trống bên dưới khung để bạn “căn chỉnh” thêm (px). */
  reserveSpace?: number; // default 24
}

function parsePx(v: number | string | undefined, fallback: number) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d+(?:\.\d+)?)px$/i);
    if (m) return parseFloat(m[1]);
  }
  return fallback;
}

const PictureFrame: React.FC<PictureFrameProps> = ({
  className = '',
  initialSrc,
  width = 0,
  height = 0,
  onChange,
  onClear,
  maxBytes = 5 * 1024 * 1024,
  enableDrop = true,

  sticky = true,
  stickyOffsetTop = 38,
  stickyZIndex = 45,

  minZoom = 0.25,
  maxZoom = 8,
  resetOnNewImage = true,

  reserveSpace = 24,
}) => {
  const [preview, setPreview] = useState<string | null>(initialSrc ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Kích thước khung cố định
  const frameW = useMemo(() => parsePx(width, 960), [width]);
  const frameH = useMemo(() => parsePx(height, 420), [height]);

  // Kích thước ảnh gốc
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  // Zoom/pan
  const [zoom, setZoom] = useState(1); // 1 = fit-to-frame
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan state
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSrc) setPreview(initialSrc);
  }, [initialSrc]);

  // Tính scale fit-to-frame
  const baseScale = useMemo(() => {
    if (!imgNatural) return 1;
    const s = Math.min(frameW / imgNatural.w, frameH / imgNatural.h);
    return s > 0 ? s : 1;
  }, [imgNatural, frameW, frameH]);

  useEffect(() => {
    if (!preview) {
      setImgNatural(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [preview]);

  const readFileAsDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });

  const acceptFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('Chỉ hỗ trợ ảnh (PNG/JPEG/WebP/…)');
        return;
      }
      if (file.size > maxBytes) {
        setError(`Ảnh quá lớn (>${Math.round(maxBytes / (1024 * 1024))}MB)`);
        return;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        setPreview(dataUrl);
        if (resetOnNewImage) {
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        }
        onChange?.(file, dataUrl);
      } catch {
        setError('Không đọc được ảnh từ clipboard/tệp.');
      }
    },
    [maxBytes, onChange, resetOnNewImage]
  );

  // Paste ảnh
  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = async (e) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await acceptFile(file);
          return;
        }
      }
    }
    setError('Clipboard không có ảnh.');
  };

  // Drag & drop
  const handleDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    if (!enableDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const f = Array.from(e.dataTransfer?.files ?? []).find((x) => x.type.startsWith('image/'));
    if (f) await acceptFile(f);
  };
  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    if (!enableDrop) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Clear
  const clearImage = () => {
    setPreview(null);
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    onClear?.();
    boxRef.current?.focus();
  };

  // Zoom (giữ điểm dưới con trỏ)
  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!imgNatural) return;
    e.preventDefault();

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;

    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const oldZoom = zoom;
    const newZoomRaw = oldZoom * zoomFactor;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, newZoomRaw));
    const k = newZoom / oldZoom;

    setOffset((prev) => ({ x: k * prev.x + (1 - k) * cx, y: k * prev.y + (1 - k) * cy }));
    setZoom(newZoom);
  };

  // Pan
  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setOffset({ x: d.startOffsetX + dx, y: d.startOffsetY + dy });
  };
  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    if (dragRef.current) {
      dragRef.current.active = false;
      dragRef.current = null;
    }
  };

  // Double click = reset mềm
  const handleDoubleClick: React.MouseEventHandler<HTMLDivElement> = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const frameStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  // Sticky wrapper
  const stickyWrapStyle: React.CSSProperties | undefined = sticky
    ? {
        position: 'sticky',
        top: stickyOffsetTop,
        zIndex: stickyZIndex,
        background: 'transparent',
        borderBottom: '0 solid #000',
        padding: '0 16px',
        overflowX: 'auto',
      }
    : undefined;

  const totalScale = baseScale * zoom;

  return (
    <div className="picture-frame-sticky-wrap" style={stickyWrapStyle}>
      <div className={`picture-frame-wrap ${className}`} style={{ marginBottom: reserveSpace }}>
        <div
          ref={boxRef}
          role="textbox"
          aria-multiline={false}
          tabIndex={0}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          aria-label="Khung dán ảnh — bấm để focus rồi Ctrl/Cmd+V để dán; cuộn để zoom; kéo để di chuyển"
          className="picture-frame"
          style={{
            ...frameStyle,
            border: '1px dashed #000',       // viền ngoài màu đen
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',              // NỀN KHUNG CHỨA ẢNH = ĐEN
            position: 'relative',
            overflow: 'hidden',
            userSelect: 'none',
            outline: 'none',
            padding: 0,
            boxShadow: isFocused ? '0 0 0 3px rgba(255,255,255,0.25)' : 'none', // viền focus trắng nhẹ
            cursor: preview ? 'grab' : 'text',
            touchAction: 'none',
            margin: '0 auto',
            color: '#fff',                   // chữ trắng để nổi trên nền đen
          }}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onWheel={handleWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={handleDoubleClick}
        >
          {preview ? (
            <>
              <img
                src={preview}
                alt="pasted"
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  const w = el.naturalWidth || 1;
                  const h = el.naturalHeight || 1;
                  setImgNatural({ w, h });
                  if (resetOnNewImage) {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }
                }}
                style={{
                  width: imgNatural ? `${imgNatural.w}px` : 'auto',
                  height: imgNatural ? `${imgNatural.h}px` : 'auto',
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${totalScale})`,
                  transformOrigin: 'center center',
                  willChange: 'transform',
                  pointerEvents: 'none',
                }}
              />

              {/* Nút xoá: trắng để thấy rõ trên nền đen */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearImage();
                }}
                title="Xóa ảnh"
                aria-label="Xóa ảnh"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid #fff',
                  borderRadius: 8,
                  padding: '2px 6px',
                  fontSize: 12,
                  lineHeight: 1.6,
                  cursor: 'pointer',
                }}
              >
                ✖
              </button>
            </>
          ) : (
            <div
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: '#fff', // chữ trắng trên nền đen
                lineHeight: 1.4,
                padding: 6,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>PictureFrame</div>
              <div>Bấm để focus → Ctrl/Cmd+V để dán ảnh</div>
              {enableDrop && <div>Cuộn để zoom, kéo để di chuyển</div>}
            </div>
          )}
        </div>

        {/* Lỗi hiển thị phía dưới, giữ mặc định (đen/trắng tùy nền trang) */}
        {error && (
          <div style={{ color: '#000', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
      </div>
    </div>
  );
};

export default PictureFrame;
