# Agents skill — example flows

## Example 1: "Create a QA agent that runs every 6 hours"

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
    "systemPrompt": "You are a QA agent for this project. On each wakeup, scan recent commits for new test gaps and create tasks for the gaps you find."
  }
}
```

After approval, call `POST /api/agents` with the same payload, then:

```orch8-card
{
  "kind": "result_create_agent",
  "summary": "Created agent agent_qa-bot",
  "payload": { "agentId": "qa-bot", "name": "QA Bot" }
}
```

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
