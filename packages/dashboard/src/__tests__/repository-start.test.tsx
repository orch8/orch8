import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";
import { RepositoryStart } from "../components/onboarding/RepositoryStart.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
beforeEach(() => { mockFetch.mockReset(); localStorage.clear(); });
const ready = { ok: true, json: async () => ({ ready: true, branch: "main", baseBranch: "main" }) };

it("clones then opens the checkout through existing readiness and project creation", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ homeDir: "/tmp/checkouts/demo", branch: "trunk", origin: "https://github.com/sample/demo.git" }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true, branch: "trunk" }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "repo-demo", slug: "demo" }) });
  const onComplete = vi.fn();
  renderWithProviders(<RepositoryStart onComplete={onComplete} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Clone from GitHub" }));
  await user.type(screen.getByLabelText("GitHub HTTPS repository URL"), "https://github.com/sample/demo.git");
  await user.type(screen.getByLabelText("Local parent directory"), "/tmp/checkouts");
  await user.click(screen.getByRole("button", { name: "Clone repository" }));
  await waitFor(() => expect(screen.getByLabelText("Local repository path")).toHaveValue("/tmp/checkouts/demo"));
  expect(screen.getByLabelText("Base branch")).toHaveValue("trunk");
  expect(screen.getByLabelText(/GitHub repository URL/)).toHaveValue("https://github.com/sample/demo.git");
  await user.type(screen.getByLabelText(/First feature request/), "Improve settings");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith("demo"));
  expect(mockFetch.mock.calls.map(call => call[0])).toEqual(["/api/projects/repository-clone", "/api/projects/repository-readiness", "/api/projects"]);
  expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toMatchObject({ homeDir: "/tmp/checkouts/demo", defaultBranch: "trunk", repoUrl: "https://github.com/sample/demo.git" });
  expect(JSON.parse(localStorage.getItem("orch8:feature-draft:repo-demo")!)).toMatchObject({ feature: "Improve settings" });
});

it("shows a clone conflict without proceeding to project creation", async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => JSON.stringify({ message: "The destination already exists. Choose another parent." }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Clone from GitHub" }));
  await user.type(screen.getByLabelText("GitHub HTTPS repository URL"), "https://github.com/sample/demo.git");
  await user.type(screen.getByLabelText("Local parent directory"), "/tmp/checkouts");
  await user.click(screen.getByRole("button", { name: "Clone repository" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("destination already exists");
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("accepts the advertised .git clone URL and rejects paths beyond a repository", async () => {
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Clone from GitHub" }));
  const url = screen.getByLabelText("GitHub HTTPS repository URL");
  await user.type(screen.getByLabelText("Local parent directory"), "/tmp/checkouts");
  await user.type(url, "https://github.com/sample/demo.git");
  expect(screen.getByRole("button", { name: "Clone repository" })).toBeEnabled();
  await user.clear(url);
  await user.type(url, "https://github.com/sample/demo/tree/main");
  expect(screen.getByRole("button", { name: "Clone repository" })).toBeDisabled();
  expect(mockFetch).not.toHaveBeenCalled();
});

it("opens a pasted checkout without making the user invent its name, key, or branch", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "release", origin: "https://github.com/org/my-app.git", originAvailable: true }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true, branch: "release", baseBranch: "release" }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "repo-id", slug: "my-app" }) });
  const onComplete = vi.fn();
  renderWithProviders(<RepositoryStart onComplete={onComplete} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/my-app/");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await waitFor(() => expect(screen.getByLabelText("Repository name")).toHaveValue("My App"));
  expect(screen.getByLabelText(/Project key/)).toHaveValue("MYA");
  expect(screen.getByLabelText("Base branch")).toHaveValue("release");
  await user.type(screen.getByLabelText(/First feature request/), "Add an export button");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith("my-app"));
  expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toMatchObject({ name: "My App", key: "MYA", defaultBranch: "release" });
  expect(JSON.parse(localStorage.getItem("orch8:feature-draft:repo-id")!)).toMatchObject({ feature: "Add an export button" });
});

