---
name: _card-protocol
description: >
  Defines the orch8-card fence protocol used by the project chat agent for
  every state-changing or read-only action. Use when about to call any
  orch8 REST API endpoint that creates, updates, or deletes data, OR when
  returning structured read data (lists, summaries) you want the chat UI
  to render as an interactive widget. Do NOT use for plain conversational
  prose, clarifying questions, or scratch reasoning — those should remain
  in normal markdown.
---

# orch8 Card Protocol

The orch8 dashboard renders structured "cards" inline in chat threads.
Cards are how you propose state changes for the user to approve, and
how you return structured read data (tables, summaries) that should be
clickable and visually distinct from prose.

## When to emit a card

**Always emit a `confirm_*` card BEFORE calling any orch8 API endpoint that
mutates state.** That includes — but is not limited to — creating, updating,
deleting, pausing, resuming, killing, assigning, moving, converting, or
running anything.

**Always emit an `info_*` card when returning structured read data** the
user will want to interact with: task lists, agent summaries, run history,
cost breakdowns, memory search results, etc. Plain prose answers are fine
for unstructured questions.

**Always emit a `result_*` card AFTER a successful or failed mutation**, so
the chat UI can show a banner with a link to the created/affected entity.

## Fence format

Emit cards as fenced JSON blocks. The fence language is exactly
`orch8-card` (no other identifier). The body is a single JSON object.

```orch8-card
{
  "kind": "confirm_create_agent",
  "summary": "Create QA agent 'qa-bot' (sonnet, heartbeat 6h)",
  "payload": {
    "name": "qa-bot",
    "model": "claude-sonnet-4-6",
    "heartbeatEnabled": true,
    "heartbeatIntervalSec": 21600
  }
}
```

Three required fields:

| Field | Purpose |
|---|---|
| `kind` | A discriminator string in snake_case. The dashboard switches on this to pick the right card component. The full kind catalogue is in §Kind catalogue below. |
| `summary` | A one-line human-readable description shown in the card header. Keep it under 80 characters. |
| `payload` | Per-kind structured data. Schemas live in the dashboard; if you emit a payload that doesn't match the schema for that kind, the dashboard renders a fallback "invalid card" widget. |

You may emit multiple cards in a single message. Text between fences
renders as normal markdown.

## Approval flow for `confirm_*` cards

1. You emit the `confirm_*` card. **STOP. Do not call the API yet.**
2. The dashboard renders Approve / Cancel buttons.
3. The user clicks one. The daemon writes a synthetic system message
   into the chat: `"User approved card_<id>: <summary>"` or
   `"User cancelled card_<id>: <summary>"`.
4. You will see this system message on your next turn.
5. **Only after seeing the approval system message** should you call
   the API endpoint. Use Bash + curl. The `orch8` skill has the URL
   patterns and identity headers.
6. After the API call, emit a `result_*` card with the outcome.
7. If the API call fails, emit a `result_error` card with the error
   details — do **not** retry without the user's go-ahead.

If the user cancels, acknowledge briefly and ask what to do next.
Do not call the API.

## `info_*` cards (no approval)

`info_*` cards are read-only data widgets. They have no buttons. Emit
them directly without waiting for user input. Use them whenever the
user asks for a list, status, summary, or detail view of something.

## `result_*` cards

Two flavours:
- `result_<action>` — success. Payload should include the affected
  entity ID(s) so the dashboard can render an "Open" link.
- `result_error` — failure. Payload should include `reason` (string)
  and optionally `httpStatus`, `endpoint`, and `rawResponse`.

## Kind catalogue

See your skills (`tasks`, `agents`, `pipelines`, `runs`,
`cost-and-budget`, `memory`, `brainstorm`) for the per-skill kinds
they emit. The card kind is always one of:

- `confirm_<verb>_<entity>` — e.g. `confirm_create_agent`,
  `confirm_update_task`, `confirm_kill_run`.
- `info_<entity>_<scope>` — e.g. `info_task_list`,
  `info_agent_detail`, `info_cost_summary`.
- `result_<verb>_<entity>` — e.g. `result_create_agent`,
  `result_delete_task`. Use `result_error` for failures.

## Hyperlinks and IDs

When you mention a task, run, agent, pipeline, or chat thread in
prose **outside** a card, use its canonical ID (`task_abc123`,
`agent_qa-bot`, `run_xyz`, `pipe_pipe456`, `chat_abc`). The chat
renderer pattern-matches these and turns them into clickable links.
You don't need to do anything special — just use the IDs.

## Common mistakes

- **Calling the API before emitting a confirm card.** This is the
  single most common protocol violation. The user must always see
  the proposal before you commit.
- **Putting markdown formatting inside the JSON payload.** Payloads
  are pure data, not display content. The card component formats
  them for the user.
- **Forgetting the `kind` discriminator.** The dashboard cannot render
  a card without a `kind`. It will fall back to an error card.
- **Emitting a card and then continuing to write more text after it
  in the same turn for `confirm_*` cards.** STOP after the fence.
  Wait for the system message.

## Quick reference

| Situation | What to emit |
|---|---|
| User asks "what tasks are in progress?" | One `info_task_list` card |
| User asks "create a QA agent" | One `confirm_create_agent` card → wait → API call → `result_create_agent` |
| User asks "kill run xyz" | One `confirm_kill_run` card → wait → API call → `result_kill_run` |
| User asks for budget status | One `info_budget_status` card |
| API call fails | `result_error` card with `reason`, `httpStatus`, `endpoint` |
