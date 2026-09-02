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

// Characterization of the focused Explore Family navigation. The request
// replaced the multi-generation tree (with its collapsible descendant branches)
// with a focused view where tapping a relative card recenters on that person.
// These tests protect the working navigation behavior that must survive: the
// user can move through the family by recentering, the view always shows only
// the focus person's closest relatives (never the full extended tree), and the
// focus card's View Profile opens the existing profile.
describe("Explore Family focused navigation", () => {
  it("recenters on a tapped relative and shows only their closest relatives", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Start on Julia (default focus). Her closest relatives render.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();

    // Tap Clayton to recenter on him.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();
    // His parents, spouses, and children now render around him.
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Elbert Norwood Child/ }),
    ).toBeInTheDocument();
  });

  it("does not render the full extended family tree at any focus", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // A distant relative (Harvey Adams Sr.) is not present on the default view.
    expect(screen.queryByText("Harvey Adams Sr.")).not.toBeInTheDocument();

    // Recenter on Clayton; his distant relatives are still absent.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );
    expect(screen.queryByText("Harvey Adams Sr.")).not.toBeInTheDocument();
    // No infinite-canvas surface is rendered.
    expect(screen.queryByTestId("explore.canvas")).not.toBeInTheDocument();
  });

  it("opens the focus person's profile via View Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Clayton, then open his profile via the focus card's button.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );
  });
});
