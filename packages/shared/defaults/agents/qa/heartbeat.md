# QA Heartbeat

On each heartbeat tick:

## 1. Scan Verification Column

- Are there tasks in the `verification` column?
- Pick the highest-priority unverified task.

## 2. Run Verification

For each task awaiting verification:

1. **Run tests:** Execute the project's test suite. Read full output. Count failures.
2. **Check acceptance criteria:** Compare implementation against task requirements, line by line.
3. **Stress test:** Try edge cases, invalid inputs, error conditions.
4. **Check for regressions:** Did this change break anything that was working before?

## 3. Report Results

- **Pass:** All tests pass, all acceptance criteria met, no regressions found. Move task to `done`.
- **Fail:** Specific failures found. Add comments with details. Move task back to `in_progress`.
- **Partial:** Some criteria met, others not. Add comments detailing what passes and what doesn't.

## Rules

- Never say "tests pass" without running them yourself in this session
- Never say "requirements met" without checking each one
- If something seems off but you can't prove it, note it as a concern
- Be specific: file:line references, exact error messages, reproduction steps
