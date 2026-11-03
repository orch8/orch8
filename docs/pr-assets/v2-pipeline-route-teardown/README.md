# Pipeline route teardown evidence

Test-only fixture repair. The reviewed source SHA-256 and each compressed artifact's original-byte and compressed-byte hashes are in `manifest.json`. All 34 original evidence files are preserved byte-for-byte with deterministic gzip compression. Decompress with `gzip -dc <file.gz>`.

Independent review: spec PASS and quality PASS. Two fresh independent focused runs each passed all 83 tests across four files; typecheck passed. The author's three final focused runs also passed 83 tests each. The archived full daemon run passed 816 tests across 99 files.

The full daemon run is not diagnostically clean: three missing-relation startup errors and one skill-sync CONNECTION_ENDED diagnostic remain. See `full-log-analysis.json.gz`, `full-daemon.log.gz`, and the limitations in `independent-review.md.gz`. This repair does not change production shutdown contracts.

`report.md.gz` describes the implementation and evidence chronology. `independent-review.md.gz` records approval of the exact source hash. `red2.*.gz` and `observer-negative.*.gz` are accepted negative evidence. Earlier `red.*.gz`, `green1.*.gz`, and `focused-1.*.gz` are retained development history, not final passing evidence. Filtered negative tests intentionally have pending assertions.
