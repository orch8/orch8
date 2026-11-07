// packages/daemon/src/adapter/claude-local-adapter.ts
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { SpawnFn } from "./types.js";
import type { SchemaDb } from "../db/client.js";
import type {
  AgentAdapter,
  ClaudeLocalAdapterConfig,
  RunAgentInstructions,
  RunContext,
  RunResult,
  TestEnvironmentResult,
} from "./types.js";
import { buildArgs } from "./args-builder.js";
import { buildEnv } from "./env-builder.js";
import { buildStdinPrompt } from "./prompt-builder.js";
import { agentsMdPath } from "../services/agent-files.js";
import { dirname, join } from "node:path";
import { createSkillsDir, createInstructionsFile, cleanupTempPath } from "./file-injector.js";
import { GLOBAL_SKILLS_DIR } from "@orch/shared/defaults";
import { SessionManager } from "./session-manager.js";
import { runProcess } from "./process-runner.js";
import { resolveClaudePath } from "./resolve-claude-path.js";
import type { ProjectSkillService } from "../services/project-skill.service.js";

export async function resolveSkillPaths(
  skillService: ProjectSkillService,
  projectId: string,
  desiredSkills: string[],
): Promise<string[]> {
  if (desiredSkills.length === 0) return [];

  const paths: string[] = [];
  for (const slug of desiredSkills) {
    const skill = await skillService.get(projectId, slug);
    if (skill?.sourceLocator) {
      paths.push(join(skill.sourceLocator, "SKILL.md"));
    }
  }
  return paths;
}

export type { RunAgentInstructions } from "./types.js";

