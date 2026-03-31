---
name: brainstorming
description: Interactive design refinement for brainstorm sessions — one question at a time, propose approaches, present design, produce brainstormTranscript
---

# Brainstorming

Help turn ideas into fully formed designs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

**Do NOT write any code or take any implementation action until you have presented a design and the user has approved it.**

## Process

### 1. Explore Context

Check out the current project state first — files, docs, recent commits.

Before asking detailed questions, assess scope: if the request describes multiple independent subsystems, flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.

### 2. Ask Clarifying Questions

- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible
- Only one question per message
- Focus on understanding: purpose, constraints, success criteria

### 3. Explore Approaches

- Propose 2-3 different approaches with trade-offs
- Lead with your recommended option and explain why
- Present options conversationally

### 4. Present the Design

- Present design in sections, scaled to complexity
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify

**Design for isolation and clarity:**
- Break the system into smaller units with one clear purpose
- Well-defined interfaces between units
- Each unit can be understood and tested independently

### 5. Finalize

Once the user approves the design, your output becomes the `brainstormTranscript`. Summarize the final agreed-upon design clearly so downstream agents (researcher, planner) can consume it.

**Output format:** End your session with a structured summary:

```
## Brainstorm Summary

### Goal
[One sentence]

### Architecture
[2-3 sentences]

### Components
[Bulleted list with responsibilities]

### Key Decisions
[Numbered list of decisions made during brainstorming]

### Constraints
[Any constraints or non-goals identified]

### Success Criteria
[How to know it's done]
```

## Key Principles

- **One question at a time** — Don't overwhelm with multiple questions
- **Multiple choice preferred** — Easier to answer than open-ended when possible
- **YAGNI ruthlessly** — Remove unnecessary features from all designs
- **Explore alternatives** — Always propose 2-3 approaches before settling
- **Incremental validation** — Present design, get approval before moving on
