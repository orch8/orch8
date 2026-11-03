# Independent final reliability review

## Verdicts

- Specification: PASS for the requested async-test correction scope. Both original P2 findings are fixed.
- Quality/security: PASS. No blocking correctness or security findings in the complete test-only diff. Existing assertions are preserved and strengthened. No production changes.

This is not approval of the broader reliability release or a claim that Vitest exit propagation is fixed.

## Scope

Reviewed `/home/hermes/projects/orch8-test-investigation`, branch `fix/v2-test-reliability`, dirty diff against `origin/v2`. HEAD and origin/v2 both resolve to `26c83ab38f363a7c0a1a90f57684fb825731c2c1`.

Read all four tracked test diffs and both untracked files, `helpers/async-work.ts` and `async-work.test.ts`. Read the original `reliability-spec-review.md`, the implementer's `reliability-review-fixes.md`, relevant real-service catch/cleanup paths, and daemon Vitest configuration. Ignored existing generated Vitest reports in CLI/shared and `helpers/.hermes-tmp.Y3sx0e`. No repository source edits, mutations, commits, pushes, or merges.

## P2 resolution: cleanup ordering and guarantees

Fixed at `helpers/async-work.ts:30-37,52-55`.

`useAsyncWork` now registers one cleanup hook. Its cleanup releases every registered gate before awaiting drain, restores the intercepted method in finally, and invokes the resource callback in a nested finally. Drain rejection cannot bypass restoration or resource cleanup. The release functions are native deferred promise resolvers, not arbitrary callbacks that can throw before the try block.

There are no competing afterEach drain hooks in the reviewed suites. Route app closure belongs to the shared lifecycle callback at `chats-routes.test.ts:41-42`; both default and local apps are registered. Heartbeat shutdown belongs to that callback at `heartbeat-integration.test.ts:24`. SQL teardown remains afterAll. This removes the stack-order dependency identified in the original review and puts gate release before every teardown drain.

`async-work.test.ts:5-34` exercises both successful and rejected held work after an actual assertion failure before release. It checks zero pending promises, original method identity, onClose invocation, and rejection of injection into the closed Fastify app. The close callback also checks settlement and restoration order. Both cases passed in my fresh run. The late-cleanup/spawned-work test retains a finally that releases both holds and restores interception even if drain rejects.

The failure-path regression invokes the same cleanup function directly rather than deliberately failing an outer Vitest test. Together with the now-single suite hook, this is sufficient for the reported ordering defect. It does not certify runner cancellation of an arbitrary hung test or an execution that never settles.

## P2 resolution: swallowed errors and successful final state

Fixed at `helpers/async-work.ts:13-25`, `heartbeat-integration.test.ts:60-62,185-217,263-274`, and `chats-routes.test.ts:332-338`.

The helper records logger warning/error/fatal calls and errorLogger records, then rejects unexpected records after execution settlement. The errorLogger's async method records synchronously before returning its resolved promise, so the service's fire-and-forget logging does not race observation. Heartbeat receives both observers. Both route ChatService instances receive the logger.

The real-service probe injects failure into `releaseTaskLock`, through the production catch/log path at `heartbeat.service.ts:974-997`. It explicitly proves the captured real executeRun promise fulfills, the persisted run succeeds, and lock release was attempted once. It then requires drain to reject the `lock_release_failed` record. That test passed independently. The injection is restored in finally.

The coalescing test now checks successful persisted state for both the first run and the later third wake, after draining their actual execution promises. The route approval follow-up now requires exact role order, complete final assistant status, one card, nonempty content, and exactly two adapter calls. This matters because ChatService catches execution errors and persists an error assistant while fulfilling its promise at `chat.service.ts:451-477`; logger attachment alone would not detect that catch path.

Expected deliberate error records are consumed by the probe's rejecting drain. Unexpected records in ordinary tests fail their drain or teardown rather than being ignored.

## Complete diff quality/security review

- Tracked changes are limited to four test files; the two added files are test helper and helper tests. No changes to service behavior, configuration, dependencies, or authorization logic.
- No removed content/card/role/session-key/HTTP/adapter-call assertions. Queued/coalesced expectations remain exact, with no permissive alternatives, skips, or added fixed sleeps.
- Coalescing holds the configured adapter, checks one running row with the original run ID and one adapter call, and releases before awaiting completion. The null runId on the coalesced receipt remains consistent with the service contract.
- Replay uses separate gates for initial and approval-follow-up turns. The shared helper proves the intermediate row is still empty/streaming and completion has not resolved before release, then verifies complete status.
- Interception preserves the original receiver, arguments, and returned promise. The pending set drains in a loop to include work spawned during cleanup. Rejections are recorded rather than silently discarded.
- No added secrets, unsafe shell execution, external network destinations, dynamic evaluation, or production data access introduced by the diff.
- Nonblocking maintainability note: the helper's broad `any` targets and cast logger are pragmatic for private-method interception, but do not enforce a complete logger interface. Current services only use supported methods. Error JSON serializes Error objects without their nonenumerable message/stack, though the service message/code still identifies the failure. Neither issue invalidates the current regression checks.

## Independent execution evidence

Executed only the five requested files, not the full suite. Working directory was `/home/hermes/projects/orch8-test-investigation/packages/daemon`.

```sh
pnpm exec vitest run src/__tests__/async-work.test.ts src/__tests__/heartbeat-integration.test.ts src/__tests__/chats-routes.test.ts src/__tests__/chat-message-replay.test.ts src/__tests__/chat.service.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/independent-final-1793665849779043472.json
pnpm exec tsc --noEmit
```

Fresh JSON was parsed programmatically, not inferred from shell exit. Verified `success: true`, exactly five file results, every file status passed, exactly 33 assertion results, every assertion passed, zero failed tests, and zero pending tests.

| File | Passed |
| --- | ---: |
| async-work.test.ts | 4 |
| chat-message-replay.test.ts | 1 |
| chat.service.test.ts | 16 |
| chats-routes.test.ts | 8 |
| heartbeat-integration.test.ts | 4 |
| Total | 33 |

Vitest process exit was 0. Typecheck independently exited 0 with no output. `git diff --check` independently exited 0. Final git status retained the same reviewed modified/untracked scope.

Artifacts:

- `/home/hermes/orch8-evidence/independent-final-1793665849779043472.json`
- `/home/hermes/orch8-evidence/independent-final-1793665849779043472.log`
- `/home/hermes/orch8-evidence/independent-final-1793665849779043472-validation.json`
- `/home/hermes/orch8-evidence/independent-final-typecheck.log`

I also parsed the implementer's archived negative-control JSON, without rerunning mutations in this read-only review. Observer-disabled control had 3 passed and 1 failed, with the expected resolved-instead-of-rejected failure. Release-disabled control had 2 passed and 2 failed, both held-work regressions. Restoration-disabled control had 3 passed and 1 failed, with the rejected-work method-identity assertion failing. These corroborate sensitivity but are implementer-produced evidence, distinct from my fresh green execution.

## Limits and remaining work outside this review

The known false-green process-exit defect remains outside this test-only patch; shell status is not a sufficient CI pass criterion. No full-suite execution, repeat/constrained-scheduling campaign, remote CI verification, dependency repair, or actual database-disconnection injection was performed. No blocker encountered for this review.
