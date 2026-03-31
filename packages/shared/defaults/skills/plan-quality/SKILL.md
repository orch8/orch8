---
name: plan-quality
description: Standards for implementation plans — bite-sized tasks, no placeholders, complete code, self-review checklist
---

# Plan Quality

Write implementation plans that an engineer with zero codebase context can execute successfully. Every task bite-sized. Every step complete. No ambiguity.

## Plan Structure

### Header

Every plan starts with:
- **Goal:** One sentence describing what this builds
- **Architecture:** 2-3 sentences about approach
- **Tech Stack:** Key technologies/libraries

### File Map

Before defining tasks, map out which files will be created or modified and what each one is responsible for.

- Each file should have one clear responsibility
- Prefer smaller, focused files over large ones
- Files that change together should live together
- Follow existing codebase patterns

### Task Granularity

Each step is one action (2-5 minutes):
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

### Task Format

Each task includes:
- **Files:** Exact paths (create, modify, test)
- **Steps:** Numbered, with checkbox tracking
- **Code:** Complete code in every code step
- **Commands:** Exact run commands with expected output

## No Placeholders

These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the implementer may read tasks out of order)
- Steps that describe what to do without showing how
- References to types, functions, or methods not defined in any task

## Self-Review Checklist

After writing the complete plan, review it:

**1. Spec coverage:** Skim each requirement. Can you point to a task that implements it? List gaps.

**2. Placeholder scan:** Search for any "No Placeholders" violations. Fix them.

**3. Type consistency:** Do types, method signatures, and property names used in later tasks match earlier definitions? `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

Fix issues inline. If a spec requirement has no task, add the task.

## Output Format

The plan's output becomes `planOutput`. The implementer agent consumes this directly. Everything the implementer needs must be in the plan — they don't read the research output or brainstorm transcript.
