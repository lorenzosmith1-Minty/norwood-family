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

const SEVEN_CHILDREN = [
  "Lorenzo Smith Sr.",
  "Versie Smith Jr.",
  "Herbert Smith",
  "Alonzo Smith",
  "Sherri Smith",
  "Beatrice Smith",
  "Ed Smith",
];

// Characterization baseline for the Lula Mae + Versie family unit. The request
// intentionally replaced the classic Family Tree with the focused Explore
// Family navigator, so the old Family Unit cluster plate DOM is not frozen.
// These tests protect the adjacent working behavior that must survive: focusing
// on Lula Mae shows Versie as her spouse and the seven children as relative
// cards, and the Adams family (not a direct relative of Lula Mae) is not shown
// on that view.
describe("Lula Mae + Versie Family Unit cluster characterization: self-contained view", () => {
  it("keeps the Lula Mae focus self-contained: spouse, seven children, and no Adams family", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    // Lula Mae is the focus; Versie renders as her spouse.
    expect(screen.getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith Spouse/ }),
    ).toBeInTheDocument();

    // All seven children render as relative cards.
    for (const name of SEVEN_CHILDREN) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${name} Child`) }),
      ).toBeInTheDocument();
    }

    // The Adams family is not a direct relative of Lula Mae, so none of its
    // members render on this focused view.
    expect(
      screen.queryByRole("button", { name: /Harvey Adams Sr\./ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mary Louise Sims/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Gertrude Adams-Hill/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the zones in order: spouse beside the focus, children below", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    // The Spouse zone label precedes the Children zone label in document order.
    const spouse = screen.getAllByText("Spouse")[0];
    const children = screen.getAllByText("Children")[0];
    expect(
      spouse.compareDocumentPosition(children) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
