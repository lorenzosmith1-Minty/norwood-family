import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Vitest picks up vitest.config.* over vite.config.js. We extend the app's
// existing Vite config (react plugin, environment plugin, jsdom test
// environment, inlined deps) and add the shared test setup that stubs
// ResizeObserver, which jsdom does not implement but the Explore Family
// SiblingsRail component relies on.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ["./src/test/setup.ts"],
      // The container reports a CPU count that makes Vitest's default fork-pool
      // sizing produce minThreads > maxThreads ("options.minThreads and
      // options.maxThreads must not conflict"). Pin the pool to a single worker
      // so the suite can start at all in this environment.
      pool: "forks",
      poolOptions: {
        forks: {
          minForks: 1,
          maxForks: 1,
        },
      },
    },
  }),
);
