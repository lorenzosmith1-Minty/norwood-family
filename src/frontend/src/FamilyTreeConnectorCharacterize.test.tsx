import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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

async function openFamilyTree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

// The Clayton branch defaults to collapsed; expand it so its cards render.
async function expandClaytonBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Clayton \d+$/ }));
}

// The Lula Mae & Versie branch defaults to collapsed; expand it so the nested
// "Versie's maternal line" region renders.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}

// Characterization baseline for the family-tree connector redesign. The request
// will intentionally change the connector DOM structure and CSS classes in
// FamilyTreePage.tsx (new junction points, direction chevrons, selected-path
// highlighting), so the current connector div classes are NOT frozen here.
// These tests protect the semantic tree structure the redesign must preserve:
// children of each marriage stay grouped under their own branch, selecting a
// person never removes/reorders cards, and the tree sections keep their
// established vertical order.
describe("Family Tree connector characterization: semantic structure stays intact", () => {
  it("keeps each marriage's children grouped under their own branch in Clayton's branch", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const branch = screen.getByRole("region", { name: "Clayton's branch" });
    const cardTexts = within(branch)
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");

    // Ms. Hudson's children (first marriage) and Erma T. Williams' children
    // (second marriage) are distinct groups. The assertion is order-based, so
    // it survives a connector restyle: all of the first marriage's children
    // must render before any of the second marriage's children.
    const hudsonChildren = [
      "Elbert",
      "Wellman",
      "Wetherby",
      "Son (died at birth)",
    ];
    const ermaChildren = [
      "Columbus",
      "Thomas Clayton",
      "Alton",
      "Robert Davis",
      "Ardeanus",
      "Willie B.",
      "James",
      "Freddie",
      "Zelia Mae",
      "Lula Mae",
    ];

    const indexOf = (name: string) =>
      cardTexts.findIndex((text) => text.includes(name));

    const hudsonIndices = hudsonChildren.map(indexOf);
    const ermaIndices = ermaChildren.map(indexOf);

    // Every child of both marriages renders in the branch.
    for (const index of [...hudsonIndices, ...ermaIndices]) {
      expect(index).toBeGreaterThanOrEqual(0);
    }

    // The two marriages' children form separate contiguous groups.
    expect(Math.max(...hudsonIndices)).toBeLessThan(Math.min(...ermaIndices));
  });

  it("keeps every person card in place when a person is selected", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    // The person cards carry data-ocid "tree.person.<n>"; the "This is Me"
    // action button carries a ".mark_me" suffix and is excluded.
    const personCardOcids = () =>
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("data-ocid"))
        .filter(
          (ocid): ocid is string =>
            ocid !== null && /^tree\.person\.\d+$/.test(ocid),
        );

    const before = personCardOcids();

    // Selecting a highlight-only child (no profile) keeps every card in place.
    await user.click(screen.getByRole("button", { name: /Isaiah Jr\./ }));
    expect(personCardOcids()).toEqual(before);

    // Selecting another highlight-only child likewise leaves the layout intact.
    await user.click(
      screen.getByRole("button", { name: /Son \(died at birth\)/ }),
    );
    expect(personCardOcids()).toEqual(before);
  });

  it("keeps the tree sections in their established vertical order", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);
    await expandLulaVersieBranch(user);

    const sections = [
      screen.getByRole("region", { name: "Starting couple" }),
      screen.getByRole("region", { name: "Children" }),
      screen.getByRole("region", { name: "Clayton's branch" }),
      screen.getByRole("region", { name: "Lula Mae and Versie" }),
      screen.getByRole("region", { name: "Versie's maternal family" }),
    ];

    for (let i = 0; i < sections.length - 1; i++) {
      expect(
        sections[i].compareDocumentPosition(sections[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
