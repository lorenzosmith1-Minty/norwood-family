import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the steward/admin navigation gating that the
// Family Governance & Safety Controls build must NOT break.
//
// The upcoming build adds a governance area (Review Requests, Steward
// Management, Duplicate Profiles, Relationship Management, Archived Profiles,
// Audit History) reached from the existing "Family Steward" nav button. The
// requirements keep the current gating intact:
//
//  1. Steward controls are hidden from unauthenticated users and normal members.
//  2. An existing current Family Steward still works and can access the
//     governance area.
//  3. Governance subpages are kept OUT of the global navbar (only the single
//     "Family Steward" entry point remains in the top bar).
//
// This baseline freezes the navbar gating that must survive the build: the
// "Family Steward" and "Pending Contributions" buttons appear only for an
// authenticated admin, and never for an unauthenticated caller or a signed-in
// normal member. It deliberately does NOT assert the internal structure of the
// governance area itself — that is the behavior the build intentionally adds.
import { Principal } from "@icp-sdk/core/principal";

const ACCOUNT = "2vxsx-fae";

const {
  mockActor,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setCurrentPrincipal,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
  };
  return {
    mockActor,
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getCurrentPrincipal: () => currentPrincipal,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);

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

const STEWARD_LABEL = "Family Steward";
const ADMIN_LABEL = "Pending Contributions";

describe("Steward/admin navigation gating characterization", () => {
  it("hides steward and admin controls from an unauthenticated caller", () => {
    setAuthenticated(false);
    setAdmin(false);
    renderApp();

    expect(
      screen.queryByRole("button", { name: STEWARD_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ADMIN_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("hides steward and admin controls from a signed-in normal member", () => {
    setAuthenticated(true);
    setAdmin(false);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    expect(
      screen.queryByRole("button", { name: STEWARD_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ADMIN_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("shows steward and admin controls to an authenticated Family Steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    // The admin query is async, so wait for the gated steward nav button to
    // appear. Pending Contributions is no longer a top-level pill — it lives
    // inside the Family Steward hub.
    const steward = await screen.findByRole("button", { name: STEWARD_LABEL });
    expect(steward).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ADMIN_LABEL }),
    ).not.toBeInTheDocument();

    // Opening the Family Steward hub surfaces Pending Contributions.
    await user.click(steward);
    expect(
      await screen.findByRole("button", { name: /Pending Contributions/ }),
    ).toBeInTheDocument();
  });

  it("keeps the governance entry point out of the global navbar for a steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    // The single "Family Steward" entry point is present, but no governance
    // subpage labels leak into the top bar.
    expect(
      await screen.findByRole("button", { name: STEWARD_LABEL }),
    ).toBeInTheDocument();
    for (const subpage of [
      "Review Requests",
      "Steward Management",
      "Duplicate Profiles",
      "Relationship Management",
      "Archived Profiles",
      "Audit History",
    ]) {
      expect(
        screen.queryByRole("button", { name: subpage }),
      ).not.toBeInTheDocument();
    }
  });
});
