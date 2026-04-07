# Tasks skill — example flows

## Example 1: Create then immediately move to in_progress

User: "Create a quick task to fix the auth bug, and move it to in-progress"

Agent message 1:
```orch8-card
{
  "kind": "confirm_create_task",
  "summary": "Create task: Fix auth bug",
  "payload": {
    "title": "Fix auth bug",
    "description": "Login fails for users with apostrophes in their names.",
    "column": "in_progress",
    "taskType": "quick",
    "priority": "high"
  }
}
```

System (after approval): `"User approved card_xyz: Create task: Fix auth bug"`

Agent message 2 (after calling POST /api/tasks):
```orch8-card
{
  "kind": "result_create_task",
  "summary": "Created task task_new in column in_progress",
  "payload": { "taskId": "task_new", "title": "Fix auth bug", "column": "in_progress" }
}
```

(No separate `confirm_move_task` needed — the user can specify the
target column directly in the create card.)

## Example 2: Show backlog grouped by priority

User: "What's in the backlog by priority?"

Agent (after calling GET /api/tasks?column=backlog):
```orch8-card
{
  "kind": "info_task_list",
  "summary": "7 tasks in backlog",
  "payload": {
    "groupedBy": "priority",
    "tasks": [
      { "id": "task_a", "title": "Investigate slow API", "priority": "high" },
      { "id": "task_b", "title": "Refactor auth", "priority": "high" },
      { "id": "task_c", "title": "Write docs", "priority": "medium" }
    ]
  }
}
```

## Example 3: Convert a brainstorm to a quick task

User: "OK we know what we want now, let's actually do it"

Agent:
```orch8-card
{
  "kind": "confirm_convert_task",
  "summary": "Convert brainstorm task_abc to quick",
  "payload": { "taskId": "task_abc", "from": "brainstorm", "to": "quick" }
}
```

After approval:
```orch8-card
{
  "kind": "result_update_task",
  "summary": "Converted task_abc to quick",
  "payload": { "taskId": "task_abc", "fieldsChanged": ["taskType"] }
}
```

## Example 4: API failure

If `POST /api/tasks` returns 500:

```orch8-card
{
  "kind": "result_error",
  "summary": "Failed to create task: server error",
  "payload": {
    "reason": "Internal server error",
    "httpStatus": 500,
    "endpoint": "/api/tasks",
    "rawResponse": "{\"error\":\"db_unavailable\"}"
  }
}
```

Then ask the user how they want to proceed. Do **not** retry silently.
