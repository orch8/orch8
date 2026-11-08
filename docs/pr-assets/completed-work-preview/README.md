# Completed-work navigation UI preview

These screenshots were captured from the live local dashboard at `http://localhost:5173`. The browser intercepted the pipeline-list response and added a clearly named **sample completed feature (UI preview only)** to exercise the new chooser and active-page links. No agent run, review, GitHub PR, or completed pipeline was created by this preview. The existing Factory demo pending workflows and repository data were loaded from the local daemon.

- `chooser-preview.png`: completed-work link on the repository chooser.
- `active-preview.png`: same link ahead of new feature intake.

The CLI runtime remains blocked on this host: Claude Code returns OAuth 401, and Codex's workspace-write sandbox cannot initialize. These screenshots prove only the navigation UI, not the end-to-end factory workflow.