it("does not overwrite a custom repository name while inspection is in flight", async () => {
  let resolveInspection!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { resolveInspection = resolve; }));
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/my-app");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await user.type(screen.getByLabelText("Repository name"), "Custom name");
  resolveInspection({ ok: true, json: async () => ({ branch: "main", origin: "", originAvailable: false }) });
  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  expect(screen.getByLabelText("Repository name")).toHaveValue("Custom name");
  expect(screen.getByLabelText(/Project key/)).toHaveValue("CUS");
});

it("clears inferred identity when switching checkouts without losing user edits", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "main", origin: "", originAvailable: false }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/old-repo");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await waitFor(() => expect(screen.getByLabelText("Repository name")).toHaveValue("Old Repo"));
  await user.clear(screen.getByLabelText("Local repository path"));
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/new-repo");
  expect(screen.getByLabelText("Repository name")).toHaveValue("");
  expect(screen.getByLabelText(/Project key/)).toHaveValue("");
  await user.type(screen.getByLabelText("Repository name"), "My project");
  await user.clear(screen.getByLabelText("Local repository path"));
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/third-repo");
  expect(screen.getByLabelText("Repository name")).toHaveValue("My project");
  expect(screen.getByLabelText(/Project key/)).toHaveValue("MYP");
});

it.each([["x", "XR"], ["1password", "PAS"]])("infers a valid key for folder %s", async (folder, key) => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "main", origin: "", originAvailable: false }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), `/tmp/${folder}`);
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await waitFor(() => expect(screen.getByLabelText(/Project key/)).toHaveValue(key));
  expect((screen.getByLabelText(/Project key/) as HTMLInputElement).checkValidity()).toBe(true);
});

it("explains when a folder name cannot produce a repository identifier", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "main", origin: "", originAvailable: false }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/日本語");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await waitFor(() => expect(screen.getByLabelText("Repository name")).toHaveValue("日本語"));
  await user.click(screen.getByLabelText(/No project spending limit/));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a name with at least one Latin letter or digit");
  expect(screen.getByRole("button", { name: "Open and describe feature" })).toBeDisabled();
});

it("detects a repository's real branch and safe origin before opening it", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "v2", origin: "https://github.com/orch8/orch8.git", originAvailable: true }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true, branch: "v2", baseBranch: "v2" }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "repo-id", slug: "orch8" }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "Orch8");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/orch8");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await waitFor(() => expect(screen.getByLabelText("Base branch")).toHaveValue("v2"));
  expect(screen.getByLabelText(/GitHub repository URL/)).toHaveValue("https://github.com/orch8/orch8.git");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
  expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toMatchObject({ defaultBranch: "v2", repoUrl: "https://github.com/orch8/orch8.git" });
});

it("does not apply inspection details after the repository path changes", async () => {
  let resolveInspection!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { resolveInspection = resolve; }));
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/old-repo");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await user.clear(screen.getByLabelText("Local repository path"));
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/new-repo");
  resolveInspection({ ok: true, json: async () => ({ branch: "old-branch", origin: "https://github.com/org/old.git", originAvailable: true }) });
  await waitFor(() => expect(screen.getByRole("button", { name: "Detect branch and GitHub origin" })).toBeEnabled());
  expect(screen.getByLabelText("Base branch")).toHaveValue("main");
  expect(screen.getByLabelText(/GitHub repository URL/)).toHaveValue("");
});

it("clears a stale GitHub origin when re-inspection finds no supported origin", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "main", origin: "https://github.com/org/repo.git", originAvailable: true }) });
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ branch: "main", origin: "", originAvailable: false }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/repo");
  const detect = screen.getByRole("button", { name: "Detect branch and GitHub origin" });
  await user.click(detect);
  await waitFor(() => expect(screen.getByLabelText(/GitHub repository URL/)).toHaveValue("https://github.com/org/repo.git"));
  await user.click(detect);
  await waitFor(() => expect(screen.getByLabelText(/GitHub repository URL/)).toHaveValue(""));
});

it("preserves edits made to branch and origin while detection is in flight", async () => {
  let resolveInspection!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { resolveInspection = resolve; }));
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/repo");
  await user.click(screen.getByRole("button", { name: "Detect branch and GitHub origin" }));
  await user.clear(screen.getByLabelText("Base branch"));
  await user.type(screen.getByLabelText("Base branch"), "release");
  await user.type(screen.getByLabelText(/GitHub repository URL/), "https://github.com/org/other.git");
  resolveInspection({ ok: true, json: async () => ({ branch: "main", origin: "https://github.com/org/repo.git", originAvailable: true }) });
  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  expect(screen.getByLabelText("Base branch")).toHaveValue("release");
  expect(screen.getByLabelText(/GitHub repository URL/)).toHaveValue("https://github.com/org/other.git");
});

