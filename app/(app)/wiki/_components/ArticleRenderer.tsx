"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TipTapDoc, TipTapNode, TipTapMark } from "@/lib/wiki/tiptap";

/**
 * Read-only renderer for TipTap JSON docs. Lightweight — no editor instance,
 * just recursive React. Renders headings, paragraphs, lists, tables,
 * blockquotes, code, hr, plus link + wikilink marks.
 */
export function ArticleRenderer({
  doc,
  onWikilinkClick,
}: {
  doc: TipTapDoc | null | undefined;
  /** Override default navigation. Otherwise wikilinks navigate to /wiki/a/[slug]. */
  onWikilinkClick?: (target: { articleId: string; slug: string; title: string }) => void;
}) {
  if (!doc || !doc.content || doc.content.length === 0) {
    return <div className="text-sm italic text-stone-400">(empty)</div>;
  }
  return (
    <div className="prose prose-stone prose-sm max-w-none prose-headings:font-semibold prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1 prose-table:my-3 prose-table:text-xs prose-th:bg-stone-50 prose-th:px-2 prose-th:py-1.5 prose-td:px-2 prose-td:py-1.5 prose-td:align-top prose-table:border prose-th:border prose-td:border prose-th:border-stone-200 prose-td:border-stone-200 prose-table:border-stone-200 prose-blockquote:border-l-stone-300 prose-blockquote:not-italic prose-blockquote:text-stone-700 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
      {doc.content.map((node, i) => (
        <NodeView key={i} node={node} onWikilinkClick={onWikilinkClick} />
      ))}
    </div>
  );
}

function NodeView({
  node,
  onWikilinkClick,
}: {
  node: TipTapNode;
  onWikilinkClick?: (target: { articleId: string; slug: string; title: string }) => void;
}) {
  switch (node.type) {
    case "text":
      return <TextView text={node.text} marks={node.marks} onWikilinkClick={onWikilinkClick} />;
    case "paragraph":
      return <p>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</p>;
    case "heading": {
      const level = node.attrs?.level ?? 3;
      const children = (node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />);
      if (level === 1) return <h1>{children}</h1>;
      if (level === 2) return <h2>{children}</h2>;
      if (level === 3) return <h3>{children}</h3>;
      return <h4>{children}</h4>;
    }
    case "bulletList":
      return <ul>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</ul>;
    case "orderedList":
      return <ol>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</ol>;
    case "listItem":
      return <li>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</li>;
    case "blockquote":
      return <blockquote>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</blockquote>;
    case "horizontalRule":
      return <hr />;
    case "hardBreak":
      return <br />;
    case "codeBlock":
      return <pre><code>{(node.content ?? []).map((c, i) => c.type === "text" ? c.text : "")}</code></pre>;
    case "table":
      return <table><tbody>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</tbody></table>;
    case "tableRow":
      return <tr>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</tr>;
    case "tableCell":
      return <td>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</td>;
    case "tableHeader":
      return <th>{(node.content ?? []).map((c, i) => <NodeView key={i} node={c} onWikilinkClick={onWikilinkClick} />)}</th>;
    default:
      return null;
  }
}

function TextView({
  text,
  marks,
  onWikilinkClick,
}: {
  text: string;
  marks?: TipTapMark[];
  onWikilinkClick?: (target: { articleId: string; slug: string; title: string }) => void;
}) {
  let node: React.ReactNode = text;
  if (!marks || marks.length === 0) return <>{node}</>;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":      node = <strong>{node}</strong>; break;
      case "italic":    node = <em>{node}</em>; break;
      case "underline": node = <u>{node}</u>; break;
      case "code":      node = <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">{node}</code>; break;
      case "link":      node = <a href={mark.attrs.href} target="_blank" rel="noreferrer" className="text-blue-600 underline">{node}</a>; break;
      case "wikilink":  node = <WikilinkChip text={text} attrs={mark.attrs} onClick={onWikilinkClick} />; break;
    }
  }
  return <>{node}</>;
}

function WikilinkChip({
  text,
  attrs,
  onClick,
}: {
  text: string;
  attrs: { articleId: string; slug: string; title: string };
  onClick?: (target: { articleId: string; slug: string; title: string }) => void;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (onClick ? onClick(attrs) : router.push(`/wiki/a/${attrs.slug}`))}
      className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-200"
      title={attrs.title}
    >
      {text}
    </button>
  );
}

/** Convenience: link an article summary to its /wiki/a/[slug] page. */
export function ArticleLink({ slug, title, className }: { slug: string; title: string; className?: string }) {
  return <Link href={`/wiki/a/${slug}`} className={className ?? "text-amber-700 hover:underline"}>{title}</Link>;
}
