import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { GitDiffViewer } from "../components/diff/GitDiffViewer.js";

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
});
