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

// Recenter the Explore Family view on Harvey Adams Sr. by tapping each relative
// card down the maternal ancestry chain: Julia -> Clayton -> Lula Mae -> Versie
// Smith -> Gertrude Adams-Hill -> Harvey Adams Sr.
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

// Characterization of the deeper maternal ancestry chain in the focused Explore
// Family view. The request replaced the multi-generation tree with a focused
// view, so the old lower-tree connector sections no longer exist. These tests
// protect the working behavior that must survive: the user can still recenter
// down the maternal ancestry chain (Harvey above Gertrude above Versie) and
// reach Harvey's documented relationships (his two wives and children).
describe("Explore Family maternal ancestry navigation", () => {
  it("recenters down the maternal ancestry chain to Harvey Adams Sr.", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // Harvey is now the focus person.
    expect(screen.getByText("Harvey Adams Sr.")).toBeInTheDocument();
    // His documented parents are absent (none recorded), but his two wives and
    // children render.
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Gertrude Adams-Hill Child/ }),
    ).toBeInTheDocument();
  });

  it("shows the maternal ancestry chain relationships around Versie Smith", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Versie Smith Spouse/ }),
    );

    // Versie is the focus. His mother (Gertrude) and spouse (Lula Mae) render.
    expect(screen.getByText("Versie Smith")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Gertrude Adams-Hill Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lula Mae Norwood Spouse/ }),
    ).toBeInTheDocument();
  });

  it("recenters on a spouse and shows their own relationships", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // Recenter on Mary Jane Johnson (Harvey's second wife).
    await user.click(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    );
    expect(screen.getByText("Mary Jane Johnson")).toBeInTheDocument();
    // Her spouse (Harvey) and children (Mildred, Christine) render.
    expect(
      screen.getByRole("button", { name: /Harvey Adams Sr\. Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mildred Adams Child/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Christine Adams Child/ }),
    ).toBeInTheDocument();
  });
});
