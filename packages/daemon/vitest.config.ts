import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    globalSetup: ["./src/__tests__/helpers/global-setup.ts"],
    poolOptions: {
      threads: {
        maxThreads: process.env.VITEST_MAX_THREADS
          ? Number(process.env.VITEST_MAX_THREADS)
          : undefined,
      },
    },
  },
});
