# Independent heartbeat isolation review

## Verdict

Spec: PASS. Quality: APPROVE for the scoped test-isolation change, with non-blocking hardening notes below. No production change or removed assertion found. Do not describe the daemon suite as free of background errors: its 775 passing tests coexist with a real, preexisting pipeline-route teardown leak.

Reviewed worktree `/home/hermes/projects/orch8-heartbeat-isolation`, branch `fix/v2-heartbeat-test-isolation`, HEAD/base `17e254e3ea22e0c433e8f9ab2bcaec3ee4bda7d4`. Only tracked difference is `packages/daemon/src/__tests__/heartbeat.service.test.ts`. The three dependency symlinks remain untracked and were not staged. No source edits, commits, pushes, or merges performed.

Reviewed source SHA-256 before and after fresh execution: `b97357c7ed73de7f44a814b2ed8a5790c636f9d8f80049e3c8bcd0e20b938ef5`.

## Spec and implementation assessment

- `resetFixture` joins previous executions before deleting any database rows. Tracking wraps the actual owning service's `executeRun`, including recursive executions started by the final queue promotion. Keeping the same project and agent identities is appropriate because the fix establishes a completion barrier rather than hiding unfinished work behind fresh IDs.
- `afterEach`, reset, and `afterAll` share cleanup. The existing helper releases registered gates, repeatedly drains pending promises, propagates rejected work, restores interception in finally, and closes the owner in a nested finally. `afterAll` closes the database even if cleanup fails.
- Task coalescing uses a releasable adapter gate rather than a permanently pending promise. No sleep-based workaround or terminal-state polling was introduced.
- The first regression exercises the real reset boundary while the previous run is held in final queue promotion. It verifies no old claim, drained promises, shutdown, one invocation of the current adapter, successful final status, and finishedAt. The second verifies recursively promoted executions complete before shutdown.
- All 76 original expectation-bearing source lines remain, confirmed by a multiset comparison against base. The changed file has 91 such lines. Existing happy-path, claim-order, FIFO, and coalescing assertions were not weakened or skipped.
- Reviewed implementer red and mutation JSON. The red report records the new cross-fixture test failing. The no-cleanup mutation records both new regressions failing. Other tests were intentionally filtered out in those probes. Final focused reports contain no skipped tests. These historical probes were inspected, not independently re-created or source-mutated during this review.
- Added code has no security-sensitive production behavior, credentials, dynamic evaluation, or command execution. `git diff --check` passed.

## Fresh execution evidence

All commands ran from `/home/hermes/projects/orch8-heartbeat-isolation/packages/daemon`, with `TMPDIR=/dev/shm` for Vitest. Report paths were required not to exist before execution. Assertions and file statuses were validated from JSON, not inferred from process exit.

1. `python /home/hermes/orch8-evidence/heartbeat-isolation/independent-validate.py` ran:

   `node node_modules/vitest/vitest.mjs run src/__tests__/heartbeat.service.test.ts src/__tests__/heartbeat-idempotency.test.ts src/__tests__/heartbeat-integration.test.ts src/__tests__/heartbeat-broadcast.test.ts src/__tests__/startup.test.ts src/__tests__/pipeline-approval-safety.test.ts --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile=/home/hermes/orch8-evidence/heartbeat-isolation/independent-focused.json`

   Exit 0, JSON success true, 77 passed, zero failed or pending, six files passed. The four heartbeat files account for 49 passed tests, including 40 in heartbeat.service.test.ts. Exact requested file coverage, per-test statuses, totals, and unchanged source hash were checked. Evidence: `independent-focused.json`, `independent-focused.log`, `independent-validation.json`, `independent-validate.py`.

2. `node node_modules/vitest/vitest.mjs run src/__tests__/pipeline-routes.test.ts --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile=/home/hermes/orch8-evidence/heartbeat-isolation/independent-routes.json`

   Exit 0, JSON success true, 8 passed. Reproduced real post-close database access without loading the modified heartbeat test. Evidence: `independent-routes.json`, `independent-routes.log`.

