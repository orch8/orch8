import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { autoLinkIds } from "../components/chat/IdAutoLinker.js";

// Wrap with a router context so <Link> can render. The route table is empty
// because we test the spans directly via getByText. We use RouterContextProvider
// (not RouterProvider) because the latter renders <Matches /> instead of children.
const router = createRouter({
  routeTree: createRootRoute({ component: () => <div /> }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

function renderSpans(text: string, projectId = "proj_a") {
  return render(
    <RouterContextProvider router={router}>
      <div>{autoLinkIds(text, projectId)}</div>
    </RouterContextProvider>,
  );
}

describe("autoLinkIds", () => {
  it("returns the original text unchanged when no IDs are present", () => {
    renderSpans("Hello world");
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("wraps a task_<id> in a link", () => {
    renderSpans("Look at task_abc123 for details.");
    const link = screen.getByText("task_abc123");
    expect(link.tagName.toLowerCase()).toBe("a");
    expect(link.getAttribute("href")).toContain("task_abc123");
    expect(link.getAttribute("href")).toContain("proj_a");
  });

  it("wraps multiple distinct IDs in the same paragraph", () => {
    renderSpans("Run run_xyz on agent_qa-bot");
    expect(screen.getByText("run_xyz").tagName.toLowerCase()).toBe("a");
    expect(screen.getByText("agent_qa-bot").tagName.toLowerCase()).toBe("a");
  });

  it("recognises pipe_<id>", () => {
    renderSpans("Pipeline pipe_abc completed.");
    expect(screen.getByText("pipe_abc").tagName.toLowerCase()).toBe("a");
  });

  it("recognises chat_<id>", () => {
    renderSpans("See chat_abc for context.");
    expect(screen.getByText("chat_abc").tagName.toLowerCase()).toBe("a");
  });

  it("does not wrap IDs adjacent to alphanumeric characters", () => {
    renderSpans("subtask_abc is not a task_id");
    // "subtask_abc" should remain plain text — no link wrapping the inner
    // "task_abc" substring. The trailing "task_id" is preceded by whitespace
    // so it IS linked; that's the only expected link.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toBe("task_id");
    // The plain "subtask_abc" text must still be present in the DOM.
    expect(screen.getByText(/subtask_abc/)).toBeInTheDocument();
  });

  it("does not link unknown prefixes like foo_abc", () => {
    renderSpans("Strange foo_abc reference");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("preserves punctuation around the ID", () => {
    renderSpans("Done with task_abc, moving on.");
    const link = screen.getByText("task_abc");
    expect(link.tagName.toLowerCase()).toBe("a");
    // The trailing comma should still be in the document text.
    expect(screen.getByText(/,/)).toBeInTheDocument();
  });
});
