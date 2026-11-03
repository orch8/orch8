# Heartbeat isolation evidence

Only `packages/daemon/src/__tests__/heartbeat.service.test.ts` changes executable source. `source.json.gz` and `manifest.json` bind evidence to the reviewed source SHA-256 and base commit. Logs and JSON are gzip-compressed original bytes; the manifest includes original and stored hashes.

Independent review: spec PASS, quality APPROVE. Read `independent-review.md` for review limits and non-blocking notes. `report.md` is the original implementation report; the independent review corrects its incomplete characterization of background database errors.

Validated local evidence includes five 49-test heartbeat runs, a 775-test daemon run across 97 files, an independent 77-test run across six files, the four-test async-work helper run, and the separate eight-test pipeline-routes reproduction. Every final test assertion and file status was parsed, not inferred from process exit. Red and no-cleanup mutation reports contain one and two expected failures respectively. Typecheck and changed-file lint passed. Build and workspace-wide gates are checked by remote CI.

The unchanged pipeline-routes fixture has a separately reproduced post-close database-access leak. Passing daemon assertions do not establish globally clean asynchronous teardown. This test-only change does not modify production shutdown.

`validate.py` and `independent-validate.py` preserve the original commands and validation logic. Their absolute paths describe the original verification environment.
