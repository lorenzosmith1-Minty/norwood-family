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

// Cover for the Explore Family centered relationship navigator and the Lorenzo
// Smith Sr. relationship correction. The build rewrote ExploreFamilyPage as a
// centered navigator (focus card largest center, spouse left at half size with
// multiple-spouse stacking, parents above, siblings in a horizontally scrollable
// row, children below, tap-to-recenter) and corrected the family graph so
// Lorenzo Smith Sr. records exactly one child (Lorenzo Smith Jr.) while his six
// siblings stay siblings. These tests cover the accepted layout and the child
// correction.
describe("Explore Family centered navigator cover", () => {
  it("renders the focus card with name, years, relation, and View Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The default focus is the founding matriarch Julia.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(
      within(focusCard).getByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
    // Birth–death years when known.
    expect(within(focusCard).getByText("1860–1936")).toBeInTheDocument();
    // Relation to You (Julia has no relationToYou value, so it falls back).
    expect(within(focusCard).getByText("Family member")).toBeInTheDocument();
    // View Profile action.
    expect(
      within(focusCard).getByRole("button", { name: "View Profile" }),
    ).toBeInTheDocument();
  });

  it("places the spouse immediately left of the focus card at half size", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia's spouse Isaiah renders as a half-size spouse card in the spouse
    // stack, which sits in the center band immediately left of the focus card.
    const spouseStack = screen.getByTestId("explore.zone.spouse");
    const spouseCard = within(spouseStack).getByRole("button", {
      name: /Isaiah Norwood Spouse/,
    });
    expect(spouseCard).toBeInTheDocument();
    expect(spouseCard.className).toContain("ex-spouse-half");

    // The spouse stack appears before the focus card in the center band, i.e.
    // to its left.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(
      spouseStack.compareDocumentPosition(focusCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders parents above the focus card when known", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia has no documented parents, so no Father/Mother zones render.
    expect(screen.queryByText("Father")).not.toBeInTheDocument();
    expect(screen.queryByText("Mother")).not.toBeInTheDocument();

    // Recenter on Clayton, who has documented parents.
    await tapRelative(user, /Clayton Norwood Child/);
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Father/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood Mother/ }),
    ).toBeInTheDocument();
  });

  it("renders siblings below the focus card in a wrapping row", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Lorenzo Smith Sr. (Julia -> Clayton -> Lula Mae -> Lorenzo).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    // The Siblings zone uses the wrapping row class below the focus card.
    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row");
    expect(row).not.toBeNull();
    expect((row as HTMLElement).className).toContain("ex-siblings-row");

    // All six siblings render in the Siblings zone.
    for (const name of SIX_SIBLINGS) {
      expect(
        within(siblingsZone).getByRole("button", {
          name: new RegExp(`${name} Sibling`),
        }),
      ).toBeInTheDocument();
    }
  });

  it("shows Lorenzo Smith Sr.'s one child Lorenzo Smith Jr. in the Children zone", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    // Lorenzo Smith Sr. records exactly one child: Lorenzo Smith Jr. (no profile
    // exists for him, so the card falls back to the graph id as its name).
    const childrenZone = screen.getByTestId("explore.zone.children");
    expect(
      within(childrenZone).getByRole("button", {
        name: /lorenzoSmithJr Child/,
      }),
    ).toBeInTheDocument();
    // Exactly one child card renders.
    expect(
      within(childrenZone).getAllByRole("button", { name: / Child$/ }),
    ).toHaveLength(1);

    // His six siblings stay siblings, never as children.
    for (const name of SIX_SIBLINGS) {
      expect(
        screen.queryByRole("button", { name: new RegExp(`${name} Child`) }),
      ).not.toBeInTheDocument();
    }
  });

  it("recenters on a tapped child and rebuilds the layout around them", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Tap Clayton (Julia's child) to recenter on him.
    await tapRelative(user, /Clayton Norwood Child/);

    // The new focus is Clayton; the layout rebuilds around him with his
    // documented parents, spouses, and children.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(within(focusCard).getByText("Clayton Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Father/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Elbert Norwood Child/ }),
    ).toBeInTheDocument();
  });
});
