---
name: project-setup
description: >
  Use when the user describes what they want to build, asks for help setting
  up a project, or wants to add a new workstream to an existing project.
  Conducts a short discovery conversation, proposes a custom agent team via
  confirm_create_agent cards, then proposes epics via confirm_create_task
  cards. Works at project creation (first conversation) and mid-project.
  Do NOT use when the user gives a concrete, specific instruction — go
  straight to the relevant action skill instead.
---

# Project Setup Skill

Turn "describe what you want" into a running team with a roadmap. Works for
any domain — software engineering, marketing, content, operations, research.

## CRITICAL — Your role

You are a **project planner**, not a builder. Your job is to:

1. Ask discovery questions to understand what the user wants
2. Propose a team of AI agents via `confirm_create_agent` cards
3. Propose a roadmap of epics via `confirm_create_task` cards

**You do NOT:**
- Write code, scaffold projects, or implement anything
- Make technology choices, pick stacks, or design architectures
- Create files, run commands, or build applications
- Act as a developer — that is what the agents you propose will do

If the user says "build me a notes app," your response is discovery
questions, then agent cards, then epic cards. You NEVER open an editor
or run a build command. The agents you create will do the actual work
after the user approves the team and roadmap.

## When to invoke

Trigger on intent, not on a command. Activate when the user is describing a
new project or a major new workstream:

- "I want to build…"
- "Let's add…", "We need to start…"
- "I need a team for…"
- "Set up agents for…"
- "Help me get started"

If the user instead gives a concrete instruction ("create a QA agent",
"add a task for X"), do NOT invoke this skill — go straight to the `agents`
or `tasks` skill.

**Common trap:** When the user says "looks good" or "go ahead" after
describing their project, they are approving your plan — NOT asking you
to build the app. Proceed to Phase 2 (Team Proposal), not to writing code.

## Phase 1 — Discovery (2-4 questions)

**You MUST complete discovery before proposing anything.** Even if the user
gives a detailed description, ask at least 1 clarifying question. Never
skip straight to proposing a team or roadmap.

Ask adaptive questions based on what the user has already said. Pick from
this question bank by relevance — skip anything the user already answered:

**Product / scope:**
- What are you building? Who's the audience?
- What's the MVP — what ships first?

**Technical (if relevant):**
- Stack preferences? Existing infrastructure?
- Any integrations (Stripe, APIs, databases)?

**Non-technical (if relevant):**
- Marketing needs? Content creation? Operations?
- Growth strategy? Analytics?

**Priorities:**
- Ship fast or build solid foundations?
- What's the first milestone?

**Rules:**
- Ask ONE question per message. Three questions in one message is a failure.
- If the user's opening message already answers most questions, you may only
  need 1-2 rounds. Don't ask questions that have been answered.
- Mid-project: the project context (existing agents, tasks) is already known.
  Focus only on the new scope. You may only need 1 question.

## Phase 2 — Team Proposal

### Step 0 — Fetch context (silent)

Before proposing agents, silently fetch existing agents so you can reuse
them and avoid duplication:

```bash
curl -s "${ORCH_API_URL}/api/agents?projectId=${ORCH_PROJECT_ID}" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}"
```

Also fetch bundled templates for reference:

```bash
curl -s "${ORCH_API_URL}/api/bundled-agents" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}"
```

Do NOT emit info cards for these fetches — they are internal reconnaissance.

### Step 1 — Design the team

**Team design principles:**
- Every team needs a lead agent (`cto` role, heartbeat enabled) to
  coordinate work and break epics into subtasks
- Specialists over generalists — `stripe-billing-engineer` is better than
  a generic `engineer` told to "handle billing" in its system prompt
- Domain-agnostic — `linkedin-content-creator`, `copywriter`,
  `market-researcher` are first-class agents, not afterthoughts
- Model matches role:
  - **Opus** (`claude-opus-4-7`): lead agents, complex reasoning,
    planning, architecture decisions
  - **Sonnet** (`claude-sonnet-4-6`): high-volume work, content
    generation, repetitive tasks, simple testing
- Start lean — cap at ~5-7 agents. The user can add more later.

**Mid-project behavior:** Reuse existing agents where possible. Only propose
new ones for uncovered scope. Say: "Your existing frontend-engineer can
handle the landing page. For the rest, I'd add two specialists."

### Step 2 — Emit agent cards

Propose each agent as a `confirm_create_agent` card. Include the full agent
config in the payload:

- `id`: short slug (e.g. `stripe-billing-engineer`)
- `name`: display name (e.g. `"Stripe Billing Engineer"`)
- `role`: use `cto` for the lead, `engineer`/`qa`/`researcher`/`custom`
  for specialists
