import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FeatureIntake } from "../components/pipeline/FeatureIntake.js";
const state = vi.hoisted(() => ({ agents: [] as any[], requestedAgents: vi.fn(), create: vi.fn(), createAgent: vi.fn(), probe: vi.fn(), readiness: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock("../api/client.js", () => ({ api: { post: state.probe, get: state.readiness } }));
vi.mock("../hooks/useAgents.js", () => ({ useAgents: (id: string) => { state.requestedAgents(id); return { data: state.agents, isLoading: false }; }, useCreateAgent: () => ({ mutateAsync: state.createAgent }) }));
vi.mock("../hooks/useProjects.js", () => ({ useProject: () => ({ data: { id: "canonical-id", homeDir: "/repo" } }) }));
vi.mock("../hooks/usePipelines.js", () => ({ useCreatePipeline: () => ({ mutateAsync: state.create, isPending: false }) }));
beforeEach(() => {
 localStorage.clear();
 state.requestedAgents.mockReset(); state.create.mockReset(); state.createAgent.mockReset(); state.createAgent.mockResolvedValue({ id: "created" }); state.probe.mockReset(); state.probe.mockResolvedValue({ ok: true }); state.invalidate.mockReset(); state.invalidate.mockResolvedValue(undefined);
 state.readiness.mockReset(); state.readiness.mockResolvedValue({ ready: false, branch: "feat/usage", baseBranch: "main" });
 state.agents = ["planner", "implementer", "reviewer"].map(id => ({ id, name: id, status: "active", adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
});
function select() {
 fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Add usage" } });
 for (const [label, value] of [["Plan agent", "planner"], ["Implement agent", "implementer"], ["Review agent", "reviewer"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function check() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check agent runtime" })); }); }
describe("feature intake", () => {
 it("opens with the feature entered during repository setup without starting an agent", () => {
  localStorage.setItem("orch8:feature-draft:one", JSON.stringify({ feature: "Add a keyboard shortcut" }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("What should change?")).toHaveValue("Add a keyboard shortcut");
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
 });
 it("returns from a previous feature branch without clearing the next feature draft or runtime gate", async () => {
  state.readiness.mockResolvedValueOnce({ ready: false, branch: "feat/previous", baseBranch: "main", reason: "Check out the configured default branch 'main' before preparing a feature branch." });
  state.probe.mockImplementation(async path => path.includes("return-to-base") ? { ready: true, branch: "main", baseBranch: "main", note: "Orch8's generated .gitignore will remain uncommitted on the feature branch." } : { ok: true });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/previous/);
  select(); await check();
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/next" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Return to base branch" })); });
  expect(state.probe).toHaveBeenCalledWith("/projects/canonical-id/return-to-base", {});
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["repository-changes", "canonical-id"] });
  expect(screen.getByText(/Current branch: main/)).toBeInTheDocument();
  expect(screen.getByText(/generated .gitignore will remain uncommitted/)).toBeInTheDocument();
  expect(screen.getByLabelText("What should change?")).toHaveValue("Add usage");
  expect(screen.getByLabelText("New feature branch name")).toHaveValue("feat/next");
  expect(screen.getByRole("button", { name: "Prepare feature branch" })).toBeEnabled();
 });
 it("shows a safe server refusal without pretending the branch changed", async () => {
  state.probe.mockRejectedValue(new Error(JSON.stringify({ message: "The repository must be completely clean." })));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/usage/);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Return to base branch" })); });
  expect(screen.getByRole("alert").textContent).toContain("completely clean");
  expect(screen.getByText(/Current branch: feat\/usage/)).toBeInTheDocument();
 });
 it("sets up three sandboxed agents explicitly without starting a feature", async () => {
  state.agents = [];
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(state.requestedAgents).toHaveBeenCalledWith("canonical-id");
  fireEvent.change(screen.getByLabelText("Codex model for new agents"), { target: { value: "  gpt-6.1-sol  " } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set up feature agents" })); });
  expect(state.createAgent).toHaveBeenCalledTimes(3);
  for (const role of ["planner", "implementer", "reviewer"]) {
   expect(state.createAgent).toHaveBeenCalledWith(expect.objectContaining({ id: `feature-${role}`, projectId: "canonical-id", role, adapterType: "codex_local", model: "gpt-6.1-sol", adapterConfig: { model: "gpt-6.1-sol", sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
  }
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
 });
 it("requires a model before creating feature agents", async () => {
  state.agents = [];
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/usage/);
  act(() => { fireEvent.change(screen.getByLabelText("Codex model for new agents"), { target: { value: "  " } }); });
  expect(screen.getByRole("button", { name: "Set up feature agents" })).toBeDisabled();
  expect(state.createAgent).not.toHaveBeenCalled();
 });
 it("does not overwrite an existing feature agent", async () => {
  state.agents = [{ id: "feature-planner", status: "paused", adapterType: "claude_local", adapterConfig: {} }];
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Codex model for new agents"), { target: { value: "gpt-6.1-sol" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set up feature agents" })); });
  expect(state.createAgent).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("feature-planner already exists but is not eligible");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
 });
 it("explains that generated ignore changes follow the feature branch without a commit", async () => {
  state.readiness.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main", note: "Orch8's generated .gitignore will remain uncommitted on the feature branch." });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(await screen.findByText(/generated .gitignore will remain uncommitted/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/usage" } });
  expect(screen.getByRole("button", { name: "Prepare feature branch" })).toBeDisabled();
  select(); await check();
  expect(screen.getByRole("button", { name: "Prepare feature branch" })).toBeEnabled();
 });
 it("shows branch readiness and explicitly prepares a named branch before starting", async () => {
  state.readiness.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
  state.probe.mockImplementation(async path => path.includes("feature-branch") ? { branch: "feat/usage", baseBranch: "main" } : { ok: true });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(await screen.findByText(/Current branch: main/)).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Prepare feature branch" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/usage" } });
  expect(button).toBeDisabled();
  select(); await check();
  expect(button).toBeEnabled();
  await act(async () => { fireEvent.click(button); });
  expect(state.readiness).toHaveBeenCalledWith("/projects/canonical-id/feature-branch");
  expect(state.probe).toHaveBeenCalledWith("/projects/canonical-id/feature-branch", { name: "feat/usage" });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["repository-changes", "canonical-id"] });
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
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); await screen.findByText(/Current branch: feat\/usage/); select();
  fireEvent.change(screen.getByLabelText("Review agent"), { target: { value: "implementer" } });
  expect(screen.getByRole("button", { name: "Check agent runtime" })).toBeDisabled();
 });
 it("uses explicit plan and review approval gates", async () => {
  state.create.mockResolvedValue({ pipeline: { id: "pipeline_1" } });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select(); await check();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start with a plan" })); });
  expect(state.readiness).toHaveBeenLastCalledWith("/projects/canonical-id/feature-branch");
  expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: "one", steps: [expect.objectContaining({ label: "Plan", requiresVerification: true }), expect.objectContaining({ label: "Implement", requiresVerification: false }), expect.objectContaining({ label: "Independent review", requiresVerification: true })] }));
  const steps = state.create.mock.calls[0][0].steps;
  expect(steps[1].promptOverride).toMatch(/commit only the intended feature files/);
  expect(steps[1].promptOverride).toMatch(/Do not push, publish a PR, merge/);
  expect(steps[2].promptOverride).toMatch(/inspect the actual committed branch diff/);
  expect(steps[2].promptOverride).toMatch(/Do not edit or commit product files/);
  expect(localStorage.getItem("orch8:feature-draft:one")).toBeNull();
 });
 it("requires a feature branch and refuses a changed branch at submission", async () => {
  state.readiness.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: main/);
  select(); await check();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(screen.getByText(/Start is unavailable on the base branch/)).toBeInTheDocument();
  expect(screen.getByText(/Prepare a feature branch \(required\)/)).toBeInTheDocument();
 });
 it("checks the live branch again before creating a workflow", async () => {
  state.readiness.mockResolvedValueOnce({ ready: false, branch: "feat/usage", baseBranch: "main" })
    .mockResolvedValueOnce({ ready: true, branch: "main", baseBranch: "main" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/usage/);
  select(); await check();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start with a plan" })); });
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("Repository branch changed");
 });
 it("shows a failed sandbox probe and does not start a pipeline", async () => {
  state.probe.mockResolvedValue({ ok: false, message: "bwrap: loopback: Failed RTM_NEWADDR" });
  state.readiness.mockResolvedValue({ ready: true, branch: "main", baseBranch: "main" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select();
  await screen.findByText(/Current branch: main/);
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/usage" } });
  await check();
  expect(screen.getByText(/planner: bwrap: loopback/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Codex sandbox needs host setup" })).toBeInTheDocument();
  expect(screen.getByText(/sudo apt install bubblewrap/)).toBeInTheDocument();
  expect(screen.getByText(/apparmor_parser -r/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Codex sandbox prerequisites" })).toHaveAttribute("href", "https://developers.openai.com/codex/concepts/sandboxing#prerequisites");
  expect(screen.getByText(/Do not disable AppArmor globally/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Prepare feature branch" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(state.create).not.toHaveBeenCalled();
  expect(state.probe).not.toHaveBeenCalledWith("/projects/canonical-id/feature-branch", expect.anything());
 });
 it("hides host repair advice for unrelated failures and after a passing retry", async () => {
  state.probe.mockResolvedValueOnce({ ok: false, message: "Model not available" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select(); await check();
  expect(screen.queryByRole("heading", { name: "Codex sandbox needs host setup" })).not.toBeInTheDocument();
  state.probe.mockReset().mockResolvedValueOnce({ ok: false, message: "bwrap: Failed RTM_NEWADDR" });
  await check();
  expect(screen.getByRole("heading", { name: "Codex sandbox needs host setup" })).toBeInTheDocument();
  state.probe.mockReset().mockResolvedValue({ ok: true });
  await check();
  expect(screen.queryByRole("heading", { name: "Codex sandbox needs host setup" })).not.toBeInTheDocument();
 });
 it("clears host repair advice when choosing another agent", async () => {
  state.probe.mockResolvedValue({ ok: false, message: "bwrap: Failed RTM_NEWADDR" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />); select(); await check();
  expect(screen.getByRole("heading", { name: "Codex sandbox needs host setup" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Plan agent"), { target: { value: "reviewer" } });
  expect(screen.queryByRole("heading", { name: "Codex sandbox needs host setup" })).not.toBeInTheDocument();
 });
 it("restores a blocked feature draft after reload without restoring runtime clearance", async () => {
  state.probe.mockResolvedValue({ ok: false, message: "bwrap: Failed RTM_NEWADDR" });
  const first = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  select();
  await check();
  await screen.findByText(/Current branch: feat\/usage/);
  first.unmount();
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("What should change?")).toHaveValue("Add usage");
  expect(screen.getByLabelText("Review agent")).toHaveValue("reviewer");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(screen.getByText(/Runtime check required for this agent selection/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
  expect(screen.getByLabelText("What should change?")).toHaveValue("");
  expect(localStorage.getItem("orch8:feature-draft:one")).toBeNull();
 });
 it("keeps drafts separate between repositories", async () => {
  const first = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/usage/);
  fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "First repository" } });
  first.unmount();
  render(<FeatureIntake projectId="two" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("What should change?")).toHaveValue("");
  expect(localStorage.getItem("orch8:feature-draft:one")).toContain("First repository");
 });
 it("preserves agent choices even before a feature request is entered", async () => {
  const first = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/usage/);
  fireEvent.change(screen.getByLabelText("Plan agent"), { target: { value: "planner" } });
  first.unmount();
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Plan agent")).toHaveValue("planner");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
 });
});
