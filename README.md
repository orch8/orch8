# Orch8

AI agent orchestration platform for autonomous software engineering. Orch8 manages teams of Claude Code agents executing coding tasks across projects — with a dashboard for real-time monitoring, a Kanban board for task management, and isolated git worktrees for safe parallel execution.

## What It Does

- **Task orchestration** — Create quick fixes, complex multi-phase features, or interactive brainstorm sessions
- **Multi-agent coordination** — Specialized agent roles (researcher, planner, implementer, reviewer, QA) work through pipelines
- **Live streaming** — Watch agent output in real-time via WebSocket
- **Isolated execution** — Every task runs in its own git worktree with a dedicated Claude Code process
- **Persistent memory** — Three-layer knowledge system (Knowledge Graph, Work Logs, Lessons) survives across sessions
- **Budget enforcement** — Token usage tracking with hard cost limits per agent and project
- **Verification pipeline** — Adversarial verification before task completion, with manual review option

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Dashboard   │────▶│   Daemon    │────▶│  Agents     │
│  (React)     │◀────│  (Fastify)  │◀────│ (Claude CLI)│
└─────────────┘  WS  └──────┬──────┘ MCP └─────────────┘
                             │
                      ┌──────▼──────┐
                      │  PostgreSQL  │
                      └─────────────┘
```

**Monorepo packages:**

| Package | Description |
|---------|-------------|
| `packages/daemon` | Fastify server — orchestration engine, API, WebSocket, agent spawning |
| `packages/dashboard` | React 19 + Vite SPA — Kanban board, agent editor, live output viewer |
| `packages/shared` | Zod schemas, Drizzle ORM table definitions, shared types |
| `packages/cli` | Commander.js CLI for scripting and automation |

## Tech Stack

**Backend:** TypeScript, Fastify, PostgreSQL, Drizzle ORM, Zod
**Frontend:** React 19, Vite, TanStack Query + Router, Tailwind CSS, shadcn/ui, Zustand
**Monorepo:** pnpm workspaces, Turborepo
**Testing:** Vitest, testcontainers
**Agent Runtime:** Claude Code CLI via `child_process.spawn`, MCP protocol

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
pnpm build
```

### Run (development)

```bash
# All packages at once
pnpm dev

# Or individually
cd packages/daemon && pnpm dev     # API server on localhost:3847
cd packages/dashboard && pnpm dev  # Vite dev server (proxies to daemon)
```

The daemon starts an embedded PostgreSQL instance automatically — no external database setup needed.

### Configuration

The daemon reads `~/.orch8/config.yaml` at startup. An external PostgreSQL instance can be configured there if preferred.

## Task Types

| Type | Description |
|------|-------------|
| **Quick** | Single agent, single phase. Bug fixes, config changes, small features. |
| **Complex** | Multi-phase pipeline (Research → Plan → Implement → Review). Different agents per phase, with optional parallel subagents. |
| **Brainstorm** | Interactive live-chat session between user and agent for architecture exploration and design. |

## CLI

```bash
orch8 project list              # List projects
orch8 task create --project X   # Create a task
orch8 agent list --project X    # List agents
```

## Tests

```bash
pnpm test        # Run all tests
pnpm typecheck   # Type-check all packages
```

## Documentation

Detailed specs live in the `specs/` directory:

- [Overview & Architecture](specs/01-overview-and-architecture.md)
- [Task Types](specs/02-task-types.md)
- [Database Schema](specs/03-database-schema.md)
- [Agent Spawning](specs/04-agent-spawning.md)
- [Task Lifecycle](specs/05-task-lifecycle.md)
- [Agent System](specs/06-agent-system.md)
- [Heartbeat Pipeline](specs/07-heartbeat-pipeline.md)
- [API & Auth](specs/08-api-and-auth.md)
- [Verification & Budget](specs/09-verification-and-budget.md)
- [Memory System](specs/10-memory-system.md)
- [Dashboard](specs/11-dashboard.md)

API reference is in [docs/api-reference.md](docs/api-reference.md).

## Security

- **Default bind host.** The daemon binds to `localhost` by default, so only the host machine can reach the API and dashboard. The admin gate currently trusts loopback requests; if you override this by setting `ORCH_HOST=0.0.0.0` (or any non-loopback address) to reach the dashboard from another machine, **every peer on that network becomes an admin** until a proper authentication mechanism is added. Keep the bind host on loopback unless you have put the daemon behind a trusted proxy and reverse-auth layer.
- **Agent execution.** The daemon spawns the `claude` CLI with `--dangerously-skip-permissions` inside each task's git worktree (see `packages/daemon/src/adapter/args-builder.ts`). This means agents can read and write any file under the worktree without per-tool prompts. Treat every worktree as a privileged execution context; do not point Orch8 at repositories whose contents you would not want an LLM to run arbitrary commands against.
- **Reporting issues.** Please report security vulnerabilities privately to sergio.jisko@gmail.com before filing a public issue.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.
