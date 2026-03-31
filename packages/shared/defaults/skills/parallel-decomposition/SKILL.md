---
name: parallel-decomposition
description: How to decompose work into parallel-safe chunks — identify independent domains, scope to avoid shared state, determine when parallelization is appropriate
---

# Parallel Decomposition

When you have multiple independent problems, solving them sequentially wastes time. Identify independent domains and dispatch them in parallel.

## When to Use

**Use when:**
- 3+ tasks or failures with different root causes
- Multiple subsystems that can be worked on independently
- Each problem can be understood without context from others
- No shared state between investigations

**Don't use when:**
- Tasks are related (fixing one might fix others)
- Need to understand full system state first
- Agents would interfere with each other (editing same files, using same resources)

## The Pattern

### 1. Identify Independent Domains

Group work by what's independent:
- Different subsystems with no shared code
- Different test files testing different functionality
- Different features touching different parts of the codebase

**Independence test:** Would fixing/building Domain A affect Domain B in any way? If yes, they're not independent.

### 2. Create Focused Agent Tasks

Each agent gets:
- **Specific scope:** One domain or subsystem
- **Clear goal:** What "done" looks like
- **Constraints:** What NOT to change
- **Expected output:** Summary of what was done

### 3. Dispatch in Parallel

Send all independent tasks at once. Each agent works concurrently in its own scope.

### 4. Review and Integrate

When agents return:
- Read each summary
- Verify fixes/implementations don't conflict
- Run full test suite
- Integrate all changes

## Common Mistakes

**❌ Too broad:** "Fix all the tests" — agent gets lost
**✅ Specific:** "Fix agent-tool-abort.test.ts" — focused scope

**❌ No context:** "Fix the race condition" — agent doesn't know where
**✅ Context:** Paste the error messages and test names

**❌ No constraints:** Agent might refactor everything
**✅ Constraints:** "Only modify files in src/validation/"

**❌ Vague output:** "Fix it" — you don't know what changed
**✅ Specific:** "Return summary of root cause and changes made"

## When NOT to Parallelize

**Related work:** Fixing one thing might fix others — investigate together first.
**Need full context:** Understanding requires seeing the entire system.
**Exploratory work:** You don't know what's broken yet — investigate first, parallelize after.
**Shared state:** Agents would edit the same files or use the same resources.

## Verification After Integration

After all parallel agents return:
1. **Review each summary** — Understand what changed
2. **Check for conflicts** — Did agents edit same code?
3. **Run full suite** — Verify all changes work together
4. **Spot check** — Agents can make systematic errors
