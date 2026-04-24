const MENTION_SLUG_PATTERN = "[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
const MENTION_REGEX = new RegExp(`(?<![\\w/.@])@(${MENTION_SLUG_PATTERN})\\b`, "g");

export function mentionAutoLink(text: string, projectSlug?: string): string {
  if (!projectSlug) return text;

  const encodedProjectSlug = encodeURIComponent(projectSlug);
  MENTION_REGEX.lastIndex = 0;
  return text.replace(
    MENTION_REGEX,
    (_match, slug: string) => `[@${slug}](/projects/${encodedProjectSlug}/agents/${slug})`,
  );
}

export { MENTION_SLUG_PATTERN };
