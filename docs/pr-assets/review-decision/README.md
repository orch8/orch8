# Live host evidence

`host-runtime-blocker.png` was captured from a running Orch8 daemon and dashboard on 2026-11-04 using a disposable local repository and three configured Codex agents. The browser submitted the actual "Check agent runtime" action. Codex's sandbox preflight returned `Failed RTM_NEWADDR: Operation not permitted`, and the dashboard kept "Start with a plan" disabled. This is not evidence that any coding agent ran or that an end-to-end feature/PR completed.

The change in this PR is the review decision UI. Its behavior is covered by component tests; the screenshot records the concrete host blocker encountered while attempting the full product journey, not a screenshot of a completed review.