it("opens a repository for feature intake without starting agents or changing budgets", async () => {
  mockFetch.mockResolvedValueOnce(ready);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "repo-id", slug: "my-app" }) });
  const onComplete = vi.fn();
  renderWithProviders(<RepositoryStart onComplete={onComplete} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "My App");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/my-app");
  await user.type(screen.getByLabelText(/GitHub repository URL/), "https://github.com/owner/my-app.git");
  expect(screen.getByLabelText(/Project key/)).toHaveValue("MYA");
  fireEvent.change(screen.getByLabelText(/Project spending limit/), { target: { value: "10" } });
  const form = (screen.getByLabelText(/Project spending limit/) as HTMLInputElement).closest("form")!;
  expect(Array.from(form.elements).filter(el => el instanceof HTMLInputElement && !el.checkValidity()).map(el => (el as HTMLInputElement).outerHTML)).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith("my-app"));
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(mockFetch.mock.calls[0][0]).toContain("/api/projects/repository-readiness");
  const [url, options] = mockFetch.mock.calls[1];
  expect(url).toContain("/api/projects");
  expect(JSON.parse(options.body)).toMatchObject({
    name: "My App", slug: "my-app", key: "MYA", homeDir: "/tmp/my-app", repoUrl: "https://github.com/owner/my-app.git", defaultBranch: "main", finishStrategy: "none", budgetLimitUsd: 10,
  });
});

it("carries a feature request into the new repository's Build draft only after creation succeeds", async () => {
  mockFetch.mockResolvedValueOnce(ready);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "repo-id", slug: "my-app" }) });
  const onComplete = vi.fn();
  renderWithProviders(<RepositoryStart onComplete={onComplete} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "My App");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/my-app");
  await user.type(screen.getByLabelText(/First feature request/), "Add a keyboard shortcut");
  await user.click(screen.getByLabelText(/No project spending limit/));
  expect(localStorage.getItem("orch8:feature-draft:repo-id")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith("my-app"));
  expect(JSON.parse(localStorage.getItem("orch8:feature-draft:repo-id")!)).toMatchObject({ feature: "Add a keyboard shortcut" });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

it("keeps the form and shows the API error when repository creation fails", async () => {
  mockFetch.mockResolvedValueOnce(ready);
  mockFetch.mockRejectedValueOnce(new Error("Repository not found"));
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "Missing");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/missing");
  await user.type(screen.getByLabelText(/First feature request/), "never saved");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository not found");
  expect(localStorage.length).toBe(0);
  expect(screen.getByLabelText("Local repository path")).toHaveValue("/tmp/missing");
});

it("can start without a GitHub URL while clearly disclosing the later PR requirement", async () => {
  mockFetch.mockResolvedValueOnce(ready);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "repo-id", slug: "local-only" }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  expect(screen.getByText(/Required only to publish a draft PR later/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("Repository name"), "Local only");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/local-only");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(mockFetch.mock.calls[1][1].body)).not.toHaveProperty("repoUrl");
});

it("does not create a project for a missing or dirty checkout, and keeps the inputs", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ready: false, reason: "The repository must be clean before preparing a feature branch." }) });
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "My App");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/my-app");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("repository must be clean");
  expect(screen.getByLabelText("Local repository path")).toHaveValue("/tmp/my-app");
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][0]).toContain("/api/projects/repository-readiness");
});

it("allows a different key when two names share a prefix, and requires an explicit budget choice", async () => {
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "My API");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/my-api");
  expect(screen.getByRole("button", { name: "Open and describe feature" })).toBeDisabled();
  await user.clear(screen.getByLabelText(/Project key/));
  await user.type(screen.getByLabelText(/Project key/), "API2");
  await user.click(screen.getByLabelText(/No project spending limit/));
  expect(screen.getByRole("button", { name: "Open and describe feature" })).toBeEnabled();
});
