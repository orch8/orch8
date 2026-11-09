import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { GitDiffViewer } from "../components/diff/GitDiffViewer.js";
import { api } from "../api/client.js";
import { fireEvent } from "@testing-library/react";

afterEach(() => vi.restoreAllMocks());

const sampleDiff = `diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,6 @@
 import { app } from "./app";
+import { logger } from "./logger";

 app.listen(3000, () => {
-  console.log("started");
+  logger.info("started on port 3000");
 });`;

describe("GitDiffViewer", () => {
  it("renders file header", () => {
    renderWithProviders(<GitDiffViewer diff={sampleDiff} />);

    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("renders added lines with + prefix", () => {
    renderWithProviders(<GitDiffViewer diff={sampleDiff} />);

    expect(
      screen.getByText(/import \{ logger \} from/),
    ).toBeInTheDocument();
  });

  it("renders removed lines with - prefix", () => {
    renderWithProviders(<GitDiffViewer diff={sampleDiff} />);

    expect(
      screen.getByText(/console\.log\("started"\)/),
    ).toBeInTheDocument();
  });

  it("shows empty state when no diff provided", () => {
    renderWithProviders(<GitDiffViewer diff="" />);

    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("opens the current tracked file from a diff without leaving review", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ path: "src/main.ts", content: "current checkout content" });
    renderWithProviders(<GitDiffViewer diff={sampleDiff} projectId="project-1" />);
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByText("current checkout content")).toBeInTheDocument();
    expect(screen.getByText(/not a saved copy of the reviewed revision/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/projects/project-1/repository-files?path=src%2Fmain.ts");
  });

  it("explains when a deleted file is no longer available", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("not_found"));
    renderWithProviders(<GitDiffViewer diff={sampleDiff} projectId="project-1" />);
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/deleted or untracked/);
  });

  it("marks binary and oversized files unavailable", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ path: "src/main.ts", content: null });
    renderWithProviders(<GitDiffViewer diff={sampleDiff} projectId="project-1" />);
    fireEvent.click(screen.getByText("Open current file"));
    await waitFor(() => expect(screen.getByText(/binary files, or files over 32 KiB/)).toBeInTheDocument());
  });

  it("decodes Git-quoted UTF-8 filenames before requesting the tracked file", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ path: "café.txt", content: "hello" });
    const diff = 'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"\n--- "a/caf\\303\\251.txt"\n+++ "b/caf\\303\\251.txt"\n@@ -0,0 +1 @@\n+hello';
    renderWithProviders(<GitDiffViewer diff={diff} projectId="project-1" />);
    expect(screen.getByText("café.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/projects/project-1/repository-files?path=caf%C3%A9.txt");
  });

  it("uses the file marker when the name itself contains b/", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ path: "notes b/draft.txt", content: "draft" });
    const diff = 'diff --git a/notes b/draft.txt b/notes b/draft.txt\n--- a/notes b/draft.txt\n+++ b/notes b/draft.txt\n@@ -0,0 +1 @@\n+draft';
    renderWithProviders(<GitDiffViewer diff={diff} projectId="project-1" />);
    expect(screen.getByText("notes b/draft.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByText("draft")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/projects/project-1/repository-files?path=notes%20b%2Fdraft.txt");
  });

  it("offers the destination on a quoted rename-only diff", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ path: "café.txt", content: "renamed" });
    const diff = 'diff --git "a/caf\\303\\251-old.txt" "b/caf\\303\\251.txt"\nsimilarity index 100%\nrename from "caf\\303\\251-old.txt"\nrename to "caf\\303\\251.txt"';
    renderWithProviders(<GitDiffViewer diff={diff} projectId="project-1" />);
    expect(screen.getByText("café.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByText("renamed")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/projects/project-1/repository-files?path=caf%C3%A9.txt");
  });

  it("refreshes the preview when reopened", async () => {
    const get = vi.spyOn(api, "get")
      .mockResolvedValueOnce({ path: "src/main.ts", content: "first version" })
      .mockResolvedValueOnce({ path: "src/main.ts", content: "new version" });
    renderWithProviders(<GitDiffViewer diff={sampleDiff} projectId="project-1" />);
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByText("first version")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open current file"));
    fireEvent.click(screen.getByText("Open current file"));
    expect(await screen.findByText("new version")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
