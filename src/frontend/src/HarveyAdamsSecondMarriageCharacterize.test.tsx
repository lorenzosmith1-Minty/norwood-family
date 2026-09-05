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
  // The header nav button is always labeled "Explore Family" (the home page
  // has a separate "Explore the Family" button). Clicking the header button
  // resets the focus to the default anchor (Julia).
  await user.click(screen.getByRole("button", { name: /^Explore Family$/ }));
}

// Recenter the Explore Family view on Harvey Adams Sr. by tapping each relative
// card down the maternal ancestry chain.
async function focusHarvey(user: ReturnType<typeof userEvent.setup>) {
  await openExploreFamily(user);
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
  );
  await user.click(screen.getByRole("button", { name: /Versie Smith Spouse/ }));
  await user.click(
    screen.getByRole("button", { name: /Gertrude Adams-Hill Mother/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Harvey Adams Sr\. Father/ }),
  );
}

// The 14 first-marriage children in recorded order (Gertrude first, then the
// rest), followed by the 2 second-marriage children. This is the order the
// family graph documents under Harvey.
const FIRST_MARRIAGE_CHILDREN = [
  "Gertrude Adams-Hill",
  "John Adams",
  "Louis Adams Sr.",
  "Albert Adams",
  "Charles Adams",
  "Homer Adams",
  "Versie Adams Sr.",
  "Judge Granberry Adams",
  "Fannie Adams",
  "Harvey Adams Jr.",
  "Christine Adams Tucker",
  "Robert Adams Sr.",
  "Ella Mae Adams",
  "Eula Lee Adams",
];
const SECOND_MARRIAGE_CHILDREN = ["Mildred Adams", "Christine Adams"];

// Characterization baseline for the Harvey Adams Sr. second-marriage expansion.
// The request added Person Profile pages for Mary Jane Johnson, Mildred Adams,
// Christine Adams, Tammy, Punchy, and Patricia Rollins; updated Harvey's profile
// so Mary Jane Johnson is his second wife with Mildred and Christine as their
// children; and wired the second-marriage branch into the Explore Family and
// Heritage Branch views. This file protects the adjacent working behavior that
// must remain unchanged: the first-marriage branch stays grouped and in recorded
// order in both views, Harvey and Mary Louise Sims remain the couple above the
// first-marriage children, and the first-marriage children keep their recorded
// order in the Heritage Branch under the Harvey anchor.
describe("Harvey Adams Sr. second-marriage characterization: maternal ancestry stays intact", () => {
  it("keeps the maternal ancestry chain in Explore Family: Harvey shows both wives and all children in recorded order", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // Both wives render as spouse cards.
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    ).toBeInTheDocument();

    // All children render as child cards in the recorded order: the 14
    // first-marriage children first, then the 2 second-marriage children.
    const childrenZone = screen.getByTestId("explore.zone.children");
    const childButtons = [
      ...FIRST_MARRIAGE_CHILDREN,
      ...SECOND_MARRIAGE_CHILDREN,
    ].map((name) =>
      within(childrenZone).getByRole("button", {
        name: new RegExp(`^${name} Child$`),
      }),
    );
    for (let i = 0; i < childButtons.length - 1; i++) {
      expect(
        childButtons[i].compareDocumentPosition(childButtons[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("keeps the Adams Line as a compact branch card in the Heritage Branch", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // The Adams Line renders as a compact branch-anchor card for Harvey, not
    // as a cluster of every individual child.
    const adams = screen.getByTestId("hb.branch_cluster.3");
    expect(
      within(adams).getByRole("button", {
        name: /Harvey Adams Sr\., Father of Gertrude Adams-Hill/,
      }),
    ).toBeInTheDocument();

    // The hardcoded marriage/child count was removed: no count chip renders
    // because no count is computed from the stored relationship graph.
    expect(
      within(adams).queryByText("16 children · 2 marriages"),
    ).not.toBeInTheDocument();

    // The overview does not recreate the full tree: individual children are not
    // rendered as separate nodes.
    expect(
      screen.queryByRole("button", { name: /Gertrude Adams-Hill, Daughter/ }),
    ).not.toBeInTheDocument();
  });
});
