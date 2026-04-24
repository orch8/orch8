import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { BriefingPage } from "../components/briefing/BriefingPage.js";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useParams: () => ({ projectSlug: "proj_1" }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("BriefingPage", () => {
  it("renders the LIVE eyebrow with the project name", () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(<BriefingPage projectId="proj_1" />);
    expect(screen.getByText(/LIVE/i)).toBeInTheDocument();
  });

  it("renders the ACTIVITY section label", () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(<BriefingPage projectId="proj_1" />);
    expect(screen.getByText("ACTIVITY")).toBeInTheDocument();
  });

  it("renders the ATTENTION section label", () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(<BriefingPage projectId="proj_1" />);
    expect(screen.getByText("ATTENTION")).toBeInTheDocument();
  });
});
