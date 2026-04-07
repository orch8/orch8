---
name: cost-and-budget
description: >
  View orch8 spend, set or update budgets at the project or agent level,
  and view budget alerts. Use when the user asks how much they've spent,
  wants a cost breakdown, or wants to set/raise/lower a budget. Do NOT
  use for ad-hoc agent config (use the `agents` skill); budgets are a
  cross-cutting concern with their own endpoints.
---

# Cost & Budget Skill

orch8 tracks spend per agent and per project. Budgets are soft caps —
when an agent exceeds its budget, it can be auto-paused depending on
the agent's `autoPauseThreshold`. Project-level spend is the sum of
all agent spend.

## Endpoints

| Action | Method | Endpoint |
|---|---|---|
| Get project cost summary | GET | `/api/cost?projectId={id}` |
| Get cost over time | GET | `/api/cost/timeseries?projectId={id}&period={day|week|month}` |
| Get agent budget status | GET | `/api/agents/{agentId}` (look at `budgetLimitUsd`, `budgetSpentUsd`, `budgetPaused`) |
| Set agent budget | PATCH | `/api/agents/{agentId}` (set `budgetLimitUsd` + optionally `autoPauseThreshold`) |
| Set project budget | PATCH | `/api/projects/{projectId}` (set `budgetLimitUsd`) |

## Card kinds

| Kind | Buttons | Payload essentials |
|---|---|---|
| `confirm_set_budget` | Approve / Cancel | `scope: "agent"|"project"`, `entityId`, `current`, `proposed` |
| `info_cost_summary` | none | `projectId`, `totalSpentUsd`, `byAgent: { agentId, name, spentUsd }[]` |
| `info_budget_status` | none | `entries: { entityId, name, limitUsd, spentUsd, percentUsed, paused }[]` |
| `result_set_budget` | Open | `entityId`, `newLimitUsd` |

## Common flows

### "How much have we spent this week?"

```orch8-card
{
  "kind": "info_cost_summary",
  "summary": "$12.43 spent this week (4 agents)",
  "payload": {
    "projectId": "proj_abc",
    "totalSpentUsd": 12.43,
    "period": "week",
    "byAgent": [
      { "agentId": "engineer", "name": "Engineer", "spentUsd": 7.20 },
      { "agentId": "qa-bot", "name": "QA Bot", "spentUsd": 3.10 },
      { "agentId": "chat", "name": "Project Chat", "spentUsd": 1.95 },
      { "agentId": "cost-watcher", "name": "Cost Watcher", "spentUsd": 0.18 }
    ]
  }
}
```

### "Set qa-bot's budget to $5"

```orch8-card
{
  "kind": "confirm_set_budget",
  "summary": "Set qa-bot budget to $5.00",
  "payload": {
    "scope": "agent",
    "entityId": "qa-bot",
    "current": { "budgetLimitUsd": null, "budgetSpentUsd": 3.10 },
    "proposed": { "budgetLimitUsd": 5.00 }
  }
}
```

### Bootstrap problem

The chat agent itself has a budget. If you yourself are running out
of budget, you may not be able to call the cost API anymore. The
user will see a "budget exceeded" error and must raise the chat
agent's budget via the dashboard.

For card emission rules, see the `_card-protocol` skill.
