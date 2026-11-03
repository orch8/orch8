# Heartbeat test isolation fix

## Result

Implemented and locally verified in `/home/hermes/projects/orch8-heartbeat-isolation`, branch `fix/v2-heartbeat-test-isolation`, created from fetched `origin/v2` at `17e254e3ea22e0c433e8f9ab2bcaec3ee4bda7d4`.

Only tracked modification: `packages/daemon/src/__tests__/heartbeat.service.test.ts`. No production or shared-helper changes. No assertions removed, weakened or skipped. No push or merge. Not committed yet: independent review remains with the parent agent; this subagent has no delegate_task tool. Do not treat the self-review as independent approval.

## Cause and fix

Read the triage and extracted its reproduction archive into `repro/`. Previous executions can reach their final queue promotion after the next fixture reuses the same agent/project. Replacing the service or calling synchronous shutdown does not join those executions.

The fixture now uses the existing `createAsyncWork` helper to capture actual `executeRun` promises. Its cleanup releases gates, drains recursively promoted executions, restores interception, and calls the owning service's shutdown. `afterEach` cleans every test; reset also invokes the same cleanup before deleting rows; `afterAll` cleans before closing the database. The project remains shared deliberately: correct joining removes the race without relying on identity changes to conceal unfinished work.

The task-scoped coalescing adapter now waits on a releasable helper gate rather than a never-resolving promise. Existing coalescing and claim/FIFO assertions remain intact.

Two bounded 10-second regressions use actual services and PostgreSQL:

- Hold the old execution in its final queue drain, invoke the actual fixture reset, insert a new run for the same agent/project, then release. Require no old claim, zero pending work, shutdown, exactly one current-adapter invocation, succeeded status and finishedAt.
- Hold an adapter with another queued run behind it. Invoke actual fixture teardown and require both runs to succeed, recursive work to settle, and real shutdown only after zero pending executions.

## Evidence

- `red.json` / `red.log`: test-first cross-fixture regression failed before adding cleanup. The old drain returned a claimed next-fixture run instead of an empty array.
- `mutation-no-cleanup.json` / `.log`: disabling fixture cleanup made both regressions fail, one on cross-fixture claim and one on missing shutdown. Actual Vitest exit was 0 despite JSON reporting two failures. Mutation restored.
- `focused-1.json` through `focused-5.json`: final-source runs each passed all 49 assertions across four heartbeat files. 245 passing assertions in these five repetitions, no skips or failures. `validation.json` records exact commands and exit codes; `validation.log` records validation and typecheck output.
- `full-daemon.json`: 775/775 assertions passed across 97 files, zero failed or pending tests. Command: `TMPDIR=/dev/shm node node_modules/vitest/vitest.mjs run --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile=/home/hermes/orch8-evidence/heartbeat-isolation/full-daemon.json`, from the worktree's `packages/daemon` directory.
- Daemon `node node_modules/typescript/bin/tsc --noEmit` passed with exit 0; `typecheck.log` is empty.
- `git diff --check` passed. Added-line security scan found no secret assignment, shell injection, eval or unsafe-deserialization matches. Scope self-reviewed against original assertions and production diff.
- `source.json` records the source SHA-256, base, branch and changed path. `change.patch` preserves the proposed diff. `validate.py` reruns and validates the focused tests rather than trusting shell status.

Full-daemon logs are not silent: they contain startup database-error messages from other fixtures, including missing agents/heartbeat_runs relations. JSON has no test failures. This task did not investigate or change those other fixtures. The focused heartbeat runs and typecheck passed.

## Environment and review handoff

Dependencies were reused without installation through three untracked symlinks in this worktree: `node_modules`, `packages/daemon/node_modules`, and `packages/shared/node_modules`, each pointing at the corresponding path in `/home/hermes/projects/orch8`. Do not stage these symlinks. PostgreSQL used `/dev/shm`; no unrelated project cleanup occurred.

Review and commit only `packages/daemon/src/__tests__/heartbeat.service.test.ts` after independent approval. No claim is made that this test-only fix changes production shutdown semantics or conclusively reconstructs the historical CI scheduling order.
