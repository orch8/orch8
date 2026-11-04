import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FeatureIntake } from "../components/pipeline/FeatureIntake.js";
const state = vi.hoisted(() => ({ agents: [] as any[], create: vi.fn(), probe: vi.fn(), readiness: vi.fn() }));
vi.mock("../api/client.js", () => ({ api: { post: state.probe, get: state.readiness } }));
vi.mock("../hooks/useAgents.js", () => ({ useAgents: () => ({ data: state.agents, isLoading: false }) }));
vi.mock("../hooks/useProjects.js", () => ({ useProject: () => ({ data: { id: "canonical-id", homeDir: "/repo" } }) }));
vi.mock("../hooks/usePipelines.js", () => ({ useCreatePipeline: () => ({ mutateAsync: state.create, isPending: false }) }));
beforeEach(() => {
 state.create.mockReset(); state.probe.mockReset(); state.probe.mockResolvedValue({ ok: true });
 state.readiness.mockReset(); state.readiness.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
 state.agents = ["planner", "implementer", "reviewer"].map(id => ({ id, name: id, status: "active", adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
});
function select() {
 fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Add usage" } });
 for (const [label, value] of [["Plan agent", "planner"], ["Implement agent", "implementer"], ["Review agent", "reviewer"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function check() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check agent runtime" })); }); }
describe("feature intake", () => {
 it("shows branch readiness and explicitly prepares a named branch before starting", async () => {
  state.probe.mockImplementation(async path => path.includes("feature-branch") ? { branch: "feat/usage", baseBranch: "main" } : { ok: true });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(await screen.findByText(/Current branch: main/)).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Prepare feature branch" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/usage" } });
  expect(button).toBeEnabled();
  await act(async () => { fireEvent.click(button); });
  expect(state.readiness).toHaveBeenCalledWith("/projects/canonical-id/feature-branch");
  expect(state.probe).toHaveBeenCalledWith("/projects/canonical-id/feature-branch", { name: "feat/usage" });
  expect(screen.getByText(/Current branch: feat\/usage/)).toBeInTheDocument();
  expect(button).toBeDisabled();
 });
 it("explains blocked preparation when the repository is dirty", async () => {
  state.readiness.mockResolvedValue({ ready: false, branch: "main", baseBranch: "main", reason: "The repository must be clean." });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/usage" } });
  expect(await screen.findByText(/repository must be clean/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Prepare feature branch" })).toBeDisabled();
 });
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
 it("requires different implementation and review agents", async () => {
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); await screen.findByText(/Current branch: main/); select();
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
