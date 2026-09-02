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

// Characterization baseline for the Lula Mae + Versie Smith family unit. The
// request intentionally replaced the classic multi-generation Family Tree with
// the focused Explore Family navigator, so the old branch-layout assertions are
// not frozen. These tests protect the adjacent working behavior that must
// survive: the Lula Mae + Versie couple stays present and navigable, Versie's
// card still opens his profile, Lula Mae's card still opens her profile, and
// the Clayton and Harvey Adams Sr. relationships remain intact.
describe("Lula Mae + Versie Family Unit characterization: adjacent behavior stays intact", () => {
  it("keeps the Lula Mae and Versie couple present in Explore Family", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Lula Mae (Julia -> Clayton -> Lula Mae).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    // Lula Mae is the focus and Versie Smith renders as her spouse.
    expect(screen.getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith Spouse/ }),
    ).toBeInTheDocument();
  });

  it("keeps Versie's card opening his profile from Explore Family", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae -> Versie.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Versie Smith Spouse/);

    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
    expect(screen.getByText("Husband of Lula Mae Norwood")).toBeInTheDocument();
  });

  it("keeps Lula Mae's card opening her profile from Explore Family", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );
    expect(screen.getByText("Daughter")).toBeInTheDocument();
  });

  it("keeps the Clayton and Harvey Adams Sr. relationships intact", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Clayton; his two documented spouses render beside him.
    await tapRelative(user, /Clayton Norwood Child/);
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    ).toBeInTheDocument();

    // Recenter on Harvey Adams Sr. (Clayton -> Lula Mae -> Versie -> Gertrude
    // -> Harvey); his two documented spouses render beside him.
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Versie Smith Spouse/);
    await tapRelative(user, /Gertrude Adams-Hill Mother/);
    await tapRelative(user, /Harvey Adams Sr\. Father/);
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    ).toBeInTheDocument();
  });
});
