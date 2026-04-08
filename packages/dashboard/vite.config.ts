import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3847",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3847",
        ws: true,
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
