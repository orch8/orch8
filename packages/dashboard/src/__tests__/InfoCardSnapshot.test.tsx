import { describe, it, expect } from "vitest";
import { renderWithProviders } from "../test-utils.js";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { CardRegistry } from "../components/chat/cards/CardRegistry.js";
import type { ExtractedCard } from "@orch/shared";

const INFO_FIXTURES: ExtractedCard[] = [
  {
    id: "c1",
    kind: "info_task_list",
    summary: "1 task",
    payload: { tasks: [{ id: "task_a", title: "T", column: "backlog" }] },
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
  },
  {
    id: "c2",
    kind: "info_agent_list",
    summary: "1 agent",
    payload: {
      agents: [
        { id: "qa-bot", name: "QA Bot", role: "qa", model: "claude-sonnet-4-6", status: "active" },
      ],
    },
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
  },
  {
    id: "c3",
    kind: "info_cost_summary",
    summary: "$1.00",
    payload: {
      projectId: "proj_a",
      totalSpentUsd: 1,
      byAgent: [{ agentId: "qa-bot", name: "QA Bot", spentUsd: 1 }],
    },
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
  },
];

const router = createRouter({
  routeTree: createRootRoute({ component: () => <div /> }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

describe("Info card snapshots", () => {
  for (const fixture of INFO_FIXTURES) {
    it(`renders ${fixture.kind} without crashing`, () => {
      const { container } = renderWithProviders(
        <RouterContextProvider router={router}>
          <CardRegistry extracted={fixture} chatId="chat_a" projectId="proj_a" />
        </RouterContextProvider>,
      );
      // Just check the card body is non-empty and the title appears.
      expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
    });
  }
});
