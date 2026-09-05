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

/** Tap a relative card by its accessible name (e.g. "Clayton Norwood Child"). */
async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

describe("Explore Family focused navigator", () => {
  it("loads with a focus card showing name, years, relation, and View Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The default focus is the founding matriarch Julia (no person is marked Me).
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(
      within(focusCard).getByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
    // Birth–death years when known.
    expect(within(focusCard).getByText("1860–1936")).toBeInTheDocument();
    // Relation to You (Julia has no relationToYou value, so it falls back).
    expect(within(focusCard).getByText("Family member")).toBeInTheDocument();
    // View Profile action.
    expect(
      within(focusCard).getByRole("button", { name: "View Profile" }),
    ).toBeInTheDocument();
  });

  it("shows father, mother, spouse, siblings, and children only when known", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia has no documented parents, so no Father/Mother zones render.
    expect(screen.queryByText("Father")).not.toBeInTheDocument();
    expect(screen.queryByText("Mother")).not.toBeInTheDocument();
    // Spouse Isaiah renders beside the focus.
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();
    // Her eight children render below. The children without a profile entry
    // fall back to their graph id as the card name.
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

  it("recenters on a tapped relative and shows their immediate relationships", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Tap Clayton (Julia's child) to recenter on him.
    await tapRelative(user, /Clayton Norwood Child/);
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();

    // Clayton now shows his documented parents, spouses, and children.
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Father/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Elbert Norwood Child/ }),
    ).toBeInTheDocument();
  });

  it("defaults to the person marked 'Me' when present, otherwise the default anchor", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // No person is marked 'Me' in the profiles record, so the default anchor
    // (Julia) is the focus.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
  });

  it("View Profile opens the existing profile page for the focus person", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
  });

  it("does not render the full extended family tree or an infinite canvas", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Only the focus person's closest relatives are shown, not the whole tree.
    // A distant relative (e.g. Harvey Adams Sr.) is not present on the default view.
    expect(screen.queryByText("Harvey Adams Sr.")).not.toBeInTheDocument();
    // No pan/zoom infinite-canvas surface is rendered.
    expect(screen.queryByTestId("explore.canvas")).not.toBeInTheDocument();
  });
});
