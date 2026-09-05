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
    },
  }),
);
