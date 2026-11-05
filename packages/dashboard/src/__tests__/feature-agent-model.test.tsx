import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionTab } from "../components/agent-settings/ExecutionTab.js";
import type { Agent } from "../types.js";

it("updates both displayed and executed models without changing sandbox permissions", () => {
  const mutate = vi.fn();
  const agent = {
    id: "planner", model: "gpt-5.5", adapterType: "codex_local",
    adapterConfig: { model: "gpt-5.5", sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false },
    maxTurns: 100, maxConcurrentRuns: 1, heartbeatEnabled: false, heartbeatIntervalSec: 300,
    wakeOnAssignment: true, wakeOnOnDemand: false, wakeOnAutomation: false,
  } as Agent;
  render(<ExecutionTab agent={agent} projectId="project" updateAgent={{ mutate, isPending: false } as never} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Codex runtime model" }), { target: { value: "  gpt-6.1-sol  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    model: "gpt-6.1-sol",
    adapterConfig: expect.objectContaining({
      model: "gpt-6.1-sol", sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false,
    }),
  }));
});
