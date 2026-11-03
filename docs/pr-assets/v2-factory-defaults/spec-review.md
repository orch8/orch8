# Factory-defaults independent specification review

## Verdict

PASS for the reviewed production-code scope, with acceptance evidence gaps. This is not an unconditional all-gates-green or merge approval.

Reviewed `/home/hermes/projects/orch8-factory-defaults`, branch `feat/v2-factory-defaults`, HEAD `87267e7df8d9c28568c3ed880899221c850018b6`, against `/home/hermes/orch8-research/simplification-first-pr.md`. Review used the dirty tracked diff, new fixture/tests, saved JSON assertions, browser records, logs and snapshot comparisons. No application edits, broad test reruns, commits or pushes were performed. Saved screenshots were inventoried, not independently visually inspected.

## Specification findings

- Both automatic Welcome-chat call sites are removed, and only those calls are removed from daemon production code. `ProjectService.create` still provisions the chat agent and the existing pipeline. Startup still repairs chat agents and reconciles skills. `ensureInitialChat` remains available and is explicitly exercised by the compatibility fixture.
- The wizard has the specified intro-dependent step sequence, no conversational branch or chat mutation, no static verification settings page, and retains repository, branch and budget fields. Optional agents start empty. Only implementer/reviewer are offered through an optional `allowedIds` prop; ordinary agent creation still retains the catalog and Blank Agent. The optional first task remains an unassigned quick task. Errors remain visible without a new retry contract.
- Project root redirects to Board with replacement. Both wizard callers navigate through that root, and `/projects/new` retains `showIntro={false}`. A real-router test checks resolved URL and history length.
- WORK, SETUP and MONITOR retain the requested links. Chat, Briefing and Memory are grouped below them under More, absent without a project slug, closed by default and auto-open on matching deep links including nested Chat. More retains active styling in icon mode and a native keyboard-operable button. The mobile fix closes the actual sidebar store as well as invoking optional `onClose`.
- No changes to schemas, migrations, default agent definitions, scheduler, approvals, pipeline progression, chat/memory/summary routes, ProjectSwitcher or task-local comment production code appear in the reviewed tracked diff. Existing CTO/QA heartbeats remain intentional and enabled. The explicit legacy installation test checks both roles and retained heartbeat intervals across two startups.
- `factory-defaults.test.ts` verifies zero conversations, only the compatibility chat agent, zero tasks/runs and the existing four pipeline labels at creation and after two initializations. Legacy conversation/message IDs and contents, memory entity and CTO/QA configuration survive two initializations. The fake spawn rejects provider execution and scheduler start is stubbed. This proves startup/setup behavior under the stated fixture, not live scheduler operation or idle behavior of legacy projects.
- `docs/factory-defaults.md` exists and records migration rules, retained capabilities, heartbeat behavior, navigation and the partial-setup retry limitation. It was read during this review; repository evidence work appears to be ongoing independently.

No concrete production-code specification violation was found in this bounded review.

## Recovered test evidence, independently parsed

Primary saved evidence is `/home/hermes/orch8-evidence/factory-final/`.

| Report | JSON assertions | Result |
| --- | --- | --- |
| `daemon.json` | 773 of 773 passed | PASS, success true, zero failed suites |
| `shared.json` | 180 of 180 passed | PASS |
| `cli.json` | 4 of 4 passed | PASS |
| `dashboard.json` | 276 of 277 passed | FAIL, success false |
| `mobile-red.json` | 14 of 15 passed | Expected regression failure, actual mobile drawer did not close |
| `mobile-green.json` | 15 of 15 passed | PASS after mobile fix |

These counts were recalculated from every `testResults[].assertionResults[]`, not accepted from command exit alone. The saved daemon report includes factory-defaults, seeding, project-seeding, startup, chat/memory routes, comment service/routes, wake-targets and the 25-assertion pipeline-approval-safety suite. The saved dashboard report includes wizard, full agent catalog, real index routing, project layout/switcher and retained chat/memory/briefing/task UI tests.

The dashboard failure is the obsolete `home.test.tsx` assertion expecting Chat instead of Board. The current file has already been updated; it is not a current demonstrated implementation failure.

I ran only this focused verification against the current sources:

```sh
pnpm --filter @orch/dashboard exec vitest run src/__tests__/home.test.tsx src/__tests__/sidebar.test.tsx src/__tests__/project-index-route.test.tsx --reporter=json --outputFile=/home/hermes/orch8-evidence/factory-defaults-review-focused.json
```

Exit 0. Independently parsed JSON reports success true, 17 actual assertions, all 17 passed, zero failed tests and zero failed suites. This covers the changed home assertion, mobile fix, disclosure/deep-link behavior and real project-root redirect. It does not replace a final full dashboard gate.

