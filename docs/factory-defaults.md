# Factory-first defaults

Project setup follows one explicit path: Welcome, Project, Agents, First Task. Adding another project omits Welcome. Agents and the first task are optional. The onboarding picker offers only implementer and reviewer, with neither selected initially. The ordinary agent editor and bundled-agent API still expose the full catalog, including CTO and QA and their existing heartbeat settings.

The first task remains an unassigned quick task. Setup does not dispatch it or start a pipeline. The existing Standard Dev Flow is unchanged. Role names do not establish independent verification or permission to publish.

## Navigation

| Entry | New default | Retained access |
| --- | --- | --- |
| Project root | Board | Explicit Chat URLs still open Chat |
| Chat and Briefing | More disclosure | Original labels, URLs and history |
| Memory | More disclosure | Original URLs, entities and facts |

More is closed on Board, opens on Chat, Briefing and Memory deep links, and supports keyboard activation and collapsed sidebar navigation. Project switching continues to preserve an explicitly selected route suffix. WORK, SETUP, MONITOR, notifications and daemon status remain available.

## Compatibility and migration

There is no database migration, data deletion, renamed identifier, persisted mode or timestamp cutoff. Existing chats and messages, memory, summaries, comments, agents, projects, pipeline templates, runs and artifacts remain in place. Existing filesystem instructions and skill-copy protections are unchanged.

Project creation and startup no longer create an empty Welcome chat. The default chat agent is still provisioned and repaired at startup. Explicitly visiting Chat may create a conversation under its existing behavior. Existing Welcome chats remain. Existing skill and permission reconciliation still runs, so this change does not promise byte-identical agent records after startup.

Chat, memory, briefing and other APIs remain supported. Task-local comments retain their notify toggle and assignee/mention wakeups, without requiring generic Chat. Pipeline approval policy and transitions are unchanged.

Existing CTO/QA agents keep their configured heartbeats. Users can explicitly pause or configure them. This change does not disable background work in existing projects. Fresh-default idle checks apply only when no work or heartbeat-enabled agents have been explicitly configured.

## Known limitation and rollback

If project creation succeeds but adding agents or the first task fails, the wizard shows the failure. Retrying may encounter a duplicate slug because the project already exists. This existing partial-setup limitation needs a separate resume/idempotency change.

Reverting the code restores the previous onboarding and navigation. A restart under the old code may recreate an empty Welcome chat. No data rollback is required.

## Verification

See `docs/pr-assets/v2-factory-defaults/README.md` for the review evidence location and limits. Tests use disposable databases/homes and browser fixtures block provider execution. No live user database or paid agent is needed.
