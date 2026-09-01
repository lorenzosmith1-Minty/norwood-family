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

function maternalFamily() {
  return screen.getByRole("region", { name: "Versie's maternal family" });
}

// The Versie's maternal family branch defaults to collapsed; expand it so the
// ancestor cards (Harvey, Gertrude, Versie) render.
async function expandVersieMaternalBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Versie's Maternal Family \d+$/ }),
  );
}

// Characterization baseline for the Harvey Adams Sr. second-marriage expansion.
// The request will add Person Profile pages for Mary Jane Johnson, Mildred
// Adams, Christine Adams, Tammy, Punchy, and Patricia Rollins; update Harvey's
// profile so Mary Jane Johnson is his second wife with Mildred and Christine as
// their children; and wire the second-marriage branch into the Family Tree and
// Heritage Branch View. That intentionally changes Harvey's second-wife spouse
// card (currently no children) and adds new cards/entries to both views. This
// file protects the adjacent working behavior that must remain unchanged: the
// first-marriage branch stays grouped and in recorded order in both views,
// Harvey and Mary Louise Sims remain the couple above the first-marriage
// children with Gertrude below them, and the first-marriage children keep their
// recorded order in the Heritage Branch under the Harvey anchor.
describe("Harvey Adams Sr. second-marriage characterization: maternal ancestry stays intact", () => {
  it("keeps the maternal ancestry chain in the Family Tree: Harvey above Gertrude above Versie, with no first-marriage cards", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    const line = maternalFamily();
    const harvey = within(line).getByRole("button", {
      name: /^Harvey Adams Sr\.$/,
    });
    const gertrude = within(line).getByRole("button", {
      name: /Gertrude Adams-Hill 1913/,
    });
    const versie = within(line).getByRole("button", {
      name: /^Versie Smith$/,
    });

    // Ancestors upward, descendants downward: Harvey above Gertrude above
    // Versie.
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(harvey, gertrude)).toBe(true);
    expect(follows(gertrude, versie)).toBe(true);

    // The first-marriage branch (Mary Louise Sims and her 14 children) is no
    // longer part of the Family Tree.
    expect(
      within(line).queryByRole("button", { name: /Mary Louise Sims/ }),
    ).toBeNull();
    expect(
      within(line).queryByRole("button", { name: /John Adams/ }),
    ).toBeNull();
  });

  it("keeps the first-marriage children in recorded order under the Harvey anchor in the Heritage Branch", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Navigate to the Harvey anchor.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    expect(screen.getByText(/Anchor: Harvey Adams Sr\./)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims, First Wife/ }),
    ).toBeInTheDocument();

    // The first-marriage children render in the recorded HERITAGE order
    // (Gertrude first, then the rest in the same order as the Family Tree).
    const heritageChildren = [
      "Gertrude Adams-Hill, Mother",
      "John Adams, Son",
      "Louis Adams Sr., Son",
      "Albert Adams, Son",
      "Charles Adams, Son",
      "Homer Adams, Son",
      "Versie Adams Sr., Son",
      "Judge Granberry Adams, Son",
      "Fannie Adams, Daughter",
      "Harvey Adams Jr., Son",
      "Christine Adams Tucker, Daughter",
      "Robert Adams Sr., Son",
      "Ella Mae Adams, Daughter",
      "Eula Lee Adams, Daughter",
    ];

    const childButtons = heritageChildren.map((name) =>
      screen.getByRole("button", { name: new RegExp(name) }),
    );
    for (let i = 0; i < childButtons.length - 1; i++) {
      expect(
        childButtons[i].compareDocumentPosition(childButtons[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
