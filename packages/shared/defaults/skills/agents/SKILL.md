---
name: agents
description: >
  Manage orch8 agents: create new agents, edit their config (name, model,
  skills, tools, budget, heartbeat), pause and resume them, delete them.
  Use when the user wants to add a new agent, change how an existing
  agent works, or take an agent offline. Do NOT use for runs (use the
  `runs` skill) or for assigning tasks to agents (use the `tasks` skill).
  Editing an agent's system prompt is handled through the Instructions
  tab / `PUT /api/agents/{id}/instructions`, not through this skill's
  confirm cards.
---

# Agents Skill

Agents are the workers in orch8. Each agent has a model, a set of
allowed tools, a list of skills it loads on every turn, and optional
heartbeat / budget configuration. Their system prompt lives on disk
(see "Instructions on disk" below) — not in the database or in this
skill's confirm-card payloads. This skill teaches the chat agent how
to manage them.

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
| `confirm_create_agent` | Approve / Cancel | full agent config (`id`, `name`, `role`, `model`, `effort?`, `maxTurns?`, `heartbeatEnabled?`, `desiredSkills?`, `allowedTools?`, `budgetLimitUsd?`) |
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

## Interactive brainstorm mode (for create only)

Creating an agent is the highest-stakes operation in this skill: you
are provisioning a new worker with its own budget, permissions, wake
schedule, and system prompt. Before emitting a `confirm_create_agent`
card, walk the user through a short structured brainstorm — one
clarifying question at a time — even when the initial request looks
concrete. One round of clarification is cheap insurance against
regret.

This mode is for CREATE only. For update / pause / resume / delete,
go straight to the appropriate confirm card as documented elsewhere
in this skill. Those operations are reversible (pause, update) or
low-stakes (a deleted agent can be re-added from a bundled template),
so the brainstorm overhead is not justified.

### Step 0 — Fetch live context

Before asking any brainstorm questions, silently fetch two pieces of
project context in parallel via Bash and curl:

1. `GET /api/bundled-agents` — returns the bundled template
   archetypes (`cto`, `implementer`, `planner`, `qa`, `researcher`,
   `reviewer`) with pre-wired model, skills, heartbeat, and effort
   presets. These are the starting points for any new agent: do NOT
   propose role config from scratch when a template matches.
2. `GET /api/agents?projectId=${ORCH_PROJECT_ID}` — returns the agents
   that already exist in this project, so the brainstorm can avoid
   duplication, populate `canAssignTo` with real IDs, and describe
   how the new agent complements the existing fleet.

```bash
curl -s "${ORCH_API_URL}/api/bundled-agents" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" &
curl -s "${ORCH_API_URL}/api/agents?projectId=${ORCH_PROJECT_ID}" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" &
wait
```

These fetches are internal reconnaissance. Do NOT emit an `info_*`
card for them — they exist only to inform the brainstorm.

### Step 1 — Restate and clarify

Restate the user's apparent goal in one sentence, then ask ONE
clarifying question at a time (multiple choice preferred), covering
these four dimensions in roughly this order:

1. **Purpose** — what problem does this agent solve? What is the
   one-sentence job description?
2. **Autonomy** — execute-only (only runs when assigned), or allowed
   to create tasks and assign to other agents?
3. **Wake trigger** — on assignment only, on a heartbeat timer, or
   on automation events? If heartbeat, how often?
4. **Model/budget tradeoff** — opus (deep, expensive), sonnet
   (balanced, default), or haiku (fast, cheap)?

**One question per message.** Three questions in a single message is
a failure mode. If the user's initial request already pins one of
these dimensions, skip it and move to the next. If all four are
already pinned, still ask one confirming question — pick the
dimension most at risk of regret (usually autonomy or budget) and
verify the user's choice before proposing a config. The minimum for
a create flow is always at least one clarifying round.

### Step 2 — Consider existing agents

Using the `GET /api/agents` result from Step 0:

- Flag any existing agent that overlaps with the proposed new one —
  matching on `role` enum (e.g., a `qa` agent already exists in the
  project) or on obvious purpose overlap visible in the existing
  agent's `name` / `role` — and ask whether the user wants to extend
  that agent instead of creating a new one.
- Propose `canAssignTo` values only from IDs that actually exist.
- Note in one line how the new agent complements the fleet.

### Step 3 — Propose 2-3 approaches

