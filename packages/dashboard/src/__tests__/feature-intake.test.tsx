import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FeatureIntake } from "../components/pipeline/FeatureIntake.js";
const state = vi.hoisted(() => ({ agents: [] as any[], create: vi.fn(), probe: vi.fn() }));
vi.mock("../api/client.js", () => ({ api: { post: state.probe } }));
vi.mock("../hooks/useAgents.js", () => ({ useAgents: () => ({ data: state.agents, isLoading: false }) }));
vi.mock("../hooks/useProjects.js", () => ({ useProject: () => ({ data: { homeDir: "/repo" } }) }));
vi.mock("../hooks/usePipelines.js", () => ({ useCreatePipeline: () => ({ mutateAsync: state.create, isPending: false }) }));
beforeEach(() => {
 state.create.mockReset(); state.probe.mockReset(); state.probe.mockResolvedValue({ ok: true });
 state.agents = ["planner", "implementer", "reviewer"].map(id => ({ id, name: id, status: "active", adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
});
function select() {
 fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Add usage" } });
 for (const [label, value] of [["Plan agent", "planner"], ["Implement agent", "implementer"], ["Review agent", "reviewer"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function check() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check agent runtime" })); }); }
describe("feature intake", () => {
 it("requires a passing runtime check and invalidates it when an agent becomes ineligible", async () => {
  const props = { projectId: "one", onCreated: vi.fn() };
  const { rerender } = render(<FeatureIntake {...props} />);
  select();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  await check();
  expect(state.probe).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeEnabled();
  state.agents = state.agents.map(a => a.id === "planner" ? { ...a, status: "paused" } : a);
  rerender(<FeatureIntake {...props} />);
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "Start with a plan" }).closest("form")!);
  expect(state.create).not.toHaveBeenCalled();
 });
 it("requires different implementation and review agents", () => {
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select();
  fireEvent.change(screen.getByLabelText("Review agent"), { target: { value: "implementer" } });
  expect(screen.getByRole("button", { name: "Check agent runtime" })).toBeDisabled();
 });
 it("uses explicit plan and review approval gates", async () => {
  state.create.mockResolvedValue({ pipeline: { id: "pipeline_1" } });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select(); await check();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start with a plan" })); });
  expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: "one", steps: [expect.objectContaining({ label: "Plan", requiresVerification: true }), expect.objectContaining({ label: "Implement", requiresVerification: false }), expect.objectContaining({ label: "Independent review", requiresVerification: true })] }));
 });
 it("shows a failed sandbox probe and does not start a pipeline", async () => {
  state.probe.mockResolvedValue({ ok: false, message: "bwrap: loopback: Failed RTM_NEWADDR" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select(); await check();
  expect(screen.getByRole("status").textContent).toContain("bwrap: loopback");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(state.create).not.toHaveBeenCalled();
 });
});
