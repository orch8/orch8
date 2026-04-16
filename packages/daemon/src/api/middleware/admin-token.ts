import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface AdminTokenLoadResult {
  /** Raw hex token. Null if no token has been generated yet. */
  token: string | null;
  /** True if a new token was generated and persisted during this call. */
  generated: boolean;
  /** Absolute path where the token was read from / written to. */
  filePath: string;
}

export function defaultAdminTokenPath(): string {
  return path.join(homedir(), ".orch8", "admin-token");
}

/**
 * Read the admin token from disk if one exists. Returns `null` without
 * throwing if the file is absent. Used to test whether a token has been
 * provisioned at boot before deciding whether to warn about an insecure
 * bind host.
 */
export async function readAdminToken(filePath: string): Promise<string | null> {
  try {
    const contents = await readFile(filePath, "utf-8");
    const trimmed = contents.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Load the persisted admin token or generate a fresh one if none exists.
 * The token is 256 bits of hex-encoded entropy written with mode 0600 so
 * only the local user can read it. Returns both the token and a flag
 * indicating whether a new token was just created, so callers can log
 * the "new token generated" event once per daemon install.
 */
export async function loadOrGenerateAdminToken(
  filePath: string = defaultAdminTokenPath(),
): Promise<AdminTokenLoadResult> {
  const existing = await readAdminToken(filePath);
  if (existing) {
    return { token: existing, generated: false, filePath };
  }

  const token = randomBytes(32).toString("hex");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, token, { mode: 0o600 });
  return { token, generated: true, filePath };
}

/**
 * Constant-time comparison between a supplied bearer token and the
 * canonical admin token. Both inputs are encoded to Buffers of equal
 * length first; mismatched-length inputs fail fast without touching
 * `timingSafeEqual`, which throws on length mismatch.
 */
export function adminTokenMatches(supplied: string, canonical: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(canonical);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extracts a Bearer token from an Authorization header. Returns null
 * if the header is missing, empty, or does not use the Bearer scheme.
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}
