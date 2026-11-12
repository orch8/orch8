# Cancel a failed feature attempt

In an isolated Orch8 daemon and disposable Git checkout, a deliberately synthetic failed pipeline was added to the disposable database to exercise the recovery UI. This was not an agent execution. The live browser opened its workflow, showed the new **Cancel failed workflow** action and confirmation, accepted it, then observed the pipeline as `cancelled` in the API and History. The chooser then enabled **Continue to plan setup** because the checkout was clean on `main` and no active workflow remained. Browser page errors: none.

- [Failed workflow detail before cancellation](failed-workflow-cancel-before.png)
- [Chooser after cancellation](failed-workflow-cancel-after.png)
- [Cancelled attempt in History](failed-workflow-history.png)

This run did not produce a real plan, code change, independent agent review, test log or PR from Orch8. On this host, Codex's `workspace-write` sandbox cannot initialize its network namespace, and Claude Code returned OAuth 401. Neither permission boundary was bypassed.
