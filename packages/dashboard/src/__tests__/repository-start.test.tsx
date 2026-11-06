import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";
import { RepositoryStart } from "../components/onboarding/RepositoryStart.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
beforeEach(() => mockFetch.mockReset());
const ready = { ok: true, json: async () => ({ ready: true, branch: "main", baseBranch: "main" }) };

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

it("keeps the form and shows the API error when repository creation fails", async () => {
  mockFetch.mockResolvedValueOnce(ready);
  mockFetch.mockRejectedValueOnce(new Error("Repository not found"));
  renderWithProviders(<RepositoryStart onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Repository name"), "Missing");
  await user.type(screen.getByLabelText("Local repository path"), "/tmp/missing");
  await user.click(screen.getByLabelText(/No project spending limit/));
  await user.click(screen.getByRole("button", { name: "Open and describe feature" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository not found");
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
