# Orch8

Orch8 is a local-first control plane for AI agent organizations. It gives a team of agents a shared operating board, durable memory, budgets, skills, run logs, and a dashboard where humans can supervise work across an entire project, department, or company.

The current runtime is built around a daemon that runs on your machine, a React dashboard, and local agent adapters for tools such as Claude Code and Codex CLI. Software work is one strong use case, but the orchestration model is broader: any repeatable, reviewable workflow can become agent work.

## What Orch8 Does

- Runs agent teams from a dashboard or API.
- Keeps each operating context isolated with its own agents, tasks, memory, budget, skills, and execution workspace.
- Lets agents claim tasks atomically, do the work, and report back through comments and run events.
- Supports quick tasks, brainstorm tasks, and reusable pipeline templates for multi-step work.
- Coordinates work across domains such as engineering, research, operations, support, planning, and company administration.
- Streams agent output and structured run events to the dashboard over WebSocket.
- Tracks token/cost usage, project activity, notifications, errors, and agent status.
- Seeds default agent roles and skills, while allowing project-specific customization.
- Exposes the same control plane through REST, WebSocket, OpenAPI docs, and a thin CLI.

## Repository Layout

```text
packages/
  daemon/       Fastify API, scheduler, adapters, embedded Postgres, orchestration services
  dashboard/    React 19 + Vite dashboard for projects, tasks, chat, runs, memory, cost
  shared/       Zod schemas, Drizzle tables, defaults, parsers, shared types
  cli/          Commander-based project scripting client
```

## Architecture

```text
Dashboard (React/Vite)
  | REST + WebSocket
  v
Daemon (Fastify)
  | scheduler, task lifecycle, chat, pipelines, memory, budgets
  | Drizzle ORM
  v
Embedded Postgres

Daemon
  | local adapter process
  v
Claude Code CLI / Codex CLI
  | task workspace
  v
Your company/project workspace
```

The dashboard is the primary interface. The daemon owns the source of truth: projects, agents, tasks, pipeline templates, chat messages, run history, memory, cost, notifications, and audit events.

## Requirements

- Node.js 20+
- pnpm 9.15+
- Git, for repository-backed workspaces
- One or more local agent runtimes:
  - Claude Code CLI, authenticated locally, for `claude_local` agents
  - Codex CLI, authenticated locally, for `codex_local` agents

Orch8 starts an embedded Postgres instance automatically in development. No separate database is needed for the default setup. The current task execution layer is strongest with git-backed workspaces because agents can isolate changes in worktrees.

## Quick Start

```bash
pnpm install
pnpm build
pnpm dev
```

Then open the dashboard:

- Dashboard: `http://localhost:5173`
- Daemon API: `http://localhost:3847/api`
- OpenAPI UI: `http://localhost:3847/docs`

On first boot the daemon writes an admin token to:

```text
~/.orch8/admin-token
```

The Vite dev server reads that file and injects the token into proxied dashboard requests, so the dashboard works without exposing the token to browser JavaScript.

## Create a Project

Use the dashboard welcome flow first. It will ask for:

- Project name and slug
- Workspace path, currently usually a git repository
- Default branch, for repository-backed work
- Optional budget limit
- Agent templates to install
- Optional starter task

The daemon will then provision project state, sync project skills, ensure an initial chat thread exists, and make the project available in the sidebar.

You can also create a project through the API:

```bash
TOKEN="$(cat ~/.orch8/admin-token)"

curl -s http://localhost:3847/api/projects \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example Company",
    "slug": "example-company",
    "homeDir": "/absolute/path/to/company-workspace",
    "defaultBranch": "main",
    "finishStrategy": "merge"
  }'
```

## Core Concepts

**Projects**

A project is an operating context for a team of agents. It can represent a company, department, product, client, research program, or software repository. Each project has its own task board, agents, skills, memory, run history, budget, and integration strategy.

**Agents**

