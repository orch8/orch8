# Approval-safety verification

This change tightens the existing pipeline rather than introducing another factory abstraction.

## Verified by parent execution

- `pnpm --filter @orch/daemon exec vitest run src/__tests__/pipeline-approval-safety.test.ts src/__tests__/pipeline.test.ts src/__tests__/pipeline-routes.test.ts`: exit 0. See `approval-recovery-tests.log`.
- `pnpm test`: exit 0; 1,225 passing tests across all four packages. See `approval-full-tests.log`.
- `pnpm typecheck`: exit 0. See `approval-typecheck.log`.
- `pnpm lint`: exit 0, with 69 warnings and no errors. See `approval-lint.log`.
- `pnpm build`: exit 0; existing dashboard chunk-size warning remains. See `approval-build.log`.
- `git diff --check`: clean.

The pre-fix expanded regression run had 21 failures and 4 passes. `red-summary.txt` contains selected verbatim test output, not simulated results. The final new suite contains 25 tests.

Tests exercise real Postgres transactions, concurrent API approval requests, competing approval/rejection, ownership checks, unauthorized agent calls and failure-injected rollback. A mocked wakeup in the concurrency test counts dispatch calls; this is not evidence of crash-safe delivery or exactly-once agent execution.

## Scope and limitations

- Approve/reject routes now require the existing admin authorization flag. This is not new per-user identity, an immutable approval audit, or artifact-revision binding.
- Approval and rejection lock the pipeline before checking current state. Approval writes and successor task creation commit together.
- Other lifecycle paths, including completion, retry and cancellation, still need the planned consistency/recovery work.
- Wakeup remains after transaction commit. A crash or failed wakeup can still strand successor work; a durable dispatch intent is a separate milestone.
- This backend change has no new UI. `baseline-dashboard.png` is an actual screenshot of the existing running dashboard, included as baseline context only. It does not prove the authorization fix; the regression tests do.
- All PRs for this work target `v2`. `main` is not modified.
