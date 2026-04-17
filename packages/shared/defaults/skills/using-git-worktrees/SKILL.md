---
name: using-git-worktrees
description: Use at the start of every heartbeat for non-brainstorm tasks — ensures you're working inside an isolated git worktree tied to the task, creating one if needed.
---

# Using Git Worktrees

Invoke this skill at the start of any heartbeat when `ORCH_TASK_ID` is set and the task type is not `brainstorm`. Your goal: you must be `cd`'d inside a per-task worktree before doing any domain work.

## Inputs

- `ORCH_TASK_ID` — the deterministic key for this task's worktree.
- `ORCH_WORKSPACE_CWD` — the project's main working tree (where the daemon launched you).
- Task title — fetch via `GET ${ORCH_API_URL}/api/tasks/${ORCH_TASK_ID}` if you don't already have it.

## Procedure

1. Compute the slug from the task title:
   - lowercase
   - replace any run of non-alphanumeric chars with `-`
   - strip leading/trailing `-`
   - cap at 60 chars (trim a trailing `-` if the cut leaves one)

2. The expected branch name is `task/${ORCH_TASK_ID}/${slug}`.

3. Check whether the worktree already exists from a prior wake:

   ```bash
   cd "$ORCH_WORKSPACE_CWD"
   git worktree list --porcelain | awk -v id="$ORCH_TASK_ID" '
     /^worktree / { wt = $2 }
     /^branch refs\/heads\/task\// {
       split($2, parts, "/")
       if (parts[3] == id) { print wt; exit }
     }'
   ```

   If this prints a path, `cd` into it and stop — the worktree is already there.

4. Otherwise pick a directory for new worktrees:
   - if `.worktrees/` exists in `$ORCH_WORKSPACE_CWD`, use it
   - else if `worktrees/` exists, use it
   - else if a `CLAUDE.md` at the project root mentions a worktree directory preference, use that
   - else create `.worktrees/`

5. Verify the chosen directory is gitignored. Run:

   ```bash
   git check-ignore "$dir/.keep" >/dev/null 2>&1 || {
     echo "$dir/" >> .gitignore
     git add .gitignore
     git commit -m "chore: ignore $dir worktree directory"
   }
   ```

6. Determine the default branch:

   ```bash
   defaultBranch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   defaultBranch=${defaultBranch:-$(git config --get init.defaultBranch)}
   defaultBranch=${defaultBranch:-main}
   ```

7. Create the worktree:

   ```bash
   git worktree add "$dir/task-${ORCH_TASK_ID}" -b "task/${ORCH_TASK_ID}/${slug}" "$defaultBranch"
   cd "$dir/task-${ORCH_TASK_ID}"
   ```

## Post-create dependency install

Detect and run, in order:
- `pnpm-lock.yaml` exists → `pnpm install`
- `package-lock.json` exists → `npm ci` (or `npm install` if ci fails because of missing lockfile mismatches)
- `Cargo.toml` → `cargo build --quiet`
- `pyproject.toml` → `poetry install --no-interaction` (skip if `poetry` not on PATH)
- `requirements.txt` → `pip install -r requirements.txt`
- `go.mod` → `go mod download`

Do not run a smoke test — too slow for an agent wake-up.

## Failure handling

If any step fails, log the error to `${ORCH_API_URL}/api/log` at level `error`, PATCH the task to `column: "blocked"` with a comment that quotes the failing command's stderr, and exit the heartbeat. Never crash silently.

## What NOT to do

- Don't `git worktree remove` here — that's the finishing skill's job.
- Don't switch branches inside the worktree.
- Don't assume the worktree is empty — a previous wake may have left uncommitted work.
