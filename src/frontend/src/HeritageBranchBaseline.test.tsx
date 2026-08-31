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

async function openFamilyTree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

// The Clayton branch defaults to collapsed; expand it so its cards render.
async function expandClaytonBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Clayton \d+$/ }));
}

// Characterization baseline for the existing Family Tree view before the new
// Heritage Branch View is added. The new view is a net-new View union member
// plus a new page component, reachable alongside the existing Family Tree. These
// tests protect the working behavior that must remain unchanged: the app still
// loads on the default route without a blank screen, the existing Family Tree
// view stays reachable and intact, and the founding couple remains the root of
// the existing tree.
describe("Heritage Branch View baseline: existing Family Tree stays intact", () => {
  it("loads the app on the default route without a blank screen", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );
  });

  it("keeps the existing Family Tree view reachable from Home", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("keeps the founding couple as the root of the existing tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    for (const name of ["Julia “Julie” Norwood", "Isaiah Norwood"]) {
      expect(
        within(coupleSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("keeps the existing tree's children and Clayton branch intact", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    const childrenSection = screen.getByRole("region", { name: "Children" });
    for (const name of [
      "Clayton",
      "Isaiah Jr.",
      "Edward",
      "Hattie",
      "Pinkie",
      "Louise",
      "Lillie",
      "Lula E.",
    ]) {
      expect(
        within(childrenSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    expect(
      within(claytonBranch).getByRole("button", { name: /Ms\. Hudson/ }),
    ).toBeInTheDocument();
    expect(
      within(claytonBranch).getByRole("button", { name: /Erma T\. Williams/ }),
    ).toBeInTheDocument();
  });

  it("returns to Home from the existing Family Tree view", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    await user.click(screen.getByRole("button", { name: /Back to Home/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );
  });

  it("keeps Open Profile disabled for people without a profile entry", async () => {
    // Freddie, Zelia Mae, and Lula Mae now have profiles, so their Open Profile
    // is enabled. The other documented members without a profile entry must keep
    // Open Profile disabled. Isaiah Jr., Edward, and Hattie are children of the
    // default Julia anchor; Freddie, Zelia Mae, and Lula Mae are Erma's children,
    // so they are reached by anchoring the tree on Clayton.
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    for (const name of [
      "Isaiah Jr., Child",
      "Edward, Child",
      "Hattie, Child",
    ]) {
      await user.click(screen.getByRole("button", { name: new RegExp(name) }));
      expect(
        screen.getByRole("button", { name: "Open Profile" }),
      ).toBeDisabled();
    }

    // Re-anchor on Clayton to reveal his children, including Erma's.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Freddie, Zelia Mae, and Lula Mae now have profiles, so Open Profile is
    // enabled for them.
    for (const name of [
      "Freddie, Child",
      "Zelia Mae, Child",
      "Lula Mae, Child",
    ]) {
      await user.click(screen.getByRole("button", { name: new RegExp(name) }));
      expect(
        screen.getByRole("button", { name: "Open Profile" }),
      ).toBeEnabled();
    }
  });
});
