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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

// Lorenzo Smith Sr.'s six siblings, derived from his shared parents (Lula Mae
// Norwood and Versie Smith) in the relationship graph.
const SIX_SIBLINGS = [
  "Versie Smith Jr.",
  "Herbert Smith",
  "Alonzo Smith",
  "Sherri Smith",
  "Beatrice Smith",
  "Ed Smith",
];

// Characterization baseline for the Lorenzo Smith Sr. relationship structure in
// the Explore Family view. The upcoming build adds one recorded child (Lorenzo
// Smith Jr.) to Lorenzo Smith Sr., but it explicitly preserves his six siblings
// as siblings — never as his children. These tests protect that preserved
// behavior: focusing on Lorenzo Smith Sr. shows his six siblings in the Siblings
// zone with the "Sibling" relationship label, and none of them appear as
// children.
describe("Lorenzo Smith Sr. sibling characterization", () => {
  it("shows Lorenzo Smith Sr.'s six siblings in the Siblings zone, not as children", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    // Lorenzo Smith Sr. is the focus.
    expect(screen.getByText("Lorenzo Smith Sr.")).toBeInTheDocument();

    // All six siblings render as relative cards with the "Sibling" label.
    for (const name of SIX_SIBLINGS) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${name} Sibling`) }),
      ).toBeInTheDocument();
    }

    // None of the six siblings appear as children of Lorenzo Smith Sr.
    for (const name of SIX_SIBLINGS) {
      expect(
        screen.queryByRole("button", { name: new RegExp(`${name} Child`) }),
      ).not.toBeInTheDocument();
    }
  });

  it("recenters on a tapped sibling and shows their shared-parent relationship", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    // Tap Versie Smith Jr. (a sibling) to recenter on them.
    await tapRelative(user, /Versie Smith Jr\. Sibling/);

    // The new focus is Versie Smith Jr.; Lorenzo Smith Sr. is now his sibling.
    expect(screen.getByText("Versie Smith Jr.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lorenzo Smith Sr\. Sibling/ }),
    ).toBeInTheDocument();
  });
});
