# Pipeline approval safety

Base: v2 at 2de07076d3c604984a7865af0af3f04861211e98. Task branch: feat/v2-approval-safety. No push, PR, merge, or main changes.

## Verified findings

Approval currently reads a step by ID alone and performs separate writes without a transaction. Rejection validates outside its transaction and permits terminal pipelines. Both HTTP decision routes accept authenticated agents without checking isAdmin. Existing tests use real PostgreSQL and provide write-failure injection.

## Files and steps

1. Add packages/daemon/src/__tests__/pipeline-approval-safety.test.ts. Exercise real services/database and HTTP authentication. Save failing output before implementation.
2. Change packages/daemon/src/api/routes/pipelines.ts. Require isAdmin before approve/reject validation or service calls. Preserve successful response objects, existing 400 invalid-step behavior, and 404 missing relationships. Return 400 for inactive pipelines.
3. Change packages/daemon/src/services/pipeline.service.ts. Lock the pipeline row first inside each decision transaction, accept only pending/running pipelines, and select the decision step within that pipeline. Lock the decision step before validating approval state. Keep approval, successor task allocation, pipeline movement and backlink atomic. Move rejection relationship/order validation inside its transaction, using the same lock order. Keep rejection's existing ability to reject a pending review step.
4. Run new and existing pipeline, route, task, dispatch/auth tests, full daemon tests, workspace typecheck and lint. Save actual command output in docs/pr-assets/v2-approval-safety/. Document failures and limits; commit only this branch.

## Acceptance tests

- Agent Bearer tokens receive 403 for approve and reject, even with localhost admin enabled; no mutations or wakeups. Admin succeeds. Unauthenticated requests receive 401.
- Approve and reject refuse completed, failed, and cancelled pipelines without changing rows or tasks.
- Approve refuses a foreign step or missing pipeline; reject refuses foreign rejecting/target steps. No mutation on failure.
- Concurrent approval requests yield one success and one successor task; subsequent approval fails without dispatching or creating a task.
- Inject failure at pipeline update, successor insert and backlink update. Approval must roll back all prior writes, including task ID allocation. Last-step approval also rolls back if pipeline update fails.
- Existing successful approval, terminal approval, skipped successor and rejection response contracts remain compatible.

## Limits

This scope does not make completion/retry transactional or add a durable dispatch outbox. Approval commit and heartbeat enqueue remain separate, so a crash can lose dispatch. No actor/artifact binding, sandbox, runner fencing, cancellation of live processes, or new factory abstraction. Pipeline row locking serializes approval/rejection decisions and conflicts with pipeline cancellation updates; other lifecycle paths need a separate concurrency audit. Independent spec and quality review belong to the parent after implementation.
