import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { DaemonPageComponent } from "../components/daemon/DaemonPage.js";

vi.mock("../hooks/WsEventsProvider.js", () => ({
  useWsEvents: () => ({
    connected: true,
    send: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockStatus = {
  status: "running",
  pid: 12345,
  uptimeMs: 3600000,
  uptimeFormatted: "1h 0m",
  tickIntervalMs: 5000,
  processCount: 2,
  queueDepth: 1,
};

describe("DaemonPageComponent", () => {
  it("renders daemon status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatus) });
    renderWithProviders(<DaemonPageComponent />);

    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument();
      expect(screen.getByText("1h 0m")).toBeInTheDocument();
    });
  });

  it("shows restart button", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatus) });
    renderWithProviders(<DaemonPageComponent />);

    await waitFor(() => {
      expect(screen.getByText("Restart")).toBeInTheDocument();
    });
  });

  it("shows live log section", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatus) });
    renderWithProviders(<DaemonPageComponent />);

    await waitFor(() => {
      expect(screen.getByText("Live Log")).toBeInTheDocument();
    });
  });
});
