import { describe, it, expect } from "vitest";
import { HealthStatusSchema } from "../schemas/index.js";

describe("HealthStatusSchema", () => {
  it("validates a valid health response", () => {
    const result = HealthStatusSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptime: 123,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = HealthStatusSchema.safeParse({
      status: "broken",
      version: "0.0.0",
      uptime: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = HealthStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
