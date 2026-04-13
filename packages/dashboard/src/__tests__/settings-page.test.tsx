import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../components/settings/SettingsPage.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockConfig = {
  orchestrator: { tick_interval_ms: 5000, log_level: "info" },
  api: { port: 3847, host: "localhost" },
  database: { host: "localhost", port: 5432, name: "orchestrator", user: "orchestrator", pool_min: 2, pool_max: 10, auto_migrate: true },
  defaults: { model: "claude-opus-4-6", max_turns: 180, auto_commit: false, auto_pr: true, verification_required: true, brainstorm_idle_timeout_min: 30 },
  limits: { max_concurrent_agents: 5, max_concurrent_per_project: 3, max_spawns_per_hour: 20, cooldown_on_failure: 300 },
  memory: { extraction_on_session_end: true, summary_rewrite_schedule: "weekly", fact_decay_days: 90 },
};

describe("SettingsPage", () => {
  it("renders tab navigation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByText("Daemon")).toBeInTheDocument();
      expect(screen.getByText("Concurrency")).toBeInTheDocument();
      expect(screen.getByText("Database")).toBeInTheDocument();
      expect(screen.getByText("Memory")).toBeInTheDocument();
    });
  });

  it("shows General tab fields by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Default Model")).toBeInTheDocument();
      expect(screen.getByText("Max Turns per Run")).toBeInTheDocument();
    });
  });

  it("switches to Concurrency tab", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Concurrency")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Concurrency"));

    expect(screen.getByText("Max Concurrent Agents")).toBeInTheDocument();
  });

  it("renders Save & Restart button", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Save & Restart")).toBeInTheDocument();
    });
  });
});
