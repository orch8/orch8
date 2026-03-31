---
name: code-quality-review
description: Code quality assessment independent of spec compliance — architecture, testing, maintainability with severity-categorized issues
---

# Code Quality Review

Assess code quality independent of spec compliance. The spec compliance review verifies WHAT was built. This review verifies it was built WELL.

## Review Checklist

**Code Quality:**
- Clean separation of concerns?
- Proper error handling?
- Type safety?
- DRY principle followed?
- Edge cases handled?
- Each file has one clear responsibility?
- Units can be understood and tested independently?

**Architecture:**
- Sound design decisions?
- Follows existing codebase patterns?
- Scalability considerations?
- Performance implications?
- Security concerns?

**Testing:**
- Tests actually test logic (not mocks)?
- Edge cases covered?
- Integration tests where needed?
- All tests passing?

**Production Readiness:**
- Migration strategy (if schema changes)?
- Backward compatibility considered?
- No obvious bugs?

## Output Format

### Strengths
[What's well done — be specific with file:line references]

### Issues

#### Critical (Must Fix)
[Bugs, security issues, data loss risks, broken functionality]

#### Important (Should Fix)
[Architecture problems, missing edge cases, poor error handling, test gaps]

#### Minor (Suggestion)
[Code style, optimization opportunities, naming improvements]

**For each issue:**
- File:line reference
- What's wrong
- Why it matters
- How to fix (if not obvious)

### Assessment

**Ready to merge?** [Yes / No / With fixes]

**Reasoning:** [1-2 sentence technical assessment]

## Rules

**DO:**
- Categorize by actual severity (not everything is Critical)
- Be specific (file:line, not vague)
- Explain WHY issues matter
- Acknowledge strengths
- Give a clear verdict

**DON'T:**
- Say "looks good" without checking
- Mark nitpicks as Critical
- Give feedback on code you didn't review
- Be vague ("improve error handling")
- Avoid giving a clear verdict

## Integration with orch8

Issue severities map to task comment types:
- Critical → comment type `verification`, blocks task completion
- Important → comment type `inline`, should fix before merge
- Minor → comment type `inline`, suggestion only
