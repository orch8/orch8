import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// The daemon writes a Bearer token to ~/.orch8/admin-token on first boot
// and enforces it on every admin-path request. In dev, inject it into
// proxied /api and /ws calls so the dashboard SPA doesn't have to know
// about the token (and so it never reaches browser JS).
const ADMIN_TOKEN_PATH =
  process.env.ORCH_ADMIN_TOKEN_PATH ??
  path.join(homedir(), ".orch8", "admin-token");

let cachedAdminToken: string | null = null;
let warnedMissing = false;
function readAdminToken(): string | null {
  if (cachedAdminToken) return cachedAdminToken;
  try {
    const t = readFileSync(ADMIN_TOKEN_PATH, "utf-8").trim();
    if (t.length > 0) {
      cachedAdminToken = t;
      return t;
    }
  } catch {
    // fall through — file missing or unreadable
  }
  if (!warnedMissing) {
    // eslint-disable-next-line no-console
    console.warn(
      `[vite] admin token not found at ${ADMIN_TOKEN_PATH}; dashboard API calls will 401 until the daemon provisions one.`,
    );
    warnedMissing = true;
  }
  return null;
}

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3847",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const token = readAdminToken();
            if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
          });
        },
      },
      "/ws": {
        target: "ws://localhost:3847",
        ws: true,
        configure: (proxy) => {
          proxy.on("proxyReqWs", (proxyReq) => {
            const token = readAdminToken();
            if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
          });
        },
      },
    },
  },
  build: {
    // After chunking we expect the largest chunk to be ~450kB uncompressed.
    // Leave a small cushion above 500kB so minor dep bumps don't trip the
    // warning, but keep it below the default Netlify/Vercel recommendations.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks: {
          tanstack: [
            "@tanstack/react-query",
            "@tanstack/react-router",
          ],
          recharts: ["recharts"],
          markdown: ["react-markdown", "remark-gfm", "rehype-highlight"],
          dnd: [
            "@dnd-kit/core",
            "@dnd-kit/sortable",
            "@dnd-kit/utilities",
          ],
        },
      },
    },
  },
});
