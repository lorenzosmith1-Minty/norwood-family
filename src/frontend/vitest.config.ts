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
      // options.maxThreads must not conflict"). Bounding both bounds explicitly
      // avoids that conflict while still letting the suite run test files in
      // parallel across a small pool of forks. Each test file renders its own
      // App with its own QueryClient, so files are isolated and safe to run
      // concurrently.
      pool: "forks",
      poolOptions: {
        forks: {
          minForks: 1,
          maxForks: 4,
        },
      },
      // Scratch "probe" test files left over from earlier debugging. They are
      // not meaningful regression coverage: each re-verifies behavior that a
      // dedicated test file already covers (Explore Family navigator, sibling
      // layout, profile navigation, and a useCanMessagePerson smoke check).
      // Excluding them removes redundant work from the suite without touching
      // production code.
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/ProbeCanMessage.test.tsx",
        "**/HBProbe.test.tsx",
        "**/wheelprobe.test.tsx",
        "**/ExploreFamilyNavProbe.test.tsx",
        // Redundant Explore Family siblings-section layout tests. All four of
        // these files assert the same wrapping-row siblings layout below the
        // focus card; ExploreFamilyScrollAffordanceCharacterize is the most
        // comprehensive and is kept, so the other three are consolidated away.
        "**/ExploreFamilySiblingsPositionCharacterize.test.tsx",
        "**/ExploreFamilySiblingsRailCover.test.tsx",
        "**/ExploreFamilySiblingsRowCharacterize.test.tsx",
        // Redundant Lula Mae + Versie family-unit cover. Its assertions (couple
        // present, all seven child cards, each child's profile opens) are
        // already covered by LulaVersieChildrenProfilesCharacterize and
        // LulaVersieFamilyUnitCharacterize.
        "**/LulaVersieFamilyUnitCover.test.tsx",
      ],
    },
  }),
);
