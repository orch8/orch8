# v2 async-test reliability evidence

## Scope

This patch changes six daemon test/helper files only. It holds adapters with deferred promises, verifies incomplete chat rows before release, drains actual service execution before teardown, and makes one cleanup operation own release, drain, restoration, and resource closure. It checks successful persisted outcomes and observes swallowed late-cleanup errors. Existing assertions remain intact.

No production code, dependency, CI workflow, or main-branch changes are included. CI PR #5 is separate. The known Vitest false-green process-exit defect is **not fixed** by this patch. Test verdicts below come from parsed JSON, not shell status alone.

Base revision: `26c83ab38f363a7c0a1a90f57684fb825731c2c1`. [manifest.json](manifest.json) records hashes of the six reviewed sources and every archived artifact. Compressed files preserve the actual source bytes. Absolute paths and timestamps in raw reports refer to the local verification environment.

## Results

| Check | Result |
| --- | --- |
| Full suite, fresh forced execution by parent agent | 1,230 passed, 0 failed, 0 pending |
| Shared | 180 passed |
| Daemon | 770 passed |
| Dashboard | 276 passed |
| CLI | 4 passed |
| Focused repeat checks, default scheduling | 3 runs, each 33 passed across 5 files |
| Focused repeat checks, one worker and no file parallelism | 3 runs, each 33 passed across 5 files |
| Build, forced | Exit 0, 2 tasks successful |
| Typecheck, forced | Exit 0, 4 tasks successful |
| Lint | Exit 0, 0 errors, 69 warnings |
| Independent final specification and quality review | PASS |

Build reports a dashboard chunk-size warning. Lint warnings are retained in the raw log, not suppressed. These local gates do not establish remote CI success or a 100-repeat stress campaign. Single-worker runs constrain Vitest scheduling, not host CPU affinity.

The packaging pass reparsed all four full-suite reports, checked expected counts and every assertion/file status, then ran build, typecheck, lint, and all six fresh focused repeats. [verification/gates.json](verification/gates.json) records exact commands, working directories, exit codes, timing, and report hashes. [verification/full-validation.json](verification/full-validation.json) records the supplied full-suite reports' validation. The original full-suite command was:

```sh
pnpm exec turbo run test --force -- --reporter=json --outputFile=vitest-review-final.json
```

The focused file set is `async-work.test.ts`, `heartbeat-integration.test.ts`, `chats-routes.test.ts`, `chat-message-replay.test.ts`, and `chat.service.test.ts`. Commands run from `packages/daemon`. Single-worker checks add `--maxWorkers=1 --no-file-parallelism`.

## Evidence map

- [Full-suite log](full-suite/test.log.gz) and package reports: [shared](full-suite/shared.json.gz), [daemon](full-suite/daemon.json.gz), [dashboard](full-suite/dashboard.json.gz), [CLI](full-suite/cli.json.gz).
- [Build log](verification/build.log.gz), [typecheck log](verification/typecheck.log.gz), [lint log](verification/lint.log.gz).
- `verification/focused-*.json.gz` and matching logs contain six repeated runs.
- [Independent final review](reviews/reliability-final-review.md) provides the final PASS verdict and limitations.
- [Review fixes](reviews/reliability-review-fixes.md) documents the cleanup and swallowed-error corrections.
- [Original specification review](reviews/reliability-spec-review.md) retains historical findings, superseded by the final review.
- `review-evidence/` retains independent execution, implementer red/green runs, and deliberate negative-control reports. Failed negative controls are expected sensitivity evidence, not failures of the final sources. They are not part of test discovery.
- [Verification driver](verification/package-reliability-gates.py) records how the packaging checks ran. Its absolute paths are environment-specific, not a portable CI entrypoint.

Historical review documents accurately state what their authors did at that time. Their statements that full-suite/repeat checks were not performed apply to those review passes, not the later packaging verification above. Negative controls were archived from the implementer's runs and were not rerun during packaging.

To inspect a report without altering the archive:

```sh
gzip -dc docs/pr-assets/v2-test-reliability/full-suite/daemon.json.gz | python3 -m json.tool
```

No merge is authorized. Actual database-disconnection injection, arbitrary runner-cancellation behavior, dependency exit-propagation repair, and remote CI verification remain outside this test-only patch.
