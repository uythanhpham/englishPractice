'use client';

/**
 * src/state/mirroring.ts
 * Store siêu nhẹ dùng cho MirroringSpace:
 * - setFromEditor(text, tokens, activeIndex): publish từ PracticingSpace (tùy chọn)
 * - setPreviewText(text): đẩy preview từ InputModal trước khi gọi BE
 * - clearPreview(): xóa trạng thái preview sau khi BE trả về
 */

export type Token = { word: string; start: number; end: number };

type MirroringState = {
  text: string;
  tokens: Token[];
  activeIndex: number | null;

  // Preview khi bấm "Gửi đến Server" trong InputModal
  previewText: string | null;
  previewTokens: Token[] | null;
};

let state: MirroringState = {
  text: '',
  tokens: [],
  activeIndex: null,
  previewText: null,
  previewTokens: null,
};

const listeners = new Set<(s: MirroringState) => void>();
const emit = () => listeners.forEach((cb) => cb(state));

export const getState = (): MirroringState => state;

export const subscribe = (cb: (s: MirroringState) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const tokenize = (text: string): Token[] => {
  // Regex để nhận diện các chuỗi nằm giữa cặp dấu '<' và '>' như một từ duy nhất
  const re = /<[^>]*>|\p{L}+|\d+/gu;
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    const start = m.index;
    out.push({ word, start, end: start + word.length });
  }
  return out;
};

/** (Tuỳ chọn) publish từ editor nếu bạn muốn MirroringSpace đọc qua store */
export const setFromEditor = (text: string, tokens: Token[], activeIndex: number | null) => {
  state = { ...state, text, tokens, activeIndex };
  emit();
};

/** Đẩy trước nội dung từ InputModal để MirroringSpace hiển thị ngay lập tức */
export const setPreviewText = (text: string) => {
  state = { ...state, previewText: text, previewTokens: tokenize(text) };
  emit();
};

/** Xoá trạng thái preview để quay lại bám theo editor */
export const clearPreview = () => {
  state = { ...state, previewText: null, previewTokens: null };
  emit();
};

/** Export default (để phòng trường hợp import default) */
export default {
  getState,
  subscribe,
  setFromEditor,
  setPreviewText,
  clearPreview,
};
