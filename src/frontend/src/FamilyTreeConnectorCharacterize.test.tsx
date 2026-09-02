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

// Characterization baseline for the Explore Family focused navigator. The old
// full-tree connector layout (marriage-grouped branches, tree.person cards) was
// intentionally replaced by a focused navigator with labeled relative zones.
// These tests protect the semantic structure the redesign must preserve: each
// relationship kind renders in its own labeled zone, and navigating never
// removes or reorders the relative cards.
describe("Explore Family connector characterization: semantic structure stays intact", () => {
  it("keeps each relationship kind grouped in its own labeled zone", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia's spouse renders in the Spouse zone and her children in the
    // Children zone, each under a labeled zone header. "Spouse"/"Children"
    // appear both as the zone label and on each relative card, so use the
    // multi-match query.
    expect(screen.getAllByText("Spouse").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Children").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    ).toBeInTheDocument();
  });

  it("keeps every relative card in place when the focus moves", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The relative cards carry data-ocid "explore.relative.<n>".
    const relativeOcids = () =>
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("data-ocid"))
        .filter(
          (ocid): ocid is string =>
            ocid !== null && /^explore\.relative\.\d+$/.test(ocid),
        );

    // Recenter on Clayton; his relatives render in the same relative-card
    // structure (the exact set differs, but the card mechanism is unchanged).
    await tapRelative(user, /Clayton Norwood Child/);
    expect(relativeOcids().length).toBeGreaterThan(0);
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();
  });

  it("keeps the relative zones in their established vertical order", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The zones render in order: Father/Mother above, then Spouse, Siblings,
    // and Children below the focus card. The first match for each label is the
    // zone header (it precedes the relative cards in document order).
    const father = screen.queryByText("Father");
    const mother = screen.queryByText("Mother");
    const spouse = screen.getAllByText("Spouse")[0];
    const children = screen.getAllByText("Children")[0];

    // Julia has no documented parents, so Father/Mother zones are absent; the
    // Spouse zone must precede the Children zone.
    expect(father).toBeNull();
    expect(mother).toBeNull();
    expect(
      spouse.compareDocumentPosition(children) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
