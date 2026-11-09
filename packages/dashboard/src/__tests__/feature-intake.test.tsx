import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { FeatureIntake } from "../components/pipeline/FeatureIntake.js";
import { RepositoryExplorer } from "../components/pipeline/RepositoryExplorer.js";
const state = vi.hoisted(() => ({ agents: [] as any[], requestedAgents: vi.fn(), create: vi.fn(), createAgent: vi.fn(), probe: vi.fn(), readiness: vi.fn(), invalidate: vi.fn() }));
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
 if (originalScrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView;
 else delete (Element.prototype as { scrollIntoView?: typeof Element.prototype.scrollIntoView }).scrollIntoView;
 if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
 else delete (navigator as { clipboard?: Clipboard }).clipboard;
});
function mockClipboard(writeText: (text: string) => Promise<void>) {
 Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}
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
 it("copies a manual handoff before agent setup with the exact request, paths, and only a proposed branch", async () => {
  state.agents = [];
  const writeText = vi.fn().mockResolvedValue(undefined);
  mockClipboard(writeText);
  localStorage.setItem("orch8:feature-draft:one", JSON.stringify({ feature: "  Add usage\nKeep keyboard access.  ", branchName: "feat/usage", filePaths: ["src/app.ts", "src/usage.ts"] }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Set up feature agents" })).toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy feature handoff" })); });
  const handoff = writeText.mock.calls[0][0] as string;
  expect(handoff).toContain("/repo");
  expect(handoff).toContain("  Add usage\nKeep keyboard access.  ");
  expect(handoff).toContain("src/app.ts");
  expect(handoff).toContain("src/usage.ts");
  expect(handoff).toMatch(/proposed branch[^\n]*feat\/usage/i);
  expect(handoff).toMatch(/inspect the repository/i);
  expect(handoff).toMatch(/plan/i);
  expect(handoff).toMatch(/review.*before implementation/i);
  expect(handoff).toMatch(/run.*tests/i);
  expect(handoff).toMatch(/independent review/i);
  expect(handoff).toMatch(/no agents? (?:have|has) (?:been )?run/i);
  expect(screen.getByText("Handoff copied to clipboard.")).toBeInTheDocument();
  expect(state.create).not.toHaveBeenCalled();
  expect(state.probe).not.toHaveBeenCalled();
 });
 it("does not offer a handoff for an empty or whitespace-only request", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  mockClipboard(writeText);
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Copy feature handoff" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "   " } });
  expect(screen.queryByRole("button", { name: "Copy feature handoff" })).not.toBeInTheDocument();
  expect(writeText).not.toHaveBeenCalled();
 });
 it("offers the same selectable handoff for manual copy when clipboard permission is denied", async () => {
  mockClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
  state.probe.mockResolvedValue({ ok: false, message: "Runtime test failed" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  select(); await check();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy feature handoff" })); });
  expect(screen.getByText(/Clipboard unavailable/)).toBeInTheDocument();
  const fallback = screen.getByRole("textbox", { name: "Feature handoff for manual copy" });
  expect(fallback).toHaveAttribute("readonly");
  expect((fallback as HTMLTextAreaElement).value).toContain("Add usage");
  expect((fallback as HTMLTextAreaElement).value).toContain("/repo");
  expect(state.create).not.toHaveBeenCalled();
 });
 it("excludes repository previews, README bodies, and agent configuration from the copied handoff", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  mockClipboard(writeText);
  state.readiness.mockImplementation(async path => path.includes("?path=") ? { path: "src/app.ts", content: "SOURCE_SECRET_BODY" }
   : path.includes("/repository-files?") ? { paths: ["src/app.ts"], truncated: false }
    : path.endsWith("/repository-overview") ? { filename: "README.md", content: "README_SECRET_BODY" }
     : { ready: false, branch: "main", baseBranch: "main" });
  state.agents = state.agents.map(agent => ({ ...agent, adapterConfig: { ...agent.adapterConfig, token: "AGENT_SECRET_TOKEN" } }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText("README_SECRET_BODY");
  fireEvent.click(screen.getByText("Explore repository files"));
  fireEvent.click(await screen.findByRole("button", { name: "src/app.ts" }));
  await screen.findByText("SOURCE_SECRET_BODY");
  fireEvent.click(screen.getByRole("button", { name: "Add path to feature" }));
  fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Add usage" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy feature handoff" })); });
  const handoff = writeText.mock.calls[0][0] as string;
  expect(handoff).toContain("src/app.ts");
  expect(handoff).not.toContain("SOURCE_SECRET_BODY");
  expect(handoff).not.toContain("README_SECRET_BODY");
  expect(handoff).not.toContain("AGENT_SECRET_TOKEN");
 });
 it("puts an unfinished workflow ahead of new planning without losing the next draft", async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  localStorage.setItem("orch8:feature-draft:one", JSON.stringify({ feature: "Add usage" }));
  const view = render(<FeatureIntake projectId="one" onCreated={vi.fn()} activeWorkflow />);
  expect(screen.getByLabelText("Next feature step")).toHaveTextContent("Inspect existing workflows");
  expect(screen.getByRole("link", { name: "Inspect existing workflows" })).toHaveAttribute("href", "#active-feature-workflows");
  expect(screen.getByLabelText("What should change?")).toHaveValue("Add usage");
  select(); await check();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Return to base branch" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "Start with a plan" }).closest("form")!);
  expect(state.create).not.toHaveBeenCalled();
  expect(localStorage.getItem("orch8:feature-draft:one")).toContain("Add usage");
  view.rerender(<FeatureIntake projectId="one" onCreated={vi.fn()} activeWorkflow={false} />);
  expect(screen.getByLabelText("Next feature step")).toHaveTextContent("Start with a plan");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeEnabled();
 });
 it("points to the next real action without starting agents or bypassing runtime checks", async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  const step = screen.getByLabelText("Next feature step");
  expect(step).toHaveTextContent("Describe your feature");
  fireEvent.click(screen.getByRole("button", { name: "Go to step" }));
  expect(screen.getByLabelText("What should change?")).toHaveFocus();
  expect(scroll).toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Add usage" } });
  expect(step).toHaveTextContent("Choose three feature agents");
  for (const [label, value] of [["Plan agent", "planner"], ["Implement agent", "implementer"], ["Review agent", "reviewer"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(step).toHaveTextContent("Check agent runtime");
  fireEvent.click(screen.getByRole("button", { name: "Go to step" }));
  expect(screen.getByRole("button", { name: "Check agent runtime" })).toHaveFocus();
  expect(state.probe).not.toHaveBeenCalled();
  await check();
  expect(step).toHaveTextContent("Start with a plan");
  expect(state.create).not.toHaveBeenCalled();
 });
 it("fills three eligible role agents with one explicit action without clearing a saved request or approving runtime", async () => {
  state.agents = ["planner", "implementer", "reviewer"].map(role => ({
   id: `feature-${role}`, name: `Feature ${role}`, role, status: "active", adapterType: "codex_local",
   adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false },
  }));
  localStorage.setItem("orch8:feature-draft:one", JSON.stringify({ feature: "Add usage" }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Plan agent")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Use feature agents" }));
  expect(screen.getByLabelText("Plan agent")).toHaveValue("feature-planner");
  expect(screen.getByLabelText("Implement agent")).toHaveValue("feature-implementer");
  expect(screen.getByLabelText("Review agent")).toHaveValue("feature-reviewer");
  expect(screen.getByLabelText("What should change?")).toHaveValue("Add usage");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(state.probe).not.toHaveBeenCalled();
  expect(state.create).not.toHaveBeenCalled();
 });
 it("does not suggest missing or unsafe feature agents", () => {
  state.agents = state.agents.map(agent => ({ ...agent, role: agent.id, status: agent.id === "reviewer" ? "paused" : "active" }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Use feature agents" })).not.toBeInTheDocument();
 });
 it("does not select an agent with a role-mismatched feature ID", () => {
  state.agents = [
   { id: "feature-reviewer", role: "planner" },
   { id: "feature-planner", role: "planner" },
   { id: "feature-implementer", role: "implementer" },
   { id: "actual-reviewer", role: "reviewer" },
  ].map(agent => ({ ...agent, name: agent.id, status: "active", adapterType: "codex_local",
   adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use feature agents" }));
  expect(screen.getByLabelText("Review agent")).toHaveValue("actual-reviewer");
 });
 it("adds a browsed file path to a saved feature draft and planning prompt without copying its contents", async () => {
  state.readiness.mockImplementation(async path => path.includes("?path=") ? { path: "src/app.ts", content: "private source body" }
    : path.includes("/repository-files?") ? { paths: ["src/app.ts"], truncated: false }
      : path.endsWith("/repository-overview") ? { filename: null, content: null }
        : { ready: false, branch: "feat/usage", baseBranch: "main" });
  state.create.mockResolvedValue({ pipeline: { id: "pipeline_1" } });
  const view = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.click(screen.getByText("Explore repository files"));
  fireEvent.click(await screen.findByRole("button", { name: "src/app.ts" }));
  expect(await screen.findByText("private source body")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add path to feature" }));
  expect(screen.getByLabelText("Selected feature files")).toHaveTextContent("src/app.ts");
  expect(localStorage.getItem("orch8:feature-draft:one")).toContain('"filePaths":["src/app.ts"]');
  view.unmount();
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Selected feature files")).toHaveTextContent("src/app.ts");
  select(); await check();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start with a plan" })); });
  const plan = state.create.mock.calls[0][0].steps[0].promptOverride;
  expect(plan).toContain("- src/app.ts");
  expect(plan).not.toContain("private source body");
  expect(localStorage.getItem("orch8:feature-draft:one")).toBeNull();
 });
 it("removes a selected path and ignores malformed saved path lists", async () => {
  localStorage.setItem("orch8:feature-draft:one", JSON.stringify({ feature: "Add usage", filePaths: ["src/app.ts", "src/app.ts", "bad\npath", 42] }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Selected feature files")).toHaveTextContent("src/app.ts");
  expect(screen.getByLabelText("Selected feature files")).not.toHaveTextContent("bad");
  fireEvent.click(screen.getByRole("button", { name: "Remove src/app.ts" }));
  await waitFor(() => expect(screen.queryByLabelText("Selected feature files")).not.toBeInTheDocument());
 });
 it("refetches a preview when the selected file is clicked again", async () => {
  state.readiness.mockImplementation(async path => path.includes("?path=")
    ? { path: "README.md", content: "Actual README" }
    : { paths: ["README.md"], truncated: false });
  render(<RepositoryExplorer projectId="canonical-id" />);
  fireEvent.click(screen.getByText("Explore repository files"));
  const file = await screen.findByRole("button", { name: "README.md" });
  fireEvent.click(file);
  expect(await screen.findByText("Actual README")).toBeInTheDocument();
  fireEvent.click(file);
  await waitFor(() => expect(state.readiness.mock.calls.filter(([path]) => path.includes("?path=")).length).toBe(2));
  expect(await screen.findByText("Actual README")).toBeInTheDocument();
 });
 it("shows the selected repository README beside the feature request as safe text", async () => {
  state.readiness.mockImplementation(async path => path.endsWith("/repository-overview")
    ? { filename: "README.md", content: "# Project A\n<img src=x onerror=alert(1)>" }
    : { ready: false, branch: "feat/usage", baseBranch: "main" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(await screen.findByText(/# Project A/)).toHaveTextContent("<img src=x onerror=alert(1)>");
  expect(document.querySelector("img")).toBeNull();
  expect(state.readiness).toHaveBeenCalledWith("/projects/canonical-id/repository-overview");
  expect(screen.getByRole("heading", { name: "Repository overview" })).toBeInTheDocument();
 });
 it("explains missing README without blocking intake", async () => {
  state.readiness.mockImplementation(async path => path.endsWith("/repository-overview")
    ? { filename: null, content: null }
    : { ready: false, branch: "feat/usage", baseBranch: "main" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(await screen.findByText(/No root README available/)).toBeInTheDocument();
  expect(screen.getByLabelText("What should change?")).toBeEnabled();
 });
 it("shows a read failure without blocking intake", async () => {
  state.readiness.mockImplementation(async path => {
    if (path.endsWith("/repository-overview")) throw new Error("offline");
    return { ready: false, branch: "feat/usage", baseBranch: "main" };
  });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(await screen.findByText(/Could not load repository overview/)).toBeInTheDocument();
  expect(screen.getByLabelText("What should change?")).toBeEnabled();
 });
 it("opens with the feature entered during repository setup without starting an agent", () => {
  localStorage.setItem("orch8:feature-draft:one", JSON.stringify({ feature: "Add a keyboard shortcut" }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("What should change?")).toHaveValue("Add a keyboard shortcut");
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
 });
 it("returns from a previous feature branch without clearing the next feature draft or runtime gate", async () => {
  state.readiness.mockResolvedValueOnce({ ready: false, branch: "feat/previous", baseBranch: "main", reason: "Check out the configured default branch 'main' before preparing a feature branch." });
  state.probe.mockImplementation(async path => path.includes("return-to-base") ? { ready: true, branch: "main", baseBranch: "main" } : { ok: true });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  await screen.findByText(/Current branch: feat\/previous/);
  select(); await check();
  fireEvent.change(screen.getByLabelText("New feature branch name"), { target: { value: "feat/next" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Return to base branch" })); });
  expect(state.probe).toHaveBeenCalledWith("/projects/canonical-id/return-to-base", {});
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["repository-changes", "canonical-id"] });
  expect(screen.getByText(/Current branch: main/)).toBeInTheDocument();
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
  expect(screen.getByText("Feature agent setup").closest("details")).toHaveAttribute("open");
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
 it("creates permission-respecting Claude feature agents and checks their own runtime", async () => {
  state.agents = [];
  const view = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Feature agent runtime"), { target: { value: "claude_local" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set up feature agents" })); });
  expect(state.createAgent).toHaveBeenCalledTimes(3);
  for (const role of ["planner", "implementer", "reviewer"]) {
   expect(state.createAgent).toHaveBeenCalledWith(expect.objectContaining({ id: `feature-claude-${role}`, adapterType: "claude_local", adapterConfig: { dangerouslySkipPermissions: false } }));
  }
  state.agents = ["planner", "implementer", "reviewer"].map(role => ({ id: `feature-claude-${role}`, name: role, role, status: "active", adapterType: "claude_local", adapterConfig: { dangerouslySkipPermissions: false } }));
  view.rerender(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use feature agents" }));
  fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Add usage" } });
  await check();
  expect(state.probe).toHaveBeenCalledWith("/adapter/claude_local/test-environment", { config: { dangerouslySkipPermissions: false }, projectId: "canonical-id" });
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeEnabled();
 });
 it("explains expired Claude authentication without approving the runtime or starting a plan", async () => {
  state.agents = ["planner", "implementer", "reviewer"].map(role => ({ id: `feature-claude-${role}`, name: role, role, status: "active", adapterType: "claude_local", adapterConfig: { dangerouslySkipPermissions: false } }));
  state.probe.mockResolvedValue({ ok: false, errorCode: "auth_required", message: "Claude authentication expired. Re-authenticate with the Claude CLI before retrying the runtime check." });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use feature agents" }));
  await check();
  expect(screen.getByLabelText("Claude authentication recovery")).toHaveTextContent("claude auth login");
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
  expect(state.create).not.toHaveBeenCalled();
 });
 it("does not claim a Claude token expired for a generic authentication failure", async () => {
  state.agents = ["planner", "implementer", "reviewer"].map(role => ({ id: `feature-claude-${role}`, name: role, role, status: "active", adapterType: "claude_local", adapterConfig: { dangerouslySkipPermissions: false } }));
  state.probe.mockResolvedValue({ ok: false, errorCode: "auth_required", message: "auth_required" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use feature agents" }));
  await check();
  expect(screen.queryByLabelText("Claude authentication recovery")).not.toBeInTheDocument();
 });
 it("does not show Claude sign-in instructions for a Codex auth failure", async () => {
  state.probe.mockResolvedValue({ ok: false, errorCode: "auth_required", message: "auth_required" });
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  select(); await check();
  expect(screen.queryByLabelText("Claude authentication recovery")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start with a plan" })).toBeDisabled();
 });
 it("offers Claude setup even when three Codex agents already exist", async () => {
  state.agents = ["planner", "implementer", "reviewer"].map(role => ({ id: `feature-${role}`, name: role, role, status: "active", adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
  const view = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByText("Feature agent setup (optional)").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Feature agent setup (optional)"));
  fireEvent.change(screen.getByLabelText("Feature agent runtime"), { target: { value: "claude_local" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set up feature agents" })); });
  expect(state.createAgent).toHaveBeenCalledTimes(3);
  expect(state.createAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "feature-claude-planner", adapterType: "claude_local" }));
  state.agents = [...state.agents, ...["planner", "implementer", "reviewer"].map(role => ({ id: `feature-claude-${role}`, name: role, role, status: "active", adapterType: "claude_local", adapterConfig: { dangerouslySkipPermissions: false } }))];
  view.rerender(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Plan agent")).toHaveValue("feature-claude-planner");
 });
 it("keeps the setup panel open when agents become available", () => {
  state.agents = [];
  const view = render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Feature agent runtime"), { target: { value: "claude_local" } });
  state.agents = ["planner", "implementer", "reviewer"].map(role => ({ id: `feature-${role}`, name: role, role, status: "active", adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
  view.rerender(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  // An operator who is configuring Claude must not lose the open setup action.
  expect(screen.getByText("Feature agent setup (optional)").closest("details")).toHaveAttribute("open");
  expect(screen.getByLabelText("Feature agent runtime")).toHaveValue("claude_local");
 });
 it("does not require setup when three manually selectable agents have nonstandard roles", () => {
  state.agents = ["alpha", "beta", "gamma"].map(id => ({ id, name: id, role: "custom", status: "active", adapterType: "codex_local", adapterConfig: { sandbox: "workspace-write", dangerouslyBypassApprovalsAndSandbox: false } }));
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByText("Feature agent setup (optional)").closest("details")).not.toHaveAttribute("open");
  expect(screen.queryByRole("button", { name: "Use feature agents" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Plan agent")).toHaveTextContent("alpha");
 });
 it("rejects Claude agents with override arguments or permission bypass", () => {
  state.agents = [
   { id: "unsafe", name: "unsafe", adapterType: "claude_local", status: "active", adapterConfig: { dangerouslySkipPermissions: true } },
   { id: "override", name: "override", adapterType: "claude_local", status: "active", adapterConfig: { dangerouslySkipPermissions: false, extraArgs: ["--allowedTools", "Bash"] } },
  ];
  render(<FeatureIntake projectId="one" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Plan agent")).not.toHaveTextContent("unsafe");
  expect(screen.getByLabelText("Plan agent")).not.toHaveTextContent("override");
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
  let branchReads = 0;
  state.readiness.mockImplementation(async path => path.endsWith("/repository-overview")
    ? { filename: null, content: null }
    : ++branchReads === 1 ? { ready: false, branch: "feat/usage", baseBranch: "main" }
      : { ready: true, branch: "main", baseBranch: "main" });
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
