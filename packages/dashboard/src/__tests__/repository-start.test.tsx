import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";
import { RepositoryStart } from "../components/onboarding/RepositoryStart.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
beforeEach(() => mockFetch.mockReset());
const ready = { ok: true, json: async () => ({ ready: true, branch: "main", baseBranch: "main" }) };

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
