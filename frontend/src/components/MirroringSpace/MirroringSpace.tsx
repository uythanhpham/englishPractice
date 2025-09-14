// src/components/MirroringSpace/MirroringSpace.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export type Token = { word: string; start: number; end: number };

export interface MirroringSpaceProps {
    tokens?: Token[];
    activeIndex?: number | null;
    follow?: boolean;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
    /** Dùng để chọn module state: 'mirroring' (mặc định) hoặc 'submirror' */
    stateKind?: 'mirroring' | 'submirror';
    /**
     * Tùy biến phần hiển thị bên trong mỗi token.
     * Nội dung trả về sẽ được render bên trong <span data-idx="..."> cố định
     * để auto-follow vẫn dùng được.
     */
    renderToken?: (args: { token: Token; idx1: number; isActive: boolean }) => React.ReactNode;
}

const ACTIVE_BG = "var(--ms-active-bg, #fde68a)";

const containerBaseStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    border: "1px solid #333",        // viền tối
    borderRadius: 12,
    background: "#000",              // nền đen
    color: "#fff",                   // chữ trắng
    minHeight: 120,
    position: "relative",
    overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid #333", // viền header tối
    fontSize: 14,
    fontWeight: 600,
    opacity: 0.9,
    zIndex: 1,
    color: "#fff", // chữ trắng
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
};

const scrollerStyle: React.CSSProperties = {
    padding: 12,
    overflow: "auto",
    maxHeight: 360,
    lineHeight: 1.9,
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    color: "#fff",                   // chữ trắng
    transition: "filter 0ms ease, opacity 0ms ease",
};

const wordStyle: React.CSSProperties = {
    display: "inline",
    padding: "0 3px",
    borderRadius: 6,
    color: "#fff",                   // chữ trắng
};

const activeWordStyle: React.CSSProperties = {
    ...wordStyle,
    background: "#444",               // màu nền active tối hơn
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3)",
};


// Overlay che toàn bộ vùng nội dung (không che tiêu đề)
const overlayStyleBase: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // đặt top bằng chiều cao header  (sẽ tính bằng ref, xem dưới),
    // nhưng để fallback an toàn dùng 40px; sau khi mount sẽ cập nhật chuẩn.
    top: 40,
    zIndex: 2,
    // Kính mờ: nền mờ + backdrop blur (nếu trình duyệt hỗ trợ)
    background:
        "linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0))",
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(8px)",
    pointerEvents: "auto",
    transition: "opacity 0ms ease",
};

