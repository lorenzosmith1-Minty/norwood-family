import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

configure({ testIdAttribute: "data-ocid" });

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

// Characterization baseline for the Home screen navigation cards that the new
// Family Stories / Family Mysteries / Travel Through Time pages must NOT break.
//
// The upcoming build adds three new destination pages and rewires the Home
// buttons that currently route to them. This baseline freezes the routing of
// the Home buttons whose destinations are NOT changing, so a regression in the
// Home nav wiring (e.g. a button losing its onClick, or a view being renamed)
// is caught here rather than silently shipping:
//
//  1. The Home screen is the default route and renders the six nav cards.
//  2. "Explore the Family" opens the Explore Family view.
//  3. "Heritage Branch View" opens the Heritage Branch view.
//  4. "Add to Our History" opens the Archive contribution view.
//
// It deliberately does NOT assert the current routing of "Family Stories"
// (today it opens the archive), "Family Mysteries" (dead), or "Travel Through
// Time" (dead) — those destinations are exactly what the request changes.
describe("Home navigation routing characterization", () => {
  it("loads the Home screen as the default route with all seven nav cards", () => {
    renderApp();

    // The default route is Home, not a blank screen: the brand and the nav
    // section are present.
    expect(screen.getByText("Norwood")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    // The Home screen now carries a seventh nav card, "Family Videos & Oral
    // History", the new entry point to the dedicated media library.
    expect(within(nav).getAllByRole("button")).toHaveLength(7);
    expect(
      within(nav).getByRole("button", { name: "Family Videos & Oral History" }),
    ).toBeInTheDocument();
  });

  it("routes 'Explore the Family' to the Explore Family view", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
  });

  it("routes 'Heritage Branch View' to the Heritage Branch view", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );
  });

  it("routes 'Add to Our History' to the Archive contribution view", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole("button", { name: "Add to Our History" }),
    );

    // The button opens the Archive contribution view. For an unauthenticated
    // caller that view renders a sign-in prompt as its primary heading.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sign in to add to our history",
    );
  });
});
