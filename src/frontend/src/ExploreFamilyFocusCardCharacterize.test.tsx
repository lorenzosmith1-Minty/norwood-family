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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

// Characterization baseline for the Explore Family focus card affordances. The
// upcoming redesign repositions the father/mother/spouse/siblings/children
// relative cards around the focus person, but it explicitly preserves the focus
// card itself: the selected person rendered as the central card with the bronze
// halo, the Relation-to-You text, and the View Profile action. These tests
// protect that preserved affordance independent of the surrounding layout, so a
// layout change cannot silently drop the focus card's halo or its actions.
describe("Explore Family focus card characterization", () => {
  it("renders the focus person as the central card with the bronze halo styling", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The focus card is the centered person card carrying the bronze halo
    // (the ex-focus-card surface with its --ex-ring box-shadow).
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(focusCard.className).toContain("ex-focus-card");
    // The focus person's name is the card's heading content.
    expect(
      within(focusCard).getByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
  });

  it("keeps the Relation to You text on the focus card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia has no relationToYou value, so the focus card falls back to the
    // generic "Family member" relation text.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(within(focusCard).getByText("Family member")).toBeInTheDocument();
  });

  it("keeps the View Profile action on the focus card opening the profile page", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    const focusCard = screen.getByTestId("explore.focus.1");
    const viewProfile = within(focusCard).getByRole("button", {
      name: "View Profile",
    });
    await user.click(viewProfile);

    // The profile page for the focus person opens.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
  });

  it("keeps the focus card affordances when the view recenters on a relative", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Clayton (Julia's child).
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );

    // The new focus card still carries the bronze halo and View Profile action.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(focusCard.className).toContain("ex-focus-card");
    expect(within(focusCard).getByText("Clayton Norwood")).toBeInTheDocument();
    expect(
      within(focusCard).getByRole("button", { name: "View Profile" }),
    ).toBeInTheDocument();
  });
});
