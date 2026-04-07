---
name: brainstorm
description: >
  Use when the user wants to explore an idea, gather requirements, or think
  through a problem before committing to a concrete task. Conducts an
  exploratory dialogue, asks one focused clarifying question at a time, and
  emits NO cards until the conversation has converged on something
  actionable. Do NOT use when the user has already given a clear,
  concrete instruction — go straight to the relevant action skill instead.
---

# Brainstorm Skill

Brainstorming is the chat agent's exploratory mode. Use it whenever the
user is thinking out loud, gathering requirements, weighing trade-offs,
or asking "what should we do about X" without yet knowing the answer.

## When to invoke

Trigger phrases include:
- "let's think about…", "let's brainstorm…", "I'm not sure how to…"
- "what would be the best way to…", "I'm trying to figure out…"
- Any open-ended question without a clear answer the user expects you
  to know.

If the user instead says something concrete ("create a QA agent",
"move task X to in-progress"), do **not** brainstorm — go straight to
the relevant action skill.

## How to brainstorm

1. **Listen first.** Restate what you understand the user is trying
   to achieve in one sentence. Confirm or correct.
2. **Ask one focused question at a time.** Never ask three questions
   in one message — the user will only answer one and the rest get lost.
3. **Sketch trade-offs in prose.** When weighing options, lay them out
   as a short bulleted comparison: "Option A: [pro/con]. Option B:
   [pro/con]. Recommendation: …".
4. **Do not commit prematurely.** While brainstorming, do **not**
   emit any cards. Cards are for action; brainstorming is for thought.
5. **Converge.** When the conversation has reached an actionable
   conclusion ("OK so let's create a quick task to do X"), STOP
   brainstorming and switch to the relevant action skill — usually
   `tasks`. Emit a `confirm_create_task` card with the agreed scope.

## Optional: durable brainstorm tasks

If the user wants the brainstorm to persist as a task they can come
back to (rather than just live in the chat history), emit a
`confirm_create_task` card with `task.taskType="brainstorm"`. This
creates a brainstorm-type task in the backlog. The conversation stays
in the chat thread; the task is a marker the user can find later
under "Backlog".

When ready to convert a brainstorm task into a quick task to actually
do the work, follow the `tasks` skill's `confirm_convert_task` flow.

## What NOT to do

- **Do not call any API endpoints during brainstorming.** Brainstorming
  is conversational. The user has not yet asked you to do anything.
- **Do not emit `info_*` cards unsolicited.** If the user asks for
  data ("what tasks do we have already?") you can switch to `tasks`
  briefly to emit an `info_task_list` and then resume brainstorming.
- **Do not pretend to have brainstormed if the user gave you a
  concrete instruction.** Skip straight to the action skill.

## Cards this skill emits

| Kind | When |
|---|---|
| `confirm_create_task` (taskType=brainstorm) | User wants to persist the brainstorm |
| `confirm_convert_task` | Brainstorm task is ready to become a quick task |

(Both kinds are formally defined in the `tasks` skill — they are
shared, not duplicated here.)

For card emission rules, see the `_card-protocol` skill.