3. `node node_modules/vitest/vitest.mjs run src/__tests__/async-work.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/heartbeat-isolation/independent-async-work.json`

   Exit 0, JSON success true, 4 passed. Includes assertion failure before gate release with both fulfilled and rejected background work, zero pending promises, restored method identity, and actual Fastify closure. Also tests recursive late work and rejected-work reporting. This exercises the unchanged helper's failure-path contract used by the new fixture; it is not a newly injected failure in the heartbeat fixture itself. Evidence: `independent-async-work.json`, `independent-async-work.log`.

4. `node node_modules/typescript/bin/tsc --noEmit`: exit 0, `independent-typecheck.log` empty.

Separately parsed all five implementer focused reports, each 49 passed with no non-passing assertion. Parsed full-daemon.json and verified 97 passed files and all 775 test-result entries passed. The full daemon suite was not rerun independently.

## Database error assessment

The original report understates the full-log findings by describing only startup errors.

### Missing relations are unrelated startup-fixture diagnostics

`full-daemon.log:61-63` contains failed skill sync, interrupted-run recovery, and streaming-chat recovery with missing `agents`, `heartbeat_runs`, and `chat_messages` relations. Their timestamps overlap startup.test.ts. That unchanged test starts an empty embedded database and calls buildServer without migrations at `startup.test.ts:56-71`. Server startup launches these database consumers at `server.ts:218-274` and logs their caught failures. The independent six-file run reproduced the same missing-relation diagnostics at `independent-focused.log:101-103`.

These are real failed startup queries in an unmigrated fixture, not evidence of a prior heartbeat.service.test execution stealing the next fixture's run. They do not invalidate the scoped heartbeat verification, but they are not successful startup recovery checks either.

### Pipeline route errors are real leaked work, not harmless startup noise

`full-daemon.log:186` reports `Unhandled error in executeRun`, querying queued runs for `route-agent-a`, with `CONNECTION_ENDED`. Its stack reaches `HeartbeatService.executeRun:1001`, the final queue promotion. The log timestamp is 1793669589422; pipeline-routes.test.ts ended at 1793669589418.2578. This is post-test work, not a missing-table startup probe.

The owner is the separate pipeline routes fixture, which inserts `route-agent-a` at `pipeline-routes.test.ts:45-50` and closes the app/database at lines 53-55 without explicitly joining executions. Running that unchanged test alone reproduced task-lock cleanup errors, an ErrorLoggerService DB write failure, and an unhandled executeRun query after connection close at `independent-routes.log:86-89`. The changed heartbeat.service.test.ts was not loaded. The original triage also documents route-agent-a connection-ended errors in both historical CI attempts.

Therefore this is an existing, separately reproducible lifecycle defect outside the modified fixture. It does not establish a regression introduced by this patch and should not block this scoped repair. It does invalidate any claim that passing full-suite JSON proves all daemon asynchronous work is clean. Track pipeline-routes teardown separately. Do not fold a production shutdown change into this test-only patch.

Other full-log diagnostics include expected admin-authentication rejections and PostgreSQL's no_self_dep constraint rejection. They are not evidence of this isolation race. Structured error records and timing attribution are saved in `independent-log-analysis.json`.

## Non-blocking quality notes and limits

- The helper's optional logger/errorLogger observers are not attached to this heartbeat fixture. Draining detects promise rejections, but cannot detect every production error caught and swallowed internally. The successful-state assertions and drain ownership prove the requested race fix, not universal absence of caught cleanup errors. Observer wiring with explicit handling for deliberate error-path tests is useful future hardening.
- The regression-local finally blocks restore their additional spies after an awaited cleanup/drain. If that await rejects, those local restores can be skipped. The helper's executeRun restoration and owner close remain protected, and the extra spies belong to the discarded service instance, so this is not a demonstrated cross-fixture leak or approval blocker. Nested finally for those local spy restores would make failure diagnostics cleaner.
- Approval covers local test-isolation correctness. It does not claim production shutdown joins active work, prove the exact historical CI interleaving, or certify a globally quiet daemon suite.

## Files written by this review

Only evidence under `/home/hermes/orch8-evidence/heartbeat-isolation/`: this report, `independent-validate.py`, `independent-validation.json`, `independent-focused.json`, `independent-focused.log`, `independent-routes.json`, `independent-routes.log`, `independent-async-work.json`, `independent-async-work.log`, `independent-typecheck.log`, and `independent-log-analysis.json`.
