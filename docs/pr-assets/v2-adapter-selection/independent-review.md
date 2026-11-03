# Independent adapter-selection review

## Verdicts

- Spec compliance: PASS for the stated fail-closed selection requirements.
- Code quality and security: APPROVE WITH NON-BLOCKING FOLLOW-UPS. No blocking defect found in the changed resolver or its integration. Chat failure visibility and test precision have gaps described below.
- Scope: read-only review of source in `/home/hermes/projects/orch8-adapter-selection`, branch `fix/v2-adapter-selection`, HEAD `17e254e3ea22e0c433e8f9ab2bcaec3ee4bda7d4`. Only evidence files were written. No source edits, commits, pushes or merges.

## Independent verification

Fresh executions, not inherited implementation results:

| Check | Result |
| --- | --- |
| New registry and execution-boundary suites | 35 passed, zero failed or pending, both requested files present |
| Existing heartbeat.service and chat.service suites | 54 passed, zero failed or pending, both requested files present |
| Independent resolver probe | 20 invalid strings rejected without any registry property or membership access; four exact-name/legacy checks passed |
| ESLint on all three changed/new source files | Passed |
| `git diff --check` | Passed |

Vitest JSON was parsed and checked for `success`, zero failed tests/suites, and passed status for every assertion. Shell exit zero was not used as proof. The focused report also had its expected assertion count checked. Compatibility verification checked that both requested files ran.

Commands from the worktree:

```sh
VITEST_MAX_THREADS=2 pnpm --filter @orch/daemon exec vitest run src/__tests__/adapter/registry.test.ts src/__tests__/adapter-selection.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/adapter-selection/independent-focused.json
VITEST_MAX_THREADS=2 pnpm --filter @orch/daemon exec vitest run src/__tests__/heartbeat.service.test.ts src/__tests__/chat.service.test.ts --reporter=json --outputFile=/home/hermes/orch8-evidence/adapter-selection/independent-compatibility-corrected.json
node /home/hermes/orch8-evidence/adapter-selection/independent-probe.cjs
pnpm exec eslint packages/daemon/src/adapter/registry.ts packages/daemon/src/__tests__/adapter/registry.test.ts packages/daemon/src/__tests__/adapter-selection.test.ts
git diff --check
```

The independent probe transpiles the actual registry source using the installed TypeScript compiler, then uses a Proxy to detect registry reads. It covers every Object.prototype property name, `__proto__`, empty/whitespace/newline strings, case changes, trailing space, and a NUL suffix. It checks exact object identity and access keys for both supported providers and null/undefined defaults.

Evidence is in `independent-focused.json`, `independent-focused.log`, `independent-compatibility-corrected.json`, `independent-compatibility-corrected.log`, `independent-probe.cjs`, and `independent-probe.json` beside this report. An initial compatibility invocation used the nonexistent filter `heartbeat.test.ts` and therefore ran only chat tests. Its artifacts are retained as `independent-compatibility.json` and `.log`; they are superseded by the corrected two-file run and are not evidence of heartbeat verification.

I did not rerun the whole workspace build, typecheck, or full suite. The implementation report records those separately. No real provider calls were made.

## Selection and compatibility analysis

`packages/daemon/src/adapter/registry.ts:13-23` defaults only null/undefined. Strict equality against the two supported names precedes all explicit-name registry lookup. Unsupported strings always throw and cannot reach a provider through fallback, inherited property names, or extra registry properties. JSON stringification makes empty strings and control characters identifiable in errors. Exact names return the existing configured adapter objects unchanged.

The registry is an internal typed map, not user-controlled registration data. `server.ts:141-145` constructs both own properties with their respective Claude and Codex implementations. This change does not validate the integrity of a deliberately malformed injected map or protect against an already-compromised internal map; no production path for such an input was found. Legacy single-adapter injection in heartbeat and chat remains intentionally unchanged.

All production resolver calls were inspected:

