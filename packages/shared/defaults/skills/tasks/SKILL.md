---
name: tasks
description: >
  Manage orch8 tasks: create, update, assign, move between columns
  (backlog/blocked/in_progress/done), convert types (quick ↔ brainstorm),
  kill in-flight execution, delete. Use when the user wants to add work
  to the project, change a task's status, assign work to an agent, or
  query the task board. Do NOT use for runs (use the `runs` skill) or
  pipelines (use the `pipelines` skill).
---

# Tasks Skill

Tasks are the unit of work in orch8. Each task lives in one of four
columns (`backlog`, `blocked`, `in_progress`, `done`) and has a type
(`quick` or `brainstorm`). This skill teaches you how to manipulate
them via the orch8 REST API.

## Endpoints (all require X-Project-Id and X-Agent-Id headers)

| Action | Method | Endpoint |
|---|---|---|
| List tasks | GET | `/api/tasks?projectId={id}&column={col}` |
| Get task | GET | `/api/tasks/{taskId}` |
| Create task | POST | `/api/tasks` |
| Update task | PATCH | `/api/tasks/{taskId}` |
| Move task to column | POST | `/api/tasks/{taskId}/transition` |
| Assign task | PATCH | `/api/tasks/{taskId}` (set `assignee`) |
| Convert type | PATCH | `/api/tasks/{taskId}` (set `taskType`) |
| Kill in-flight | POST | `/api/tasks/{taskId}/kill` |
| Delete task | DELETE | `/api/tasks/{taskId}` |
| Add dependency | POST | `/api/tasks/{taskId}/dependencies` |
| Remove dependency | DELETE | `/api/tasks/{taskId}/dependencies/{depId}` |

The `orch8` skill has the full request/response shapes — read it for
the exact JSON bodies and headers.

## Card kinds this skill emits

| Kind | Buttons | Payload essentials |
|---|---|---|
| `confirm_create_task` | Approve / Cancel | `title`, `description?`, `column?`, `taskType?`, `priority?`, `assignee?`, `dependsOn?` (array of task IDs) |
| `confirm_update_task` | Approve / Cancel | `taskId`, `current` (object), `proposed` (object) — use both for diff display |
| `confirm_assign_task` | Approve / Cancel | `taskId`, `currentAssignee?`, `proposedAssignee` |
| `confirm_move_task` | Approve / Cancel | `taskId`, `from`, `to` (column names) |
| `confirm_convert_task` | Approve / Cancel | `taskId`, `from` (taskType), `to` (taskType) |
| `confirm_kill_task` | Approve / Cancel | `taskId`, `currentRunId?` |
| `confirm_delete_task` | Approve / Cancel | `taskId`, `title` |
| `info_task_list` | none | `tasks: TaskSummary[]`, optional `groupedBy: "column"|"priority"|"assignee"` |
| `info_task_detail` | none | full task object |
| `result_create_task` | Open | `taskId`, `title`, `column` |
| `result_update_task` | Open | `taskId`, fields changed |
| `result_delete_task` | none | `taskId`, `title` |

## Task Dependencies

Tasks can depend on other tasks. A task with unresolved dependencies is
automatically moved to `blocked` and cannot be checked out. When all
dependencies complete (`done`), the system automatically moves the task
back to `backlog` and wakes the assigned agent.

### Setting dependencies at creation time

Include a `dependsOn` array of task IDs in the create payload:

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create task: Implement payments (depends on auth)",
  "payload": {
    "title": "Implement payments",
    "description": "Add Stripe billing integration.",
    "taskType": "quick",
    "priority": "high",
    "assignee": "billing-engineer",
    "dependsOn": ["task_abc123"]
  }
}
```

The task will be created in `blocked` column. When `task_abc123` is marked
done, the system automatically unblocks it and wakes the billing-engineer.

### Adding dependencies after creation

```bash
curl -s -X POST "${ORCH_API_URL}/api/tasks/${TASK_ID}/dependencies" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "dependsOnId": "task_abc123" }'
```

If the task is in `backlog`, it will be automatically moved to `blocked`.

### Removing dependencies

```bash
curl -s -X DELETE "${ORCH_API_URL}/api/tasks/${TASK_ID}/dependencies/${DEP_TASK_ID}" \
  -H "X-Agent-Id: ${ORCH_AGENT_ID}" \
  -H "X-Project-Id: ${ORCH_PROJECT_ID}"
