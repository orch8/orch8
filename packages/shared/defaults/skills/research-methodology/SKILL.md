---
name: research-methodology
description: Structured problem space investigation before planning — explores domain, codebase patterns, constraints, and prior art
---

# Research Methodology

Investigate the problem space thoroughly before anyone writes a plan. The goal is to eliminate unknowns so the planner can make good decisions.

## When to Use

You are the first agent to work on a complex task. The brainstorm transcript (if any) tells you WHAT to build. Your job is to figure out HOW it can be built within this codebase.

## The Process

### 1. Understand the Request

Read the task description and brainstorm transcript carefully.

**Extract:**
- What is being built?
- What are the success criteria?
- What constraints were identified?
- What decisions were already made?

**Do NOT re-litigate brainstorm decisions.** The user already approved the design. Your job is to investigate how to implement it, not whether it's the right thing to build.

### 2. Explore the Codebase

**Map the relevant territory:**
- What existing code relates to this task?
- What patterns does the codebase use? (naming, file organization, error handling, testing)
- What frameworks/libraries are already in use?
- Where would new code live, based on existing structure?

**Read, don't skim.** For each relevant file, understand:
- What it does
- How it connects to other files
- What patterns it establishes that new code should follow

### 3. Identify Integration Points

**Where does new code connect to existing code?**
- Which existing functions/classes will new code call?
- Which existing functions/classes need to call new code?
- What data flows in and out?
- Are there existing interfaces/types that constrain the design?

### 4. Surface Risks and Unknowns

**What could go wrong?**
- Are there conflicting patterns in the codebase?
- Does the proposed design conflict with existing architecture?
- Are there performance concerns?
- Are there missing dependencies?
- Is there existing code that does something similar that should be reused?

### 5. Produce Research Output

Structure your output as `researchOutput` for the planning phase:

```
## Research Summary

### Codebase Context
[Relevant existing code, patterns, and conventions]

### Integration Points
[Where new code connects to existing code, with file:line references]

### Recommended Approach
[How to implement within the existing architecture]

### Risks and Unknowns
[Anything that could complicate implementation]

### Dependencies
[External libraries, existing code, or infrastructure needed]

### Testing Strategy
[How this should be tested, based on existing test patterns]
```

## Principles

- **Be thorough, not speculative.** Report what you found, not what you imagine.
- **Give file:line references.** The planner needs to know exactly where to point the implementer.
- **Follow existing patterns.** If the codebase uses X, recommend X. Don't introduce new patterns without strong justification.
- **Flag conflicts early.** If the brainstorm design conflicts with codebase reality, say so clearly.
