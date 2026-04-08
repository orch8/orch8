import { Fragment, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { autoLinkIds } from "./IdAutoLinker.js";
import type { ExtractedCard } from "@orch/shared";
import { CardRegistry } from "./cards/CardRegistry.js";

export interface ChatMessageRendererProps {
  projectId: string;
  chatId: string;
  content: string;
  cards: ExtractedCard[];
}

interface Segment {
  type: "text" | "card";
  content: string;
  cardIndex?: number;
}

const FENCE_OPEN = "```orch8-card";
const FENCE_CLOSE = "```";

/**
 * Splits the raw content into ordered text and card segments. Used by
 * the renderer to interleave markdown prose with placeholder card blocks
 * (Plan 04) or with real card components (Plan 05).
 */
export function splitMessageSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  let cardIdx = 0;

  while (cursor < content.length) {
    const openIdx = content.indexOf(FENCE_OPEN, cursor);
    if (openIdx === -1) {
      const text = content.slice(cursor);
      if (text.length > 0) segments.push({ type: "text", content: text });
      break;
    }
    if (openIdx > cursor) {
      const text = content.slice(cursor, openIdx);
      if (text.length > 0) segments.push({ type: "text", content: text });
    }
    const afterOpen = openIdx + FENCE_OPEN.length;
    const closeIdx = content.indexOf("\n" + FENCE_CLOSE, afterOpen);
    if (closeIdx === -1) {
      // Unterminated — treat the rest as text.
      segments.push({ type: "text", content: content.slice(openIdx) });
      break;
    }
    const body = content.slice(afterOpen, closeIdx).trim();
    segments.push({ type: "card", content: body, cardIndex: cardIdx });
    cardIdx++;
    cursor = closeIdx + ("\n" + FENCE_CLOSE).length;
  }

  return segments;
}

export function ChatMessageRenderer({
  projectId,
  chatId,
  content,
  cards,
}: ChatMessageRendererProps) {
  const segments = useMemo(() => splitMessageSegments(content), [content]);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <ReactMarkdown
              key={`text-${i}`}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // Auto-link IDs only in text nodes outside of code/inline-code.
                p: ({ children, ...rest }) => (
                  <p {...rest} className="text-zinc-200">
                    {linkifyChildren(children, projectId)}
                  </p>
                ),
                li: ({ children, ...rest }) => (
                  <li {...rest}>{linkifyChildren(children, projectId)}</li>
                ),
              }}
            >
              {seg.content}
            </ReactMarkdown>
          );
        }
        const card = cards[seg.cardIndex!];
        if (!card) return null;
        return (
          <CardRegistry
            key={`card-${card.id}`}
            extracted={card}
            chatId={chatId}
            projectId={projectId}
          />
        );
      })}
    </div>
  );
}

/**
 * Walks react-markdown's children and linkifies plain string children
 * via autoLinkIds. Non-string children (e.g. nested elements like
 * <code>) are left untouched.
 */
function linkifyChildren(children: ReactNode, projectId: string): ReactNode {
  if (typeof children === "string") {
    return <Fragment>{autoLinkIds(children, projectId)}</Fragment>;
  }
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string"
        ? <Fragment key={i}>{autoLinkIds(c, projectId)}</Fragment>
        : c,
    );
  }
  return children;
}
