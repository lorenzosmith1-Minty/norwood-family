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

async function openHeritageBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Heritage Branch" }));
}

// Characterization baseline for the Explore Family focused navigator and the
// Heritage Branch overview map. The request intentionally replaced the classic
// multi-generation Family Tree and the anchor-centered Heritage Branch with
// these two focused views. These tests protect the working behavior that must
// remain unchanged: the app still loads on the default route without a blank
// screen, the founding couple remains the default focus, the founding couple's
// children stay intact, the Heritage Branch overview renders all major family
// lines, and tapping a Heritage Branch node opens Explore Family centered on
// that person.
describe("Explore Family + Heritage Branch baseline: focused views stay intact", () => {
  it("loads the app on the default route without a blank screen", () => {
    renderApp();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toHaveAttribute("src", "/assets/norwood-logo.png");
  });

  it("keeps the Explore Family view reachable from Home", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
  });

  it("keeps the founding couple as the default focus", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // No person is marked "Me", so the default anchor (Julia) is the focus.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();
  });

  it("keeps the founding couple's children intact", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    for (const name of [
      "Clayton Norwood Child",
      "isaiah-jr Child",
      "edward Child",
      "hattie Child",
      "pinkie Child",
      "louise Child",
      "lillie Child",
      "lula-e Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("renders the Heritage Branch overview with every major family line", async () => {
    const user = userEvent.setup();
    renderApp();
    await openHeritageBranch(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );

    // Each cluster renders its title heading.
    const clusters: string[] = [
      "Founding Couple",
      "Lula Mae + Versie Family Unit",
      "Clayton Branch",
      "Smith Branch",
      "Versie's Maternal / Adams Line",
    ];
    for (const title of clusters) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }

    // The hardcoded descendant/branch counts were removed: no count chip text
    // is shown because no count is computed from the stored relationship graph.
    expect(screen.queryByText("8 children")).not.toBeInTheDocument();
    expect(screen.queryByText("7 children")).not.toBeInTheDocument();
    expect(screen.queryByText("72 Descendants")).not.toBeInTheDocument();
    expect(
      screen.queryByText("16 children · 2 marriages"),
    ).not.toBeInTheDocument();
  });

  it("opens Explore Family centered on a person when a Heritage Branch card is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openHeritageBranch(user);

    // The Clayton Branch anchor card opens Explore Family centered on Clayton.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );

    // Explore Family opens centered on Clayton.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();
  });
});