export default function MirroringSpace({
    tokens: tokensFromProps,
    activeIndex: activeFromProps,
    follow = true,
    className,
    style,
    title = "Mirroring Space",
    renderToken,
    stateKind = 'mirroring',
}: MirroringSpaceProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    // State từ props
    const [propTokens, setPropTokens] = useState<Token[]>(tokensFromProps ?? []);
    const [propActive, setPropActive] = useState<number | null>(
        typeof activeFromProps === "number" ? activeFromProps : activeFromProps ?? null
    );

    useEffect(() => {
        if (tokensFromProps) setPropTokens(tokensFromProps);
    }, [tokensFromProps]);

    useEffect(() => {
        if (typeof activeFromProps !== "undefined") setPropActive(activeFromProps ?? null);
    }, [activeFromProps]);

    // State từ store (kể cả preview)
    const [storeTokens, setStoreTokens] = useState<Token[]>([]);
    const [storeActive, setStoreActive] = useState<number | null>(null);
    const [previewTokens, setPreviewTokens] = useState<Token[] | null>(null);

    useEffect(() => {
        let unsub: undefined | (() => void);
        let cancelled = false;

        (async () => {
            try {
                // Chọn module state theo stateKind (giúp reuse logic cho SubMirroringSpace)
                const mod: any =
                    stateKind === 'submirror'
                        ? await import("../../state/submirror")
                        : await import("../../state/mirroring");
                if (cancelled) return;
                const getState = (mod.getState || mod.default?.getState) as (() => any) | undefined;
                const subscribe = (mod.subscribe || mod.default?.subscribe) as
                    | ((cb: (s: any) => void) => () => void)
                    | undefined;

                if (getState) {
                    const s = getState();
                    setStoreTokens(s?.tokens ?? []);
                    setStoreActive(s?.activeIndex ?? null);
                    setPreviewTokens(s?.previewTokens ?? null);
                }
                if (subscribe) {
                    unsub = subscribe((s: any) => {
                        setStoreTokens(s?.tokens ?? []);
                        setStoreActive(s?.activeIndex ?? null);
                        setPreviewTokens(s?.previewTokens ?? null);
                    });
                }
            } catch {
                // Handle module import errors
            }
        })();

        return () => {
            cancelled = true;
            if (unsub) {
                try {
                    unsub();
                } catch { }
            }
        };
    }, [stateKind]);

    // Ưu tiên hiển thị previewTokens nếu đang có
    const effectiveTokens =
        previewTokens && previewTokens.length > 0
            ? previewTokens
            : (propTokens.length ? propTokens : storeTokens);

    // Luôn nhận activeIndex từ editor (props) hoặc store, kể cả khi đang preview
    const effectiveActive = (propActive ?? storeActive ?? null);

    const spans = useMemo(() => {
        const arr: React.ReactNode[] = [];
        for (let i = 0; i < effectiveTokens.length; i++) {
            const idx = i + 1;
            const t = effectiveTokens[i];
            const isActive = effectiveActive === idx;
            const inner = renderToken?.({ token: t, idx1: idx, isActive }) ?? t.word;
            arr.push(
                <span
                    key={`${t.start}-${t.end}-${idx}`}
                    data-idx={idx}
                    title={`#${idx}`}
                    style={isActive ? activeWordStyle : wordStyle}
                    className={isActive ? "word active" : "word"}
                >
                    {inner}
                </span>
            );
            if (i < effectiveTokens.length - 1) arr.push(" ");
        }
        return arr;
    }, [effectiveTokens, effectiveActive, renderToken]);

    // Auto scroll
    useEffect(() => {
        if (!follow || effectiveActive == null) return;
        const root = scrollerRef.current;
        if (!root) return;
        const el = root.querySelector<HTMLSpanElement>(`span[data-idx="${effectiveActive}"]`);
        if (!el) return;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, [effectiveActive, follow]);

    const empty = !effectiveTokens || effectiveTokens.length === 0;

    // ====== Overlay logic: mặc định có kính mờ; nhấn giữ Esc để ẩn ======
    const [overlayVisible, setOverlayVisible] = useState<boolean>(true);
    const [headerHeight, setHeaderHeight] = useState<number>(40);
    const [escRevealEnabled, setEscRevealEnabled] = useState<boolean>(true); // Toggle Esc functionality

    // cập nhật top của overlay theo chiều cao header thực tế
    useEffect(() => {
        const h = headerRef.current;
        if (h) setHeaderHeight(h.getBoundingClientRect().height || 40);
    }, []);

    // Lắng nghe phím Esc (keydown/keyup)
    // Lắng nghe phím Esc hoặc Enter
    useEffect(() => {
        if (!escRevealEnabled) {
            setOverlayVisible(false);
            return;
        }
        setOverlayVisible(true);
        let escHeld = false;
        let enterHeld = false;
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.key === "Escape" || e.key === "Esc") && !escHeld) {
                escHeld = true;
                setOverlayVisible(false);
            }
            if (e.key === "Enter" && !enterHeld) {
                enterHeld = true;
                setOverlayVisible(false);
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Escape" || e.key === "Esc") {
                escHeld = false;
                setOverlayVisible(true);
            }
            if (e.key === "Enter") {
                enterHeld = false;
                setOverlayVisible(true);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, [escRevealEnabled]);


    // Khi overlay bật, blur nội dung; khi tắt Esc, bỏ blur cho rõ chữ
    const contentFilter = overlayVisible ? "blur(6px)" : "none";

    return (
        <section
            aria-label="Mirroring Space"
            className={className ? `mirroring-space ${className}` : "mirroring-space"}
            style={{ ...containerBaseStyle, ...style }}
        >
            {title ? (
                <div ref={headerRef} style={headerStyle}>
                    <span>{title}</span>
                    <button
                        type="button"
                        onClick={() => setEscRevealEnabled((v) => !v)}
                        title={
                            escRevealEnabled
                                ? "Đang BẬT: Nhấn giữ Esc (hoặc Enter) để tạm ẩn lớp sương mờ. Bấm để tắt tính năng này."
                                : "Đang TẮT: Lớp sương mờ luôn bị vô hiệu. Bấm để bật lại tính năng nhấn Esc."
                        }
                        style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 8,
                            border: "1px solid #444",
                            background: escRevealEnabled ? "#1f2937" : "#374151",
                            color: "#fff",
                            cursor: "pointer",
                        }}
                        aria-pressed={!escRevealEnabled}
                    >
                        {escRevealEnabled ? "ESC reveal: ON" : "ESC reveal: OFF"}
                    </button>
                </div>
            ) : null}

            {/* Nội dung với blur có/không tuỳ overlay */}
            <div
                ref={scrollerRef}
                style={{ ...scrollerStyle, filter: contentFilter }}
                aria-hidden={overlayVisible ? true : false}
            >
                {empty ? (
                    <div style={{ opacity: 0.6, fontSize: 14 }}>Chưa có nội dung để hiển thị.</div>
                ) : (
                    spans
                )}
            </div>

            {/* Overlay kính mờ (che vùng dưới header) */}
            <div
                style={{
                    ...overlayStyleBase,
                    top: headerHeight,
                    opacity: overlayVisible ? 1 : 0,
                    pointerEvents: overlayVisible ? "auto" : "none",
                }}
                aria-label="Frosted overlay — Hold Esc to reveal text"
                title={
                    escRevealEnabled
                        ? "Giữ phím Esc (hoặc Enter) để tạm ẩn lớp kính mờ và xem nội dung"
                        : "Tính năng nhấn Esc đã tắt — lớp kính mờ đang bị vô hiệu hoá"
                }
            />
        </section>
    );
}
