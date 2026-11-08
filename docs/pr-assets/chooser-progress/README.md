# Repository chooser progress evidence

`live-pending-workflow.png` is a browser screenshot of the actual Vite dashboard connected to an isolated Orch8 daemon and embedded Postgres. In that isolated instance, a disposable local Git repository was registered through the API and a one-step pipeline was created without an agent. The card showed the recorded pending plan and its direct link; clicking the link opened the workflow detail, which showed no run recorded. This demonstrates navigation and live status retrieval, **not** agent execution, approval, tests, review, or PR publishing.

The independent code review flagged a missing error state for failed workflow-detail requests. That state and a regression test were added before publication.
