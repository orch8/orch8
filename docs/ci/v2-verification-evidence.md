# v2 verification evidence

## Scope

Based on freshly fetched `origin/v2`, commit `26c83ab38f363a7c0a1a90f57684fb825731c2c1`, in worktree `/home/hermes/projects/orch8-v2-ci`, branch `ci/v2-verification`. Only the workflow and these evidence documents change. No push, PR, merge, or main branch operation was performed.

## Local results

Environment: non-root Linux user `hermes`, UID 1000, Node `v22.22.2`, pnpm `9.15.0`. Embedded Postgres started and stopped during the real daemon test suite. No provider credentials or paid provider runs were added.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0, lockfile unchanged |
| `pnpm build` | Exit 0, existing dashboard chunk-size warning |
| `pnpm typecheck` | Exit 0 |
| `pnpm lint` | Exit 0 |
| Uncached tests with JSON reporters, first report-enabled run | Exit 0, 1,225 tests passed across 166 files |
| Final exact workflow shell steps | Environment, install, build, typecheck, lint exit 0; test step exit 1 |
| `actionlint` 1.7.12 | Exit 0 after final workflow validation |
| Report-validator negative checks | A modified failed report and a missing report each exit 1 in an isolated temporary directory |
| `git diff --check` | Exit 0 |

The first passing report-enabled run recorded CLI 4, shared 180, dashboard 276, and daemon 765 passing tests. The final run had one daemon failure, with 764 daemon tests passing. The final workflow caught that failure through report validation.

### Existing intermittent failure and false-green prevention

`packages/daemon/src/__tests__/chat-message-replay.test.ts:106` intermittently fails in `replays user → confirm card → approve → result card in order`:

```text
AssertionError: expected [] to have a length of 1 but got +0
```

The initial uncached run printed this failure but exited 0, and Turbo reported all four tasks successful. The root cause of that exit behavior was not established. The workflow therefore checks JSON reports as well as shell exit status. It rejects failed, missing, empty, or skipped results and deletes old reports before execution. The final run reproduced the assertion and the report validator correctly returned 1. Application code and tests remain untouched; this intermittent failure needs a separate fix before v2 can be described as consistently green.

During implementation, `pnpm test --force` was rejected by pnpm itself. The final command uses `pnpm run test --force -- --reporter=default --reporter=json --outputFile=vitest-results.json`, verified in real execution. Actionlint also caught an unsupported job-level `runner.temp` expression; the final workflow initializes the log path through `GITHUB_ENV` instead.

## Attached proof

[Local logs and final JSON reports](evidence/v2-verification-local.tar.gz) include the initial false-green output, the passing report-enabled test output, final exact-shell-step logs, command statuses, and final per-workspace reports. Paths inside the archive distinguish earlier runs from the final run. These are actual local outputs, not a GitHub artifact.

## Review correction and remote evidence

The independent specification review found that missing or string-valued test counts could pass JavaScript comparisons. The guard now requires nonnegative safe integers for all four count fields, a positive total, all tests passed and zero failures. `python docs/ci/test-report-guard.py` executes the exact inline Node guard with 11 explicitly synthetic cases: valid, failed, empty, skipped, missing counts, numeric strings, negative counts, fractional counts, null counts, missing file and malformed JSON. All 11 produced the expected accept/reject exit. The Python harness requires PyYAML and Node; it is a local verifier, not an application-test result.

The first remote run, https://github.com/orch8/orch8/actions/runs/41548331556, passed environment/install/build/typecheck/lint and successfully uploaded artifacts. The test guard failed on three daemon assertions. Downloaded reports show 762 daemon tests passed and 3 failed; other packages passed. This establishes remote event/action/artifact execution, not green CI. A separate branch is fixing the independently diagnosed asynchronous test synchronization defects; no test is skipped or weakened here.

## Action pins and remote limits

The action SHAs in the workflow were retrieved with `git ls-remote` against the upstream repositories' `refs/tags/v4`:

- `actions/checkout`: `11d5960a326750d5838078e36cf38b85af677262`
- `pnpm/action-setup`: `f40ffcd9367d9f12939873eb1018b921a783ffaa`
- `actions/setup-node`: `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/upload-artifact`: `ea165f8d65b6e75b540449e92b4886f43607fa02`

The initial YAML passed actionlint, and its shell steps were executed locally using Bash `-eo pipefail`. The first remote run subsequently verified GitHub event dispatch, action execution and artifact upload, but failed the test gate as detailed above. Any PR must target `v2`; inspect the latest actual Actions result and download its reports before claiming CI passed.
