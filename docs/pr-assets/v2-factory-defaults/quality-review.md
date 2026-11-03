# Factory-defaults independent quality and security review

## Verdict

PASS for the bounded production diff and requested navigation behavior. No introduced security or functional blocker found. This is not a full-gate or merge approval. Three visual follow-ups remain in unchanged shared/page layout code, listed below.

Reviewed dirty branch `feat/v2-factory-defaults` at HEAD `87267e7df8d9c28568c3ed880899221c850018b6` in `/home/hermes/projects/orch8-factory-defaults`. Read the specification review and simplification scope. No source edits, commits, pushes or merges. Full tests/typecheck/lint/build belong to the separate gate run and were not repeated here.

## Source identity

Complete per-file SHA-256 manifest: `/home/hermes/orch8-evidence/factory-quality/source-hashes.json`.

- Tracked diff SHA-256: `9093a6f0da0e2d798eb79ee37d0016f6109c6b16b49ae2a6362aa41e48e5fcc1`
- Sidebar.tsx: `03c7be5fe59be82540420d17be7818e21e7fb4ab35e9aa300dcdeebd8aa6133e`
- WelcomeWizard.tsx: `f0d142b78ef5041a51cc745981b0bd091dfdf303da99526a4cf58e4ad574bcb2`
- server.ts: `b405c27afa3fe7980ccbf34e1f116f2045ef95406aa4bd51a4788fa7f9c74a88`
- project.service.ts: `57a9da0eb66db02fb72bc7aaef368f8fb2f720860943b4d95c1b51f415e6c678`

Rehashed every manifest source after browser verification. No source hashes changed during this review. `git diff --check` exited zero.

## Code review

- The only daemon production changes remove automatic `ensureInitialChat` calls at project creation and startup. Chat agent provisioning and startup reconciliation remain. No new database mutation, schema/migration, permission boundary or execution path was introduced.
- The wizard removes its conversational branch, static verification claim and direct chat mutation. It retains explicit project creation, optional selected agent installation, optional unassigned quick task and visible mutation errors. The known partial-setup retry issue is pre-existing and explicitly outside this PR.
- The onboarding allowlist affects only callers passing `allowedIds`. Ordinary agent creation still exposes CTO, QA and Blank Agent. Bundled definitions are unchanged. Existing CTO/QA heartbeats are not disabled. The new compatibility test explicitly installs both roles through the API and compares heartbeat settings through two startups.
- More uses a native button, accessible name, expanded state, route-aware active state and original Chat/Briefing/Memory destinations. Nested Chat still matches. Mobile link handling now closes the actual sidebar store and preserves the optional callback.
- Project root still uses replacement navigation, now to Board. Explicit legacy URLs are untouched. ProjectSwitcher, task-comment components/services, wake-targets, seeding implementation, defaults and migrations have no diff from HEAD. No approval/scheduler logic is changed.
- Manual review found no added injection, unsafe HTML, credential exposure or destructive migration. The tracked added-line scan has no matches for dangerous execution, hardcoded secret assignments or obvious SQL interpolation. Results: `factory-quality/security-scan.json`. This is a targeted diff review, not a repository-wide security audit.
- The browser fixture's fixed token is deliberately test-only, bound to localhost, guarded by a disposable HOME requirement and excluded from production startup. It disables scheduler start and rejects provider execution. Do not reuse that token/fixture for production service exposure.

## Actual browser verification

Used the existing fixture with a new temporary HOME `/tmp/orch8-factory-browser-quality-hK6OQuQo`, isolated embedded Postgres, no real user database and no provider execution. Vite served the reviewed working tree at localhost:5173 and proxied only to that fixture at localhost:3847. Fixture IDs are saved in `factory-quality/fixture.json`.

Desktop viewport was 1440x900, mobile 390x844. Saved 16 actual screenshots. Fourteen capture records have no document-level horizontal overflow and no page errors. Two additional verification screenshots accompany successful keyboard navigation and persisted comment submission. These screenshots were inspected visually, not just inventoried.

Verified:

1. Project root resolves to `/projects/factory-fixture/board`; More starts closed and opens with Enter.
2. Desktop sidebar collapses using the visible header trigger. More closes with Enter, opens with Space, and Tab reaches Chat, Briefing and Memory in order. Enter on Memory navigates to the original URL. More remains active on the legacy route. `verification.json` records these assertions from an exit-zero run.
3. Mobile sidebar opens, More expands with Enter, all three destinations are readable, and selecting Memory closes the actual Sidebar dialog. The original Memory URL and compatibility entity remain visible. `browser-extra.py` exited zero with `mobileDrawerClosed: true`.
4. Existing nested Chat shows its saved discussion/message and active More/Chat links. Memory lists the compatibility entity. Briefing remains reachable and activates More in collapsed mode.
5. Onboarding shows Project/Agents/First Task without the removed setup choice/settings page. Only implementer/reviewer appear in onboarding and neither is selected. Ordinary agent creation visibly retains the full catalog, CTO/QA heartbeat badges and Blank Agent.
6. Task-local clarification remains on FAC-1. Submitted `Independent review: preserve task-local clarification.` with Notify agent off. Captured POST explicitly has `notify:false`; API readback contains the comment and matching task ID. No generic Chat interaction or provider execution was needed. This does not claim a live notify-enabled agent wakeup.

### Screenshot paths

All paths below are relative to `/home/hermes/orch8-evidence/factory-quality/`.

| Screenshot | Evidence |
| --- | --- |
| `desktop-board.png` | Board entry, More closed |
| `desktop-more.png` | Expanded disclosure and desktop layout |
| `desktop-collapsed-closed.png` | Collapsed sidebar, disclosure closed |
| `desktop-collapsed-more.png` | Collapsed disclosure open |
| `desktop-collapsed-active.png` | Briefing deep link, active More |
| `collapsed-keyboard-memory.png` | Keyboard navigation to Memory |
| `mobile-board.png` | Mobile Board and existing toolbar clipping |
| `mobile-more.png` | Mobile drawer and readable More links |
| `mobile-memory-closed.png` | Drawer closed after link selection |
| `legacy-chat.png` | Preserved message and nested Chat URL |
| `legacy-memory.png` | Preserved compatibility entity |
| `normal-agent-catalog.png` | Explicit legacy templates remain available |
| `onboarding-project.png` | Retained project fields and revised step sequence |
| `onboarding-agents.png` | Restricted optional onboarding choices |
| `task-comments.png` | Existing task-local question and notify toggle |
| `task-comment-submitted.png` | New task-local reply, Notify agent off |

Supporting records: `browser.json`, `browser-extra.json`, `verification.json`, `comments-readback.json`. Reproduction scripts: `browser.py`, `browser-extra.py`, `verify.py`.

## Non-blocking visual findings

| ID | Severity | Finding and reproduction | Scope/evidence |
| --- | --- | --- | --- |
| Q1 | Low | Collapse desktop sidebar. Project heading/status text is cropped rather than replaced with a compact presentation; active/focus outlines around navigation icons are narrow. More remains keyboard-operable and its active state is visible. | `desktop-collapsed-active.png`, `desktop-collapsed-more.png`. Shared Sidebar sizing/group padding and ProjectSwitcher are unchanged. New More inherits the existing narrow control presentation. |
| Q2 | Medium | Open Board at 390x844. The filter row clips the New task control at its right edge. Document overflow is false, so an overflow-only assertion misses this visual defect. | `mobile-board.png`. Board page/toolbar are unchanged by this PR. Follow up on mobile toolbar wrapping or scrolling; not demonstrated as a new regression. |
| Q3 | Medium | Select Memory from mobile More. Drawer closes correctly, but the existing two-pane Memory layout leaves its right pane extremely narrow and clips the tab row. | `mobile-memory-closed.png`. Memory page is unchanged. Follow up with a responsive stacked/detail view; not a regression from the close fix. |

These findings prevent calling the entire existing application visually polished, but do not invalidate the requested defaults/navigation change. No baseline browser was rerun for these observations; their unchanged source attribution was checked with git.

## Tool issues and evidence limits

- The old collapsed-navigation timeout is explained: the first `Toggle sidebar` match is the rail with a zero-height rectangle at y=900, while the visible header trigger is a separate button. Selecting `[data-slot="sidebar-trigger"]` resolves this without forced clicks or hidden-element activation.
- The initial browser script completed and saved its five desktop navigation captures, then Chromium returned `Page.captureScreenshot: Unable to capture screenshot` on a later Chat capture. That script exited nonzero. Fresh pages in `browser-extra.py` captured all remaining screens successfully; `verify.py` separately completed the collapsed keyboard assertions and comment persistence with exit zero. Do not present the first script as an entirely successful run.
- Vite logged WebSocket ECONNRESET messages while browser contexts were closed. Captured pages and verification runs reported no page errors. This review does not establish long-lived socket reliability.
- Startup preservation, explicit CTO/QA installation across restarts and complete gate totals were reviewed through source/spec evidence, not rerun here. The browser fixture is intentionally not proof of a live scheduler being idle on legacy projects.
- Fixture shutdown returned success; its process exited zero and Postgres reported shutdown. The owned Vite process was stopped. No review servers were intentionally left running.
