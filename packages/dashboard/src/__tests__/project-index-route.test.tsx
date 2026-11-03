import { it, expect } from "vitest";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet, type AnyRoute } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { Route as projectIndex } from "../routes/projects/$projectSlug/index.js";

it("resolves project root to Board and replaces its history entry", async () => {
  const root = createRootRoute({ component: Outlet });
  const project = createRoute({ getParentRoute: () => root, path: "/projects/$projectSlug", component: Outlet });
  const index = projectIndex.update({ getParentRoute: () => project, path: "/", id: undefined } as never);
  const board = createRoute({ getParentRoute: () => project, path: "board", component: () => <h1>Board fixture</h1> });
  const chat = createRoute({ getParentRoute: () => project, path: "chat", component: () => <h1>Chat fixture</h1> });
  const history = createMemoryHistory({ initialEntries: ["/projects/factory"] });
  const router = createRouter({ routeTree: root.addChildren([project.addChildren([index as AnyRoute, board, chat])]), history });
  render(<RouterProvider router={router} />);
  expect(await screen.findByText("Board fixture")).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toBe("/projects/factory/board"));
  expect(history.length).toBe(1);
});
