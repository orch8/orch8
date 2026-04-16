import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generates a 128-bit random hex token used as an agent's bearer
 * credential. Callers MUST capture the raw return value before
 * storing the hashed form — the raw token is never recoverable from
 * the database.
 */
export function generateAgentToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Hashes a raw agent token for at-rest storage. SHA-256 is used because
 * tokens are 128-bit uniform random (no dictionary risk), which makes a
 * slow KDF like bcrypt unnecessary overhead on every auth request. The
 * hash is constant-time-compared on the auth path via `agentTokenMatches`.
 */
export function hashAgentToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Constant-time compare of a supplied token's hash against the stored
 * hash. Length-mismatch fails fast without throwing from
 * `timingSafeEqual`, which requires equal-length Buffers.
 */
export function agentTokenMatches(suppliedRaw: string, storedHash: string): boolean {
  const suppliedHash = hashAgentToken(suppliedRaw);
  const a = Buffer.from(suppliedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
