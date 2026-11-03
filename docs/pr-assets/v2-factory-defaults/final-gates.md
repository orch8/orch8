# Factory-defaults final gates

PASS for fresh tests, typecheck, lint and build on the source tree identified below. The first daemon attempt failed environmentally despite exit zero; its full retry passed. This report does not certify browser acceptance or authorize merge.

## Source binding

- Worktree: `/home/hermes/projects/orch8-factory-defaults`
- Branch: `feat/v2-factory-defaults`
- HEAD: `87267e7df8d9c28568c3ed880899221c850018b6`
- SHA-256 of sorted source-path/hash manifest: `169011e51f75ce35ef33ee4188e0e5f1d2fec8c28e400dc4a8398893d7117923`
- `factory-reconciled/source-before.json` and `source-after.json` contain per-file SHA-256 hashes for all tracked and nonignored untracked files. They are identical. The validator checked the same hashes again after the daemon retry. Ignored build outputs are not part of this source manifest.
- Tracked patches and dirty status are preserved as `diff-before.patch`, `diff-after.patch`, `status-before.txt` and `status-after.txt`. No application or test sources were modified by this verification.

## Fresh full test results

| Package | Files | Assertions passed | Report |
| --- | ---: | ---: | --- |
| shared | 8 | 180/180 | `shared.json` |
| cli | 1 | 4/4 | `cli.json` |
| daemon | 97 | 773/773 | `daemon-tmpfs.json` |
| dashboard | 63 | 278/278 | `dashboard.json` |

Total: 1235 passing assertions in 169 files across all four packages. Zero skipped, todo or failed assertions in the final reports. `validate.py` checks success flags, failed-suite counters, every file status and assertion status/failure message, snapshot status, aggregate counts and exact correspondence to all source test/spec files. `validation.json` records per-file assertion counts.

Tests ran directly through each package Vitest command instead of Turbo test caching. All gates ran serially and Vitest used one worker. Typecheck and build used `--force --concurrency=1` to execute uncached, serial package tasks.

## Commands and actual exits

| Gate | Exit | Seconds | Command |
| --- | ---: | ---: | --- |
| test-shared | 0 | 3.087 | `pnpm --filter @orch/shared exec vitest run --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=/home/hermes/orch8-evidence/factory-reconciled/shared.json` |
| test-cli | 0 | 1.221 | `pnpm --filter @orch/cli exec vitest run --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=/home/hermes/orch8-evidence/factory-reconciled/cli.json` |
| test-daemon | 0 | 90.959 | `pnpm --filter @orch/daemon exec vitest run --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=/home/hermes/orch8-evidence/factory-reconciled/daemon.json` |
| test-dashboard | 0 | 56.044 | `pnpm --filter @orch/dashboard exec vitest run --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=/home/hermes/orch8-evidence/factory-reconciled/dashboard.json` |
| typecheck | 0 | 32.235 | `pnpm exec turbo run typecheck --concurrency=1 --force` |
| lint | 0 | 19.213 | `pnpm lint` |
| build | 0 | 27.887 | `pnpm exec turbo run build --concurrency=1 --force` |
| test-daemon-tmpfs | 0 | 79.344 | `pnpm --filter @orch/daemon exec vitest run --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=/home/hermes/orch8-evidence/factory-reconciled/daemon-tmpfs.json` |

Exact UTC starts, commands and subprocess return codes are in `gates.json` and `daemon-retry-gate.json`. Each gate has its own log. All paths in this report refer to `/home/hermes/orch8-evidence/factory-reconciled/` unless absolute.

## Failure preserved and resolved without code changes

- Initial `daemon.json` has `success:false`, 765 passed and eight skipped assertions, and one failed file. Its suite counter reports two failed suites. `test-daemon.log:1048-1064` shows PostgreSQL ENOSPC during pipeline-routes setup, followed by teardown reading `close` on an uninitialized app. The actual process exit was zero, reproducing the known false-green problem. This report does not count that attempt as passing.
- Filesystem inspection found the root filesystem at 100% usage with only 286 MiB available; `/dev/shm` had 1.9 GiB free. The retry used an isolated `TMPDIR=/dev/shm/factory-reconciled-z4u_al6u` so the existing test setup placed temporary PostgreSQL storage there. No shared files were deleted and no tests were weakened. The full daemon retry passed all 773 assertions in 97 files. The temporary directory was cleaned after execution.
- Typecheck completed all four tasks successfully with zero cached tasks, resolving the earlier ambiguous interrupted log. Lint exited zero with 66 warnings and zero errors. Build completed both defined tasks, CLI and dashboard, with zero cached tasks. Shared and daemon define no build script. Dashboard emitted a nonfatal chunk-size warning.

## Provenance and limits

- These reports supersede the stale dashboard 276/277 and ambiguous typecheck evidence for gate claims. Historical red reports remain untouched. The fresh dashboard result is 278/278, including the final mobile regression and Board redirect expectation.
- Browser/keyboard acceptance is owned by the concurrent reviewer and was not rerun here. This report makes no claim that those separate acceptance gaps are closed.
- No commits, pushes, merges, main-branch edits, source fixes or scope expansion were made. Build products and tooling caches were generated normally. Root filesystem capacity remains an environment risk for future runs using default `/tmp`.
