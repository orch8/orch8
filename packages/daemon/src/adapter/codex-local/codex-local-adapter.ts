import { spawn as nodeSpawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { GLOBAL_SKILLS_DIR } from "@orch/shared/defaults";
import type {
  AgentAdapter,
  RunAgentInstructions,
  RunContext,
  RunResult,
  SpawnFn,
  TestEnvironmentResult,
} from "../types.js";
import type { SchemaDb } from "../../db/client.js";
import { agentsMdPath } from "../../services/agent-files.js";
import type { ProjectSkillService } from "../../services/project-skill.service.js";
import { SessionManager } from "../session-manager.js";
import { resolveSkillPaths } from "../claude-local-adapter.js";
import { ensureCodexHome, seedCodexAuth } from "./codex-home.js";
import { syncCodexSkills } from "./skills.js";
import { buildCodexExecArgs } from "./args-builder.js";
import { buildCodexEnv } from "./env-builder.js";
import { buildCodexPrompt, appendTaskContext } from "./prompt-builder.js";
import { runCodexProcess } from "./process-runner.js";
import { resolveCodexPath } from "./resolve-codex-path.js";
import {
  DEFAULT_CODEX_LOCAL_MODEL,
  type CodexLocalAdapterConfig,
} from "./types.js";

export class CodexLocalAdapter implements AgentAdapter {
  readonly type = "codex_local";
  readonly capabilities = {
    requiresMaterializedRuntimeSkills: false,
    supportsInstructionsBundle: false,
  };

  private sessionManager: SessionManager;

  constructor(
    private db: SchemaDb,
    private spawnFn: SpawnFn = nodeSpawn,
    private projectSkillService?: ProjectSkillService,
  ) {
    this.sessionManager = new SessionManager(db);
  }

  async runAgent(
    config: unknown,
    ctx: RunContext,
    instructions: RunAgentInstructions,
  ): Promise<RunResult> {
    const codexConfig = config as CodexLocalAdapterConfig;
    const taskKey = ctx.sessionKey ?? ctx.taskId ?? ctx.runId;
    const adapterType = "codex_local";
    const cwd = codexConfig.cwd ?? ctx.cwd;
    const codexHome = await ensureCodexHome(ctx.agentId);

    await syncCodexSkills(codexHome, await this.resolveSkillPaths(ctx.projectId, instructions.desiredSkills ?? []));

    const systemPromptPath = agentsMdPath(instructions.projectRoot, instructions.slug);
    if (!existsSync(systemPromptPath)) {
      throw new Error(`Missing AGENTS.md for agent "${instructions.slug}" at ${systemPromptPath}`);
    }

    const prompt = appendTaskContext(await buildCodexPrompt(systemPromptPath, instructions), ctx);
    const command = codexConfig.command ?? resolveCodexPath();
    const env = buildCodexEnv(codexConfig, { ...ctx, cwd }, codexHome, process.env as Record<string, string | undefined>);

    let sessionId = (await this.sessionManager.lookupSession({
      agentId: ctx.agentId,
      taskKey,
      adapterType,
      cwd,
    }))?.sessionId;

    let result = await this.runOnce({
      config: codexConfig,
      command,
      cwd,
      env,
      prompt,
      sessionId,
      ctx,
    });

    if (result.errorCode === "unknown_session" && sessionId) {
      await this.sessionManager.clearSession({ agentId: ctx.agentId, taskKey, adapterType });
      sessionId = undefined;
      result = await this.runOnce({
        config: codexConfig,
        command,
        cwd,
        env,
        prompt,
        sessionId,
        ctx,
      });
    }

    if (result.errorCode === "transient_upstream") {
      result = await this.retryTransient({
        initialResult: result,
        config: codexConfig,
        command,
        cwd,
        env,
        prompt,
        sessionId,
        ctx,
      });
    }

    if (result.sessionId && !result.errorCode) {
      await this.sessionManager.saveSession({
        agentId: ctx.agentId,
        projectId: ctx.projectId,
        taskKey,
        adapterType,
        sessionId: result.sessionId,
        cwd,
      });
    }

    return result;
  }

  async testEnvironment(config: unknown): Promise<TestEnvironmentResult> {
    const codexConfig = config as CodexLocalAdapterConfig & { sandboxOnly?: boolean };
    const cwd = await mkdtemp(join(tmpdir(), "orch8-codex-probe-"));
    const codexHome = await mkdtemp(join(tmpdir(), "orch8-codex-home-"));

    try {
      await seedCodexAuth(codexHome);
      // A text-only reply can succeed even when Codex cannot run a single
      // sandboxed shell command. Check the actual execution boundary first.
      if (codexConfig.sandbox && codexConfig.sandbox !== "danger-full-access" &&
          codexConfig.dangerouslyBypassApprovalsAndSandbox === false) {
        if (process.platform !== "linux") {
          return { ok: false, errorCode: "process_error",
            message: "Sandbox shell preflight is currently supported on Linux only. No agent work was started." };
        }
        try {
          await promisify(execFile)(codexConfig.command ?? resolveCodexPath(), [
            "-c", `sandbox_mode=${JSON.stringify(codexConfig.sandbox)}`,
            "sandbox", "linux", "--", "/bin/true",
          ], { cwd, timeout: 10000, env: buildCodexEnv(codexConfig, {
            agentId: "probe", agentName: "Probe", projectId: "probe", runId: "probe",
            wakeReason: "on_demand", apiUrl: "http://localhost:3847", cwd,
          }, codexHome, process.env as Record<string, string | undefined>) });
        } catch (err) {
          const failure = err as Error & { stderr?: string };
          const detail = failure.stderr?.includes("Failed RTM_NEWADDR")
            ? "bubblewrap could not initialize its network namespace (Failed RTM_NEWADDR: Operation not permitted)"
            : (failure.stderr || failure.message).trim().slice(0, 400);
          return { ok: false, errorCode: "process_error",
            message: `Codex sandbox cannot run commands: ${detail}. Keep approvals and sandbox enabled; repair the host sandbox before starting a feature.` };
        }
      }
      if (codexConfig.sandboxOnly) {
        // This early check proves only that the Linux command sandbox starts.
        // It deliberately avoids the billable model invocation below.
        return { ok: true, message: "Codex sandbox ran a command in a temporary directory. Agent authentication and model access are not checked." };
      }
      const result = await runCodexProcess(
        {
          command: codexConfig.command ?? resolveCodexPath(),
          args: [
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--ephemeral",
            "-C",
            cwd,
            "-m",
            codexConfig.model ?? DEFAULT_CODEX_LOCAL_MODEL,
            "-",
          ],
          cwd,
          env: buildCodexEnv(codexConfig, {
            agentId: "probe",
            agentName: "Probe",
            projectId: "probe",
            runId: "probe",
            wakeReason: "on_demand",
            apiUrl: "http://localhost:3847",
            cwd,
          }, codexHome, process.env as Record<string, string | undefined>),
          prompt: "Respond with hello",
          timeoutSec: codexConfig.timeoutSec ?? 30,
          graceSec: codexConfig.graceSec ?? 5,
        },
        this.spawnFn,
      );

      if (result.errorCode) {
        return {
          ok: false,
          costUsd: result.costUsd,
          errorCode: result.errorCode,
          message: result.error ?? "Codex environment test failed",
          sessionId: result.sessionId ?? undefined,
        };
      }

      return {
        ok: true,
        costUsd: result.costUsd,
        sessionId: result.sessionId ?? undefined,
        message: result.result ?? undefined,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      return {
        ok: false,
        errorCode: error.code === "ENOENT" ? "not_found" : "process_error",
        message: error.message,
      };
    } finally {
      await rm(cwd, { recursive: true, force: true }).catch(() => {});
      await rm(codexHome, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async resolveSkillPaths(projectId: string, desiredSkills: string[]): Promise<string[]> {
    const paths: string[] = [];
    if (desiredSkills.length > 0 && this.projectSkillService) {
      paths.push(...await resolveSkillPaths(this.projectSkillService, projectId, desiredSkills));
    }

    const orch8SkillPath = path.join(GLOBAL_SKILLS_DIR, "orch8", "SKILL.md");
    if (!paths.includes(orch8SkillPath)) paths.push(orch8SkillPath);
    return paths;
  }

  private async runOnce(input: {
    config: CodexLocalAdapterConfig;
    command: string;
    cwd: string;
    env: Record<string, string | undefined>;
    prompt: string;
    sessionId?: string;
    ctx: RunContext;
  }): Promise<RunResult> {
    return runCodexProcess(
      {
        command: input.command,
        args: buildCodexExecArgs(input.config, {
          cwd: input.cwd,
          resumeSessionId: input.sessionId,
        }),
        cwd: input.cwd,
        env: input.env,
        prompt: input.prompt,
        timeoutSec: input.config.timeoutSec ?? 0,
        graceSec: input.config.graceSec ?? 15,
        logStream: input.ctx.logStream,
        onEvent: input.ctx.onEvent,
      },
      this.spawnFn,
    );
  }

  private async retryTransient(input: {
    initialResult: RunResult;
    config: CodexLocalAdapterConfig;
    command: string;
    cwd: string;
    env: Record<string, string | undefined>;
    prompt: string;
    sessionId?: string;
    ctx: RunContext;
  }): Promise<RunResult> {
    let latest = input.initialResult;
    for (const delayMs of [1_000, 4_000, 16_000]) {
      await sleep(delayMs);
      latest = await this.runOnce(input);
      if (latest.errorCode !== "transient_upstream") return latest;
    }
    return latest;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
