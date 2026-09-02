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

async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

// Characterization baseline for the Explore Family focused navigator. The old
// full-tree layout (couples, collapsible branches, relation-to-you reveals,
// this-is-me actions) was intentionally replaced by a focused navigator where
// tapping a relative recenters the view. These tests protect the working
// behavior that must survive the change: the full family structure (every
// couple, marriage, and parent-to-child relationship) remains present and
// reachable through the navigator.
describe("Explore Family characterization: the full family structure stays reachable", () => {
  it("keeps the founding couple and their eight children reachable from the default focus", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia is the default focus; Isaiah is her spouse.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();

    // All eight children render as relative cards.
    for (const child of [
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
        screen.getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("keeps Clayton's two marriages and their children reachable", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);

    // Clayton's two spouses.
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    ).toBeInTheDocument();

    // Children from both marriages.
    for (const child of [
      "Elbert Norwood Child",
      "Wellman Norwood Child",
      "Wetherby Norwood Child",
      "Columbus Norwood Child",
      "Thomas Clayton “Tip / TC” Norwood Child",
      "Alton Norwood Child",
      "Robert Davis “RD” Norwood Child",
      "Ardeanus Norwood Child",
      "Willie B. Norwood Child",
      "James Norwood Child",
      "Freddie Norwood Child",
      "Zelia Mae Norwood Child",
      "Lula Mae Norwood Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("keeps the Lula Mae / Versie couple reachable", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    // Lula Mae is the focus and Versie Smith is her spouse.
    expect(screen.getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith Spouse/ }),
    ).toBeInTheDocument();
  });

  it("keeps Versie's maternal ancestry reachable (Gertrude mother, Harvey grandfather)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Versie Smith Spouse/);

    // Versie is the focus; his mother Gertrude renders in the Mother zone.
    expect(screen.getByText("Versie Smith")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Gertrude Adams-Hill Mother/ }),
    ).toBeInTheDocument();

    // Focus Gertrude to reach her father Harvey.
    await tapRelative(user, /Gertrude Adams-Hill Mother/);
    expect(screen.getByText("Gertrude Adams-Hill")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Harvey Adams Sr\. Father/ }),
    ).toBeInTheDocument();
  });

  it("keeps Harvey's second marriage reachable (Mary Jane, Mildred, Christine)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Versie Smith Spouse/);
    await tapRelative(user, /Gertrude Adams-Hill Mother/);
    await tapRelative(user, /Harvey Adams Sr\. Father/);

    // Harvey is the focus; his two spouses render.
    expect(screen.getByText("Harvey Adams Sr.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    ).toBeInTheDocument();

    // Children from the second marriage (Mildred, Christine) render.
    expect(
      screen.getByRole("button", { name: /Mildred Adams Child/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Christine Adams Child/ }),
    ).toBeInTheDocument();
  });
});
