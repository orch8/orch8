# Agents skill — example flows

## Example 1: "Create a QA agent that runs every 6 hours"

After the brainstorm converges (Step 4), show the drafted markdown
to the user inline so they can tweak before approving:

````
Here's the AGENTS.md I'll ship with the QA bot:

```md
# QA Bot

You are the QA agent for this project. Your job is to catch
regressions before they land in main.

## Responsibilities
- On each heartbeat, read the last 24h of runs via GET /api/runs
  and flag any that failed unexpectedly.
- When a task in the `review` column has a failing CI signal, file
  a follow-up task for `engineer` with the reproduction steps.
- Do not modify production code. You may edit test files.

## Tools
Bash, Read, Grep, Glob. No Edit/Write outside `tests/**`.
```

And heartbeat.md:

```md
Every 6 hours: scan the last 24h of runs for regressions, and
summarize any newly-red tasks in a single comment on the
corresponding task.
```
````

Then emit the card with the drafts carried in the payload:

```orch8-card
{
  "kind": "confirm_create_agent",
  "summary": "Create QA agent qa-bot (sonnet, heartbeat 6h)",
  "payload": {
    "id": "qa-bot",
    "name": "QA Bot",
    "role": "qa",
    "model": "claude-sonnet-4-6",
    "maxTurns": 180,
    "heartbeatEnabled": true,
    "heartbeatIntervalSec": 21600,
    "allowedTools": ["Bash", "Read", "Edit", "Write", "Grep", "Glob"],
    "desiredSkills": [
      "orch8",
      "verification",
      "using-git-worktrees",
      "finishing-a-development-branch"
    ],
    "agentsMd": "# QA Bot\n\nYou are the QA agent for this project...",
    "heartbeatMd": "Every 6 hours: scan the last 24h of runs..."
  }
}
```

After approval, make TWO calls in order:

1. `POST /api/agents` with the config fields (everything EXCEPT
   `agentsMd` / `heartbeatMd`). This creates the agent row and seeds
   placeholder markdown on disk.
2. `PUT /api/agents/qa-bot/instructions` with
   `{ "agentsMd": "...", "heartbeatMd": "..." }` to overwrite the
   placeholders with the drafted content.

Only after BOTH succeed:

```orch8-card
{
  "kind": "result_create_agent",
  "summary": "Created agent agent_qa-bot",
  "payload": { "agentId": "qa-bot", "name": "QA Bot" }
}
```

If the POST succeeds but the PUT fails, emit `result_error` instead
with `endpoint: "/api/agents/qa-bot/instructions"` — the row exists
with placeholder instructions and the user needs to know.

## Example 2: "Increase the QA bot's max turns to 50"

```orch8-card
{
  "kind": "confirm_update_agent",
  "summary": "Update qa-bot maxTurns 180 → 250",
  "payload": {
    "agentId": "qa-bot",
    "current": { "maxTurns": 180 },
    "proposed": { "maxTurns": 250 }
  }
}
```

## Example 3: "Pause the cost-watcher agent"

```orch8-card
{
  "kind": "confirm_pause_agent",
  "summary": "Pause cost-watcher",
  "payload": { "agentId": "cost-watcher", "name": "Cost Watcher" }
}
```

## Example 4: List all agents

User: "What agents do we have?"

Call `GET /api/agents?projectId=$PROJECT_ID`:

```orch8-card
{
  "kind": "info_agent_list",
  "summary": "4 agents",
  "payload": {
    "agents": [
      { "id": "engineer", "name": "Engineer", "model": "claude-opus-4-7", "status": "active" },
      { "id": "qa-bot", "name": "QA Bot", "model": "claude-sonnet-4-6", "status": "active" },
      { "id": "cost-watcher", "name": "Cost Watcher", "model": "claude-haiku-4-5-20251001", "status": "paused" },
      { "id": "chat", "name": "Project Chat", "model": "claude-sonnet-4-6", "status": "active" }
    ]
  }
}
```
