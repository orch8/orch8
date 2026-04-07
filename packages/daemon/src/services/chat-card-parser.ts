import { randomUUID } from "node:crypto";
import type { ExtractedCard } from "@orch/shared";

export const FENCE_OPEN = "```orch8-card";
export const FENCE_CLOSE = "```";

export interface ExtractResult {
  cards: ExtractedCard[];
  textOnly: string; // source with fences removed (for future use, e.g. summaries)
}

/**
 * Scans a raw message string for ```orch8-card``` fences and parses each
 * JSON body into an ExtractedCard. Invalid payloads become synthetic
 * `result_error` cards so the conversation is never lost, and the agent
 * can be told about its mistake on the next turn.
 */
export function extractCards(raw: string): ExtractResult {
  const cards: ExtractedCard[] = [];
  const textChunks: string[] = [];

  let cursor = 0;
  while (cursor < raw.length) {
    const openIdx = raw.indexOf(FENCE_OPEN, cursor);
    if (openIdx === -1) {
      textChunks.push(raw.slice(cursor));
      break;
    }

    textChunks.push(raw.slice(cursor, openIdx));

    const afterOpen = openIdx + FENCE_OPEN.length;
    const closeIdx = raw.indexOf("\n" + FENCE_CLOSE, afterOpen);
    if (closeIdx === -1) {
      // Unterminated fence — treat remainder as raw text.
      textChunks.push(raw.slice(openIdx));
      break;
    }

    const body = raw.slice(afterOpen, closeIdx).trim();
    cards.push(parseCardBody(body));
    cursor = closeIdx + ("\n" + FENCE_CLOSE).length;
  }

  return {
    cards,
    textOnly: textChunks.join("").trim(),
  };
}

function parseCardBody(body: string): ExtractedCard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    return errorCard(`Failed to parse card JSON: ${(err as Error).message}`, body);
  }

  if (typeof parsed !== "object" || parsed === null) {
    return errorCard("Card body must be a JSON object", body);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.kind !== "string" || obj.kind.length === 0) {
    return errorCard("Card is missing `kind`", body);
  }

  return {
    id: `card_${randomUUID()}`,
    kind: obj.kind,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    payload: obj.payload ?? {},
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
  };
}

function errorCard(reason: string, rawBody: string): ExtractedCard {
  return {
    id: `card_${randomUUID()}`,
    kind: "result_error",
    summary: "Invalid card from the agent",
    payload: { reason, rawBody: rawBody.slice(0, 2000) },
    status: "error",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
  };
}
