import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../components/layout/NotificationBell.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockNotifications = [
  {
    id: "ntf_1",
    projectId: "proj_1",
    type: "task_completed",
    title: "Task completed",
    message: "Auth flow is done",
    link: "/board?task=task_1",
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "ntf_2",
    projectId: "proj_1",
    type: "agent_failure",
    title: "Agent failed",
    message: "Engineer crashed",
    link: "/runs/run_1",
    read: true,
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
];

describe("NotificationBell", () => {
  it("renders bell icon", () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    renderWithProviders(<NotificationBell projectId="proj_1" />);
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("shows unread badge when there are unread notifications", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNotifications),
    });
    renderWithProviders(<NotificationBell projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("1 unread")).toBeInTheDocument();
    });
  });

  it("opens dropdown on click and shows notifications", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNotifications),
    });
    renderWithProviders(<NotificationBell projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText("Notifications"));

    await waitFor(() => {
      expect(screen.getByText("Task completed")).toBeInTheDocument();
      expect(screen.getByText("Agent failed")).toBeInTheDocument();
    });
  });

  it("shows mark all read button in dropdown", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNotifications),
    });
    renderWithProviders(<NotificationBell projectId="proj_1" />);

    await userEvent.click(screen.getByLabelText("Notifications"));

    await waitFor(() => {
      expect(screen.getByText("Mark all read")).toBeInTheDocument();
    });
  });
});
