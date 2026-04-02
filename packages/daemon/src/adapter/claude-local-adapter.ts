// packages/daemon/src/adapter/claude-local-adapter.ts
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { SpawnFn } from "../services/brainstorm.service.js";
import type { SchemaDb } from "../db/client.js";
import type { ClaudeLocalAdapterConfig, RunContext, RunResult } from "./types.js";
import { buildArgs } from "./args-builder.js";
import { buildEnv } from "./env-builder.js";
import { buildPrompt } from "./prompt-builder.js";
import { dirname, join } from "node:path";
import { createSkillsDir, createInstructionsFile, cleanupTempPath } from "./file-injector.js";
import { DEFAULT_SKILLS_DIR, GLOBAL_SKILLS_DIR } from "@orch/shared";
import { SessionManager } from "./session-manager.js";
import { runProcess } from "./process-runner.js";
import { resolveClaudePath } from "./resolve-claude-path.js";
import type { ProjectSkillService } from "../services/project-skill.service.js";
import type { InstructionBundleService } from "../services/instruction-bundle.service.js";

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

export interface RunAgentPrompts {
  heartbeatTemplate: string;
  bootstrapTemplate?: string;
  sessionHandoff?: string;
  desiredSkills?: string[];
}

export class ClaudeLocalAdapter {
  private sessionManager: SessionManager;

  constructor(
    private db: SchemaDb,
    private spawnFn: SpawnFn = nodeSpawn,
    private projectSkillService?: ProjectSkillService,
    private bundleService?: InstructionBundleService,
  ) {
    this.sessionManager = new SessionManager(db);
  }

  async runAgent(
    config: ClaudeLocalAdapterConfig,
    ctx: RunContext,
    prompts: RunAgentPrompts,
  ): Promise<RunResult> {
    const taskKey = ctx.taskId ?? ctx.runId;
    const adapterType = "claude_local";
    const cwd = config.cwd ?? ctx.cwd;

    // 1. Look up existing session (spec §5)
    const existingSession = await this.sessionManager.lookupSession({
      agentId: ctx.agentId,
      taskKey,
      adapterType,
      cwd,
    });

    const isFirstRun = !existingSession;
    const sessionId = existingSession?.sessionId;

    // 2. Inject files (spec §7, §8)
    const tempPaths: string[] = [];
    let skillsDir: string | null = null;
    let instructionsFilePath: string | undefined;

    try {
      // Resolve skill paths from desiredSkills
      let effectiveSkillPaths: string[] = [];
      if (prompts.desiredSkills && prompts.desiredSkills.length > 0 && this.projectSkillService) {
        effectiveSkillPaths = await resolveSkillPaths(
          this.projectSkillService, ctx.projectId, prompts.desiredSkills,
        );
      }

      // Always inject the orch8 skill from global directory
      const ORCH8_SKILL_PATH = join(GLOBAL_SKILLS_DIR, "orch8", "SKILL.md");
      if (!effectiveSkillPaths.includes(ORCH8_SKILL_PATH)) {
        effectiveSkillPaths.push(ORCH8_SKILL_PATH);
      }
      skillsDir = await createSkillsDir(effectiveSkillPaths);
      if (skillsDir) tempPaths.push(skillsDir);

      // Stale recovery: if instructionsFilePath is set but the file is missing, attempt recovery
      if (config.instructionsFilePath && !existsSync(config.instructionsFilePath) && this.bundleService) {
        const agentRole = (ctx as any).agentRole ?? "engineer";
        await this.bundleService.recover(ctx.agentId, ctx.projectId, agentRole);
      }

      if (config.instructionsFilePath) {
        instructionsFilePath = await createInstructionsFile(config.instructionsFilePath);
        tempPaths.push(dirname(instructionsFilePath));
      }

      // 3. Build CLI args (spec §1)
      const args = buildArgs(config, sessionId, {
        instructionsFilePath,
        skillsDir: skillsDir ?? undefined,
      });

      // 4. Build environment (spec §2.3, §3)
      const env = buildEnv(config, { ...ctx, cwd }, process.env as Record<string, string | undefined>);

      // 5. Build prompt (spec §6)
      const prompt = buildPrompt({
        heartbeatTemplate: prompts.heartbeatTemplate,
        bootstrapTemplate: prompts.bootstrapTemplate,
        sessionHandoff: prompts.sessionHandoff,
        context: ctx,
        isFirstRun,
      });

      // 6. Run the process (spec §2)
      const command = config.command ?? resolveClaudePath();
      const result = await runProcess(
        {
          command,
          args,
          cwd,
          env,
          prompt,
          timeoutSec: config.timeoutSec ?? 0,
          graceSec: config.graceSec ?? 20,
          logStream: ctx.logStream,
          onEvent: ctx.onEvent,
        },
        this.spawnFn,
      );

      // 7. Handle session persistence (spec §5.1)
      if (result.sessionId) {
        if (result.errorCode === "unknown_session" && sessionId) {
          // Unknown session recovery (spec §5.4):
          // Clear the old session and retry without --resume
          await this.sessionManager.clearSession({ agentId: ctx.agentId, taskKey, adapterType });

          const retryArgs = buildArgs(config, undefined, {
            instructionsFilePath,
            skillsDir: skillsDir ?? undefined,
          });

          const retryResult = await runProcess(
            {
              command,
              args: retryArgs,
              cwd,
              env,
              prompt,
              timeoutSec: config.timeoutSec ?? 0,
              graceSec: config.graceSec ?? 20,
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
}
