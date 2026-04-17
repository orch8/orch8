---
name: finishing-a-development-branch
description: Use immediately before moving a task to `done` — integrates the task branch per ORCH_FINISH_STRATEGY, removes the worktree, and cleans up local refs.
---

# Finishing a Development Branch

Invoke this skill right before you PATCH the task to `column: "done"`. You must already be `cd`'d inside the task worktree (the `using-git-worktrees` skill put you there).

## Pre-flight

1. `pwd` — confirm the path matches the task's worktree (`*/task-${ORCH_TASK_ID}`). If not, log and abort.

2. Confirm the current branch matches `task/${ORCH_TASK_ID}/*`:

   ```bash
   currentBranch=$(git rev-parse --abbrev-ref HEAD)
   case "$currentBranch" in
     task/${ORCH_TASK_ID}/*) ;;
     *) echo "wrong branch: $currentBranch"; exit 1 ;;
   esac
   ```

3. Confirm the working tree is clean — `git status --porcelain` must be empty. If dirty, log a `warn` activity and abort: the implementer must commit before this skill runs.

4. Read `$ORCH_FINISH_STRATEGY`. If unset, log and abort (the daemon guarantees it post-migration).

## Determine the default branch and worktree path once

```bash
defaultBranch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
defaultBranch=${defaultBranch:-main}
worktreePath=$(pwd)
branch="$currentBranch"
```

The snippets below use `$ORCH_WORKSPACE_CWD` to step out of the worktree before removing it (you cannot remove a worktree you're standing inside). The `{title}` and `{description + summary}` tokens are filled in by you — fetch them via the task GET endpoint.

## Strategy: `merge` (default)

```bash
cd "$ORCH_WORKSPACE_CWD"
git checkout "$defaultBranch"
git pull --ff-only origin "$defaultBranch" 2>/dev/null || true   # best-effort
git merge --no-ff "$branch" -m "Merge task ${ORCH_TASK_ID}: {title}"
git push origin "$defaultBranch" 2>/dev/null || true              # best-effort
git worktree remove "$worktreePath"
git branch -d "$branch"
```

Conflict handling: if `git merge` fails, run `git merge --abort`, post a comment with the conflict list to the task, leave the task in `in_progress`, and do NOT remove the worktree.

Push handling: if the push is rejected, `git fetch` and retry once. If still rejected, surface a `warn` activity and leave the task `in_progress`.

## Strategy: `pr`

```bash
git push -u origin "$branch"
gh pr create --base "$defaultBranch" --head "$branch" \
  --title "{title}" \
  --body  "{description + summary}"
cd "$ORCH_WORKSPACE_CWD"
git worktree remove "$worktreePath"
# branch is left live on the remote
```

If `gh` is not installed or unauthenticated, push the branch but do NOT silently fall back to `merge`. Surface a `warn` activity with a manual PR-URL hint and leave the task in `in_progress` — the agent does not mark `done`.

## Strategy: `none`

```bash
cd "$ORCH_WORKSPACE_CWD"
git worktree remove "$worktreePath"
# local branch stays, unpushed
```

## Post-cleanup

POST a final `info` activity at `${ORCH_API_URL}/api/log` describing:
- the strategy used
- the resulting ref state (merge SHA, PR URL, or "branch retained")
- any warnings emitted during the run

Then return — the orch8 skill will PATCH the task to `column: "done"`.
