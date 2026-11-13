import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ComponentType } from "react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options, useParams: () => ({ projectSlug: "repo" }) }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouterState: () => "/projects/repo/pipelines",
}));
vi.mock("../hooks/useProjects.js", () => ({ useProject: () => ({ data: { id: "repo-id", name: "Repo", homeDir: "/repo" } }) }));
vi.mock("../hooks/usePipelines.js", () => ({ usePipelines: () => ({ data: [] }) }));
vi.mock("../components/pipeline/FeatureIntake.js", () => ({ FeatureIntake: () => <button>Start with a plan</button> }));
vi.mock("../components/pipeline/TestInstructions.js", () => ({ TestInstructions: () => <button>Run repository tests</button> }));
vi.mock("../components/pipeline/RepositoryChanges.js", () => ({ RepositoryChanges: () => <pre>Raw diff</pre> }));
import { Route } from "../routes/projects/$projectSlug/pipelines/index.js";

it("keeps tests and raw diff collapsed after the first feature action and available to inspect", () => {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
  const start = screen.getByRole("button", { name: "Start with a plan" });
  for (const name of ["Repository test controls", "Inspect repository diff"]) {
    const disclosure = screen.getByLabelText(name) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(start.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(disclosure.open).toBe(true);
  }
  expect(screen.getByRole("button", { name: "Run repository tests" })).toBeInTheDocument();
  expect(screen.getByText("Raw diff")).toBeInTheDocument();
});
