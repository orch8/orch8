---
name: agents
description: >
  Manage orch8 agents: create new agents, edit their config (name, model,
  system prompt, skills, tools, budget, heartbeat), pause and resume them,
  delete them. Use when the user wants to add a new agent, change how an
  existing agent works, or take an agent offline. Do NOT use for runs (use
  the `runs` skill) or for assigning tasks to agents (use the `tasks` skill).
---

# Agents Skill

Agents are the workers in orch8. Each agent has a model, a system prompt,
a set of allowed tools, a list of skills it loads on every turn, and
optional heartbeat / budget configuration. This skill teaches the chat
agent how to manage them.

## Endpoints

| Action | Method | Endpoint |
|---|---|---|
| List agents | GET | `/api/agents?projectId={id}` |
| Get agent | GET | `/api/agents/{agentId}` |
| Create agent | POST | `/api/agents` |
| Update agent | PATCH | `/api/agents/{agentId}` |
| Pause agent | POST | `/api/agents/{agentId}/pause` |
| Resume agent | POST | `/api/agents/{agentId}/resume` |
| Delete agent | DELETE | `/api/agents/{agentId}` |
| Clone agent | POST | `/api/agents/{agentId}/clone` |

See the `orch8` skill for the full request body shapes.

## Card kinds

| Kind | Buttons | Payload essentials |
|---|---|---|
| `confirm_create_agent` | Approve / Cancel | full agent config (`id`, `name`, `role`, `model`, `effort?`, `maxTurns?`, `heartbeatEnabled?`, `desiredSkills?`, `allowedTools?`, `systemPrompt?`, `budgetLimitUsd?`) |
| `confirm_update_agent` | Approve / Cancel | `agentId`, `current`, `proposed` |
| `confirm_pause_agent` | Approve / Cancel | `agentId`, `name`, `reason?` |
| `confirm_resume_agent` | Approve / Cancel | `agentId`, `name` |
| `confirm_delete_agent` | Approve / Cancel | `agentId`, `name` |
| `info_agent_list` | none | `agents: AgentSummary[]` |
| `info_agent_detail` | none | full agent object |
| `result_create_agent` | Open | `agentId`, `name` |
| `result_update_agent` | Open | `agentId`, `fieldsChanged` |
| `result_pause_agent` | none | `agentId`, `name` |
| `result_resume_agent` | none | `agentId`, `name` |
| `result_delete_agent` | none | `agentId`, `name` |

## Required and optional fields

When creating an agent the user must give you, or you must propose
sensible defaults for:

- `id` — short slug, lowercase, e.g. `qa-bot`. Required.
- `name` — display name, e.g. `"QA Bot"`. Required.
- `role` — one of `cto`, `engineer`, `qa`, `researcher`, `planner`,
  `implementer`, `reviewer`, `verifier`, `referee`, `custom`. Default
  to `custom` if unsure.
- `model` — `claude-opus-4-6` (default), `claude-sonnet-4-6`, or
  `claude-haiku-4-5-20251001`. Sonnet is the right pick for most agents.
- `maxTurns` — usually 25.
- `heartbeatEnabled` + `heartbeatIntervalSec` — only if the user wants
  the agent to wake up on a timer. The interval is in seconds.
- `desiredSkills` — list of skill slugs to load. Default to none unless
  the user names specific skills.
- `allowedTools` — usually `["Bash","Read","Edit","Write","Grep","Glob"]`.
  Restrict only if the user explicitly wants a locked-down agent.
- `systemPrompt` — propose one if the user doesn't supply one.

If the user gives you a vague request ("create a QA agent that runs
every 6 hours"), propose a reasonable config and emit the confirm card.
Do not pepper them with questions about every field — they can edit
the proposal in the dashboard.

## Diff display for updates

For `confirm_update_agent` cards, ALWAYS include both `current` and
`proposed` so the dashboard can render a clear diff. Even unchanged
fields can stay in both objects — the dashboard hides those.

## Pause vs delete

Pausing an agent stops it from running but keeps the row. Deleting
removes it entirely. When the user says "stop X" without specifying,
default to pause and ask if they want to delete. Pausing is reversible.

For more example flows, see `examples.md` in this skill directory.

For card emission rules, see the `_card-protocol` skill.
