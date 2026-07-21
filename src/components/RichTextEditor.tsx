"use client";

import { useRef, useCallback, useEffect } from "react";
import {
  Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Link
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, minHeight = "200px", maxHeight = "400px" }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingFromOutside = useRef(false);

  // Синхронизируем value из props только если оно пришло извне (не от самого редактора)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      isUpdatingFromOutside.current = true;
      editorRef.current.innerHTML = value || "";
      isUpdatingFromOutside.current = false;
    }
  }, [value]);

  const exec = useCallback((command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    onChange(el.innerHTML);
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current && !isUpdatingFromOutside.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const insertLink = useCallback(() => {
    const url = prompt("Введите URL:");
    if (url) {
      exec("createLink", url);
    }
  }, [exec]);

  const ToolbarButton = ({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
        <ToolbarButton onClick={() => exec("formatBlock", "<h1>")} title="Заголовок 1">
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("formatBlock", "<h2>")} title="Заголовок 2">
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("formatBlock", "<h3>")} title="Заголовок 3">
          <Heading3 className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-zinc-300" />

        <ToolbarButton onClick={() => exec("bold")} title="Жирный">
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} title="Курсив">
          <Italic className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-zinc-300" />

        <ToolbarButton onClick={() => exec("insertUnorderedList")} title="Маркированный список">
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("insertOrderedList")} title="Нумерованный список">
          <ListOrdered className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-zinc-300" />

        <ToolbarButton onClick={insertLink} title="Вставить ссылку">
          <Link className="size-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        dir="ltr"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="prose prose-sm max-w-none overflow-y-auto px-4 py-3 outline-none focus:outline-none [&:empty:before]:text-zinc-400 [&:empty:before]:content-[attr(data-placeholder)]"
        style={{ minHeight, maxHeight, direction: "ltr", textAlign: "left", writingMode: "horizontal-tb" }}
      />
    </div>
  );
}
