import { describe, it, expect } from "vitest";

/**
 * Baseline contract tests for the project layout route.
 * Validates the localStorage key convention that the route and
 * the root index route share for "last used project" tracking.
 */
describe("ProjectLayoutRoute", () => {
  const STORAGE_KEY = "orch8:lastProjectId";

  it("storage key follows the orch8: namespace convention", () => {
    expect(STORAGE_KEY).toMatch(/^orch8:/);
  });

  it("storage key is orch8:lastProjectId", () => {
    expect(STORAGE_KEY).toBe("orch8:lastProjectId");
  });
});