export class ClaudeLocalAdapter implements AgentAdapter {
  readonly type = "claude_local";
  readonly capabilities = {
    requiresMaterializedRuntimeSkills: true,
    supportsInstructionsBundle: true,
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
    const claudeConfig = config as ClaudeLocalAdapterConfig;
    const taskKey = ctx.sessionKey ?? ctx.taskId ?? ctx.runId;
    const adapterType = "claude_local";
    const cwd = claudeConfig.cwd ?? ctx.cwd;

    // 1. Look up existing session (spec §5)
    const existingSession = await this.sessionManager.lookupSession({
      agentId: ctx.agentId,
      taskKey,
      adapterType,
      cwd,
    });

    const sessionId = existingSession?.sessionId;

    // 2. Inject files (spec §7, §8)
    const tempPaths: string[] = [];
    let skillsDir: string | null = null;
    let instructionsFilePath: string | undefined;

    try {
      // Resolve skill paths from desiredSkills
      let effectiveSkillPaths: string[] = [];
      if (instructions.desiredSkills && instructions.desiredSkills.length > 0 && this.projectSkillService) {
        effectiveSkillPaths = await resolveSkillPaths(
          this.projectSkillService, ctx.projectId, instructions.desiredSkills,
        );
      }

      // Always inject the orch8 skill from global directory
      const ORCH8_SKILL_PATH = join(GLOBAL_SKILLS_DIR, "orch8", "SKILL.md");
      if (!effectiveSkillPaths.includes(ORCH8_SKILL_PATH)) {
        effectiveSkillPaths.push(ORCH8_SKILL_PATH);
      }
      skillsDir = await createSkillsDir(effectiveSkillPaths);
      if (skillsDir) tempPaths.push(skillsDir);

      // Load AGENTS.md from disk as the system prompt source
      const systemPromptPath = agentsMdPath(instructions.projectRoot, instructions.slug);
      if (!existsSync(systemPromptPath)) {
        throw new Error(`Missing AGENTS.md for agent "${instructions.slug}" at ${systemPromptPath}`);
      }

      instructionsFilePath = await createInstructionsFile(systemPromptPath);
      tempPaths.push(dirname(instructionsFilePath));

      // Build stdin prompt from the WakeReason
      let stdinPrompt = buildStdinPrompt(instructions.wake, instructions.projectRoot, instructions.slug);
      if (instructions.sessionHandoff) {
        stdinPrompt = `${instructions.sessionHandoff}\n\n${stdinPrompt}`;
      }

      // 3. Build CLI args (spec §1)
      const args = buildArgs(claudeConfig, sessionId, {
        instructionsFilePath,
        skillsDir: skillsDir ?? undefined,
      });

      // 4. Build environment (spec §2.3, §3)
      const env = buildEnv(claudeConfig, { ...ctx, cwd }, process.env as Record<string, string | undefined>);

      // 5. Run the process (spec §2)
      const command = claudeConfig.command ?? resolveClaudePath();
      const result = await runProcess(
        {
          command,
          args,
          cwd,
          env,
          prompt: stdinPrompt,
          timeoutSec: claudeConfig.timeoutSec ?? 0,
          graceSec: claudeConfig.graceSec ?? 20,
          logStream: ctx.logStream,
          onEvent: ctx.onEvent,
        },
        this.spawnFn,
      );

      // 6. Handle session persistence (spec §5.1)
      if (result.sessionId) {
        if (result.errorCode === "unknown_session" && sessionId) {
          // Unknown session recovery (spec §5.4):
          // Clear the old session and retry without --resume
          await this.sessionManager.clearSession({ agentId: ctx.agentId, taskKey, adapterType });

          const retryArgs = buildArgs(claudeConfig, undefined, {
            instructionsFilePath,
            skillsDir: skillsDir ?? undefined,
          });

          const retryResult = await runProcess(
            {
              command,
              args: retryArgs,
              cwd,
              env,
              prompt: stdinPrompt,
              timeoutSec: claudeConfig.timeoutSec ?? 0,
              graceSec: claudeConfig.graceSec ?? 20,
              logStream: ctx.logStream,
              onEvent: ctx.onEvent,
            },
            this.spawnFn,
          );

          if (retryResult.sessionId) {
            await this.sessionManager.saveSession({
              agentId: ctx.agentId,
              projectId: ctx.projectId,
              taskKey,
              adapterType,
              sessionId: retryResult.sessionId,
              cwd,
            });
          }

          return retryResult;
        }

        // Normal session persistence
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
    } finally {
      // Cleanup temp files (spec §7)
      for (const p of tempPaths) {
        await cleanupTempPath(p);
      }
    }
  }

  async testEnvironment(config: unknown): Promise<TestEnvironmentResult> {
    const claudeConfig = config as ClaudeLocalAdapterConfig;
    const projectCwd = claudeConfig.cwd;
    // Run in the selected repository so Claude loads the same project/local
    // permission settings as a feature run. The marker stays temporary.
    let cwd: string | undefined;
    let probeDir: string | undefined;
    const nonce = randomUUID();
    try {
      cwd = projectCwd ?? await mkdtemp(join(tmpdir(), "orch8-claude-project-probe-"));
      probeDir = await mkdtemp(join(cwd, ".orch8-claude-probe-"));
      const marker = join(probeDir, "shell-marker");
      const quotedMarker = `'${marker.replaceAll("'", "'\"'\"'")}'`;
      const result = await runProcess(
        {
          command: claudeConfig.command ?? resolveClaudePath(),
          args: buildArgs({ ...claudeConfig, cwd }, undefined),
          cwd,
          env: buildEnv(claudeConfig, {
            agentId: "probe",
            agentName: "Probe",
            projectId: "probe",
            runId: "probe",
            wakeReason: "on_demand",
            apiUrl: "http://localhost:3847",
            cwd,
          }, process.env as Record<string, string | undefined>),
          prompt: `Runtime preflight only. Use the Bash tool to execute exactly this command: printf '%s' '${nonce}' > ${quotedMarker}. Do not edit any other file. Report whether it succeeded.`,
          timeoutSec: Math.min(claudeConfig.timeoutSec ?? 60, 120),
          graceSec: claudeConfig.graceSec ?? 5,
        },
        this.spawnFn,
      );

      if (result.errorCode || /OAuth access token has expired|Failed to authenticate/i.test(result.result ?? "")) {
        const expired = /OAuth access token has expired|Failed to authenticate/i.test(result.result ?? "");
        return {
          ok: false,
          costUsd: result.costUsd,
          errorCode: expired ? "auth_required" : result.errorCode ?? "process_error",
          message: expired ? "Claude authentication expired. Re-authenticate with the Claude CLI before retrying the runtime check."
            : result.error ?? result.result?.slice(0, 400) ?? "Claude environment test failed",
          sessionId: result.sessionId ?? undefined,
        };
      }

      const actual = await readFile(marker, "utf8").catch(() => null);
      if (actual !== nonce) {
        return { ok: false, errorCode: "process_error",
          costUsd: result.costUsd,
          message: "Claude did not complete the shell write under current permissions. A text response is insufficient. Check Claude's user/project permissions for Bash; no approvals were bypassed." };
      }
      return {
        ok: true,
        costUsd: result.costUsd,
        sessionId: result.sessionId ?? undefined,
        message: "Claude executed a shell write with the selected repository's existing permissions. This does not guarantee a feature run will succeed.",
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      return {
        ok: false,
        errorCode: error.code === "ENOENT" ? "not_found" : "process_error",
        message: error.message,
      };
    } finally {
      if (probeDir) await rm(probeDir, { recursive: true, force: true }).catch(() => {});
      if (!projectCwd && cwd) await rm(cwd, { recursive: true, force: true }).catch(() => {});
    }
  }
}