## Evidence freshness and contradictions

1. The saved snapshot is not the final tree. Byte comparison of its tracked patch against current `git diff` finds subsequent changes only in `home.test.tsx`, `sidebar.test.tsx` and `components/layout/Sidebar.tsx`. All three saved untracked files, including the daemon defaults test and real-router test, remain byte-identical to their snapshot copies.
2. The saved full dashboard report predates the added mobile regression and fix and the home-test correction. Source mtimes are 00:47:58 UTC for sidebar tests, 00:48:35 for Sidebar, and 00:49:21 for home tests on 2026-11-03. `dashboard.json` was written at 00:47:18. Do not present it as passing or as evidence for the final sidebar implementation.
3. `mobile-green.json` was written at 00:48:57, after the sidebar source fix. It passes all 15 sidebar assertions. The fresh focused report also passes them.
4. `gates.json` records successful initial typecheck, lint and build, but those initial gates predate the final sidebar changes. The current `typecheck.log` has been overwritten by a later unsuccessful run and ends with ELIFECYCLE and exit 1. The manifest's typecheck success therefore does not describe the current log. The log contains no specific compiler diagnostic establishing the cause; do not label it a source defect or a clean typecheck without further evidence.
5. `compat-browser-evidence.json` records the pre-fix mobile failure: its `mobile-memory-after-link` text still includes the Sidebar dialog. This is historical RED evidence, not a final successful close check.
6. The later `mobile-fixed.py` asserts drawer hidden and the Memory URL before saving `mobile-memory-fixed.png`. The surviving `mobile-fixed.log` shows execution progressed into the subsequent desktop check, where it timed out clicking a hidden sidebar rail selected by `.first`. Thus the mobile assertions completed, but the combined browser script did not finish. Neither `mobile-fixed.json` nor `more-collapsed-desktop.png` survived because the write occurs after the failed desktop action. Do not claim a completed collapsed-desktop browser acceptance run.
7. A repository-local `docs/pr-assets/v2-factory-defaults/dashboard-final.json` also still reports 276 of 277 passing with the obsolete Chat assertion at the time inspected. Its filename is not evidence of freshness. `verification-status.json` references a separate 768-test daemon run, not the recovered 773-test external report; keep their provenance separate.

## Compatibility browser and API evidence

- Before evidence explicitly names baseline `87267e7df8d9c28568c3ed880899221c850018b6`, matching the actual implementation base rather than the plan's older audit SHA.
- Saved onboarding requests contain only the project POST for the skip-agents/skip-task path. The resolved completion URL is `/projects/browser-fresh/board`; API readback shows zero chats, zero tasks and the retained chat agent with heartbeat disabled.
- Saved normal-agent browser text includes the full catalog, CTO/QA heartbeat indications and Blank Agent. Legacy Chat and Memory URLs retain content, and later API readback contains the original message, memory entity and fact identifiers/content.
- Task-local browser evidence shows the existing question and submitted reply. `compat-posts.json` records `notify:false`; `comment-readback.json` contains both persisted comments scoped to `FAC-1`. The unchanged daemon comment service tests separately cover notify-disabled behavior and taskId/commentId wakeup metadata. This is not evidence of a live paid-agent wakeup and does not need to be.
- Saved desktop/mobile browser JSON records no page errors or horizontal overflow for its captured screens. The later collapsed-desktop browser interaction remains incomplete as noted above.

## Remaining acceptance gaps

1. Reconcile final gate provenance. A full dashboard report for the final source tree is still missing from the inspected saved evidence. Focused current tests pass, but the full saved report remains red. Obtain final typecheck/lint/build results after the final sidebar fix or explicitly retain them as pending rather than reusing the initial manifest.
2. Complete the collapsed-sidebar browser keyboard check with a visible toggle selector and save its result. Existing unit coverage proves deep-link active state in collapsed mode and keyboard disclosure in expanded mode, but the combined browser check stopped before collapsed-mode keyboard actions.
3. Preserve the historical RED evidence and distinguish it from final GREEN records when assembling PR assets. Include final source identity or hashes so a later reader can bind results to the actual dirty-tree revision.
4. The defaults test checks pipeline name/default status and step labels, not a byte-for-byte complete template configuration. The production pipeline code is unchanged, so this is a coverage limit rather than a demonstrated regression. The startup preservation fixture also does not independently snapshot every summary, run, artifact or filesystem instruction; preservation of those paths is supported here by the narrow unchanged production diff and broader existing regression suites.

Only this review document and the focused JSON report were created by this reviewer. No implementation restart was needed.