Agents are configured workers with a role, model, adapter type, skills, permissions, budget, heartbeat settings, and wakeup behavior. Bundled defaults include chat, CTO, implementer, planner, QA, researcher, and reviewer agents, and projects can define their own roles for operations, sales, support, finance, research, or anything else.

**Tasks**

Tasks live on a small Kanban board:

```text
backlog -> in_progress -> done
          \-> blocked
```

Agents checkout tasks before work begins. Checkout creates or attaches the task execution lock and workspace so two agents do not work over the same task at the same time.

**Chats**

Each project has chat threads. Chat agents can discuss project state and propose state-changing actions using confirmation cards before anything is applied.

**Pipelines**

Pipeline templates describe repeatable multi-step workflows. They are useful for work that needs planning, execution, review, QA, approvals, handoffs, or other project-specific gates.

**Skills**

Skills are local instruction bundles copied from `packages/shared/defaults/skills` into the user/project Orch8 area. Agents receive only the skills selected for their role or task.

**Memory**

Memory stores project facts and summaries in Postgres so agents can recover context across short-lived runs instead of relying on a single long session.

## Development Commands

```bash
pnpm dev          # Run daemon and dashboard through Turborepo
pnpm build        # Build packages that have build outputs
pnpm test         # Run all Vitest suites
pnpm typecheck    # Type-check all packages
pnpm lint         # Run ESLint
```

Useful package-level commands:

```bash
pnpm --filter @orch/daemon dev
pnpm --filter @orch/dashboard dev
pnpm --filter @orch/daemon test
pnpm --filter @orch/dashboard test
```

## Configuration

The daemon reads `~/.orch8/config.yaml` first. Environment variables can override selected values.

Example:

```yaml
orchestrator:
  tick_interval_ms: 5000
  log_level: info

api:
  host: localhost
  port: 3847

auth:
  allow_localhost_admin: false

database:
  port: 5433
  auto_migrate: true

defaults:
  model: claude-opus-4-7
  max_turns: 180
  auto_commit: false
  auto_pr: true
  verification_required: true

limits:
  max_concurrent_agents: 5
  max_concurrent_per_project: 3
  max_spawns_per_hour: 20
```

Common environment variables:

```bash
ORCH_HOST=localhost
ORCH_PORT=3847
ORCH_PG_PORT=5433
ORCH_DB_PASSWORD=orch8-dev
ORCH_ADMIN_TOKEN_PATH=~/.orch8/admin-token
LOG_LEVEL=info
```

See [.env.example](.env.example) for the current list.

## Authentication

The daemon has two auth paths:

- Admin callers use `Authorization: Bearer <token>` with the token from `~/.orch8/admin-token`.
- Agents use their own bearer token generated by Orch8 and injected into their run environment.

The optional `auth.allow_localhost_admin` shortcut is off by default. Keep it off unless you are doing trusted local development and understand the tradeoff.

## Agent Runtime Notes

Claude agents are launched with `--dangerously-skip-permissions` inside task workspaces. Codex agents default to bypassing approvals and sandboxing unless their adapter config says otherwise. Treat every configured workspace as a privileged execution environment: agents can run commands and edit files there.

Do not point Orch8 at workspaces, repositories, or secrets you would not trust an automated local agent to access.

## Documentation

- [OpenAPI spec](packages/daemon/openapi.yaml)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

Most detailed planning notes live outside the public repo. For public references, prefer the package source and OpenAPI file as the current implementation truth.

## Security

- Bind to loopback (`localhost`) unless you have a trusted reverse proxy and an explicit auth story.
- Keep `~/.orch8/admin-token` private. It is created with mode `0600`.
- Be careful with non-loopback `ORCH_HOST` values. A daemon exposed to a network can control local workspaces through agent runs.
- Report security issues privately to `sergio.jisko@gmail.com`.

## License

Apache-2.0. See [LICENSE](LICENSE).
