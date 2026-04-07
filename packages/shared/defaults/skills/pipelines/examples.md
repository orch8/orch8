# Pipelines skill — example flows

## Example 1: Create a 3-step plan→implement→review pipeline

```orch8-card
{
  "kind": "confirm_create_pipeline",
  "summary": "Create pipeline 'feature-flow' (plan → implement → review)",
  "payload": {
    "name": "feature-flow",
    "steps": [
      { "order": 1, "label": "Plan", "defaultAgentId": "planner" },
      { "order": 2, "label": "Implement", "defaultAgentId": "implementer" },
      { "order": 3, "label": "Review", "defaultAgentId": "reviewer", "requiresVerification": true }
    ]
  }
}
```

## Example 2: Run an existing pipeline

```orch8-card
{
  "kind": "confirm_run_pipeline",
  "summary": "Run pipeline pipe_abc with inputs",
  "payload": {
    "pipelineId": "pipe_abc",
    "name": "feature-flow",
    "inputs": { "issueRef": "#123" }
  }
}
```

## Example 3: View run history

User: "How has feature-flow been doing?"

```orch8-card
{
  "kind": "info_pipeline_run_history",
  "summary": "Last 5 runs of feature-flow",
  "payload": {
    "pipelineId": "pipe_abc",
    "runs": [
      { "runId": "prun_5", "status": "succeeded", "startedAt": "2026-04-07T10:00:00Z", "durationSec": 320 },
      { "runId": "prun_4", "status": "failed", "startedAt": "2026-04-06T15:00:00Z", "durationSec": 88 },
      { "runId": "prun_3", "status": "succeeded", "startedAt": "2026-04-05T09:30:00Z", "durationSec": 415 }
    ]
  }
}
```
