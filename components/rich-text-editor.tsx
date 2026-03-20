"use client";

import { useEffect, useRef, type MutableRefObject } from 'react';
import type QuillType from 'quill';

import { EDITOR_FORMATS, getEditorModules, loadQuill, normalizeEditorHtml } from '@/lib/quill-editor';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  editorRef?: MutableRefObject<QuillType | null>;
  minHeight: number;
  placeholder?: string;
  onFocus?: () => void;
  onSelectionChange?: (index: number, length: number) => void;
};

type DestroyableModule = {
  destroy?: () => void;
};

export default function RichTextEditor({
  value,
  onChange,
  editorRef,
  minHeight,
  placeholder = '',
  onFocus,
  onSelectionChange,
}: RichTextEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<QuillType | null>(null);
  const initialValueRef = useRef(value);
  const lastHtmlRef = useRef(normalizeEditorHtml(value));
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    let isCancelled = false;
    const hostElement = hostRef.current;

    const initializeEditor = async () => {
      const Quill = await loadQuill();
      if (isCancelled || !hostElement || quillRef.current) {
        return;
      }

      hostElement.innerHTML = '';

      const editorElement = document.createElement('div');
      hostElement.appendChild(editorElement);

      const quill = new Quill(editorElement, {
        theme: 'snow',
        placeholder,
        modules: getEditorModules(),
        formats: EDITOR_FORMATS,
      });

      const handleTextChange = () => {
        const nextHtml = normalizeEditorHtml(quill.root.innerHTML);
        lastHtmlRef.current = nextHtml;
        onChangeRef.current(nextHtml);
      };

      const handleSelectionChange = () => {
        const selection = quill.getSelection();
        if (!selection) {
          return;
        }

        onFocusRef.current?.();
        onSelectionChangeRef.current?.(selection.index, selection.length);
      };

      const handleFocusIn = () => {
        onFocusRef.current?.();
      };

      quill.on(Quill.events.TEXT_CHANGE, handleTextChange);
      quill.on(Quill.events.SELECTION_CHANGE, handleSelectionChange);
      quill.root.addEventListener('focusin', handleFocusIn);

      if (initialValueRef.current) {
        quill.clipboard.dangerouslyPasteHTML(initialValueRef.current, Quill.sources.SILENT);
      } else {
        quill.setText('', Quill.sources.SILENT);
      }

      lastHtmlRef.current = normalizeEditorHtml(quill.root.innerHTML);
      quillRef.current = quill;

      if (editorRef) {
        editorRef.current = quill;
      }

      const imageResizeModule = quill.getModule('imageResize') as DestroyableModule | undefined;

      return () => {
        quill.off(Quill.events.TEXT_CHANGE, handleTextChange);
        quill.off(Quill.events.SELECTION_CHANGE, handleSelectionChange);
        quill.root.removeEventListener('focusin', handleFocusIn);
        imageResizeModule?.destroy?.();
      };
    };

    let teardown: (() => void) | undefined;

    void initializeEditor().then((cleanup) => {
      if (isCancelled) {
        cleanup?.();
        return;
      }

      teardown = cleanup;
    });

    return () => {
      isCancelled = true;
      teardown?.();

      quillRef.current = null;
      if (editorRef) {
        editorRef.current = null;
      }

      if (hostElement) {
        hostElement.innerHTML = '';
      }
    };
  }, [editorRef, placeholder]);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) {
      return;
    }

    const normalizedValue = normalizeEditorHtml(value);
    if (normalizedValue === lastHtmlRef.current) {
      return;
    }

    const currentSelection = quill.getSelection();
    if (normalizedValue) {
      quill.clipboard.dangerouslyPasteHTML(normalizedValue, 'silent');
    } else {
      quill.setText('', 'silent');
    }

    lastHtmlRef.current = normalizeEditorHtml(quill.root.innerHTML);

    if (currentSelection) {
      const maxIndex = Math.max(quill.getLength() - 1, 0);
      const nextIndex = Math.min(currentSelection.index, maxIndex);
      quill.setSelection(
        nextIndex,
        Math.max(Math.min(currentSelection.length, maxIndex - nextIndex), 0),
        'silent',
      );
    }
  }, [value]);

  return (
    <div
      className="editor-shell"
      style={{ ['--editor-min-height' as string]: `${minHeight}px` }}
    >
      <div ref={hostRef} className="editor-host" />
    </div>
  );
}
