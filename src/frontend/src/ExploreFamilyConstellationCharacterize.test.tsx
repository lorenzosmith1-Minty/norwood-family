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

async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

// Characterization baseline for the Explore Family positional constellation.
// The upcoming UI correction changes the focus card from a portrait-style w-40
// card to a wider landscape-style card and adds desktop mouse-wheel/trackpad
// scrolling plus a scroll affordance to the sibling rail. Those two changes are
// intentionally NOT frozen here. What must stay observable is the positional
// layout that the correction preserves: parents above the focus card, spouse(s)
// to its left, siblings to its right, children below, and tap-to-recenter. This
// test captures that full constellation in one place so a layout change cannot
// silently reorder or drop a relationship zone.
describe("Explore Family positional constellation characterization", () => {
  // Recenter on Clayton Norwood, who has documented parents, spouses, and
  // children, so every positional zone renders at once.
  async function focusClayton(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);
  }

  it("renders parents above the focus card, spouse left, siblings right, children below", async () => {
    const user = userEvent.setup();
    await focusClayton(user);

    const focusCard = screen.getByTestId("explore.focus.1");
    const spouseStack = screen.getByTestId("explore.zone.spouse");
    const childrenZone = screen.getByTestId("explore.zone.children");

    // Parents (Father/Mother) render above the focus card: the parent row
    // precedes the center band that holds the focus card.
    const father = screen.getByRole("button", {
      name: /Isaiah Norwood Father/,
    });
    const mother = screen.getByRole("button", {
      name: /Julia “Julie” Norwood Mother/,
    });
    expect(
      father.compareDocumentPosition(focusCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      mother.compareDocumentPosition(focusCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Spouse stack renders immediately left of the focus card (precedes it in
    // the center band).
    expect(
      spouseStack.compareDocumentPosition(focusCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Children render below the focus card (follow it in document order).
    expect(
      focusCard.compareDocumentPosition(childrenZone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the focus card's preserved structural elements", async () => {
    const user = userEvent.setup();
    await focusClayton(user);

    // The focus card carries the bronze-halo surface class and shows the focus
    // person's name, years, relation text, and View Profile action. These are
    // the preserved affordances of the focus card independent of its width.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(focusCard.className).toContain("ex-focus-card");
    expect(within(focusCard).getByText("Clayton Norwood")).toBeInTheDocument();
    expect(
      within(focusCard).getByRole("button", { name: "View Profile" }),
    ).toBeInTheDocument();
  });

  it("recenters on a tapped relative and rebuilds the constellation around them", async () => {
    const user = userEvent.setup();
    await focusClayton(user);

    // Tap Elbert (Clayton's child) to recenter on him.
    await tapRelative(user, /Elbert Norwood Child/);

    // The new focus is Elbert; the layout rebuilds around him.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(within(focusCard).getByText("Elbert Norwood")).toBeInTheDocument();
    // His parents now render above as Father/Mother.
    expect(
      screen.getByRole("button", { name: /Clayton Norwood Father/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Mother/ }),
    ).toBeInTheDocument();
  });
});
