import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "../test-utils.js";

// Mock Navigate so we can assert it was asked to redirect to /chat without
// actually triggering router navigation during the unit test.
const navigateSpy = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (opts: any) => ({
    ...opts,
    useParams: () => ({ projectSlug: "proj_1" }),
  }),
  Navigate: (props: any) => {
    navigateSpy(props);
    return null;
  },
}));

// Import the route module after mocks are set up (vi.mock is hoisted)
import { Route as HomeRoute } from "../routes/projects/$projectSlug/index.js";

const ProjectIndexRedirect = (HomeRoute as any).component;

describe("ProjectIndexRedirect", () => {
  it("redirects to the project chat route", () => {
    renderWithProviders(<ProjectIndexRedirect />);
    expect(navigateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/projects/$projectSlug/chat",
        params: { projectSlug: "proj_1" },
        replace: true,
      }),
    );
  });
});