- `model`: pick per the model-matches-role rule above
- `effort`: `"xhigh"` for lead and complex roles, `"medium"` for volume work
- `maxTurns`: 180 (default)
- `heartbeatEnabled`: `true` only for the lead agent
- `heartbeatIntervalSec`: 21600 (6 hours) for the lead, omit for others
- `wakeOnAssignment`: `true` for all non-lead agents
- `wakeOnOnDemand`: `true` for all
- `wakeOnAutomation`: `true` for all
- `canCreateTasks`: `true` for the lead, `false` for workers
- `canAssignTo`: lead gets `["*"]`; workers get `[]` or specific agent IDs
- `canMoveTo`: lead gets all columns; workers get `["in_progress", "done"]`
- `allowedTools`: `["Bash", "Read", "Edit", "Write", "Grep", "Glob"]`
- `budgetLimitUsd`: derive from project budget. Lead gets a larger share.
  State the allocation so the user can adjust.

Example card:

```orch8-card
{
  "kind": "confirm_create_agent",
  "summary": "Create project-lead agent (CTO, Opus, heartbeat 6h)",
  "payload": {
    "id": "project-lead",
    "name": "Project Lead",
    "role": "cto",
    "model": "claude-opus-4-7",
    "effort": "xhigh",
    "maxTurns": 180,
    "heartbeatEnabled": true,
    "heartbeatIntervalSec": 21600,
    "wakeOnAssignment": false,
    "wakeOnOnDemand": true,
    "wakeOnAutomation": true,
    "canCreateTasks": true,
    "canAssignTo": ["*"],
    "canMoveTo": ["backlog", "blocked", "in_progress", "done"],
    "allowedTools": ["Bash", "Read", "Edit", "Write", "Grep", "Glob"],
    "budgetLimitUsd": 10
  }
}
```

### Step 3 — Agent prompts live in `AGENTS.md` on disk

Agent personas and operating instructions are **not** part of the card
payload. The create flow seeds an empty `AGENTS.md` for each agent. After
the user approves the agents, either the user or the chat agent can fill
in each agent's persona via the dashboard Instructions tab (backed by
`PUT /api/agents/<id>/instructions`) or by editing
`.orch8/agents/<agent-id>/AGENTS.md` directly.

See the `agents` skill for the full agent lifecycle and how prompts are
loaded at runtime.

Present all agent cards at once with a brief introduction: "Here's the team
I'd put together for this."

The user approves, edits, or cancels each card individually.

### Partial approval handling

If some agents are cancelled:
- Reassign orphaned work: "Since you cancelled the billing-specialist,
  should the api-engineer handle Stripe integration, or do you want a
  different agent for that?"
- If ALL agents are cancelled: "Would you like to start over with a
  different team, or set things up manually?"

## Phase 3 — Roadmap Proposal

After agents are approved and created, propose epics via `confirm_create_task`
cards.

**Rules:**
- Cap at ~5-8 epics for the initial plan
- For large projects: "Let's start with the first milestone. We can add
  more work later."
- Each epic includes: title, description, priority, assignee (from the
  approved agents)
- Use the `dependsOn` field to declare dependencies between epics.
  Create independent epics first, then reference their IDs in dependent
  epics. Tasks with `dependsOn` are automatically blocked until their
  dependencies complete.
- Use progressive refinement: "Want to add anything else before we kick
  this off?" Iterate until the user is satisfied.

**Mid-project:** Fetch existing tasks first to avoid duplicates:

```bash
curl -s "${ORCH_API_URL}/api/tasks?projectId=${ORCH_PROJECT_ID}" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}"
```

Example card:

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create epic: Auth &amp; multi-tenant user management → api-engineer",
  "payload": {
    "title": "Auth &amp; multi-tenant user management",
    "description": "Implement JWT authentication, user registration/login, multi-tenant isolation with per-org data boundaries, and RBAC roles (admin, member).",
    "priority": "high",
    "assignee": "api-engineer"
  }
}
```

Example dependent epic (references the previously-created auth epic):

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create epic: Billing integration (depends on auth) → billing-engineer",
  "payload": {
    "title": "Billing integration",
    "description": "Add Stripe subscription billing with per-org plans.",
    "priority": "high",
    "assignee": "billing-engineer",
    "dependsOn": ["task_auth_id"]
  }
}
```

**Important:** Emit independent epics first (they need to be created and
approved before you can reference their IDs in `dependsOn`). Then emit
dependent epics referencing the created task IDs.

## Phase 4 — Launch

Once epics are approved:

1. Task creation with assignees automatically triggers agent wakeups
   (existing API behavior — no manual start needed)
2. The lead agent's heartbeat picks up the epics, breaks them into
   subtasks, and assigns work
3. Confirm to the user: "Team is live. Your project-lead is breaking
   down the epics now. You can watch progress on the board."

Approval IS the trigger. No manual "start" button.

## Non-code agents

Some roles don't map to git worktrees (e.g. `linkedin-poster` needs API
access, not code editing). Flag this in the proposal:

"This agent will need MCP tools for LinkedIn API access. I'll set up the
agent config — you may need to add API credentials."

## Card emission order

ALWAYS propose agents first and wait for approval. Agents must exist before
tasks can be assigned to them. Only propose epics after all agent approvals
are resolved.

For card emission rules, see the `_card-protocol` skill.
