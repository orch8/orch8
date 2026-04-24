import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

// Order matters: longer prefixes first so `pipe_` doesn't accidentally
// match a substring of `pipeline_`.
const ID_PATTERNS: Array<{
  prefix: string;
  build: (projectId: string, id: string) => { to: any; params: any };
}> = [
  {
    prefix: "task_",
    build: (projectId, id) => ({
      to: "/projects/$projectSlug/tasks/$taskId",
      params: { projectSlug: projectId, taskId: id },
    }),
  },
  {
    prefix: "agent_",
    build: (projectId, id) => ({
      to: "/projects/$projectSlug/agents/$agentId",
      params: { projectSlug: projectId, agentId: id },
    }),
  },
  {
    prefix: "run_",
    build: (projectId, id) => ({
      to: "/projects/$projectSlug/runs",
      params: { projectSlug: projectId },
      // The runs page handles ?runId for deep-link selection.
    }),
  },
  {
    prefix: "pipe_",
    build: (projectId, id) => ({
      to: "/projects/$projectSlug/pipelines/$pipelineId",
      params: { projectSlug: projectId, pipelineId: id },
    }),
  },
  {
    prefix: "pipeline_",
    build: (projectId, id) => ({
      to: "/projects/$projectSlug/pipelines/$pipelineId",
      params: { projectSlug: projectId, pipelineId: id },
    }),
  },
  {
    prefix: "chat_",
    build: (projectId, id) => ({
      to: "/projects/$projectSlug/chat/$chatId",
      params: { projectSlug: projectId, chatId: id },
    }),
  },
];

// Match: word-boundary | start, then a known prefix, then [a-zA-Z0-9_-]+,
// then word-boundary | punctuation | end. We use a single regex with the
// alternation of all prefixes to avoid worst-case re-scans.
const PREFIX_ALTERNATION = ID_PATTERNS.map((p) => p.prefix).join("|");
const ID_REGEX = new RegExp(
  `(?:^|(?<=[\\s.,;:!?()\\[\\]{}'"]))(?:(CATKEY)([A-Z][A-Z0-9]{1,4}-\\d+)|(${PREFIX_ALTERNATION})([a-zA-Z0-9_-]+))`,
  "g",
);

export function autoLinkIds(text: string, projectId: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  ID_REGEX.lastIndex = 0;
  while ((match = ID_REGEX.exec(text)) !== null) {
    const [full] = match;
    const prefix = match[1] === "CATKEY" ? "task_" : match[3];
    const id = match[1] === "CATKEY" ? match[2] : `${prefix}${match[4]}`;

    if (match.index > lastIdx) {
      out.push(text.slice(lastIdx, match.index));
    }

    const def = ID_PATTERNS.find((p) => p.prefix === prefix);
    if (def) {
      const { to, params } = def.build(projectId, id);
      out.push(
        <Link
          key={`id-${key++}`}
          to={to}
          params={params}
          className="text-sky-400 underline decoration-dotted hover:text-sky-300"
        >
          {id}
        </Link>,
      );
    } else {
      out.push(full);
    }

    lastIdx = match.index + full.length;
  }

  if (lastIdx < text.length) {
    out.push(text.slice(lastIdx));
  }

  return out;
}
