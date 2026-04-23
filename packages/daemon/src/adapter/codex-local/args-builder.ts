import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
  type CodexLocalAdapterConfig,
} from "./types.js";

export function buildCodexExecArgs(
  config: CodexLocalAdapterConfig,
  opts: { cwd?: string; resumeSessionId?: string },
): string[] {
  const args: string[] = ["exec"];
  const model = config.model ?? DEFAULT_CODEX_LOCAL_MODEL;
  const shouldBypass = config.dangerouslyBypassApprovalsAndSandbox
    ?? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;

  if (opts.resumeSessionId) {
    args.push("resume", "--json", opts.resumeSessionId);
    if (model) args.push("-m", model);
    if (shouldBypass) args.push("--dangerously-bypass-approvals-and-sandbox");
    args.push("--skip-git-repo-check");
    if (config.ignoreUserConfig) args.push("--ignore-user-config");
    if (config.ignoreRules) args.push("--ignore-rules");
    pushConfigOverrides(args, config);
    args.push(...(config.extraArgs ?? []));
    args.push("-");
    return args;
  }

  args.push("--json", "--skip-git-repo-check");
  args.push("-C", opts.cwd ?? config.cwd ?? process.cwd());
  if (model) args.push("-m", model);
  if (config.sandbox) args.push("-s", config.sandbox);
  if (config.fullAuto) args.push("--full-auto");
  if (shouldBypass) args.push("--dangerously-bypass-approvals-and-sandbox");
  if (config.profile) args.push("-p", config.profile);
  if (config.search) args.push("--search");
  for (const dir of config.addDirs ?? []) args.push("--add-dir", dir);
  if (config.ignoreUserConfig) args.push("--ignore-user-config");
  if (config.ignoreRules) args.push("--ignore-rules");
  if (config.modelReasoningEffort) {
    args.push("-c", `model_reasoning_effort=${config.modelReasoningEffort}`);
  }
  pushConfigOverrides(args, config);
  args.push(...(config.extraArgs ?? []));
  args.push("-");
  return args;
}

function pushConfigOverrides(args: string[], config: CodexLocalAdapterConfig): void {
  for (const [key, value] of Object.entries(config.configOverrides ?? {})) {
    args.push("-c", `${key}=${value}`);
  }
}
