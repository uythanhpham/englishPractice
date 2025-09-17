// E:\3_CODING\Personally\english_practice\src\components\PracticingSpace\PracticingSpace.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import './PracticingSpace.css';
import InputModal from '../InputModal/InputModal';
import Tabbar from '../Tabbar/Tabbar';
import MirroringSpace from '../MirroringSpace/MirroringSpace';
import SubMirroringSpace from '../SubMirroringSpace/SubMirroringSpace';

const INITIAL_TEXT = `Ví dụ: Hello [world] and [friends]!
A link or [placeholder] appears here.] Tiếp tục...`;

// Đáy tối thiểu (px) cho toàn bộ khung (cả 3 cột)
const MIN_FRAME_H = 360;

type InputEvt = InputEvent & { isComposing?: boolean; inputType?: string };
type PasteEvt = ClipboardEvent & { clipboardData: DataTransfer | null };

type Token = {
  word: string;
  start: number; // inclusive
  end: number;   // exclusive
};

const PracticingSpace: React.FC = () => {
  const edRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);           // container hàng ngang 4 vùng bằng nhau

  const [dark, setDark] = useState(true);
  // Toggle: nhấn Space để nhảy tới ']' tiếp theo (mặc định bật để giữ hành vi cũ)
  const [spaceJump, setSpaceJump] = useState<boolean>(true);

  const [colorHex, setColorHex] = useState('#e11d48');
  const [colorOn, setColorOn] = useState(false);

  // Font size controller (áp dụng cho toàn bộ PracticingSpace)
  const [fontPx, setFontPx] = useState<number>(14);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem('ps_font_px'));
      if (!Number.isNaN(v) && v >= 10 && v <= 36) setFontPx(v);
    } catch { }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('ps_font_px', String(fontPx));
    } catch { }
  }, [fontPx]);
  const clamp = (v: number) => Math.min(36, Math.max(10, v));
  const incFont = () => setFontPx((v) => clamp(v + 2));
  const decFont = () => setFontPx((v) => clamp(v - 2));
  const resetFont = () => setFontPx(14);

  // load/persist trạng thái spaceJump
  useEffect(() => {
    try {
      const v = localStorage.getItem('ps_space_jump_on');
      if (v === '0') setSpaceJump(false);
    } catch { }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('ps_space_jump_on', spaceJump ? '1' : '0');
    } catch { }
  }, [spaceJump]);

  // Modal state
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const savedCaretRef = useRef<number>(0);

  // (tuỳ chọn) quản lý percent ở parent để đồng bộ với modal
  const [percent, setPercent] = useState<number | undefined>(10);

  // Ghi nhận số lượng "slot từ" ban đầu (bất biến nếu bạn không thay đổi whitespace)
  const initialWordCountRef = useRef<number>(0);

  // Dark Mode
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    return () => document.body.classList.remove('dark');
  }, [dark]);

  // ====== Tokenize modes ======
  const NBSP = '\u00A0'; // Non-breaking space
  // In MODE 1, both NBSP and newline '\n' act as "walls" (vách ngăn)
  const isWall = (ch: string) => ch === NBSP || ch === '\n';

  const tokenizeMode0 = (text: string): Token[] => {
    // Mode 0 (mặc định hiện tại):
    // "word" = chuỗi KHÔNG chứa whitespace hoặc dấu '-'  →  /[^\s-]+/gu
    const re = /[^\s-]+/gu;
    const out: Token[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const word = m[0];
      const start = m.index;
      out.push({ word, start, end: start + word.length });
    }
    return out;
  };
  const tokenizeMode1 = (text: string): Token[] => {
    /**
     * MODE 1 — NBSP & '\n' = VÁCH NGĂN.
     * - Mỗi NBSP (U+00A0) HOẶC newline '\n' làm tăng chỉ số (index) lên 1.
     * - ToÀN BỘ ký tự giữa HAI vách (NBSP hoặc '\n') (kể cả space thường, tab, dấu câu, v.v.)
     *   CHUNG MỘT index.
     * - NBSP và '\n' tự nó KHÔNG thuộc bất kỳ token/index nào.
     * - Chúng ta tạo token cho *mọi đoạn* giữa các vách, BAO GỒM cả đoạn rỗng ở đầu/cuối
     *   hoặc giữa hai vách liên tiếp, để thứ tự index ổn định:
     *     text = "NBSP xin  chào \n  các bạn  NBSP"
     *       => tokens: ["", " xin  chào ", "  các bạn  ", ""]
     *       => indices:   1         2             3        4
     */
    const out: Token[] = [];
    const n = text.length;
    let segStart = 0;
    for (let i = 0; i < n; i++) {
      if (isWall(text[i])) {
        // push đoạn [segStart, i) — CHO PHÉP rỗng để giữ index
        out.push({ word: text.slice(segStart, i), start: segStart, end: i });
        segStart = i + 1; // bỏ qua ký tự vách (NBSP hoặc '\n')
      }
    }
    // đoạn cuối cùng sau vách cuối (có thể rỗng)
    out.push({ word: text.slice(segStart, n), start: segStart, end: n });
    return out;
  };
  const [wordMode, setWordMode] = useState<0 | 1>(1); // Default to Mode 1
  const tokenize = (text: string): Token[] => (wordMode === 0 ? tokenizeMode0(text) : tokenizeMode1(text)); // Replace tokenizeByWhitespace

  /**
   * Trả về IMMUTABLE index (1-based) của "word-slot" chứa caret,
   * dựa trên thứ tự các chuỗi [^\s]+ trong văn bản hiện tại.
   * - Nếu caret đứng trong/đúng biên 1 word → index của word đó
   * - Nếu caret ở whitespace → ưu tiên word bên trái; nếu không có thì lấy word bên phải
   *
   * Ghi chú: Miễn là bạn KHÔNG thêm/bớt whitespace (chỉ thay nội dung bên trong word),
   * thứ tự slot không đổi → index này bất biến so với ban đầu.
   */
  const caretToImmutableIndex = (text: string, caret: number): number | null => {
    // MODE 1: chỉ số = 1 + số VÁCH (NBSP hoặc '\n') *trước* vị trí caret.
    // Các vách không nhận index.
    if (wordMode === 1) {
      const pos = Math.max(0, Math.min(caret, text.length));
      let walls = 0;
      for (let i = 0; i < pos; i++) {
        if (isWall(text[i])) walls++;
      }
      // Luôn có ít nhất một "khoang" (kể cả rỗng) ⇒ index bắt đầu từ 1
      return walls + 1;
    }
    // MODE 0: như cũ — tìm token bao chứa caret (end inclusive để caret ngay trước delimiter vẫn thuộc token trái)
    const words = tokenize(text);
    if (!words.length) return null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (caret >= w.start && caret <= w.end) return i + 1;
    }
    return null;
  };

  // State cho MirroringSpace
  const [tokens, setTokens] = useState<Token[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Y (px) trên viewport dùng để canh token active ở 2 panel
  const [anchorViewportY, setAnchorViewportY] = useState<number>(typeof window !== 'undefined' ? window.innerHeight / 2 : 0);

  // Lấy hoành độ (viewport Y) của caret trong editor; fallback = giữa màn hình
  const getCaretViewportCenterY = (): number => {
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects?.();
      if (rects && rects.length > 0) {
        const r = rects[0];
        if (r) return r.top + r.height / 2;
      }
      const r2 = range.getBoundingClientRect?.();
      if (r2) return r2.top + r2.height / 2;
    }
    return window.innerHeight / 2;
  };

  const recomputeMirror = () => {
    const el = edRef.current;
    if (!el) return;
    const text = el.textContent ?? '';
    const toks = tokenize(text); // Replace tokenizeByWhitespace with tokenize
    setTokens(toks);
    const caret = getCaretOffset(el);
    const idx = caretToImmutableIndex(text, caret);
    setActiveIndex(idx);
    // cập nhật anchor Y theo caret hiện tại
    try {
      setAnchorViewportY(getCaretViewportCenterY());
    } catch { }

    // Debug: log immutable index
    if (idx != null) console.log('[PracticingSpace] Immutable word index =', idx, '(mode', wordMode, ')');

    // Cảnh báo nếu số slot thay đổi so với ban đầu (trong case bạn lỡ thêm/bớt whitespace)
    if (initialWordCountRef.current && toks.length !== initialWordCountRef.current) {
      console.warn(
        `[PracticingSpace] Word-slot count changed: init=${initialWordCountRef.current}, now=${toks.length}.` +
        ' Immutable mapping may break if whitespace skeleton changed.'
      );
    }
  };

  // ----- Helpers: caret offset <-> selection
  const getCaretOffset = (el: HTMLElement): number => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    if (!el.contains(sel.anchorNode)) return 0;
    const range = sel.getRangeAt(0);
    let offset = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const txt = node as Text;
      if (txt === range.startContainer) {
        offset += range.startOffset;
        break;
      }
      offset += txt.nodeValue?.length ?? 0;
    }
    return offset;
  };

  const setCaretOffset = (el: HTMLElement, target: number) => {
    const total = el.textContent?.length ?? 0;
    const pos = Math.max(0, Math.min(target, total));
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();

    let acc = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const txt = node as Text;
      const len = txt.nodeValue?.length ?? 0;
      if (acc + len >= pos) {
        range.setStart(txt, pos - acc);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      acc += len;
    }
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const getNodeAtOffset = (el: HTMLElement, target: number): { node: Text; offset: number } => {
    const total = el.textContent?.length ?? 0;
    const pos = Math.max(0, Math.min(target, total));
    let acc = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const txt = node as Text;
      const len = txt.nodeValue?.length ?? 0;
      if (acc + len >= pos) return { node: txt, offset: pos - acc };
      acc += len;
    }
    const empty = document.createTextNode('');
    el.appendChild(empty);
    return { node: empty, offset: 0 };
  };

  const replaceTextRange = (start: number, end: number, replacement: string) => {
    const el = edRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    const s = getNodeAtOffset(el, start);
    const e = getNodeAtOffset(el, end);
    r.setStart(s.node, s.offset);
    r.setEnd(e.node, e.offset);
    r.deleteContents();
    if (replacement && replacement.length) {
      const node = document.createTextNode(replacement);
      r.insertNode(node);
      r.setStartAfter(node);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const setEditorText = (text: string) => {
    const el = edRef.current;
    if (!el) return;
    const len = el.textContent?.length ?? 0;
    replaceTextRange(0, len, text);
    ensureTrailingBR();
    setCaretOffset(el, el.textContent?.length ?? 0);
    if (colorOn) enforceTypingColor();
    recomputeMirror();
  };

  // Chèn text thuần tại caret
  const insertPlainText = (text: string) => {
    const el = edRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    ensureTrailingBR();
    recomputeMirror();
  };

  // Đảm bảo cuối editor chỉ có đúng 1 <br data-trailing="1"> khi text kết thúc bằng '\n'
  const ensureTrailingBR = () => {
    const el = edRef.current;
    if (!el) return;
    // Xóa TẤT CẢ các br trailing do ta đã thêm trước đó
    while (
      el.lastChild &&
      el.lastChild.nodeType === 1 &&
      (el.lastChild as HTMLElement).tagName === 'BR' &&
      (el.lastChild as HTMLElement).getAttribute('data-trailing') === '1'
    ) {
      el.removeChild(el.lastChild);
    }
    // Nếu text kết thúc '\n' thì thêm đúng 1 br
    if (el.textContent?.endsWith('\n')) {
      const br = document.createElement('br');
      br.setAttribute('data-trailing', '1');
      el.appendChild(br);
    }
  };

  // ---- Gõ có màu (execCommand)
  const getDefaultTextColor = (): string => {
    const el = edRef.current;
    if (!el) return '#000';
    return getComputedStyle(el).color;
  };

  const applyTypingColor = (color: string) => {
    const el = edRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, color);
  };

  /** Chỉ apply màu khi caret đang đứng (selection collapsed). Nếu đang bôi đen thì bỏ qua. */
  const applyTypingColorIfCaret = (color: string) => {
    const el = edRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!el.contains(sel.anchorNode)) return;
    if (!sel.isCollapsed) return; // đang bôi đen: không đổi màu
    applyTypingColor(color);
  };

  const enforceTypingColor = () => {
    if (!colorOn) return;
    // Chỉ set "typing color" tại caret, không chạm vào vùng selection đang bôi đen
    applyTypingColorIfCaret(colorHex);
  };

  // ====== TỰ ĐỘNG VIẾT HOA ======
  let inAutoEdit = false;
  const isLowerAlpha = (ch: string) => !!ch && ch >= 'a' && ch <= 'z';
  const APOSTROPHES = new Set(["'", '’']);

  const replaceTextRangeSafeUpper = (idx: number, ch: string) => {
    const el = edRef.current!;
    replaceTextRange(idx, idx + 1, ch.toUpperCase());
  };

  const autoCapitalize = () => {
    const el = edRef.current;
    if (!el) return;
    if (inAutoEdit) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!el.contains(sel.anchorNode)) return;

    const pos = getCaretOffset(el);
    const text = el.textContent ?? '';
    if (!text) {
      ensureTrailingBR();
      return;
    }

    let mutated = false;
    let newCaret = pos;
    const iIdxTyped = pos - 1;

    if (iIdxTyped >= 0 && isLowerAlpha(text[iIdxTyped]) && text[iIdxTyped] !== 'i') {
      if (iIdxTyped === 0 || text[iIdxTyped - 1] === '\n') {
        inAutoEdit = true;
        replaceTextRangeSafeUpper(iIdxTyped, text[iIdxTyped]);
        newCaret = getCaretOffset(el);
        inAutoEdit = false;
        mutated = true;
      } else {
        let j = iIdxTyped - 1;
        while (j >= 0 && text[j] === ' ') j--;
        if (j >= 0 && j < text.length && (j === 0 ? false : text[j] === '.')) {
          inAutoEdit = true;
          replaceTextRangeSafeUpper(iIdxTyped, text[iIdxTyped]);
          newCaret = getCaretOffset(el);
          inAutoEdit = false;
          mutated = true;
        }
      }
    }

    if (iIdxTyped >= 0 && text[iIdxTyped] === 'i' && (iIdxTyped === 0 || text[iIdxTyped - 1] === '\n')) {
      inAutoEdit = true;
      replaceTextRange(iIdxTyped, iIdxTyped + 1, 'I');
      setCaretOffset(el, newCaret);
      inAutoEdit = false;
      mutated = true;
    } else if (pos >= 1 && text[pos - 1] === ' ') {
      const iIdx = pos - 2;
      if (iIdx >= 0 && text[iIdx] === 'i') {
        const leftIdx = iIdx - 1;
        if (leftIdx >= 0 && text[leftIdx] === ' ') {
          inAutoEdit = true;
          replaceTextRange(iIdx, iIdx + 1, 'I');
          setCaretOffset(el, newCaret);
          inAutoEdit = false;
          mutated = true;
        }
      }
    } else if (pos >= 1 && APOSTROPHES.has(text[pos - 1])) {
      const iIdx = pos - 2;
      if (iIdx >= 0 && text[iIdx] === 'i') {
        inAutoEdit = true;
        replaceTextRange(iIdx, iIdx + 1, 'I');
        setCaretOffset(el, newCaret);
        inAutoEdit = false;
        mutated = true;
      }
    }

    if (mutated) {
      ensureTrailingBR();
      if (colorOn) enforceTypingColor();
      recomputeMirror();
    }
  };

  /* ------------ Effects ------------ */

  // init nội dung & caret
  useEffect(() => {
    const el = edRef.current!;
    if (!el) return;
    if (!el.textContent || el.textContent.length === 0) {
      el.textContent = INITIAL_TEXT;
    }
    ensureTrailingBR();
    setCaretOffset(el, el.textContent!.length);

    // Ghi nhận số lượng slot từ ban đầu
    try {
      const initText = el.textContent ?? '';
      initialWordCountRef.current = tokenize(initText).length; // Replace tokenizeByWhitespace with tokenize
      console.log('[PracticingSpace] Initial word-slot count =', initialWordCountRef.current, '(mode', wordMode, ')');
    } catch { }

    recomputeMirror();
  }, []);

  // listeners
  useEffect(() => {
    const el = edRef.current!;
    if (!el) return;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!el.contains(sel.anchorNode)) return;
      enforceTypingColor(); // chỉ apply nếu caret collapsed
      recomputeMirror();
    };
    document.addEventListener('selectionchange', onSelectionChange);

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvt;
      if (!colorOn) return;
      const t = ie.inputType || '';
      if (t === 'insertText' || t === 'insertCompositionText' || t === 'insertFromComposition') {
        enforceTypingColor(); // chỉ áp vào caret trước khi chèn
      }
    };
    el.addEventListener('beforeinput', onBeforeInput);

    const onInput = (e: Event) => {
      const ie = e as InputEvt;
      if (ie && ie.isComposing) {
        ensureTrailingBR();
        return;
      }
      const type = ie?.inputType || '';
      if (type.startsWith('insert') || type === '') autoCapitalize();
      else ensureTrailingBR();
      recomputeMirror();
    };
    el.addEventListener('input', onInput);

    const onPaste = (e: Event) => {
      const pe = e as PasteEvt;
      pe.preventDefault();
      const dt = pe.clipboardData;
      let text = dt?.getData('text/plain') ?? '';
      text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
      insertPlainText(text);
      if (colorOn) enforceTypingColor();
      recomputeMirror();
    };
    el.addEventListener('paste', onPaste);

    const onCompStart = () => enforceTypingColor();
    const onCompUpdate = () => enforceTypingColor();
    el.addEventListener('compositionstart', onCompStart);
    el.addEventListener('compositionupdate', onCompUpdate);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('input', onInput);
      el.removeEventListener('paste', onPaste);
      el.removeEventListener('compositionstart', onCompStart);
      el.removeEventListener('compositionupdate', onCompUpdate);
    };
  }, [colorOn, colorHex, wordMode]);

  // Cập nhật anchorViewportY khi scroll/resize
  useEffect(() => {
    const onWin = () => {
      try { setAnchorViewportY(getCaretViewportCenterY()); } catch { }
    };
    window.addEventListener('scroll', onWin, { passive: true });
    window.addEventListener('resize', onWin);
    return () => {
      window.removeEventListener('scroll', onWin);
      window.removeEventListener('resize', onWin);
    };
  }, []);

  // ===== Helper: nhảy tới ']' kế tiếp (return true nếu nhảy được) =====
  const jumpToNextBracket = (el: HTMLElement): boolean => {
    const text = el.textContent ?? '';
    const start = getCaretOffset(el);
    let idx = text.indexOf(']', start);
    if (idx === start) idx = text.indexOf(']', start + 1); // bỏ qua nếu đang đứng ngay tại ']'
    if (idx !== -1) {
      el.focus();
      setCaretOffset(el, idx);
      if (colorOn) enforceTypingColor();
      recomputeMirror();
      return true;
    }
    return false;
  };

  // Keydown:
  // - Ctrl+Space = chèn space
  // - Space/Tab/Enter -> tới ']' kế tiếp (nếu spaceJump = true; nếu tắt => Space chèn ký tự ' ')
  // - Shift+Tab -> về ']' trước
  // - Shift+Enter hoặc Ctrl/Cmd+Enter -> chèn xuống dòng
  // - Backspace: nếu ký tự TRƯỚC caret là ' ' hoặc ']' => NHẢY về ']' trước đó (hành vi Shift+Tab). Nếu không có ']' trước đó thì để mặc định xoá.
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    const el = edRef.current!;
    const isComposing = (e.nativeEvent as any).isComposing;

    // --- BACKSPACE TUỲ BIẾN ---
    if (e.key === 'Backspace' && !e.metaKey && !e.altKey) {
      if (isComposing) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const pos = getCaretOffset(el);
        const text = el.textContent ?? '';
        const prev = pos > 0 ? text[pos - 1] : '';

        // MODE 1: nếu ngay trước caret là NBSP hoặc '\n' (vách ngăn) thì KHÔNG xoá,
        // thay vào đó hành xử như Shift+Tab (nhảy về ']' trước đó nếu có).
        if (wordMode === 1 && (prev === NBSP || prev === '\n')) {
          const idx = text.lastIndexOf(']', pos - 1);
          e.preventDefault(); // không cho xoá vách
          if (idx !== -1) {
            el.focus();
            setCaretOffset(el, idx);
            if (colorOn) enforceTypingColor();
            recomputeMirror();
          }
          return; // nếu không có ']' trước đó thì chỉ đơn giản là không làm gì
        }

        // Phần còn lại:
        // - Mode 0: ' ' hoặc ']' => nhảy về ']' trước (Shift+Tab).
        // - Mode 1: CHỈ ']' mới nhảy; ' ' thì để Backspace xoá bình thường.
        if (
          (wordMode === 0 && (prev === ' ' || prev === ']')) ||
          (wordMode === 1 && prev === ']')
        ) {
          // Hành vi như Shift+Tab: nhảy về dấu ']' trước đó nếu có
          const idx = text.lastIndexOf(']', pos - 1);
          if (idx !== -1) {
            e.preventDefault(); // chặn xoá mặc định — chỉ nhảy caret
            el.focus();
            setCaretOffset(el, idx);
            if (colorOn) enforceTypingColor();
            recomputeMirror();
            return;
          }
          // Không có ']' phía trước => KHÔNG chặn mặc định, để Backspace xoá bình thường
        }
      }
      // nếu đang có selection hoặc không trúng điều kiện, để mặc định xoá
    }

    // Ctrl + Space => CHÈN MỘT KHOẢNG TRẮNG (không nhảy ']')
    if (
      (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') &&
      e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      if (isComposing) return;
      e.preventDefault();
      insertPlainText(' ');
      if (colorOn) enforceTypingColor();
      recomputeMirror();
      return;
    }

    // Space:
    // - Nếu spaceJump = true: nhảy tới ']' tiếp theo (giống Tab)
    // - Nếu spaceJump = false: để mặc định chèn ký tự space bình thường
    if (
      (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') &&
      !e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      if (isComposing) return;
      if (spaceJump) {
        e.preventDefault();
        jumpToNextBracket(el);
      }
      return;
    }

    // Enter — NHẢY tới ']' kế tiếp (giống Tab/Space) nếu không có modifier.
    // Enter — KHÔNG làm gì cả
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (isComposing) return;
      e.preventDefault(); // chặn hành vi mặc định (xuống dòng)
      return;             // không xử lý thêm
    }

    // Shift+Enter hoặc Ctrl/Cmd+Enter => chèn newline
    if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      if (isComposing) return;
      e.preventDefault();
      insertPlainText('\n');
      if (colorOn) enforceTypingColor();
      recomputeMirror();
      return;
    }

    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const text = el.textContent ?? '';
      const start = getCaretOffset(el);
      if (!e.shiftKey) { // Tab thường -> tới ']' kế tiếp
        let idx = text.indexOf(']', start);
        if (idx === start) idx = text.indexOf(']', start + 1);
        if (idx !== -1) {
          e.preventDefault();
          el.focus();
          setCaretOffset(el, idx);
          recomputeMirror();
        }
      } else { // Shift+Tab -> về ']' trước đó
        let idx = text.lastIndexOf(']', start - 1);
        if (idx !== -1) {
          e.preventDefault();
          el.focus();
          setCaretOffset(el, idx);
          recomputeMirror();
        }
      }
    }
  };

  // ===== Handlers cho Tabbar =====
  const handleToggleDark = () => setDark((d) => !d);

  const handleChangeColorHex = (hex: string) => {
    setColorHex(hex);
    if (colorOn) {
      // Chỉ áp vào caret, không đổi màu vùng bôi đen
      applyTypingColorIfCaret(hex);
    }
  };

  const handleToggleColor = () => {
    const next = !colorOn;
    setColorOn(next);
    if (next) {
      enforceTypingColor(); // bật: set typing color tại caret
    } else {
      // tắt: chỉ trả caret về màu mặc định, không đụng đến vùng selection
      applyTypingColorIfCaret(getDefaultTextColor());
    }
  };

  // Modal handlers
  const openPasteModal = () => {
    const el = edRef.current!;
    savedCaretRef.current = getCaretOffset(el);
    setPasteText('');
    setShowPaste(true);
  };
  const closePasteModal = () => setShowPaste(false);

  const insertFromModal = () => {
    const el = edRef.current!;
    const normalized = (pasteText ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    setShowPaste(false);
    requestAnimationFrame(() => {
      el.focus();
      setCaretOffset(el, savedCaretRef.current);
      insertPlainText(normalized);
      if (colorOn) enforceTypingColor();
      recomputeMirror();
    });
  };

  // Nhận converted từ InputModal
  const handleReceiveConverted = (convertedText: string) => {
    setShowPaste(false);
    requestAnimationFrame(() => {
      setEditorText(convertedText);
    });
  };

  // Đồng bộ tokens/activeIndex vào cả hai store (mirroring & submirror)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import('../../state/mirroring'); // đường dẫn tuỳ theo cấu trúc dự án của bạn
        if (!cancelled) {
          const setTokens = mod?.setTokens || mod?.default?.setTokens;
          if (typeof setTokens === 'function') {
            setTokens(tokens, activeIndex ?? null);
          }
        }
      } catch { }
      try {
        const sub: any = await import('../../state/submirror'); // đường dẫn tuỳ theo cấu trúc dự án của bạn
        if (!cancelled) {
          const setTokens2 = sub?.setTokens || sub?.default?.setTokens;
          if (typeof setTokens2 === 'function') {
            setTokens2(tokens, activeIndex ?? null);
          }
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [tokens, activeIndex]);

  // Chiều cao đồng bộ cho Mirroring/SubMirroring (px)
  const [msSyncHeight, setMsSyncHeight] = useState<number>(MIN_FRAME_H);

  // Theo dõi chiều cao thực tế của editor để đồng bộ sang MirroringSpace
  useEffect(() => {
    const el = edRef.current;
    if (!el) return;

    // Cập nhật ngay lần đầu (sau mount)
    const update = () => {
      // Dùng cả scrollHeight lẫn boundingClientRect để bắt sát chiều cao thực tế
      const rectH = Math.ceil(el.getBoundingClientRect().height);
      const scrollH = el.scrollHeight; // phản ánh nội dung bên trong tốt hơn
      const h = Math.max(MIN_FRAME_H, rectH, scrollH);
      setMsSyncHeight(h);
    };
    update();

    // ResizeObserver theo dõi mọi biến thiên chiều cao
    // (gõ chữ, dán, đổi font size, thay đổi layout...)
    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    // Thêm dự phòng khi window resize
    const onResize = () => update();
    window.addEventListener('resize', onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      {/* Quy tắc cưỡng chế cỡ chữ cho toàn bộ PracticingSpace */}
      <style>{`
        .practicing-space-root,
        .practicing-space-root * {
          font-size: var(--ps-font-size, 14px) !important;
        }
        .ps-font-controls {
          display: flex; align-items: center; gap: 8px;
          margin: 12px 0;
        }
        .ps-font-controls button {
          padding: 6px 10px; border: 1px solid #999; border-radius: 8px;
          background: #fff; cursor: pointer;
        }
        body.dark .ps-font-controls button { background:#111; color:#fff; border-color:#555; }
        .ps-font-controls .val {
          min-width: 56px; text-align: center; padding: 4px 8px; border: 1px dashed #aaa; border-radius: 8px;
        }

        /* ===== Row ngang: Mirroring (1) + Editor (2-3) + SubMirroring (4) ===== */
        .ps-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr); /* 4 cột bằng nhau */
          gap: 16px;
          width: 100%;
          align-items: stretch; /* tất cả item cao bằng hàng (editor làm chuẩn) */
        }
        /* Vùng 1, 2-3, 4 theo thứ tự trái -> phải */
        .ps-col { 
          min-width: 0; 
          display: flex;                /* cho con bên trong fill 100% */
          min-height: var(--ps-min-h, 360px); /* đáy tối thiểu cho mỗi cột */
        }
        .col-1 { grid-column: 1 / span 1; }
        .col-editor { grid-column: 2 / span 2; } /* chiếm vùng 2 và 3 */
        .col-4 { grid-column: 4 / span 1; }

        /* Editor */
        #editor {
          width: 100%;
          min-height: var(--ps-min-h, 360px);   /* đáy tối thiểu của editor */
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 10px;
          outline: none;
          background: #fff;
          /* Căn đều như Word */
          text-align: justify;
          /* Tăng chất lượng justify, hạn chế chữ tràn dòng */
          text-justify: inter-word;
          overflow-wrap: break-word;    /* alias: word-wrap: break-word */
          hyphens: auto;                /* tự ngắt bằng dấu gạch nếu khả dụng */
        }
        body.dark #editor {
          background: #111;
          color: #eee;
          border-color: #333;
        }

        /* ===== Topbar: Tabbar + nút tròn ===== */
        .ps-topbar {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 8px;
        }
        .ps-topbar .ps-tabbar-wrap {
          flex: 1 1 auto; min-width: 0;
          color: #111 !important;                /* Light: chữ Tabbar đen */
        }
        body.dark .ps-topbar .ps-tabbar-wrap {
          color: #fff !important;                 /* Dark: chữ Tabbar trắng */
        }
        .dark-toggle-btn {
          width: 28px; height: 28px;
          border-radius: 9999px;
          border: 1px solid #ddd;
          background: #fff;
          color: #111;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          user-select: none;
          transition: transform .08s ease, background-color .2s ease, border-color .2s ease;
        }
        .dark-toggle-btn:active { transform: scale(0.96); }
        .dark-toggle-btn:hover { filter: brightness(0.97); }
        body.dark .dark-toggle-btn {
          background: #222; color: #fff; border-color: #333;
        }

        /* Nút tròn bật/tắt chế độ Space→] */
        .space-toggle-btn {
          width: 28px; height: 28px;
          border-radius: 9999px;
          border: 1px solid #ddd;
          background: #fff;
          color: #111;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          user-select: none;
          transition: transform .08s ease, background-color .2s ease, border-color .2s ease;
          font-size: 12px;
        }
        .space-toggle-btn:active { transform: scale(0.96); }
        .space-toggle-btn:hover { filter: brightness(0.97); }
        body.dark .space-toggle-btn { background:#222; color:#fff; border-color:#333; }
        .space-toggle-btn[aria-pressed="true"] { border-color:#2563eb; }

        /* Nút tròn bật/tắt chế độ word */
        .mode-toggle-btn {
          width: 28px; height: 28px;
          border-radius: 9999px;
          border: 1px solid #ddd;
          background: #fff;
          color: #111;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          user-select: none;
          transition: transform .08s ease, background-color .2s ease, border-color .2s ease;
          font-size: 12px;
        }
        .mode-toggle-btn:active { transform: scale(0.96); }
        .mode-toggle-btn:hover { filter: brightness(0.97); }
        body.dark .mode-toggle-btn { background:#222; color:#fff; border-color:#333; }
        .mode-toggle-btn[aria-pressed="true"] { border-color:#2563eb; }
      `}</style>

      <div
        className="wrap practicing-space-root"
        style={{
          ['--ps-font-size' as any]: `${fontPx}px`,
          ['--ps-min-h' as any]: `${MIN_FRAME_H}px`,
        }}
      >
        {/* Tabbar + nút tròn */}
        <div className="ps-topbar">
          <div className="ps-tabbar-wrap">
            <Tabbar
              dark={dark}
              onToggleDark={handleToggleDark}
              colorHex={colorHex}
              onChangeColorHex={handleChangeColorHex}
              colorOn={colorOn}
              onToggleColor={handleToggleColor}
              onOpenPaste={openPasteModal}
            />
          </div>

          {/* Nút tròn bật/tắt chế độ Space→] */}
          <button
            type="button"
            className="space-toggle-btn"
            title="Bật/tắt: nhấn Space để nhảy tới dấu ']' tiếp theo"
            aria-pressed={spaceJump}
            onClick={() => setSpaceJump(v => !v)}
          >
            {spaceJump ? '␣→]' : '␣'}
          </button>

          {/* Nút tròn bật/tắt chế độ word */}
          <button
            type="button"
            className="mode-toggle-btn"
            title={
              "Đổi định nghĩa 'word'.\n" +
              "Mode 0: [^\\s-]+.\n" +
              "Mode 1 (NBSP & \\n = vách ngăn):\n" +
              "  • NBSP (\\u00A0) hoặc newline (\\n) ngăn cách các cụm; MỌI ký tự khác đều thuộc cụm.\n" +
              "  • Mỗi vách làm chỉ số tăng +1; tất cả ký tự giữa 2 vách cùng một index.\n" +
              "  • Ký tự vách không nhận index."
            }
            aria-pressed={wordMode === 1}
            onClick={() => setWordMode((m: 0 | 1) => (m === 0 ? 1 : 0))}
          >
            {wordMode === 0 ? 'M0' : 'M1'}
          </button>
        </div>

        {/* Bộ điều khiển cỡ chữ */}
        <div className="ps-font-controls">
          <button type="button" onClick={decFont} title="Giảm cỡ chữ (min 10px)">A−</button>
          <div className="val">{fontPx}px</div>
          <button type="button" onClick={incFont} title="Tăng cỡ chữ (max 36px)">A+</button>
          <button type="button" onClick={resetFont} title="Đưa về mặc định 14px">Reset</button>
        </div>

        {/* ===== HÀNG NGANG: Mirroring (1) + Editor (2-3) + SubMirroring (4) ===== */}
        <div className="ps-row" ref={rowRef}>
          {/* Vùng 1: MirroringSpace */}
          <div className="ps-col col-1">
            <MirroringSpace
              tokens={tokens}
              activeIndex={activeIndex ?? null}
              fillHeight
              syncHeightPx={msSyncHeight}
              anchorViewportY={anchorViewportY}
              title="Mirroring Space"
              /* Căn đều & đảm bảo đáy tối thiểu cho khung mirroring */
              style={{ textAlign: 'justify', minHeight: MIN_FRAME_H }}
            />
          </div>

          {/* Vùng 2-3: PracticingSpace (Editor) */}
          <div className="ps-col col-editor">
            <div
              id="editor"
              ref={edRef}
              contentEditable
              spellCheck={false}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Vùng 4: SubMirroringSpace (dùng lại component MirroringSpace) */}
          <div className="ps-col col-4">
            <SubMirroringSpace
              tokens={tokens}
              activeIndex={activeIndex ?? null}
              fillHeight
              syncHeightPx={msSyncHeight}
              anchorViewportY={anchorViewportY}
              title="Sub Mirroring Space"
              style={{ textAlign: 'justify', minHeight: MIN_FRAME_H }}
            />
          </div>
        </div>

        {/* Modal */}
        <InputModal
          open={showPaste}
          value={pasteText}
          onChange={setPasteText}
          onClose={closePasteModal}
          onConfirm={insertFromModal}
          title="Dán văn bản"
          placeholder="Paste văn bản của bạn vào đây…"
          confirmLabel="Chèn (Ctrl/Cmd+Enter)"
          cancelLabel="Hủy"
          autoFocus
          percentValue={percent}
          onPercentChange={setPercent}
          onReceiveConverted={handleReceiveConverted}
        />
      </div>
    </>
  );
};

export default PracticingSpace;