- Heartbeat, `heartbeat.service.ts:495-538`: selection occurs inside the execution try/catch, before log creation, adapter configuration and execution. The catch at 920-925 calls `failRun` with `execution_error`. `failRun` at 1062 onward persists failed status, error and finishedAt, then broadcasts failure. The existing finally path releases task locks, advances the queue and clears tracking. The new DB-backed tests independently passed for invalid/empty strings, both real names and omission.
- Chat, `chat.service.ts:303-309`: selection occurs before assistant-message and run insertion, config preparation and `runAgent`. The catch at 451-476 broadcasts the selection error with a null messageId because neither placeholder exists. No assistant or run row is persisted on this failure path. The accepted user message remains. There is no retry with a different adapter.
- Environment test, `api/routes/adapter-test.ts:18-31`: the shared supported-name list rejects unsupported route names with HTTP 400 and `validation_error` before resolver or environment probe. Both supported names retain HTTP 200 in fresh route tests.

Search found only heartbeat and chat invoking `runAgent` in production. The `adapterType ?? "claude_local"` occurrence in chat detail output is display metadata, not dispatch. It preserves explicit invalid strings rather than masking them.

Agent create/update routes validate `CreateAgentSchema` and `UpdateAgentSchema` and return HTTP 400 for invalid explicit names. Their optional enums reject null while allowing omission. The DB column has NOT NULL plus a Claude default, so database-backed omission tests exercise that default; direct resolver tests separately verify null/undefined legacy compatibility. Heartbeat can encounter unsupported stored text because this column is not an enum constraint, making execution-boundary validation necessary.

Chat message POST remains asynchronous HTTP 202 from `api/routes/chats.ts:151-157`; selection failures arrive through the websocket event, not an HTTP 400. This is the existing async API contract, not successful provider execution.

## Concrete non-blocking follow-ups

### 1. Chat selection failures are transient and not displayed by the current error handler

Locations: `chat.service.ts:309,451-476`; dashboard `hooks/useChatStream.ts:51-55`; `hooks/WsEventsProvider.tsx:153-155`.

An unsupported persisted adapter leaves only the accepted user message. There is no durable failed assistant/run row. The websocket event includes the error, but the current stream handler only clears state and the provider only invalidates queries. Neither renders this error text. Reloading cannot recover it from the chat history. Thus the service reports failure to websocket consumers, but the current dashboard can look like the assistant simply never replied.

This is the preexisting pre-placeholder exception behavior newly exercised by strict selection. It does not permit execution or provider fallback, so it does not block the narrowly stated selection requirement. A follow-up should expose a chat-level error or persist a failed turn without calling a provider, and test reconnect/reload visibility.

### 2. Negative chat tests do not assert the exact failure-state contract

Location: `__tests__/adapter-selection.test.ts:78-82`.

The tests assert the error text and absence of both adapter calls, but not null messageId, absence of assistant/run rows, or the retained user-message state. The implementation report says the null-message-ID error path was tested; that specific field is only established by source inspection here. Add explicit persisted-state and messageId assertions so a change that leaves a streaming placeholder cannot pass unnoticed. Prototype names are tested directly in the resolver and environment route, while service integration tests use unknown and empty strings; expanding one service case to `__proto__` would strengthen integration coverage but is not necessary to establish the current strict-equality behavior.

## Reviewed source fingerprints

SHA-256 values from the reviewed worktree after verification:

```text
b658484171108980dfc0edead78fedde7f311dedd38bf3f0b61dfacb22abb5e0  packages/daemon/src/adapter/registry.ts
c79bca5164f25e72090d4807e4f15eded17d08360a75f153ffb38125e0f7b278  packages/daemon/src/__tests__/adapter/registry.test.ts
3bb042a622f3db6085a2aeb6cee847b519bb743fd7e99b17eb64c89aac3eca5f  packages/daemon/src/__tests__/adapter-selection.test.ts
```

Final git status still lists exactly the original modified registry and two untracked test files.