```

### Rules

- A task cannot depend on itself
- Circular dependencies are rejected (A → B → A)
- When ALL dependencies are done, the task is automatically unblocked
- The assigned agent is automatically woken when a task is unblocked

## Common flows

### "Create a task to investigate the slow API"

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create task: Investigate slow API",
  "payload": {
    "title": "Investigate slow API",
    "description": "Latency on /api/runs has spiked over the last 24h.",
    "column": "backlog",
    "taskType": "quick",
    "priority": "medium"
  }
}
```

### "Create three tasks where B and C depend on A"

First create task A (no dependencies):

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create task: Set up database schema → api-engineer",
  "payload": {
    "title": "Set up database schema",
    "taskType": "quick",
    "priority": "high",
    "assignee": "api-engineer"
  }
}
```

After approval and API call, the result returns `task_a_id`. Then create B and C with `dependsOn`:

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create task: Build API endpoints (blocked by schema) → api-engineer",
  "payload": {
    "title": "Build API endpoints",
    "taskType": "quick",
    "priority": "high",
    "assignee": "api-engineer",
    "dependsOn": ["task_a_id"]
  }
}
```

```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create task: Build frontend (blocked by schema) → frontend-engineer",
  "payload": {
    "title": "Build frontend components",
    "taskType": "quick",
    "priority": "medium",
    "assignee": "frontend-engineer",
    "dependsOn": ["task_a_id"]
  }
}
```

Tasks B and C are created in `blocked` state. When the api-engineer
completes the schema task, both are automatically unblocked and their
assigned agents are woken.

### "Move task_abc to in-progress"

```orch8-card
{
  "kind": "confirm_move_task",
  "summary": "Move task_abc to in_progress",
  "payload": { "taskId": "task_abc", "from": "backlog", "to": "in_progress" }
}
```

### "Show me what's in progress"

```orch8-card
{
  "kind": "info_task_list",
  "summary": "3 tasks in progress",
  "payload": {
    "groupedBy": "column",
    "tasks": [
      { "id": "task_a", "title": "Migrate API", "column": "in_progress", "assignee": "agent_eng" },
      { "id": "task_b", "title": "Refactor auth", "column": "in_progress", "assignee": "agent_eng" },
      { "id": "task_c", "title": "Write docs", "column": "in_progress", "assignee": null }
    ]
  }
}
```

## Update cards include current AND proposed state

For `confirm_update_*` and `confirm_assign_*` cards, the payload MUST
contain BOTH the current value and the proposed value so the dashboard
can render a diff. This is essential — the user must see exactly what
is changing before approving.

```orch8-card
{
  "kind": "confirm_update_task",
  "summary": "Update task_abc title and priority",
  "payload": {
    "taskId": "task_abc",
    "current": { "title": "Investigate slow API", "priority": "medium" },
    "proposed": { "title": "Investigate slow API latency on /api/runs", "priority": "high" }
  }
}
```

## After approval

Once you see `User approved card_<id>:` in a system message, call the
appropriate API endpoint. Capture the response and emit the matching
`result_*` card. On HTTP 4xx/5xx, emit `result_error` with `reason`,
`httpStatus`, `endpoint` in the payload.

## Conversion flows

A `brainstorm` task converted to a `quick` task means: the brainstorm
is over, here is the concrete work. Use `confirm_convert_task` for this.
Going the other way (quick → brainstorm) is rare but supported.

For more concrete examples, see `examples.md` in this skill directory.

For card emission rules, see the `_card-protocol` skill.