Once there is enough information to sketch options, lay out 2-3
configurations side by side in prose. Each option should start from
a bundled template where possible (e.g., "Option A: start from the
`qa` template, bump heartbeat to 2h, switch to sonnet"). List
trade-offs. Lead with the recommended option and explain why.

Still no card at this point. Brainstorming is for thought.

### Step 4 — Converge and emit the confirm card

When the user picks an option (or defers to the recommendation), stop
brainstorming and emit a single `confirm_create_agent` card with the
full config. If the chosen option started from a bundled template,
inherit every field from the template and override only what the
conversation specifically changed — never re-propose fields the
template already pins.

## Required and optional fields

The full `CreateAgentSchema` accepts these fields, grouped by concern.
For each one, propose a sensible default rather than pestering the
user about every field — and prefer inheriting from a bundled
template (fetched in Step 0 of the brainstorm) over proposing role
config from scratch.

**Identity**
- `id` — short slug, lowercase, e.g. `qa-bot`. Required.
- `projectId` — auto-filled from `ORCH_PROJECT_ID`. Do not ask.
- `name` — display name, e.g. `"QA Bot"`. Required.
- `role` — one of `cto`, `engineer`, `qa`, `researcher`, `planner`,
  `implementer`, `reviewer`, `verifier`, `referee`, `custom`. Default
  to `custom` if unsure.
- `icon` — optional emoji or icon identifier shown in the dashboard.
- `color` — optional hex color string for the dashboard chip.

**LLM config**
- `model` — `claude-opus-4-7` (recommended), `claude-sonnet-4-6`,
  or `claude-haiku-4-5-20251001`.
- `effort` — reasoning effort hint for models that support it
  (`low`, `medium`, `high`, `xhigh`, `max`). Bundled templates use `xhigh`.
- `maxTurns` — per-run turn budget. Usually 180.

> Agents no longer store prompts in the database. The system prompt
> lives in `<projectRoot>/.orch8/agents/<slug>/AGENTS.md` on disk, and
> the per-wake heartbeat brief lives in `heartbeat.md` next to it. To
> edit either one, use `PUT /api/agents/{id}/instructions` with an
> `agentsMd` and/or `heartbeatMd` body, or the Instructions tab in the
> dashboard. Do NOT try to set `systemPrompt`, `promptTemplate`,
> `bootstrapPromptTemplate`, or `instructionsFilePath` on a confirm
> card — those fields no longer exist.

**Tools & skills**
- `allowedTools` — usually `["Bash","Read","Edit","Write","Grep","Glob"]`.
  Restrict only if the user explicitly wants a locked-down agent.
- `mcpTools` — list of MCP tool IDs. Default to empty unless the user
  names specific MCP servers.
- `skillPaths` — raw filesystem skill paths. Rare and DB-only; prefer
  `desiredSkills`.
- `desiredSkills` — list of skill slugs to load on every turn. Default
  to none unless the user names specific skills, or inherit from the
  chosen bundled template.

**Wake triggers**
- `wakeOnAssignment` — wake when a task is assigned. Usually `true`.
- `wakeOnOnDemand` — allow manual `/wake` triggers. Usually `true`.
- `wakeOnAutomation` — wake on automation events (phase transitions,
  dependency unblocks). Usually `true`.
- `heartbeatEnabled` + `heartbeatIntervalSec` — only set if the user
  wants the agent to wake on a timer. The interval is in seconds.

**Concurrency**
- `maxConcurrentRuns` — how many runs of this agent can overlap.
  Default 1.
- `maxConcurrentTasks` — how many tasks this agent can own at once.
  Default 1.
- `maxConcurrentSubagents` — how many subagents this agent can spawn
  in parallel. Default 0.

**Permissions**
- `canCreateTasks` — whether this agent can create new tasks. Default
  `false` for execute-only agents.
- `canAssignTo` — list of agent IDs this agent may assign tasks to.
  Populate only from IDs that actually exist in the project (from
  the Step 0 fetch).
- `canMoveTo` — list of allowed task columns, drawn from: `backlog`,
  `blocked`, `in_progress`, `review`, `verification`, `done`.

**Budget**
- `budgetLimitUsd` — hard spending cap for this agent in USD. Optional.
- `autoPauseThreshold` — percent (0-100) of budget at which the agent
  auto-pauses. Optional.
- `workingHours` — cron-style string restricting when the agent can
  run. Optional.

**Adapter**
- `adapterType` — which runtime adapter to use. Default `claude-local`.
- `adapterConfig` — adapter-specific configuration object.
- `envVars` — extra environment variables to inject into the agent's
  spawn environment.

For CREATE requests, always walk the user through the interactive
brainstorm mode above — even when the request looks concrete.
Creating an agent provisions a new worker with its own budget and
permissions; one round of clarification is cheap insurance against
regret. For UPDATE / pause / resume / delete requests, go straight
to the appropriate confirm card — those operations do not need
brainstorming.

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
