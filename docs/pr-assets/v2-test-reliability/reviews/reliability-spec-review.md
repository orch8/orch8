# Reliability spec review

Verdict: CHANGES REQUESTED. The normal-path fixes preserve existing assertions and address the diagnosed races, but failure-path cleanup and swallowed service errors still have gaps.

## Scope and evidence

Read-only review of the dirty diff in `/home/hermes/projects/orch8-test-investigation` against `origin/v2`, including untracked `helpers/async-work.ts` and `async-work.test.ts`. Reviewed the diagnosis, changed tests, real service completion/error paths, and installed Vitest 3.2.4 hook execution. Ignored `helpers/.hermes-tmp.Y3sx0e`. No repository files modified and no commit, push, or merge.

The parent's 30 passing tests and successful typecheck are supplied context, not independently rerun results. The findings below concern cases not exercised by those passing runs.

## Actionable findings

### P2: Later teardown hooks drain before the helper can release held gates

Locations: `packages/daemon/src/__tests__/chats-routes.test.ts:41-50`, `heartbeat-integration.test.ts:24-33`, and `helpers/async-work.ts:13-21`.

`useAsyncWork` registers its gate-release/drain/restore `afterEach` first. Both suites then register another `afterEach` that starts by awaiting `work.drain()`. Installed Vitest defaults `sequence.hooks` to `stack`, so these later hooks run first. The daemon config does not override that default. Vitest's `callSuiteHook` awaits each hook without catching failures inside the loop.

If a test fails or times out after launching gated work but before reaching the local release `finally`, the later teardown waits on that held work. The helper hook that could release it is never reached before the hook timeout, and a hook rejection also prevents subsequent hooks in that suite from running. A concrete heartbeat path is failure of the queued-receipt assertion at line 214 before the `try` at line 217. Route failures before `finishHeldChatTurn` can do the same. A rejected background promise in the later hook also bypasses the helper's restore even without a gate. Fastify's close `finally` does not run until its preceding drain settles, so it does not repair the held-gate case.

Requested correction: give a single cleanup operation ownership of releasing gates, draining, restoring the spy, and then closing apps/shutting down services, or otherwise guarantee release runs before every teardown drain and restore runs even when drain rejects. Add a failure-path test with work held and an assertion failure before the finish helper, plus a rejected-work cleanup test. Verify cleanup completes without hook timeout, pending work, leaked spies, or open apps.

### P2: Promise settlement alone does not reject service-caught execution and cleanup errors

Locations: `packages/daemon/src/__tests__/helpers/async-work.ts:71-82`, `heartbeat-integration.test.ts:52-67,230-240`, and `chats-routes.test.ts:330-333`.

The helper correctly records rejected promises, and its rejection unit test is useful. However, the actual services intentionally catch some failures and resolve their promises. `HeartbeatService.executeRun` catches execution failures and calls `failRun` at service lines 920-925. It catches event-flush and task-lock-release errors at 933-953 and 983-997, logging them through optional logger/errorLogger instances. These tests install neither logger. Consequently, a late cleanup error can leave the run succeeded, resolve the captured promise, and pass every existing assertion. The generic Worker test delays cleanup but does not exercise this swallowed-error path. This misses the diagnosis's explicit requirement to capture and reject cleanup/connection-ended errors.

The coalescing test also never verifies the first run's final successful state after release, or the third wake's final state. Its new-after-completion check can therefore pass after an execution failure that the service converts into a failed row. Similarly, the route approval follow-up ends with only `work.drain()`, while `ChatService.runAssistantTurn` catches failures, stores an error row, broadcasts an error, and resolves at service lines 451-477. A failed follow-up is not rejected by that drain.

Requested correction: install test-owned logger/errorLogger observers and reject unexpected cleanup/error records after draining. Assert the expected successful persisted run/assistant state for these happy-path operations, including the route approval follow-up. Add a deliberate late-cleanup error probe proving that the observer fails even when the real service promise resolves. No production behavior change is needed.

## What complies

- Tracked changes are confined to four test files. The two new files are test infrastructure/tests. There are no production changes, fixed sleeps, skipped tests, or relaxed queued/coalesced alternatives in the reviewed diff.
- Existing content, card, role, session-key, adapter-call, and HTTP assertions are retained. Additional complete-status checks do not replace those assertions.
- The wrapper invokes the original method with its real receiver and arguments and returns the original promise. Prototype interception covers all instances. The drain loop rechecks for work spawned during execution cleanup.
- Replay gates independently hold the initial and approval-follow-up adapter calls. The helper checks empty streaming state and that drain has not resolved, then releases and awaits real method settlement before checking completion.
- The chat ingestion and route approval targets have controlled adapter gates rather than timing delays.
- Coalescing holds a real configured adapter, checks exactly one running row with the original run ID and one adapter call, releases in the local finally, and checks no extra adapter execution after settlement. `wake2.runId === null` matches `enqueueGeneralWakeup`, which records a coalesced receipt without a run ID at service lines 341-342. It must not be changed to the original run ID.
- Normal successful teardown drains captured work before the next test deletes tables or afterAll closes SQL. The hook-order finding concerns failed/test-timeout cleanup rather than that normal path.

## Remaining acceptance scope

This is not certification of the diagnosis's broader exit-propagation repair, 100-repeat normal/constrained runs, full uncached workflow, or remote artifact checks. Those are outside this test-only review. The missing cleanup/error-observation coverage above is directly within the requested async-test scope.
