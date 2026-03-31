import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderResult, render, type RenderOptions } from "@testing-library/react";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactNode,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}

export { screen, waitFor, within, act } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
