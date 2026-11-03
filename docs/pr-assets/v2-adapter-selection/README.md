# Adapter-selection evidence

This directory preserves the original implementation and independent-review evidence for the fail-closed resolver change. No source changes were made during packaging. All three source SHA-256 values matched both `source-manifest.json` and the independent review before packaging.

`manifest.json` lists each original artifact, its uncompressed SHA-256 and its committed-byte SHA-256. Logs, test reports, and the implementation diff are gzip-compressed without altering their original bytes. Read with `gzip -dc <file.gz>`. Markdown reports, the probe script, source hashes, and the validated result summary remain directly readable.

## Results and retained failures

- Final full-suite reports contain 1,270 passing assertions across daemon, shared, dashboard, and CLI. Packaging independently checked each file and assertion status and the report counts.
- Independent focused verification passed 35 assertions. Corrected heartbeat/chat compatibility verification passed 54 assertions.
- `red.json.gz` and `red.log.gz` preserve the expected pre-fix failures. A zero shell exit was not treated as passing evidence.
- `typecheck.log.gz` preserves the initial test-helper typing failure. `typecheck-fixed.log.gz` is the final successful run.
- `independent-compatibility.json.gz` and its log preserve an incomplete invocation with the wrong heartbeat filter. Only `independent-compatibility-corrected.json.gz` establishes both heartbeat and chat compatibility.
- Forced build, final typecheck and focused lint succeeded as recorded in `report.md`. No paid provider calls were made.

## Review and limits

`independent-review.md` records spec PASS and quality approval with non-blocking follow-ups. Its more precise findings take precedence over the implementation report's claim that the null chat message ID was tested: that field was established by source inspection, not an explicit test assertion.

Unsupported chat selection broadcasts an error before an assistant/run placeholder exists. The current dashboard does not display that error text, and no durable failed assistant/run row survives reload. This is a known non-blocking UI/persistence gap, not a claim of complete chat failure UX. Persisted-state and message-ID assertions remain follow-up work.

The change only addresses adapter selection. Cancellation, permission policy, and new provider certification are outside this PR. Remote CI evidence is recorded separately in the PR delivery report after this commit, so the packaged local evidence does not claim remote CI success.
