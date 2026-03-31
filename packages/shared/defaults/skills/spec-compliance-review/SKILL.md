---
name: spec-compliance-review
description: Verify implementation matches its specification — check for missing requirements, extra features, and misunderstandings
---

# Spec Compliance Review

Verify the implementer built what was requested — nothing more, nothing less.

**Core principle:** Do not trust the implementer's self-report. Read the actual code.

## Process

### 1. Read the Specification

Understand every requirement. Make a checklist.

### 2. Read the Implementation

Read the actual code that was written. Don't rely on commit messages, PR descriptions, or the implementer's status report.

### 3. Compare Line by Line

**Check for missing requirements:**
- Did they implement everything requested?
- Are there requirements they skipped or missed?
- Did they claim something works but didn't actually implement it?

**Check for extra/unneeded work:**
- Did they build things that weren't requested?
- Did they over-engineer or add unnecessary features?
- Did they add "nice to haves" that weren't in spec?

**Check for misunderstandings:**
- Did they interpret requirements differently than intended?
- Did they solve the wrong problem?
- Did they implement the right feature but the wrong way?

### 4. Report

**If spec compliant:**
```
✅ Spec compliant — all requirements met, nothing extra
```

**If issues found:**
```
❌ Issues found:
- Missing: [what's missing, with spec reference]
- Extra: [what was added but not requested]
- Misunderstood: [what was interpreted incorrectly]
  File references: [file:line for each issue]
```

## Rules

- **Verify by reading code, not by trusting reports.** The implementer finished suspiciously quickly. Their report may be incomplete or optimistic.
- **Missing requirements are blockers.** The implementation is not done until every spec requirement is met.
- **Extra features are issues too.** Unrequested features add maintenance burden and may not match the design intent.
- **Be specific.** "Missing error handling" is vague. "Missing validation for empty email in `auth.ts:45`" is actionable.

## Integration with orch8

When used during the review phase of a complex task, your output populates `reviewOutput`. Issues map to task comments:
- Missing requirement → comment type `verification`, severity `critical`
- Extra feature → comment type `inline`, severity `important`
- Misunderstanding → comment type `verification`, severity `critical`
