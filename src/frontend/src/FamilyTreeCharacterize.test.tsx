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

// Characterization baseline for the Erma T. Williams branch before the four new
// child profiles (Columbus, Thomas Clayton 'Tip / TC', Alton, Robert Davis 'RD')
// are added. Those four cards are intentionally changing (they will become
// clickable and open new profiles), so they are NOT frozen here. Instead this
// protects the adjacent working behavior that must remain unchanged: the other
// six Erma children and the 'Son (died at birth)' card stay highlight-only, the
// Ms. Hudson branch children stay clickable, and the existing placeholder
// profiles keep rendering the full Person Profile template.
describe("Family Tree characterization: Erma T. Williams branch", () => {
  it("keeps the six remaining Erma T. Williams children highlight-only (non-clickable)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    for (const name of [
      "Ardeanus",
      "Willie B.",
      "James",
      "Freddie",
      "Zelia Mae",
      "Lula Mae",
    ]) {
      const card = within(claytonBranch).getByRole("button", {
        name: new RegExp(name),
      });
      await user.click(card);
      // Tapping highlights the card but stays on the Family Tree — it does not
      // navigate to a profile.
      expect(card).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Family Tree",
      );
    }
  });

  it("keeps the 'Son (died at birth)' card highlight-only (non-clickable)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

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
