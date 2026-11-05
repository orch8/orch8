import { describe, expect, it } from "vitest";
import { readPrChecks } from "../services/pr-checks.js";

describe("PR checks shown beside a matching repository commit", () => {
  it("retains actual check names, outcomes and GitHub links", () => {
    expect(readPrChecks([
      { __typename: "CheckRun", name: "Build and test", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/orch8/orch8/actions/runs/42" },
      { __typename: "StatusContext", context: "security", state: "PENDING", targetUrl: "https://github.com/orch8/orch8/checks/7" },
    ])).toEqual([
      { name: "Build and test", status: "SUCCESS", url: "https://github.com/orch8/orch8/actions/runs/42" },
      { name: "security", status: "PENDING", url: "https://github.com/orch8/orch8/checks/7" },
    ]);
  });
  it("does not turn absent or malformed checks into a passing result or unsafe link", () => {
    expect(readPrChecks(null)).toEqual([]);
    expect(readPrChecks([{ name: "unknown", status: "QUEUED", detailsUrl: "javascript:alert(1)" }, {}])).toEqual([
      { name: "unknown", status: "QUEUED", url: null },
    ]);
  });
});
