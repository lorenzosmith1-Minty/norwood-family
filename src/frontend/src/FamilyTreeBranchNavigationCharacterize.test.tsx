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

// Characterization baseline for the Family Tree collapsible-branch change. The
// request will intentionally change the card layout (compact cards, hidden
// relationship labels) and add collapsible descendant branches; the current
// implementation already ships the collapsible branches, so these tests freeze
// the branch behavior the request must preserve: collapsed branches show the
// branch person's name and a descendant count, toggling expands/collapses the
// branch, the branch holding the selected card cannot be collapsed, and the
// branch containing a person whose profile was opened stays expanded when the
// user returns from the profile view.
describe("Family Tree collapsible-branch characterization: branch folds", () => {
  it("shows each major descendant branch collapsed with the branch person's name and descendant count", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonFold = screen.getByRole("button", { name: "Clayton 16" });
    const lulaVersieFold = screen.getByRole("button", {
      name: "Lula Mae & Versie 26",
    });
    const harveyFold = screen.getByRole("button", {
      name: "Harvey Adams Sr. 6",
    });

    expect(claytonFold).toHaveAttribute("aria-expanded", "false");
    expect(lulaVersieFold).toHaveAttribute("aria-expanded", "false");
    expect(harveyFold).toHaveAttribute("aria-expanded", "false");

    // Collapsed branches render no cards: the spouses and children of each
    // branch are absent until the fold is opened.
    expect(
      screen.queryByRole("button", { name: /Erma T\. Williams/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Versie Smith/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Mary Jane Johnson/ }),
    ).toBeNull();
  });

  it("expands and collapses a branch from its fold row", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonFold = screen.getByRole("button", { name: "Clayton 16" });
    await user.click(claytonFold);
    expect(claytonFold).toHaveAttribute("aria-expanded", "true");

    const branch = screen.getByRole("region", { name: "Clayton's branch" });
    expect(
      within(branch).getByRole("button", { name: /Erma T\. Williams/ }),
    ).toBeInTheDocument();
    expect(
      within(branch).getByRole("button", { name: /Columbus/ }),
    ).toBeInTheDocument();

    // The fold row stays visible in the expanded state and collapses again.
    await user.click(claytonFold);
    expect(claytonFold).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /Erma T\. Williams/ }),
    ).toBeNull();
  });

  it("keeps the branch holding the selected card expanded when its fold is clicked", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonFold = screen.getByRole("button", { name: "Clayton 16" });
    await user.click(claytonFold);

    // "Son (died at birth)" is a highlight-only child (no profile entry), so
    // selecting him does not navigate away.
    const son = screen.getByRole("button", { name: /Son \(died at birth\)/ });
    await user.click(son);
    expect(son).toHaveAttribute("aria-pressed", "true");

    // Collapsing the branch that holds the selected card is refused, so the
    // current selection stays visible.
    await user.click(claytonFold);
    expect(claytonFold).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Son \(died at birth\)/ }),
    ).toBeInTheDocument();
  });
});

describe("Family Tree collapsible-branch characterization: explored branch stays expanded", () => {
  it("keeps the branch of a person whose profile was opened expanded on return", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Clayton's card lives in the always-visible Children section; opening his
    // profile records him as the explored person.
    const childrenSection = screen.getByRole("region", { name: "Children" });
    await user.click(
      within(childrenSection).getByRole("button", { name: /^Clayton/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Clayton/,
    );

    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    // The branch containing Clayton starts expanded: the fold reports open and
    // his branch's cards render without any further interaction.
    const claytonFold = screen.getByRole("button", { name: "Clayton 16" });
    expect(claytonFold).toHaveAttribute("aria-expanded", "true");
    const branch = screen.getByRole("region", { name: "Clayton's branch" });
    expect(
      within(branch).getByRole("button", { name: /Erma T\. Williams/ }),
    ).toBeInTheDocument();
  });

  it("keeps the Lula Mae & Versie branch expanded after opening Versie's profile from it", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Expand the Lula Mae & Versie branch so Versie's card is reachable.
    const lulaVersieFold = screen.getByRole("button", {
      name: "Lula Mae & Versie 26",
    });
    await user.click(lulaVersieFold);
    expect(lulaVersieFold).toHaveAttribute("aria-expanded", "true");

    // Versie's card opens his profile (he has a profile entry).
    await user.click(screen.getByRole("button", { name: "Versie Smith" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Versie/,
    );

    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    // The branch containing the explored person (Versie) starts expanded, so
    // his maternal line is reachable without reopening the fold.
    expect(lulaVersieFold).toHaveAttribute("aria-expanded", "true");
    const maternalLine = screen.getByRole("region", {
      name: "Versie's maternal line",
    });
    expect(maternalLine).toBeInTheDocument();
    expect(
      within(maternalLine).getByRole("button", {
        name: "Harvey Adams Sr.",
      }),
    ).toBeInTheDocument();
  });
});
