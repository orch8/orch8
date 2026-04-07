---
name: pipelines
description: >
  Manage orch8 pipelines: create from a template, update, run, view past
  runs, delete. Use when the user wants to define or trigger a multi-step
  workflow that spans agents (e.g. plan → implement → review → verify).
  Do NOT use for single tasks (use the `tasks` skill) or for inspecting
  individual run logs (use the `runs` skill).
---

# Pipelines Skill

A pipeline is a sequence of steps where each step assigns work to an
agent. Pipelines are templated — you instantiate a pipeline from a
template (or define a one-off custom one) and then run it against
inputs.

## Endpoints

| Action | Method | Endpoint |
|---|---|---|
| List pipelines | GET | `/api/pipelines?projectId={id}` |
| Get pipeline | GET | `/api/pipelines/{pipelineId}` |
| Create pipeline | POST | `/api/pipelines` |
| Update pipeline | PATCH | `/api/pipelines/{pipelineId}` |
| Run pipeline | POST | `/api/pipelines/{pipelineId}/run` |
| Get run history | GET | `/api/pipelines/{pipelineId}/runs` |
| Delete pipeline | DELETE | `/api/pipelines/{pipelineId}` |
| List templates | GET | `/api/pipeline-templates` |

## Card kinds

| Kind | Buttons | Payload essentials |
|---|---|---|
| `confirm_create_pipeline` | Approve / Cancel | `name`, `templateId?` OR custom `steps[]` |
| `confirm_update_pipeline` | Approve / Cancel | `pipelineId`, `current`, `proposed` |
| `confirm_run_pipeline` | Approve / Cancel | `pipelineId`, `name`, `inputs?` |
| `confirm_delete_pipeline` | Approve / Cancel | `pipelineId`, `name` |
| `info_pipeline_list` | none | `pipelines: PipelineSummary[]` |
| `info_pipeline_run_history` | none | `pipelineId`, `runs: PipelineRunSummary[]` |
| `result_create_pipeline` | Open | `pipelineId`, `name` |
| `result_run_pipeline` | Open | `pipelineId`, `runId` |
| `result_update_pipeline` | Open | `pipelineId`, `fieldsChanged` |
| `result_delete_pipeline` | none | `pipelineId`, `name` |

## Templates vs custom pipelines

Pipelines can be created from a template or as a one-off. Templates
are listed via `GET /api/pipeline-templates` and have a `steps` array
that you copy into the new pipeline. If the user asks for something
that doesn't fit a template, build the steps array from scratch in
the `confirm_create_pipeline` payload.

## Steps reference agents by ID

Each step in a pipeline assigns work to a specific agent. The agent
must already exist in this project. If the user asks for a pipeline
that uses an agent that doesn't exist yet, propose creating the agent
first (`confirm_create_agent`) before the pipeline.

## Step verification gates

A step can have `requiresVerification: true`, which pauses the
pipeline at `awaiting_verification` after the step completes. A human
or another agent must approve before the next step runs. Use this
when the user says things like "...and have me review before X" or
"...with a human gate before deploy".

For concrete examples, see `examples.md` in this skill directory.

For card emission rules, see the `_card-protocol` skill.
