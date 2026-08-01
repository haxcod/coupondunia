"use client";

/**
 * Rich-text editor for the product description (Task 15.7, Req 16.13).
 *
 * Built on the installed TipTap editor (`@tiptap/react` + `@tiptap/starter-kit`).
 * StarterKit ships the formatting marks/nodes this field needs — bold, italic,
 * bullet lists, numbered lists, and headings (exposed here as H2 and H3). The
 * editor emits sanitisation-ready HTML to the parent on every change; the value
 * is sanitised with `isomorphic-dompurify` before it is ever displayed
 * (see the product detail rendering path).
 *
 * `immediatelyRender: false` keeps TipTap from rendering during SSR, avoiding a
 * hydration mismatch in the Next.js App Router.
 */
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Icon } from "./icons";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  ariaLabel?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  ariaLabel = "Product description",
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
        class:
          "prose-admin min-h-[10rem] w-full px-3 py-2 text-sm text-foreground focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      // TipTap represents an empty document as "<p></p>"; normalise to "".
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  if (!editor) {
    return (
      <div className="min-h-[13rem] animate-pulse rounded-control border border-border bg-card" />
    );
  }

  return (
    <div className="rounded-control border border-border bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <line x1="19" y1="4" x2="10" y2="4" />
        <line x1="14" y1="20" x2="5" y2="20" />
        <line x1="15" y1="4" x2="9" y2="20" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Heading level 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        text="H2"
      />
      <ToolbarButton
        label="Heading level 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        text="H3"
      />

      <Divider />

      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="3.5" cy="6" r="1.2" />
        <circle cx="3.5" cy="12" r="1.2" />
        <circle cx="3.5" cy="18" r="1.2" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <line x1="10" y1="6" x2="21" y2="6" />
        <line x1="10" y1="12" x2="21" y2="12" />
        <line x1="10" y1="18" x2="21" y2="18" />
        <path d="M4 6h1v4" />
        <path d="M4 10h2" />
        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
      </ToolbarButton>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
  text,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  text?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-control px-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? "bg-accent text-white"
          : "text-secondary hover:bg-background hover:text-foreground"
      }`}
    >
      {text ? <span>{text}</span> : <Icon>{children}</Icon>}
    </button>
  );
}
