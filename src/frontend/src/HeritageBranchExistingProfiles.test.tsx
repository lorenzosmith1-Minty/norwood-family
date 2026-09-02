import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// App renders useIsAdmin at the top level, which calls useActor from
// @caffeineai/core-infrastructure. The real useActor requires an
// InternetIdentityProvider, so these tests stub the provider seam with a
// minimal actor (isCallerAdmin is never reached because these renders have no
// QueryClient, so the query stays disabled).
const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
  };
  return { mockActor };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

// App renders useIsAdmin at the top level, which calls useQuery, so every render
// must be wrapped in a QueryClientProvider.
function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

async function openBranchFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Heritage Branch" }));
}

// Characterization baseline for the four Erma T. Williams child profiles that
// already exist (Columbus, Thomas Clayton 'Tip / TC', Alton, Robert Davis 'RD')
// before the three new profiles (Ardeanus, Willie B., James) are added. These
// four already open from the Heritage Branch overview map, and that working
// behavior must remain unchanged. The three new profiles are intentionally
// changing (they will gain profiles and become openable), so they are NOT
// asserted here.
describe("Heritage Branch characterization: existing Erma child profiles open", () => {
  it("opens each existing Erma child profile from the Heritage Branch overview", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // Each of the four existing profiles opens from its Heritage Branch node.
    const cases: { node: RegExp; heading: string }[] = [
      { node: /Columbus Norwood, Son/, heading: "Columbus Norwood" },
      {
        node: /Thomas Clayton “Tip \/ TC” Norwood, Son/,
        heading: "Thomas Clayton “Tip / TC” Norwood",
      },
      { node: /Alton Norwood, Son/, heading: "Alton Norwood" },
      {
        node: /Robert Davis “RD” Norwood, Son/,
        heading: "Robert Davis “RD” Norwood",
      },
    ];

    for (const { node, heading } of cases) {
      // Tap the node to open Explore Family centered on the person, then open
      // their profile.
      await user.click(screen.getByRole("button", { name: node }));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );

      // Back to Explore Family, then to the Heritage Branch for the next node.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      await user.click(screen.getByRole("button", { name: "Heritage Branch" }));
    }
  });
});
