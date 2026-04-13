/**
 * Generic fallback cards for unknown or malformed card kinds.
 *
 * When parseStrictCard fails (unknown kind, bad payload shape, etc.),
 * CardRegistry routes here instead of showing an error. The user sees
 * the payload rendered as formatted key-value pairs with the appropriate
 * chrome (approve/cancel for confirm_*, read-only for info_*, result
 * banner for result_*).
 */
import type { ExtractedCard } from "@orch/shared";
import { BaseConfirmCard } from "./BaseConfirmCard.js";
import { BaseInfoCard } from "./BaseInfoCard.js";
import { BaseResultCard } from "./BaseResultCard.js";
import { GenericPayload } from "./GenericPayload.js";

interface GenericFallbackProps {
  extracted: ExtractedCard;
  chatId: string;
  projectId: string;
}

function titleFromKind(kind: string): string {
  // confirm_bulk_create_agents → Bulk create agents
  // info_foo_bar → Foo bar
  const stripped = kind
    .replace(/^confirm_/, "")
    .replace(/^info_/, "")
    .replace(/^result_/, "");
  const words = stripped.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function GenericConfirmFallback({ extracted, chatId, projectId }: GenericFallbackProps) {
  return (
    <BaseConfirmCard
      title={titleFromKind(extracted.kind)}
      summary={extracted.summary || ""}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    >
      <GenericPayload data={extracted.payload} />
    </BaseConfirmCard>
  );
}

export function GenericInfoFallback({ extracted }: GenericFallbackProps) {
  return (
    <BaseInfoCard title={titleFromKind(extracted.kind)} summary={extracted.summary || undefined}>
      <GenericPayload data={extracted.payload} />
    </BaseInfoCard>
  );
}

export function GenericResultFallback({ extracted }: GenericFallbackProps) {
  const isError = extracted.kind === "result_error";
  return (
    <BaseResultCard
      variant={isError ? "error" : "success"}
      title={extracted.summary || titleFromKind(extracted.kind)}
    >
      <GenericPayload data={extracted.payload} />
    </BaseResultCard>
  );
}
