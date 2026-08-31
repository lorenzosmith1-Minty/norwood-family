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

// Characterization baseline for the Erma T. Williams branch. The four earlier
// child profiles (Columbus, Thomas Clayton 'Tip / TC', Alton, Robert Davis 'RD')
// and the three newest (Ardeanus, Willie B., James) are intentionally changing
// (they became clickable and open new profiles), so they are NOT frozen here.
// Instead this protects the adjacent working behavior that must remain
// unchanged: the remaining Erma children (Freddie, Zelia Mae, Lula Mae) and the
// 'Son (died at birth)' card stay highlight-only, the Ms. Hudson branch children
// stay clickable, and the existing placeholder profiles keep rendering the full
// Person Profile template.
describe("Family Tree characterization: Erma T. Williams branch", () => {
  it("opens the three new Erma child profiles (Ardeanus, Willie B., James) from their cards", async () => {
    // Ardeanus, Willie B., and James previously rendered as highlight-only
    // non-clickable cards. That behavior intentionally changed: they now have
    // profiles and open from their Family Tree cards. This test reflects the
    // new behavior while the next test keeps the remaining highlight-only cards
    // (Freddie, Zelia Mae, Lula Mae) frozen.
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const cases: { card: RegExp; heading: string }[] = [
      { card: /Ardeanus/, heading: "Ardeanus Norwood" },
      { card: /Willie B\./, heading: "Willie B. Norwood" },
      { card: /James/, heading: "James Norwood" },
    ];

    for (const { card, heading } of cases) {
      const claytonBranch = screen.getByRole("region", {
        name: "Clayton's branch",
      });
      await user.click(
        within(claytonBranch).getByRole("button", { name: card }),
      );
      // Tapping the card navigates to the person's profile.
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      // Back to the tree for the next profile.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("opens Freddie, Zelia Mae, and Lula Mae from their cards", async () => {
    // Freddie, Zelia Mae, and Lula Mae previously rendered as highlight-only
    // non-clickable cards. That behavior intentionally changed: they now have
    // profiles and open from their Family Tree cards. This test reflects the
    // new behavior while the next test keeps the remaining highlight-only card
    // ('Son (died at birth)') frozen.
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const cases: { card: RegExp; heading: string }[] = [
      { card: /Freddie/, heading: "Freddie Norwood" },
      { card: /Zelia Mae/, heading: "Zelia Mae Norwood" },
      { card: /Lula Mae/, heading: "Lula Mae Norwood" },
    ];

    for (const { card, heading } of cases) {
      const claytonBranch = screen.getByRole("region", {
        name: "Clayton's branch",
      });
      await user.click(
        within(claytonBranch).getByRole("button", { name: card }),
      );
      // Tapping the card navigates to the person's profile.
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      // Back to the tree for the next profile.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("keeps the 'Son (died at birth)' card highlight-only (non-clickable)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    const son = within(claytonBranch).getByRole("button", {
      name: /Son \(died at birth\)/,
    });
    await user.click(son);
    expect(son).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("keeps the Ms. Hudson branch children clickable to open their profiles", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    await user.click(
      within(claytonBranch).getByRole("button", { name: /Elbert/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Elbert Norwood",
    );

    // Back to the tree, then open Wellman. Re-query the branch after the
    // re-render so the element reference is not stale.
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    const branchAfterBack = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    await user.click(
      within(branchAfterBack).getByRole("button", { name: /Wellman/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Wellman Norwood",
    );
  });

  it("renders the full Person Profile template for an existing placeholder profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    await user.click(
      within(claytonBranch).getByRole("button", { name: /Wellman/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Wellman Norwood",
    );

    // The full Person Profile template renders all four sections.
    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    // The header facts render as a definition list.
    const dl = document.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Clayton Norwood and Ms. Hudson"),
    ).toBeInTheDocument();
  });
});
