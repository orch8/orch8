# v2 verification plan

Base: `origin/v2` at `26c83ab38f363a7c0a1a90f57684fb825731c2c1`.
Branch: `ci/v2-verification`. Any eventual PR must target `v2`.

1. Inspect workspace scripts and embedded Postgres setup without changing application code.
2. Add a Linux CI job for PRs targeting v2 and pushes to v2, using Node 22 and pnpm 9.15.0.
3. Run a frozen install, build, typecheck, lint, and uncached tests locally. Validate workflow syntax and attach evidence before committing. Do not push or create a PR during this task.

## Acceptance

- Only workflow and documentation changes. No main branch operations.
- Only `pull_request` and `push`, each restricted to `v2`. No privileged PR trigger, secrets, or paid provider integration runs.
- Read-only contents permission, per-PR/ref concurrency cancellation, bounded job timeout, and no persisted checkout credentials.
- Resolve action SHAs from upstream tags, never invent pins.
- Use a non-root Linux runner for embedded Postgres. The daemon global setup starts a temporary database, applies migrations, and tears it down. No database service or credentials needed.
- Install with `--frozen-lockfile`, then execute build, typecheck, lint, and tests. Independent checks still run after another check fails, if installation succeeded.
- Bash pipefail preserves failures through `tee`. Force Turbo test execution. Require nonempty, passing JSON reports from all four workspaces, because a local daemon test failure returned exit zero. Upload actual stdout/stderr logs and JSON reports with `always()`, including failed test output, and retain them for 14 days. If setup fails before logs exist, the upload warns rather than inventing evidence.
- Record local outputs separately from remote status. A local pass is not a GitHub Actions pass.
