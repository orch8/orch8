import { vi } from "vitest";
import React from "react";

// Mock TanStack Router's Link component to render as a plain <a> tag in tests.
// This avoids requiring a full RouterProvider in every test.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    Link: React.forwardRef(function MockLink(
      props: Record<string, unknown>,
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      const { to, params, ...rest } = props;
      let href = String(to ?? "#");
      if (params && typeof params === "object") {
        for (const [key, value] of Object.entries(params as Record<string, string>)) {
          href = href.replace(`$${key}`, value);
        }
      }
      return React.createElement("a", { ...rest, href, ref });
    }),
    useNavigate: () => vi.fn(),
  };
});
