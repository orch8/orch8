export const MENTION_SLUG_RE = /[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?/;

const MENTION_RE = /@([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)(?![a-z0-9-])/y;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

function isMentionPrefixBoundary(char: string | undefined): boolean {
  return char === undefined || !/[\w/.@]/.test(char);
}

function scanLine(line: string, seen: Set<string>, slugs: string[]): void {
  let i = 0;

  while (i < line.length) {
    if (line[i] === "`") {
      const start = i;
      while (i < line.length && line[i] === "`") i += 1;
      const ticks = line.slice(start, i);
      const close = line.indexOf(ticks, i);
      if (close === -1) continue;
      i = close + ticks.length;
      continue;
    }

    if (line[i] !== "@") {
      i += 1;
      continue;
    }

    if (!isMentionPrefixBoundary(line[i - 1])) {
      i += 1;
      continue;
    }

    MENTION_RE.lastIndex = i;
    const match = MENTION_RE.exec(line);
    if (!match) {
      i += 1;
      continue;
    }

    const slug = match[1];
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
    i = MENTION_RE.lastIndex;
  }
}

export function extractMentionSlugs(body: string): string[] {
  const seen = new Set<string>();
  const slugs: string[] = [];
  let fence: "`" | "~" | null = null;
  let fenceLength = 0;

  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const markerChar = marker[0] as "`" | "~";
      if (fence === null) {
        fence = markerChar;
        fenceLength = marker.length;
      } else if (fence === markerChar && marker.length >= fenceLength) {
        fence = null;
        fenceLength = 0;
      }
      continue;
    }

    if (fence !== null || /^ {4}/.test(line)) continue;
    scanLine(line, seen, slugs);
  }

  return slugs;
}
