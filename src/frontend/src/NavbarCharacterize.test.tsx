import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the top navigation bar (Layout) that the
// account-identity display change must NOT break.
//
// The upcoming build changes how the signed-in user's name is shown in the
// navbar: today the navbar renders the raw internal account ID (the ICP
// Principal, e.g. "vdcau-...-qqe") as the visible identity; the requirement
// replaces that with the linked/pending Person Profile display name, or
// 'My Account' / 'Complete Profile' when no profile is connected. This baseline
// freezes the navbar STRUCTURE that must survive that swap:
//
//  1. The primary nav links (Explore Family, Heritage Branch, Family Archive,
//     Add Myself, Notifications) are always present.
//  2. An unauthenticated caller sees a "Sign in" button and no "Sign out".
//  3. An authenticated caller sees a "Sign out" button and no "Sign in".
//
// It deliberately does NOT assert the raw account ID is rendered as the visible
// name — that is the behavior the requirement intentionally removes.
//
// The generated components use data-ocid for test ids.
import { Principal } from "@icp-sdk/core/principal";

const ACCOUNT = "2vxsx-fae";

const {
  mockActor,
  getAuthenticated,
  setAuthenticated,
  setCurrentPrincipal,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
  };
  return {
    mockActor,
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
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

const NAV_LINKS = [
  "Explore Family",
  "Heritage Branch",
  "Family Archive",
  "Add Myself",
  "Notifications",
];

describe("Navbar structure characterization", () => {
  it("always shows the primary nav links in the top bar", () => {
    renderApp();

    for (const label of NAV_LINKS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("shows a Sign in button and no Sign out when unauthenticated", () => {
    setAuthenticated(false);
    renderApp();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
  });

  it("shows a Sign out button and no Sign in when authenticated", () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the nav links visible alongside the authenticated sign-out control", () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    for (const label of NAV_LINKS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});
