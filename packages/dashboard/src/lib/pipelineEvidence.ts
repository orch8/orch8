import { api } from "../api/client.js";
import type { PipelineWithSteps, RunLog } from "@orch/shared";
import type { Run } from "../types.js";
import type { PipelineRepositoryDiff } from "../hooks/usePipelines.js";

export const EVIDENCE_TEXT_LIMIT = 40_000;

// Indented blocks keep arbitrary log/Markdown content from closing a code fence.
export function evidenceBlock(content: string, limit = EVIDENCE_TEXT_LIMIT): string {
  const text = content.slice(0, limit).replace(/\r\n?/g, "\n");
  return (text || "[Empty]").split("\n").map(line => `    ${line}`).join("\n") +
    (content.length > limit ? `\n\n[TRUNCATED: showing first ${limit} of ${content.length} characters.]` : "");
}

export async function collectPipelineEvidence(pipelineId: string): Promise<string> {
  const started = new Date().toISOString();
  // A failed state refresh must fail the download rather than export stale UI state.
  const { pipeline, steps } = await api.get<PipelineWithSteps>(`/pipelines/${encodeURIComponent(pipelineId)}`);
  const root = `/pipelines/${encodeURIComponent(pipeline.id)}`;
  const parts = ["# Orch8 pipeline evidence", `Collection started: ${started}`,
    "Read-only, non-atomic snapshot. State and files may change during collection. Logs can contain secrets. This packet is downloaded locally and is not persisted server-side.",
    "Test results are unverified. Run success and review approval are not proof that tests passed. Repository state is not proof of pipeline authorship or a binding to reviewed code.",
    evidenceBlock(`Pipeline: ${pipeline.id}\nName: ${pipeline.name}\nProject: ${pipeline.projectId}\nStatus: ${pipeline.status}\nCurrent step: ${pipeline.currentStep}`)];
  async function section(title: string, load: () => Promise<string>) {
    try { return `## ${title}\n\n${await load()}`; }
    catch { return `## ${title}\n\n[UNAVAILABLE: request failed; evidence missing or unverified. Retry the download or inspect the source.]`; }
  }
  const implement = steps.find(step => step.label.toLowerCase() === "implement");
  const artifacts = [steps.find(step => step.label.toLowerCase() === "plan"),
    steps.find(step => ["review", "independent review"].includes(step.label.toLowerCase()))];
  parts.push(...await Promise.all(artifacts.map((step, index) => section(index ? "Independent review" : "Plan", async () => {
    if (!step) return "[MISSING: no step recorded.]";
    const metadata = evidenceBlock(`Step: ${step.id}\nTask: ${step.taskId ?? "missing"}\nAgent: ${step.agentId ?? "missing"}\nRecorded artifact path: ${step.outputFilePath ?? "missing"}\nStatus: ${step.status}\nHuman verification required: ${step.requiresVerification}\nRecorded summary: ${step.outputSummary ?? "missing"}`);
    const independence = index ? `\n\nReviewer independence: ${step.agentId && implement?.agentId && step.agentId !== implement.agentId ? "distinct recorded agent IDs; execution independence unverified" : "UNVERIFIED: distinct implementer and reviewer not recorded"}.` : "";
    if (!step.outputFilePath) return metadata + independence + "\n\n[MISSING: no artifact path recorded.]";
    return metadata + independence + "\n\n" + await section("Recorded artifact", async () => {
      const output = await api.get<{ path: string; content: string }>(`${root}/steps/${encodeURIComponent(step.id)}/output`);
      return evidenceBlock(output.path) + "\n\n" + evidenceBlock(output.content);
    });
  }))));
  parts.push(await section("Implementation raw log", async () => {
    if (!implement?.taskId) return "[MISSING: no implementation task recorded.]";
    const runs = await api.get<Run[]>("/runs", { projectId: pipeline.projectId, taskId: implement.taskId, limit: 1 });
    const run = runs[0];
    if (!run) return "[MISSING: no run recorded for the current implementation task.]";
    const metadata = evidenceBlock(`Latest run for current task only: ${run.id}\nTask: ${implement.taskId}\nRun status: ${run.status}\nTests: UNVERIFIED`);
    return metadata + "\n\n" + await section("Raw log content", async () => {
      const log = await api.get<RunLog>(`/runs/${encodeURIComponent(run.id)}/log`, { projectId: pipeline.projectId });
      return `Reported stored bytes: ${log.bytes}\n\n${evidenceBlock(log.content)}`;
    });
  }));
  parts.push(await section("Current repository and PR", async () => {
    const diff = await api.get<PipelineRepositoryDiff>(`${root}/diff`);
    if (!diff.available) return "[UNAVAILABLE: repository snapshot unavailable.]\n\n" + evidenceBlock(diff.reason ?? "No reason supplied");
    const pr = diff.pullRequest;
    return evidenceBlock(`Branch: ${diff.branch ?? "unknown / detached"}\nBase: ${diff.baseBranch ?? "unknown"}\nPR lookup: ${diff.prLookup ?? "unverified"}\nPR: ${pr ? `${pr.url}\nState: ${pr.state}\nDraft: ${pr.isDraft ?? "unknown"}` : "MISSING / UNVERIFIED; see lookup status"}`) +
      "\n\n### PR checks\n\n" + (pr?.checks?.length ? evidenceBlock(pr.checks.map(check => `${check.name}: ${check.status} ${check.url ?? ""}`).join("\n")) : "[MISSING / UNVERIFIED: no checks reported. This does not mean tests passed.]") +
      "\n\n### Committed diff\n\n" + (diff.committedDiff === undefined ? "[MISSING: committed diff not supplied.]" : evidenceBlock(diff.committedDiff)) +
      "\n\n### Working diff, staged and unstaged\n\n" + (diff.workingDiff === undefined ? "[MISSING: working diff not supplied.]" : evidenceBlock(diff.workingDiff)) +
      "\n\n### Untracked names only\n\n" + evidenceBlock(diff.untrackedFiles?.join("\n") ?? "[UNVERIFIED: names not supplied.]") +
      (diff.untrackedMore ? "\n\n[TRUNCATED: more untracked names exist.]" : "") +
      "\n\nUntracked contents and submodule changes are excluded. Diff sections may also contain upstream truncation markers.";
  }));
  return parts.join("\n\n") + "\n";
}

export function downloadPipelineEvidence(pipelineId: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = `orch8-evidence-${pipelineId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
