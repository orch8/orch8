# Task-route project authorization evidence

The independent review approves the four source hashes in `manifest.json` for narrow task-route project authorization. Packaging preserves those exact contents. The original implementation report predates approval; the later independent review supplies the approval.

Every `.gz` contains the actual, unchanged named report, log, review or diagnostic file. The manifest records uncompressed and compressed SHA-256 hashes. Use `gzip -dc <file>.gz` to inspect an artifact. `validate.py.gz` records the local assertion-level validator, not a repository test entrypoint.

## Executed checks

- Initial RED: 28 failed and 7 passed. Final tests replayed on unchanged v2: 29 failed and 7 passed.
- Targeted final GREEN: 43 passed. Compatibility: 113 passed. Full daemon: 859 passed.
- Independent runs: 78 and 35 passed. Disposable comparison-inversion mutation: 26 failed and 17 passed.
- JSON validators check enumerated assertion statuses and totals, not only shell exit. Vitest returned exit zero for failing negative controls.
- Packaging ran repository-wide `pnpm build`, `pnpm typecheck` and `pnpm lint`, all exit zero. Logs and exit results are archived here. Existing lint warnings are not claimed to be fixed.

## Scope and exclusions

Authorize task routes using the authenticated agent's persisted project and the persisted task owner project before task-specific reads or writes. Validate agent-supplied assignee and dependency references, scope lists and creation, and retain global admin behavior and existing capability checks.

This is not complete tenant isolation. Pipeline and comment route authorization remain open, including indirect task-state effects. Same-project body identity impersonation, unverified run headers, execution/assignee ownership, stale/exact-run checks and PATCH-column capability consistency remain excluded. Internal services are trusted; there is no new transactional ownership or reparenting guard. Allocator deadlocks, atomic progression, locking, broadcasts, durable wakeups and shutdown are not changed.

No merge or deployment is authorized by this evidence package. Remote CI results are recorded separately after the PR runs, rather than predicting results in this commit.
