# Contributing to Orch8

Thanks for your interest in Orch8. This document covers how to get a working checkout and the flow we expect for pull requests.

## Prerequisites

- Node.js 20+
- pnpm 9+

## Local setup

```bash
git clone https://github.com/jisko/orch8.git
cd orch8
pnpm install
```

Orch8 is a pnpm workspace with four packages: `daemon`, `dashboard`, `shared`, and `cli`.

## Development loop

From the repo root:

```bash
pnpm typecheck   # Type-check every package (turbo pipeline)
pnpm test        # Run the full test suite
pnpm build       # Produce build artifacts for daemon, dashboard, and cli
pnpm dev         # Run daemon + dashboard in watch mode
```

You can also run scripts in a single package by `cd`-ing into it, e.g.:

```bash
cd packages/daemon && pnpm test
cd packages/dashboard && pnpm dev
```

The daemon starts an embedded PostgreSQL instance on first boot, so no external database setup is required.

## Pull request flow

1. Fork the repo and create a feature branch off `main`.
2. Make focused commits with descriptive messages.
3. Before opening a PR, confirm the following all pass locally:
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. Add or update tests next to the code you changed. Bug fixes should come with a regression test; new features should come with coverage for the happy path plus at least one failure mode.
5. If your change is user-facing (new API field, new env var, new flag), update the relevant docs in `docs/` or `specs/` and, for API changes, `packages/daemon/openapi.yaml`.
6. Open a PR against `main`. Describe the motivation, what changed, and how you tested it.

## Reporting bugs

Open an issue at https://github.com/orch8/orch8/issues with steps to reproduce, expected vs. actual behavior, and daemon log output if relevant.

For security issues, please email sergio.jisko@gmail.com instead of filing a public issue.

## Code of conduct

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
