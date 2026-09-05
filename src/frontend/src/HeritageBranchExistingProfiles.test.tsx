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
// already exist (Columbus, Thomas Clayton 'Tip / TC', Alton, Robert Davis 'RD').
// The redesigned Heritage Branch no longer renders every individual person as a
// map node — it shows compact family-unit and branch-anchor cards instead — so
// these profiles are no longer reachable directly from the Heritage Branch
// overview. They remain reachable through Explore Family: tapping the Clayton
// Branch anchor card opens Explore Family centered on Clayton, whose children
// include these four profiles. This test protects that working path.
describe("Heritage Branch characterization: existing Erma child profiles open", () => {
  it("opens each existing Erma child profile via the Clayton Branch anchor", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // The Heritage Branch is a compact overview: it does not list every
    // individual person, so the Erma children are not shown as separate nodes.
    expect(
      screen.queryByRole("button", { name: /Columbus Norwood, Son/ }),
    ).not.toBeInTheDocument();

    // Tapping the Clayton Branch anchor card opens Explore Family on Clayton.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );

    // Each of the four existing profiles opens from Clayton's child cards.
    const cases: { card: RegExp; heading: string }[] = [
      { card: /Columbus Norwood Child/, heading: "Columbus Norwood" },
      {
        card: /Thomas Clayton “Tip \/ TC” Norwood Child/,
        heading: "Thomas Clayton “Tip / TC” Norwood",
      },
      { card: /Alton Norwood Child/, heading: "Alton Norwood" },
      {
        card: /Robert Davis “RD” Norwood Child/,
        heading: "Robert Davis “RD” Norwood",
      },
    ];

    for (const { card, heading } of cases) {
      // Tap the child card to focus them, then open their profile.
      await user.click(screen.getByRole("button", { name: card }));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );

      // Back to Explore Family (focused on the child), then to Clayton via his
      // Father card for the next child.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      await user.click(
        screen.getByRole("button", { name: /Clayton Norwood Father/ }),
      );
    }
  });
});
