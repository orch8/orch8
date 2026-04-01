---
name: orch8
description: >
  Interact with the orch8 control plane API to manage tasks, coordinate with
  other agents, and operate within the project. Use when you need to check
  assignments, update task status, delegate work, post comments, complete phases,
  or call any orch8 API endpoint. Do NOT use for the actual domain work itself
  (writing code, research, etc.) — only for orch8 coordination.
---

# Orch8 Agent Skill

You are an agent managed by the **orch8** orchestration daemon. You operate in discrete **heartbeat** execution windows. Each time you wake, you have a budget of turns to do useful work, communicate status, and exit cleanly.

---

## 1. Authentication

### Environment Variables (always present)

| Variable | Description |
|----------|-------------|
| `ORCH_API_URL` | Daemon API base URL — always read from env, never hard-code |
| `ORCH_AGENT_ID` | Your unique agent identifier |
| `ORCH_PROJECT_ID` | Current project scope |
| `ORCH_RUN_ID` | Current heartbeat run identifier |
| `ORCH_WAKE_REASON` | Why you were woken: `timer`, `assignment`, `on_demand`, `automation` |
| `ORCH_WORKSPACE_CWD` | Your working directory |

### Conditional Variables

| Variable | When Present |
|----------|-------------|
| `ORCH_TASK_ID` | Run is scoped to a specific task |
| `ORCH_PARENT_RUN_ID` | You are a subagent |
| `ORCH_SUBTASK_SCOPE` | Subagent scope context |

### Workspace Environment Variables

These variables provide workspace context so you don't need to run git commands:

| Variable | Description |
|---|---|
| `ORCH_WORKSPACE_BRANCH` | Current git branch for the task workspace |
| `ORCH_WORKSPACE_REPO_URL` | Remote origin URL of the repository |
| `ORCH_WORKTREE_PATH` | Absolute path to the task's git worktree (if using worktrees) |
| `ORCH_WORKSPACE_ID` | The project ID (same as `ORCH_PROJECT_ID`) |
| `ORCH_WAKE_COMMENT_ID` | The comment ID that triggered this wakeup (when triggered by a comment) |
| `ORCH_LINKED_ISSUE_IDS` | Comma-separated list of linked issue IDs for the current task |

### Standard Request Pattern

Every API call MUST include identity headers. Include `X-Run-Id` on mutating requests for audit traceability.

```bash
curl -s "${ORCH_API_URL}/api/<endpoint>" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}"
```

For mutating requests (POST/PATCH/DELETE), add:

```bash
-H "Content-Type: application/json" \
-d '{ ... }'
```

---

## 2. The Heartbeat Procedure

This is your core operating loop. Follow it every time you wake.

### Step 1: Identify yourself

```bash
curl -s "${ORCH_API_URL}/api/identity" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}"
```

Response includes your agent config, permissions, current task (if any), project info, and budget.

### Step 2: Branch on wake reason

Check `$ORCH_WAKE_REASON`:

**`assignment`** — You were woken because a task was assigned to you.
1. Fetch your assigned tasks: `GET /api/tasks?assignee=${ORCH_AGENT_ID}&projectId=${ORCH_PROJECT_ID}`
2. Checkout the assigned task: `POST /api/tasks/{id}/checkout`
3. Read task context (title, description, phase outputs)
4. Do the work
5. Update status + comment

**`timer`** — Periodic heartbeat. Scan the board for work.
1. Check for in_progress tasks (resume existing work first)
2. Check for backlog tasks assigned to you
3. If work found, checkout and do it
4. If nothing to do, log activity and exit

**`on_demand`** — Manual trigger. Read any prompt/context provided and act on it.

**`automation`** — System-triggered (phase completion, dependency resolution).
1. Check for new assignments or task state changes
2. Checkout applicable task and work it

### Step 3: Checkout before working

**ALWAYS** checkout a task before doing any work on it:

```bash
curl -s -X POST "${ORCH_API_URL}/api/tasks/${TASK_ID}/checkout" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}"
```

**Success (200):** Task is now yours. Response includes the task with `column: "in_progress"`, execution lock set, and `worktreePath` for your working directory.

**Conflict (409):** Another agent owns this task. **Do NOT retry.** Pick a different task.

### Step 4: Do the work

Use your domain tools (write code, run tests, research, etc.). This is your normal work — the orch8 skill does not govern domain work.

### Step 5: Update status and communicate

After working, update the task and leave a comment:

```bash
# Update task status (e.g., mark as done)
curl -s -X PATCH "${ORCH_API_URL}/api/tasks/${TASK_ID}" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "column": "done" }'

# Add a comment
curl -s -X POST "${ORCH_API_URL}/api/tasks/${TASK_ID}/comments" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Completed: implemented feature X.\n- Modified src/foo.ts\n- Added tests in tests/foo.test.ts\n- All tests passing" }'
```

If you are stuck, set the task as **blocked** with a comment explaining the blocker:

```bash
curl -s -X PATCH "${ORCH_API_URL}/api/tasks/${TASK_ID}" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "column": "blocked" }'

curl -s -X POST "${ORCH_API_URL}/api/tasks/${TASK_ID}/comments" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "content": "BLOCKED: Cannot proceed — missing API credentials for external service.\n- Need STRIPE_API_KEY env var\n- Blocked on task_abc123 completion" }'
```

### Step 6: Prioritization

When choosing what to work on:

1. **In-progress tasks first** — Resume existing work before starting new work
2. **Backlog tasks second** — Pick up new assignments
3. **Skip blocked** — Unless you can unblock it yourself

---

## 3. Complex Task Phases

Complex tasks flow through four phases: **research → plan → implement → review**.

### Phase Flow

| Phase | Input | Expected Output | Completion |
|-------|-------|----------------|------------|
| research | Task description | Research findings, risks, patterns | `POST /api/tasks/{id}/complete` with `{ "output": "..." }` |
| plan | Research output | Implementation plan with bite-sized steps | `POST /api/tasks/{id}/complete` with `{ "output": "..." }` |
| implement | Plan output | Working code with tests | `POST /api/tasks/{id}/complete` with `{ "output": "..." }` |
| review | All prior outputs | Review verdict (approve/reject) | `POST /api/tasks/{id}/complete` with `{ "output": "..." }` |

### Working a Phase

1. **Check the current phase** from the task's `complexPhase` field
2. **Read prior phase outputs** from the task object:
   - `researchOutput` (available in plan, implement, review phases)
   - `planOutput` (available in implement, review phases)
   - `implementationOutput` (available in review phase)
3. **Do the phase work** using your domain skills
4. **Complete the phase:**

```bash
curl -s -X POST "${ORCH_API_URL}/api/tasks/${TASK_ID}/complete" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "X-Run-Id: ${ORCH_RUN_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "output": "## Research Findings\n\n- Finding 1: ...\n- Finding 2: ..." }'
```

The daemon automatically advances the task to the next phase and wakes the appropriate agent.

### Task Types

- **quick** — No phases. Checkout → work → mark done.
- **complex** — Four phases (research → plan → implement → review). Complete each phase via the API.
- **brainstorm** — Interactive ideation. No checkout needed.

---

## 4. Task Lifecycle

### Kanban Columns

`backlog → in_progress → done` (with `blocked` as a lateral state from `in_progress`)

### Key Operations

**Checkout** — Atomic claim: sets `in_progress` + execution lock + creates worktree.
```bash
POST /api/tasks/{id}/checkout
# 200: success (task returned with lock set)
# 409: conflict (another agent owns it)
```

**Release** — Drop the lock without completing. Use when you can't handle the task.
```bash
POST /api/tasks/{id}/release
# 200: lock cleared, task stays in_progress
```

**Update status** — Change column (done, blocked) via PATCH.
```bash
PATCH /api/tasks/{id}  →  { "column": "done" }
PATCH /api/tasks/{id}  →  { "column": "blocked" }
```

**Complete phase** — For complex tasks, signal phase completion.
```bash
POST /api/tasks/{id}/complete  →  { "output": "..." }
```

### Rules

- **Always checkout before working** — never work on a task you haven't checked out
- **Never retry a 409** — the task belongs to someone else, pick a different one
- **Always comment on transitions** — leave context for other agents
- **Always set blocked with a comment** — explain the blocker specifically

---

## 5. Comments & Communication

### Endpoints

```bash
# Create comment
POST /api/tasks/{taskId}/comments  →  { "content": "..." }

# List comments
GET /api/tasks/{taskId}/comments

# Delete comment
DELETE /api/comments/{commentId}
```

### Comment Style

Always structure comments with:
1. **Status line** — What happened (e.g., "Completed:", "Blocked:", "In progress:")
2. **Bullets** — Specific details (file paths, error messages, decisions made)
3. **Task links** — Reference related tasks by ID when relevant

Example:
```
Completed: Implemented user authentication flow.
- Added JWT middleware in src/middleware/auth.ts
- Created login/register endpoints in src/routes/auth.ts
- All 12 tests passing (src/__tests__/auth.test.ts)
- Depends on task_abc123 for rate limiting (not yet implemented)
```

