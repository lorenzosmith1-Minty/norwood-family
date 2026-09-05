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

// Characterization baseline for the Explore Family sibling-section layout in
// the restored mobile-friendly view. The Siblings section is a wrapping row
// BELOW the focus card with no horizontal scrolling, so there is no left/right
// arrow control and no wheel/trackpad handler. This test protects that restored
// behavior: the wrapping row renders all six siblings with no rail affordances.
describe("Explore Family sibling-section layout characterization", () => {
  async function focusLorenzo(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr. (six documented siblings).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);
  }

  it("renders the Siblings section as a wrapping row with no arrow controls", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.className).toContain("ex-siblings-row");

    // All six siblings render in the wrapping row.
    for (const name of [
      "Versie Smith Jr.",
      "Herbert Smith",
      "Alonzo Smith",
      "Sherri Smith",
      "Beatrice Smith",
      "Ed Smith",
    ]) {
      expect(
        within(siblingsZone).getByRole("button", {
          name: new RegExp(`${name} Sibling`),
        }),
      ).toBeInTheDocument();
    }

    // No horizontal-scroll rail affordances exist in the restored layout.
    expect(siblingsZone.querySelector(".ex-siblings-scroll")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Scroll siblings left" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scroll siblings right" }),
    ).not.toBeInTheDocument();
  });
});
