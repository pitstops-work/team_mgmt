"use client";

import { useEditor, EditorContent, ReactRenderer, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Mention from "@tiptap/extension-mention";
import { useRef } from "react";
import {
  BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, CodeIcon,
  Heading2Icon, Heading3Icon, Heading4Icon,
  ListIcon, ListOrderedIcon, QuoteIcon, CodeXmlIcon,
  LinkIcon, ImageIcon, TableIcon, AtSignIcon,
  Undo2Icon, Redo2Icon,
} from "lucide-react";
import type { TipTapDoc } from "@/lib/wiki/tiptap";
import { fetchJson } from "@/lib/fetchJson";
import { MentionList, type MentionListRef } from "./MentionList";

export function RichEditor({
  initialContent,
  onChange,
}: {
  initialContent: TipTapDoc | null;
  onChange: (doc: TipTapDoc) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Mention.configure({
        HTMLAttributes: {
          class: "wiki-mention rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900",
        },
        suggestion: buildMentionSuggestion(),
      }),
    ],
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChangeRef.current(editor.getJSON() as TipTapDoc);
    },
  });

  if (!editor) {
    return <div className="rounded-md border border-stone-200 p-4 text-sm text-stone-400">Loading editor…</div>;
  }

  return (
    <div className="rounded-md border border-stone-200 bg-white">
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose prose-stone prose-sm max-w-none px-4 py-3 focus:outline-none [&_table]:border [&_table]:border-stone-200 [&_th]:border [&_th]:border-stone-200 [&_th]:bg-stone-50 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-stone-200 [&_td]:px-2 [&_td]:py-1 min-h-[300px]"
      />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const Btn = ({ active, disabled, onClick, title, children }: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded p-1.5 text-stone-700 transition disabled:cursor-not-allowed disabled:text-stone-300 ${active ? "bg-amber-100 text-amber-900" : "hover:bg-stone-100"}`}
    >
      {children}
    </button>
  );

  const can = (fn: () => boolean) => {
    try { return fn(); } catch { return false; }
  };

  const insertLink = () => {
    const url = prompt("URL?");
    if (!url) return;
    editor.chain().focus().toggleLink({ href: url }).run();
  };
  const insertImage = () => {
    const url = prompt("Image URL?");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };
  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };
  const startMention = () => {
    // Insert the @ trigger; Mention plugin picks it up.
    editor.chain().focus().insertContent("@").run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 p-1.5">
      <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!can(() => editor.can().undo())}><Undo2Icon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!can(() => editor.can().redo())}><Redo2Icon className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-5 w-px bg-stone-200" />
      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><BoldIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><CodeIcon className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-5 w-px bg-stone-200" />
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2Icon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3Icon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}><Heading4Icon className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-5 w-px bg-stone-200" />
      <Btn title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><ListIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrderedIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><QuoteIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><CodeXmlIcon className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-5 w-px bg-stone-200" />
      <Btn title="Link" active={editor.isActive("link")} onClick={insertLink}><LinkIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Image" onClick={insertImage}><ImageIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Table" onClick={insertTable}><TableIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Wikilink (or type @)" onClick={startMention}><AtSignIcon className="h-3.5 w-3.5" /></Btn>
    </div>
  );
}

// ── Mention suggestion (wikilink autocomplete) ───────────────────────────────
type SuggestionItem = { id: string; slug: string; label: string };
type SuggestionProps = {
  items: SuggestionItem[];
  command: (props: { id: string; label: string }) => void;
  clientRect?: (() => DOMRect | null) | null;
};

function buildMentionSuggestion() {
  return {
    char: "@",
    items: async ({ query }: { query: string }): Promise<SuggestionItem[]> => {
      if (!query.trim()) return [];
      try {
        const r = await fetchJson<{ results: { id: string; slug: string; title: string }[] }>(
          `/api/wiki/search?q=${encodeURIComponent(query)}&limit=10`,
        );
        return r.results.map((x) => ({ id: x.id, slug: x.slug, label: x.title }));
      } catch {
        return [];
      }
    },
    render: () => {
      let component: ReactRenderer<MentionListRef, SuggestionProps> | null = null;
      let host: HTMLDivElement | null = null;

      const reposition = (rect: DOMRect | null) => {
        if (!host || !rect) return;
        host.style.left = `${rect.left + window.scrollX}px`;
        host.style.top = `${rect.bottom + window.scrollY + 4}px`;
      };

      return {
        onStart: (props: SuggestionProps) => {
          host = document.createElement("div");
          host.style.position = "absolute";
          host.style.zIndex = "9999";
          document.body.appendChild(host);
          component = new ReactRenderer(MentionList, { props, editor: undefined as never });
          host.appendChild(component.element);
          reposition(props.clientRect?.() ?? null);
        },
        onUpdate(props: SuggestionProps) {
          component?.updateProps(props);
          reposition(props.clientRect?.() ?? null);
        },
        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            host?.remove();
            host = null;
            return true;
          }
          return component?.ref?.onKeyDown?.(props) ?? false;
        },
        onExit() {
          host?.remove();
          component?.destroy();
          host = null;
          component = null;
        },
      };
    },
  };
}
