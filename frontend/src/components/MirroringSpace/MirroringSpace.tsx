// src/components/MirroringSpace/MirroringSpace.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export type Token = { word: string; start: number; end: number };

export interface MirroringSpaceProps {
    tokens?: Token[];
    activeIndex?: number | null;
    follow?: boolean;
    fillHeight?: boolean;  // NEW: fill 100% height of grid cell
    /** Force the outer container height (px). Usually the PracticingSpace (editor) height. */
    syncHeightPx?: number;
    /** Canh token active theo một hoành độ của viewport (px tính từ top màn hình). */
    anchorViewportY?: number;
    /** Khi true (mặc định), luôn canh active token vào giữa khung scroller của MirroringSpace. */
    centerActive?: boolean;
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
    // trước đây: minHeight: 120,
    minHeight: "clamp(120px, 18vh, 280px)",
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
    // trước đây: maxHeight: 360,
    maxHeight: 360, // sẽ bị override khi fillHeight=true
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
    pointerEvents: "none", // Cho phép cuộn/scroll nội dung bên dưới ngay cả khi overlay hiển thị
    transition: "opacity 0ms ease",
};

export default function MirroringSpace({
    tokens: tokensFromProps,
    activeIndex: activeFromProps,
    follow = true,
    fillHeight = false,
    syncHeightPx,
    anchorViewportY,
    centerActive = true,
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
    // Mặc định: luôn canh active token vào GIỮA scroller (centerActive = true).
    // Nếu centerActive = false: giữ hành vi cũ dựa trên anchorViewportY (nếu có).
    useEffect(() => {
        if (!follow || effectiveActive == null) return;
        const root = scrollerRef.current;
        if (!root) return;
        const el = root.querySelector<HTMLSpanElement>(`span[data-idx="${effectiveActive}"]`);
        if (!el) return;

        // Reveal guard: nếu token rất gần/át đỉnh scroller thì ép scrollTop=0 để không bị khuất.
        const TOP_REVEAL_PAD = 10; // nên ≤ padding-top của scroller (đang là 12)
        const getTopInRoot = (node: HTMLElement) => {
            const nr = node.getBoundingClientRect();
            const rr = root.getBoundingClientRect();
            // vị trí top của node tính theo hệ toạ độ content của 'root'
            return (nr.top - rr.top) + root.scrollTop;
        };

        // Nhánh A: canh GIỮA khung MirroringSpace (ưu tiên mới)
        if (centerActive) {
            // Nếu nội dung không đủ để cuộn thì bỏ qua
            if (root.scrollHeight <= root.clientHeight) return;

            const elTop = getTopInRoot(el);
            const elCenter = elTop + el.offsetHeight / 2;
            const viewCenter = root.scrollTop + root.clientHeight / 2;

            // target scrollTop để elCenter trùng viewCenter
            let target = root.scrollTop + (elCenter - viewCenter);

            // Clamp vào [0, max]
            const max = Math.max(0, root.scrollHeight - root.clientHeight);
            target = Math.max(0, Math.min(target, max));

            // Guard để không bị khuất khi token quá sát đầu
            if (elTop <= TOP_REVEAL_PAD) target = 0;

            if (Math.abs(target - root.scrollTop) > 0.5) {
                root.scrollTo({ top: target, behavior: "smooth" });
            }
        } else if (typeof anchorViewportY === 'number') {
            const rect = el.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const delta = centerY - anchorViewportY; // >0: token đang thấp hơn anchor => cuộn xuống

            // Ước lượng scrollTop mong muốn
            let target = root.scrollTop + delta;
            // Clamp phạm vi
            target = Math.max(0, Math.min(target, root.scrollHeight - root.clientHeight));

            // TOP GUARD: nếu bản thân token nằm quá sát đỉnh content, ép về 0 để lộ hoàn toàn
            const topIn = getTopInRoot(el);
            if (topIn <= TOP_REVEAL_PAD) {
                target = 0;
            }

            // Tránh cuộn vi mô khi không cần
            if (Math.abs(target - root.scrollTop) > 0.5) {
                root.scrollTo({ top: target, behavior: "smooth" });
            }
        } else {
            // Fallback: tự tính để đảm bảo "lộ hoàn toàn", ưu tiên đưa lên sát đỉnh nếu cần
            const elTop = getTopInRoot(el);
            const elBottom = elTop + el.offsetHeight;
            const viewTop = root.scrollTop;
            const viewBottom = viewTop + root.clientHeight;

            if (elTop <= viewTop + TOP_REVEAL_PAD) {
                root.scrollTo({ top: Math.max(0, elTop - TOP_REVEAL_PAD), behavior: "smooth" });
            } else if (elBottom >= viewBottom - 4) {
                root.scrollTo({ top: elBottom - root.clientHeight + 4, behavior: "smooth" });
            }
        }
    }, [effectiveActive, follow, anchorViewportY, centerActive]);

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

    // Tính style container: khi syncHeightPx có mặt, ép chiều cao = editor và bỏ minHeight
    const containerStyle: React.CSSProperties = {
        ...containerBaseStyle,
        ...(fillHeight
            ? (typeof syncHeightPx === 'number'
                ? { height: syncHeightPx, minHeight: 0 }
                : { height: "100%", minHeight: 0 })
            : {}),
        ...style
    };

    return (
        <section
            aria-label="Mirroring Space"
            className={className ? `mirroring-space ${className}` : "mirroring-space"}
            style={containerStyle}
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
                        {escRevealEnabled ? "ON" : "OFF"}
                    </button>
                </div>
            ) : null}

            <div
                ref={scrollerRef}
                style={{
                    ...scrollerStyle,
                    filter: contentFilter,
                    ...(fillHeight
                        ? {
                            maxHeight: "unset", // bỏ cap cứng
                            flex: 1,
                            minHeight: 0
                        }
                        : {})
                }}
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
                    pointerEvents: "none", // vẫn để pointerEvents "none" để không cản trở thao tác cuộn
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
