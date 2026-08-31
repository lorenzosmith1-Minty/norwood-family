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

async function openBranchFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Heritage Branch View" }),
  );
}

describe("Heritage Branch View", () => {
  it("is reachable from Home alongside the existing Family Tree view", async () => {
    const user = userEvent.setup();
    renderApp();

    // Both the existing Family Tree and the new Heritage Branch View are
    // reachable from Home.
    expect(
      screen.getByRole("button", { name: "Explore the Family" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    ).toBeInTheDocument();

    await openBranchFromHome(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );
  });

  it("is reachable from the Layout header without leaving the app", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Heritage Branch" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );
  });

  it("opens anchored on the founding couple (Julia 'Julie' Norwood)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // The anchor chip names the founding matriarch.
    expect(
      screen.getByText(/Anchor: Julia “Julie” Norwood/),
    ).toBeInTheDocument();

    // The anchor card is present and carries the "Anchor" marker.
    const juliaCard = screen.getByRole("button", {
      name: /Julia “Julie” Norwood, Matriarch/,
    });
    expect(juliaCard).toBeInTheDocument();
    expect(within(juliaCard).getByText("Anchor")).toBeInTheDocument();
  });

  it("renders the anchor-centered layout: spouse beside, children below", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // Julia is the default anchor. Her spouse Isaiah renders beside her and
    // her eight documented children render below.
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood, Patriarch/ }),
    ).toBeInTheDocument();
    for (const name of [
      "Clayton Norwood, Son",
      "Isaiah Jr., Child",
      "Edward, Child",
      "Hattie, Child",
      "Pinkie, Child",
      "Louise, Child",
      "Lillie, Child",
      "Lula E., Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("keeps deeper branches collapsed until that person is selected", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // Clayton has documented descendants but is not the anchor, so his branch
    // stays collapsed behind the "+" marker rather than expanding his children.
    const claytonCard = screen.getByRole("button", {
      name: /Clayton Norwood, Son/,
    });
    expect(
      within(claytonCard).getByLabelText(
        "Has descendants — anchor here to expand",
      ),
    ).toBeInTheDocument();
    // His children are not rendered while the branch is collapsed.
    expect(
      screen.queryByRole("button", { name: /Elbert Norwood, Son/ }),
    ).not.toBeInTheDocument();
  });

  it("selecting a person reveals all five actions", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // No actions are shown before a person is selected.
    expect(
      screen.queryByRole("button", { name: "Relation to You" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );

    for (const action of [
      "Relation to You",
      "Relationship Path",
      "Open Profile",
      "Anchor Tree Here",
      "This is Me",
    ]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    }
  });

  it("shows the relation and path fallback for a selected person with no recorded values", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );

    await user.click(screen.getByRole("button", { name: "Relation to You" }));
    expect(screen.getByText(/Relation to You:/)).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Relationship Path" }));
    expect(screen.getByText(/Relationship Path:/)).toBeInTheDocument();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("Anchor Tree Here re-centers the tree around the selected person", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // Select Clayton and re-anchor on him.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // The anchor chip now names Clayton.
    expect(screen.getByText(/Anchor: Clayton Norwood/)).toBeInTheDocument();

    // Clayton's documented parents, spouses, siblings, and children now render
    // around him in the anchor-centered layout.
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood, Matriarch/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood, Patriarch/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson, First Wife/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams, Second Wife/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Elbert Norwood, Son/ }),
    ).toBeInTheDocument();
  });

  it("Open Profile navigates to the existing profile view for that person", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );
  });

  it("This is Me marks the selected person within this view", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    const claytonCard = screen.getByRole("button", {
      name: /Clayton Norwood, Son/,
    });
    expect(within(claytonCard).queryByText("Me")).not.toBeInTheDocument();

    await user.click(claytonCard);
    await user.click(screen.getByRole("button", { name: "This is Me" }));

    expect(within(claytonCard).getByText("Me")).toBeInTheDocument();
  });

  it("returns to the existing Family Tree view via Back", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );

    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });
});
