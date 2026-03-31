---
name: subagent-coordination
description: How to spawn and manage child agents during implementation — context isolation, status reporting, two-stage review dispatch
---

# Subagent Coordination

When implementing complex tasks, you may need to spawn child agents for subtasks. This skill covers how to do that effectively.

**Core principle:** Fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration.

## Context Isolation

You delegate tasks to child agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed. They should never inherit your session's context or history — you construct exactly what they need.

**For each subagent dispatch:**
- Specific scope: one task or subtask
- Complete context: everything they need to understand the problem
- Clear goal: what "done" looks like
- Constraints: what NOT to change

## Status Reporting Protocol

Subagents report one of four statuses:

**DONE:** Task completed successfully. Proceed to review.

**DONE_WITH_CONCERNS:** Task completed but agent has doubts. Read concerns before proceeding:
- Correctness/scope concerns → address before review
- Observations (e.g., "file is getting large") → note and proceed to review

**NEEDS_CONTEXT:** Agent needs information not provided. Provide missing context and re-dispatch.

**BLOCKED:** Agent cannot complete the task. Assess the blocker:
1. Context problem → provide more context, re-dispatch
2. Needs more reasoning → re-dispatch with more capable model
3. Task too large → break into smaller pieces
4. Plan itself is wrong → escalate to task owner

**Never** ignore an escalation or force retry without changes.

## Two-Stage Review

After each subtask implementation:

### Stage 1: Spec Compliance Review

Dispatch a reviewer to verify the implementation matches the task requirements. Check for missing requirements, extra features, misunderstandings.

**Only proceed to Stage 2 after spec compliance passes.**

### Stage 2: Code Quality Review

Dispatch a reviewer to assess code quality, architecture, testing. Issue severity: Critical (must fix), Important (should fix), Minor (suggestion).

**If either reviewer finds issues:** the implementer fixes them, reviewer reviews again. Repeat until approved.

## Subagent Prompt Structure

Good subagent prompts are:
1. **Focused** — one clear problem domain
2. **Self-contained** — all context needed, pasted inline (don't make subagent read files)
3. **Specific about output** — what should the agent return?

Example:
```
You are implementing Task 3: Add validation middleware

## Task Description
[FULL TEXT of task from plan — pasted here]

## Context
[Where this fits, dependencies, what was built in previous tasks]

## Your Job
1. Implement exactly what the task specifies
2. Write tests (TDD)
3. Verify implementation works
4. Commit your work
5. Self-review
6. Report status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

## When to Escalate

Subagents should stop and escalate when:
- Task requires architectural decisions with multiple valid approaches
- Understanding requires code beyond what was provided
- Uncertain about correctness of approach
- Task involves restructuring code the plan didn't anticipate

Bad work is worse than no work. Escalation is always acceptable.

## Red Flags

**Never:**
- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Start code quality review before spec compliance passes
- Accept "close enough" on spec compliance
- Let self-review replace actual review
