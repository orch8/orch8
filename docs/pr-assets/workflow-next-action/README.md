# Live product check

The screenshots were captured in Chromium from the running dashboard and daemon on a disposable local repository. `live-repository.png` shows the repository opened through the dashboard. `live-runtime-blocked.png` shows the real Codex runtime check failing on this host. The branch was not prepared, no plan or implementation agent ran, and no PR was published. The screenshots do **not** demonstrate the new next-action link because the runtime gate prevented a workflow from reaching an approval decision.

The new link was exercised in dashboard component tests for plan approval, independent review, draft PR publication, and cancelled workflow states. It navigates to existing page sections; it does not approve or publish anything.
