import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

configure({ testIdAttribute: "data-ocid" });

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

// Lorenzo Smith Sr.'s six siblings, derived from his shared parents (Lula Mae
// Norwood and Versie Smith) in the relationship graph.
const SIX_SIBLINGS = [
  "Versie Smith Jr.",
  "Herbert Smith",
  "Alonzo Smith",
  "Sherri Smith",
  "Beatrice Smith",
  "Ed Smith",
];

// Characterization baseline for the Lorenzo Smith Sr. focus card in the Explore
// Family view. The upcoming build adds one recorded child (Lorenzo Smith Jr.)
// to Lorenzo Smith Sr., but it explicitly preserves his parents (Lula Mae
// Norwood and Versie Smith) above the focus card, his six siblings as siblings,
// and the focus card itself (name + initials placeholder since no photo exists).
// These tests protect that preserved behavior without asserting the child that
// will be added or any descendant counts that will be removed.
describe("Lorenzo Smith Sr. focus card characterization", () => {
  async function focusLorenzo(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);
  }

  it("shows Lorenzo Smith Sr. as the focus card with his parents above", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    // Lorenzo is the focus person.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(
      within(focusCard).getByText("Lorenzo Smith Sr."),
    ).toBeInTheDocument();

    // His parents render above: Lula Mae as Mother, Versie as Father.
    expect(
      screen.getByRole("button", { name: /Lula Mae Norwood Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith Father/ }),
    ).toBeInTheDocument();
  });

  it("renders the initials placeholder on the focus card since no photo exists", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    // Lorenzo has no photograph, so the focus card renders his initials "LS".
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(within(focusCard).getByText("LS")).toBeInTheDocument();
  });

  it("keeps the six siblings in the Siblings zone, never as children", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    // All six siblings render as relative cards with the "Sibling" label.
    for (const name of SIX_SIBLINGS) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${name} Sibling`) }),
      ).toBeInTheDocument();
    }

    // None of the six siblings appear as children of Lorenzo Smith Sr.
    for (const name of SIX_SIBLINGS) {
      expect(
        screen.queryByRole("button", { name: new RegExp(`${name} Child`) }),
      ).not.toBeInTheDocument();
    }
  });
});
