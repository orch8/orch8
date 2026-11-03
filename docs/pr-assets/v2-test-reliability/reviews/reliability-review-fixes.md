# Reliability review fixes

## Outcome

Addressed both P2 findings on `fix/v2-test-reliability` in `/home/hermes/projects/orch8-test-investigation`. Final targeted execution passed all 33 tests across five files. JSON was parsed and checked for exact totals, all assertion statuses, all file statuses, zero failures, and zero pending tests. Typecheck and `git diff --check` passed. No production changes, fixed sleeps, skips, commits, pushes, merges, or main-branch operations. The interrupted full-suite command was not rerun.

## Exact changes

This pass modified four existing dirty/untracked test files. The earlier replay and chat-service changes were preserved without further edits.

- `packages/daemon/src/__tests__/helpers/async-work.ts`: extracted `createAsyncWork`, with one cleanup operation that releases all gates before draining, restores interception in finally, and invokes the resource-close callback in a nested finally. `useAsyncWork` registers only that cleanup hook. Added test-owned logger and errorLogger observers. Drain rejects unexpected warning/error records after actual execution settlement.
- `packages/daemon/src/__tests__/async-work.test.ts`: added successful-work and rejected-work variants of failure-before-release cleanup. An assertion actually throws while work is held; finally invokes the same cleanup operation used by suite hooks. Both variants verify zero pending work, original method identity, Fastify onClose invocation, and rejection of injection after closure. The resource callback also checks settlement and restoration before closing. Existing late-cleanup test now restores its spy even if its final drain rejects.
- `packages/daemon/src/__tests__/chats-routes.test.ts`: moved closing every registered Fastify instance into the lifecycle callback and removed the separate drain hook. Attached the logger to both real ChatService instances. Approval follow-up now verifies exact persisted role sequence, complete assistant status, a card, nonempty content, and exactly two adapter calls after draining. Existing HTTP and approved-card assertions remain.
- `packages/daemon/src/__tests__/heartbeat-integration.test.ts`: moved service shutdown into the lifecycle callback and removed competing drain/shutdown hooks. Attached both logger observers. Coalescing now asserts the first and third wake's persisted runs succeeded. Added a real-service late-cleanup regression that makes releaseTaskLock reject after a successful adapter result. It proves executeRun resolves and the persisted row succeeds, then requires drain to reject the recorded lock_release_failed error. The injected method is restored in finally.

`reliability-review-fixes.patch` captures the complete final test diff against HEAD, including the earlier implementation and both untracked helper/test files. It is not a delta limited to this review pass. Initial unrelated CLI/shared JSON reports and `helpers/.hermes-tmp.Y3sx0e` were left untouched.

## Commands and results

All commands ran from `/home/hermes/projects/orch8-test-investigation/packages/daemon`. Every report name below has a matching `.log`, except the typecheck which has only a log. Reports were written to unique new paths under `/home/hermes/orch8-evidence`.

Initial red command:

```sh
pnpm exec vitest run src/__tests__/async-work.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/review-fixes-red.json
```

JSON reported 2 passing and 2 failing tests because the new lifecycle factory did not yet exist. This establishes the new API was missing, not the old behavioral defect. Separate mutation controls below establish behavioral sensitivity.

Targeted green command, run once with `review-fixes-green-1.json` and again on the final restored sources with `review-fixes-final.json`:

```sh
pnpm exec vitest run src/__tests__/async-work.test.ts src/__tests__/heartbeat-integration.test.ts src/__tests__/chats-routes.test.ts src/__tests__/chat-message-replay.test.ts src/__tests__/chat.service.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/review-fixes-final.json
pnpm exec tsc --noEmit
```

Both targeted JSON reports have 33 passed, 0 failed, 0 pending. Final process exit was 0. Typecheck exit was 0 with no output. `review-fixes-validation.json` records the exact final argument vector, working directory, counts, and exit statuses.

Negative controls temporarily changed only the helper and restored each mutation in finally:

1. Disable observed-error validation while retaining real execution and captured log calls:

```sh
pnpm exec vitest run src/__tests__/heartbeat-integration.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/review-fixes-observer-red.json
```

Result: 3 passed, 1 failed. The deliberate late-cleanup regression failed with `promise resolved "undefined" instead of rejecting`. This proves fulfilled real-service execution plus successful persisted status is insufficient without observation of swallowed cleanup errors.

2. Omit gate release before drain:

```sh
pnpm exec vitest run src/__tests__/async-work.test.ts --testTimeout=1000 --reporter=json --outputFile=/home/hermes/orch8-evidence/review-fixes-release-red.json
```

Result: 2 passed, both held-work cleanup regressions failed at the test timeout boundary. The JSON reporter serializes these timeout failures as STACK_TRACE_ERROR. No sleep was added; the timeout bounds the deliberately broken negative control.

3. Move restoration/resource close out of finally so rejection bypasses them:

```sh
pnpm exec vitest run src/__tests__/async-work.test.ts --testTimeout=1000 --reporter=json --outputFile=/home/hermes/orch8-evidence/review-fixes-restore-red.json
```

Result: 3 passed, the rejected-work cleanup regression failed because the method remained the spy rather than the original function.

Every negative Vitest command returned shell exit 0 despite failed JSON. This confirms the already diagnosed exit-propagation defect remains; no shell-only green claims were used. All mutations were restored before the final 33-test green run and typecheck.

## Remaining gaps

- No full-suite rerun, 100-repeat normal/constrained scheduling experiment, remote CI/artifact verification, or dependency exit-propagation repair was attempted. Those remain outside this requested test-only correction.
- Failure-before-release regressions exercise the exact shared cleanup operation with an actual thrown assertion and actual Fastify closure; they do not spawn a separate intentionally failing Vitest child to test runner timeout cancellation.
- The late-cleanup regression injects a releaseTaskLock failure through the real HeartbeatService catch/log path. It does not induce an actual database disconnection.
- A first edit batch stopped before changing anything because a read-tool response lacked the expected content key. Retried successfully. No task blocker remains.

The reusable hook-order and swallowed-error regression workflow was added to the existing default-profile `vitest-false-green-exit-diagnosis` skill. No other profile was modified.
