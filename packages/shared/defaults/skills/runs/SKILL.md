---
name: runs
description: >
  Inspect, kill, and retry orch8 agent runs. Use when the user wants to
  see what an agent has been doing, why a run failed, or to stop a
  run that is misbehaving. Do NOT use to start new work — that's the
  `tasks` or `agents` skill.
---

# Runs Skill

A "run" is one heartbeat invocation of an agent. Every time the daemon
spawns an agent (timer tick, on-demand wake, task assignment), it
creates a row in the `heartbeatRuns` table. This skill teaches the
chat agent how to query and control runs.

## Endpoints

| Action | Method | Endpoint |
|---|---|---|
| List runs | GET | `/api/runs?projectId={id}&agentId={id?}&taskId={id?}&status={status?}` |
| Get run | GET | `/api/runs/{runId}` |
| Get run events | GET | `/api/runs/{runId}/events` |
| Kill run | POST | `/api/runs/{runId}/kill` |
| Retry run | POST | `/api/runs/{runId}/retry` |

## Card kinds

| Kind | Buttons | Payload essentials |
|---|---|---|
| `confirm_kill_run` | Approve / Cancel | `runId`, `agentName`, `taskTitle?`, `runningSinceSec?` |
| `confirm_retry_run` | Approve / Cancel | `runId`, `agentName`, `failureReason?` |
| `info_run_list` | none | `runs: RunSummary[]` (id, agent, status, costUsd, startedAt, durationSec) |
| `info_run_detail` | none | full run object including events |
| `result_kill_run` | none | `runId`, `status` |
| `result_retry_run` | Open | `originalRunId`, `newRunId` |

## Status values

| Status | Meaning |
|---|---|
| `queued` | About to start |
| `running` | Currently executing |
| `succeeded` | Completed normally |
| `failed` | Errored or hit max turns |
| `timed_out` | Exceeded the time budget |
| `cancelled` | Killed manually |

## Killing a run

A kill is irreversible — it terminates the underlying Claude process.
Always emit `confirm_kill_run` first. Show the user what's running:
`agentName`, `taskTitle` (if scoped to a task), and how long it's been
running.

```orch8-card
{
  "kind": "confirm_kill_run",
  "summary": "Kill run run_abc (agent_eng, running 24m)",
  "payload": {
    "runId": "run_abc",
    "agentName": "Engineer",
    "taskTitle": "Refactor auth",
    "runningSinceSec": 1440
  }
}
```

## Run failures

When the user asks "why did run X fail?", call `GET /api/runs/{runId}`
and look at `error`, `errorCode`, and `exitCode`. Common error codes:

- `auth_required` — Claude CLI not authenticated. Tell the user to
  re-auth via `claude` directly.
- `unknown_session` — The persisted session ID was invalidated by
  Claude. The next run will start fresh automatically — no action.
- `max_turns_reached` — Hit the agent's `maxTurns`. The user may
  want to increase it (use `agents` skill).
- `timeout` — Hit the run's time budget. Same — increase via `agents`
  skill if needed.
- `process_error` — The Claude process crashed. Look at the run log
  for details.

For card emission rules, see the `_card-protocol` skill.