### Rules

- Always comment before exiting a heartbeat
- Be specific — include file paths, line numbers, error messages
- Don't post empty or generic updates ("working on it")

---

## 6. Knowledge Graph & Memory

### Entity Management

```bash
# Create entity
POST /api/memory/knowledge  →  { "name": "Auth System", "slug": "auth-system", "description": "..." }

# List entities
GET /api/memory/knowledge

# Get entity with summary
GET /api/memory/knowledge/{id}

# Get entity facts
GET /api/memory/knowledge/{id}/facts
```

### Fact Management

```bash
# Write a fact (auto-tagged with your agent ID as sourceAgent)
POST /api/memory/knowledge/{entityId}/facts  →  { "content": "The auth middleware uses JWT with RS256 signing" }

# Supersede a stale fact
POST /api/memory/knowledge/{entityId}/facts/{factId}/supersede  →  { "newContent": "Updated fact", "reason": "Migration to Ed25519" }

# Search facts
GET /api/memory/knowledge/search?query=auth+middleware
```

### Worklog & Lessons

```bash
# Append to your work log (only you can write to yours)
POST /api/memory/worklog  →  { "content": "Completed auth migration, 3 files changed" }

# Read your work log
GET /api/memory/worklog

# Append a lesson learned
POST /api/memory/lessons  →  { "content": "Always check token expiry before refresh — stale tokens cause silent 401s" }

# Read your lessons
GET /api/memory/lessons
```

### Rules

- Supersede stale facts rather than deleting them (preserves history)
- Write facts that other agents would find useful, not just notes to yourself
- Use worklog for activity tracking, lessons for reusable insights

---

## 7. Activity Logging

```bash
# Log an activity
POST /api/log \
  -d '{ "projectId": "${ORCH_PROJECT_ID}", "message": "Started research phase", "level": "info", "taskId": "${TASK_ID}" }'

# Read logs (filtered)
GET /api/log?agentId=${ORCH_AGENT_ID}&projectId=${ORCH_PROJECT_ID}&limit=20
```

Log levels: `info`, `warn`, `error`

Use logging for:
- Phase transitions and status changes
- Errors and unexpected states
- Decisions that affect other agents

---

## 8. Critical Rules

1. **Always checkout before working** — Never work on a task without calling `POST /api/tasks/{id}/checkout` first.
2. **Never retry a 409** — The task belongs to someone else. Pick a different one from your inbox.
3. **Always comment before exiting** — Every heartbeat should leave a trace of what you did.
4. **Always set blocked with a blocker comment** — If you're stuck, say exactly why and what's needed.
5. **Budget awareness** — Check your budget via `/api/identity`. At 80% spent, only do critical work. At 100%, you'll be auto-paused.
6. **Escalate when stuck** — If blocked for multiple heartbeats on the same issue, escalate via comment and activity log.
7. **Heartbeat discipline** — Do useful work, communicate what you did, exit cleanly. Don't waste turns on busywork.

---

## 9. Quick Reference

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Identity | GET | `/api/identity` |
| List tasks | GET | `/api/tasks?assignee={id}&projectId={id}` |
| Get task | GET | `/api/tasks/{id}` |
| Create task | POST | `/api/tasks` |
| Update task | PATCH | `/api/tasks/{id}` |
| **Checkout task** | **POST** | **`/api/tasks/{id}/checkout`** |
| **Release task** | **POST** | **`/api/tasks/{id}/release`** |
| Complete task/phase | POST | `/api/tasks/{id}/complete` |
| Transition task | POST | `/api/tasks/{id}/transition` |
| List comments | GET | `/api/tasks/{taskId}/comments` |
| Create comment | POST | `/api/tasks/{taskId}/comments` |
| List agents | GET | `/api/agents` |
| Wake agent | POST | `/api/agents/{id}/wake` |
| Knowledge entities | GET/POST | `/api/memory/knowledge` |
| Entity facts | GET/POST | `/api/memory/knowledge/{id}/facts` |
| Supersede fact | POST | `/api/memory/knowledge/{entityId}/facts/{factId}/supersede` |
| Search facts | GET | `/api/memory/knowledge/search?query=...` |
| Worklog | GET/POST | `/api/memory/worklog` |
| Lessons | GET/POST | `/api/memory/lessons` |
| Activity log | GET/POST | `/api/log` |
| Cost summary | GET | `/api/cost/summary` |
| Daemon status | GET | `/api/daemon/status` |
