export function featureHandoff(repository: string | undefined, request: string, filePaths: string[], branchName: string): string {
  return [
    "Feature handoff (manual; does not run agents)",
    `Repository path: ${repository ?? "Not loaded; confirm the repository path before proceeding"}`,
    "Feature request (verbatim):",
    request,
    "",
    "Starting file paths (inspect these; they may not be the only files to change):",
    ...(filePaths.length ? filePaths.map(path => `- ${path}`) : ["None selected"]),
    ...(branchName.trim() ? [`Proposed branch name (not prepared): ${branchName.trim()}`] : []),
    "",
    "Inspect the repository and relevant files before making changes. Write a scoped plan and review it before implementation.",
    "Implement only after the plan is reviewed. Run relevant tests and record the actual results. Obtain an independent review of the diff and test evidence before publishing.",
    "This handoff only copies text. No agents have run as part of this handoff and no branch has been prepared by this action.",
  ].join("\n");
}
