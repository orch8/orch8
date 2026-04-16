import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadOrGenerateAdminToken,
  readAdminToken,
  adminTokenMatches,
  extractBearerToken,
} from "../api/middleware/admin-token.js";

describe("admin-token helper", () => {
  let tmpDir: string;
  let tokenPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "orch8-admin-token-"));
    tokenPath = path.join(tmpDir, "sub", "admin-token");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("generates a new 64-char hex token on first call", async () => {
    const result = await loadOrGenerateAdminToken(tokenPath);
    expect(result.generated).toBe(true);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    const onDisk = await readFile(tokenPath, "utf-8");
    expect(onDisk).toBe(result.token);
  });

  it("returns the same token on a second call", async () => {
    const a = await loadOrGenerateAdminToken(tokenPath);
    const b = await loadOrGenerateAdminToken(tokenPath);
    expect(b.generated).toBe(false);
    expect(b.token).toBe(a.token);
  });

  it("persists the token with mode 0600", async () => {
    await loadOrGenerateAdminToken(tokenPath);
    const s = await stat(tokenPath);
    // On macOS/Linux the low 9 bits encode perms.
    const perm = s.mode & 0o777;
    expect(perm).toBe(0o600);
  });

  it("readAdminToken returns null for missing file (no throw)", async () => {
    const result = await readAdminToken(path.join(tmpDir, "nope"));
    expect(result).toBeNull();
  });

  it("readAdminToken trims whitespace/newlines from file", async () => {
    await mkdir(path.dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, "  abc\n", { mode: 0o600 });
    const result = await readAdminToken(tokenPath);
    expect(result).toBe("abc");
  });

  it("adminTokenMatches detects an exact match", () => {
    expect(adminTokenMatches("secret", "secret")).toBe(true);
  });

  it("adminTokenMatches rejects mismatched content", () => {
    expect(adminTokenMatches("secret", "secreT")).toBe(false);
  });

  it("adminTokenMatches rejects length mismatch without throwing", () => {
    expect(adminTokenMatches("short", "longer-string")).toBe(false);
  });

  it("extractBearerToken pulls token after scheme", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("bearer   abc123  ")).toBe("abc123");
  });

  it("extractBearerToken returns null for non-Bearer or empty headers", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
  });
});
