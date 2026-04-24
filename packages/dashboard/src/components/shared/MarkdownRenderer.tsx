import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { mentionAutoLink } from "./mentionAutoLink.js";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  projectSlug?: string;
}

const TASK_REF_REGEX = /TASK-(\d+)/g;

function preprocessContent(content: string): string {
  return content.replace(TASK_REF_REGEX, "[TASK-$1](/board?task=$1)");
}

const RUN_REF_REGEX = /Run #(\d+)/g;

function preprocessRuns(content: string): string {
  return content.replace(RUN_REF_REGEX, "[Run #$1](/runs/$1)");
}

function preprocess(content: string, projectSlug?: string): string {
  return mentionAutoLink(preprocessRuns(preprocessContent(content)), projectSlug);
}

const components: Components = {
  a({ href, children, ...props }) {
    const isExternal = href?.startsWith("http://") || href?.startsWith("https://");
    return (
      <a
        href={href}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="text-blue-400 hover:text-blue-300 underline"
        {...props}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content, className, projectSlug }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-invert prose-zinc max-w-none text-sm ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {preprocess(content, projectSlug)}
      </ReactMarkdown>
    </div>
  );
}
