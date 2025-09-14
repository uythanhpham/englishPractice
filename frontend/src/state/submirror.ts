// E:/3_CODING/Personally/english_practice/frontend/src/state/submirror.ts

/**
 * Store siêu nhẹ cho SubMirroringSpace — API tương thích state/mirroring.
 * Khác biệt chính: tokenizer coi cụm <...> là MỘT token duy nhất (kể cả có khoảng trắng),
 * và loại bỏ toàn bộ dấu '.' và ',' trong token.
 */

export type Token = { word: string; start: number; end: number };
export type State = { tokens: Token[]; activeIndex: number | null; previewTokens: Token[] | null };
export type Listener = (s: State) => void;

const listeners: Set<Listener> = new Set();

let state: State = {
    tokens: [],
    activeIndex: null,
    previewTokens: null,
};

function emit(): void {
    listeners.forEach((fn: Listener) => {
        try {
            fn(state);
        } catch {
            /* nuốt lỗi listener */
        }
    });
}

function isWS(ch: string): boolean {
    // \s cho hầu hết whitespace; cộng thêm NBSP để chắc ăn
    return /\s/.test(ch) || ch === '\u00A0';
}

/**
 * Tokenizer:
 * - Bỏ qua whitespace
 * - Nếu gặp '<', đọc đến '>' → toàn bộ "<...>" là 1 token
 * - Ngược lại, đọc chuỗi ký tự không-phải-whitespace thành 1 token
 * - Mọi token đều bị loại bỏ dấu '.' và ','
 */
function tokenize(text?: string): Token[] {
    const out: Token[] = [];
    if (!text) return out;

    const n = text.length;
    let i = 0;

    while (i < n) {
        // bỏ qua whitespace
        while (i < n && isWS(text[i])) i++;
        if (i >= n) break;

        const start = i;

        // cụm <...> → 1 token
        if (text[i] === '<') {
            i++; // bỏ '<'
            while (i < n && text[i] !== '>') i++;
            if (i < n && text[i] === '>') {
                i++; // gồm luôn '>'
                let word = text.slice(start, i).replace(/[.,]/g, "");
                if (word.length > 0) out.push({ word, start, end: i });
                continue;
            } else {
                // không có '>' → fallback coi như token thường
                i = start;
            }
        }

        // token thường
        while (i < n && !isWS(text[i])) i++;
        let word = text.slice(start, i).replace(/[.,]/g, "");
        if (word.length > 0) out.push({ word, start, end: i });
    }

    return out;
}

/** ===== Public API (tương thích MirroringSpace.tsx) ===== */

export function getState(): State {
    return state;
}

export function subscribe(cb: Listener): () => void {
    listeners.add(cb);
    try {
        cb(state);
    } catch { }
    return () => {
        listeners.delete(cb);
    };
}

/** Đẩy mirror text (preview) để SubMirroringSpace hiển thị */
export function setPreviewText(text?: string): void {
    state = { ...state, previewTokens: tokenize(text ?? '') };
    emit();
}

/** Xóa preview (panel sẽ quay về tokens từ props/store nếu có) */
export function clearPreview(): void {
    state = { ...state, previewTokens: null };
    emit();
}

/** Tuỳ chọn: sync tokens & activeIndex (khi không có preview) */
export function setTokens(tokens?: Token[] | null, activeIndex?: number | null): void {
    state = {
        ...state,
        tokens: Array.isArray(tokens) ? tokens : [],
        activeIndex: activeIndex ?? null,
    };
    emit();
}

export default {
    getState,
    subscribe,
    setPreviewText,
    clearPreview,
    setTokens,
};
