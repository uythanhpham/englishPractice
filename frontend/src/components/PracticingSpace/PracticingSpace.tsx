// E:\3_CODING\Personally\english_practice\src\components\PracticingSpace\PracticingSpace.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import './PracticingSpace.css';
import InputModal from '../InputModal/InputModal';
import Tabbar from '../Tabbar/Tabbar';
import PictureFrame from '../PictureFrame/PictureFrame';

const INITIAL_TEXT = `Ví dụ: Hello [world] and [friends]!
A link or [placeholder] appears here.] Tiếp tục...`;

type InputEvt = InputEvent & { isComposing?: boolean; inputType?: string };
type PasteEvt = ClipboardEvent & { clipboardData: DataTransfer | null };

const PracticingSpace: React.FC = () => {
  const edRef = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  const [colorHex, setColorHex] = useState('#e11d48');
  const [colorOn, setColorOn] = useState(false);

  // Modal state
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const savedCaretRef = useRef<number>(0);

  // (tuỳ chọn) quản lý percent ở parent để đồng bộ với modal
  const [percent, setPercent] = useState<number | undefined>(10);

  // Dark Mode
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    return () => document.body.classList.remove('dark');
  }, [dark]);

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
  };

  // Đảm bảo hiển thị dòng trống khi kết thúc bằng '\n'
  const ensureTrailingBR = () => {
    const el = edRef.current;
    if (!el) return;
    while (
      el.lastChild &&
      el.lastChild.nodeType === 1 &&
      (el.lastChild as HTMLElement).tagName === 'BR' &&
      (el.lastChild as HTMLElement).getAttribute('data-trailing') === '1'
    ) {
      if (!el.textContent?.endsWith('\n')) el.removeChild(el.lastChild);
      else return;
    }
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
  const enforceTypingColor = () => {
    if (!colorOn) return;
    applyTypingColor(colorHex);
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
        if (j >= 0 && j < text.length && text[j] === '.') {
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
  }, []);

  // listeners
  useEffect(() => {
    const el = edRef.current!;
    if (!el) return;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!el.contains(sel.anchorNode)) return;
      enforceTypingColor();
    };
    document.addEventListener('selectionchange', onSelectionChange);

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvt;
      if (!colorOn) return;
      const t = ie.inputType || '';
      if (t === 'insertText' || t === 'insertCompositionText' || t === 'insertFromComposition') {
        enforceTypingColor();
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
  }, [colorOn, colorHex]);

  // Keydown: Enter = '\n', Tab nhảy đến ']'
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    const el = edRef.current!;
    const isComposing = (e.nativeEvent as any).isComposing;

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isComposing) return;
      e.preventDefault();
      insertPlainText('\n');
      if (colorOn) enforceTypingColor();
      return;
    }

    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const text = el.textContent ?? '';
      const start = getCaretOffset(el);
      if (!e.shiftKey) {
        let idx = text.indexOf(']', start);
        if (idx === start) idx = text.indexOf(']', start + 1);
        if (idx !== -1) {
          e.preventDefault();
          el.focus();
          setCaretOffset(el, idx);
        }
      } else {
        let idx = text.lastIndexOf(']', start - 1);
        if (idx !== -1) {
          e.preventDefault();
          el.focus();
          setCaretOffset(el, idx);
        }
      }
    }
  };

  // ===== Handlers cho Tabbar =====
  const handleToggleDark = () => setDark((d) => !d);

  const handleChangeColorHex = (hex: string) => {
    setColorHex(hex);
    if (colorOn) {
      applyTypingColor(hex);
    }
  };

  const handleToggleColor = () => {
    const next = !colorOn;
    setColorOn(next);
    if (next) enforceTypingColor();
    else applyTypingColor(getDefaultTextColor());
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
    });
  };

  // Nhận converted từ InputModal
  const handleReceiveConverted = (convertedText: string) => {
    setShowPaste(false);
    requestAnimationFrame(() => {
      setEditorText(convertedText);
    });
  };

  return (
    <div className="wrap">
      {/* Tabbar tách riêng */}
      <Tabbar
        dark={dark}
        onToggleDark={handleToggleDark}
        colorHex={colorHex}
        onChangeColorHex={handleChangeColorHex}
        colorOn={colorOn}
        onToggleColor={handleToggleColor}
        onOpenPaste={openPasteModal}
      />

      {/* ✅ PictureFrame nằm ngay trên vùng nhập văn bản */}
      <PictureFrame
        width={760}
        height={330}
        onChange={(file, dataUrl) => {
          // Bạn có thể lưu dataUrl vào state/global nếu muốn dùng tiếp
          console.log('Ảnh đã nhận:', file.name, file.type, file.size);
        }}
        onClear={() => console.log('Đã xóa ảnh trong PictureFrame')}
      />

      <div
        id="editor"
        ref={edRef}
        contentEditable
        spellCheck={false}
        onKeyDown={handleKeyDown}
      />

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
  );
};

export default PracticingSpace;
