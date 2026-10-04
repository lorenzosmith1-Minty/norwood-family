import "@testing-library/jest-dom/vitest";
import {
  type FamilyMembership,
  MembershipStatus,
  type PersonProfile,
  type ProfileClaim,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the
// membership-confirmation COPY change must NOT disturb: the app-shell
// membership routing rule.
//
// The requested change reworks the user-facing wording for the membership
// confirmation states and removes obsolete pending-review actions. It must not
// change WHICH shell a caller sees for their active-family membership:
//
//   A. An Active membership (or no membership) renders the normal family
//      application — never a limited membership shell.
//   B. A Pending membership renders the limited pending shell and no normal
//      family navigation.
//   C. A Suspended membership renders the "under review" shell, distinct from
//      the Left shell.
//   D. A Left membership renders the neutral "no longer an active member"
//      shell, distinct from the Suspended shell.
//   E. While the active-family membership read is still resolving, the app
//      renders the neutral loading shell and never flashes the normal family
//      navigation.
//
// The copy inside each shell is intentionally NOT frozen here: the accepted
// change may reword it. What is frozen is the routing decision and the
// presence/absence of normal family navigation.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  resetState,
  setMembership,
  setMembershipPending,
  resolveMembershipRead,
} = vi.hoisted(() => {
  let membership: FamilyMembership | null = null;
  let membershipPending = false;
  let pendingResolve: ((value: unknown) => void) | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return false;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
    async listConfirmedRelationships(): Promise<unknown[]> {
      return [];
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return [];
    },
    async getMyMembershipForFamily(_familyId: string): Promise<unknown> {
      if (membershipPending) {
        return new Promise<unknown>((resolve) => {
          pendingResolve = resolve;
        });
      }
      return { __kind__: "ok", ok: membership };
    },
  };

  return {
    mockActor,
    resetState: () => {
      membership = null;
      membershipPending = false;
      pendingResolve = null;
    },
    setMembership: (value: FamilyMembership | null) => {
      membership = value;
    },
    setMembershipPending: (value: boolean) => {
      membershipPending = value;
    },
    resolveMembershipRead: (value: FamilyMembership | null) => {
      membership = value;
      membershipPending = false;
      pendingResolve?.({ __kind__: "ok", ok: value });
      pendingResolve = null;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => Principal.fromText(OWNER) },
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

function makeMembership(
  status: MembershipStatus,
  overrides: Partial<FamilyMembership> = {},
): FamilyMembership {
  return {
    id: 7n,
    status,
    accountId: Principal.fromText(OWNER),
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    personId: "clayton",
    familyId: "norwood",
    ...overrides,
  };
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("app-shell membership routing (characterization)", () => {
  it("renders the normal family application for an Active membership", async () => {
    setMembership(makeMembership(MembershipStatus.Active));

    renderApp();

    // The normal family navigation resolves...
    expect(
      await screen.findByRole("navigation", {
        name: "Family history sections",
      }),
    ).toBeInTheDocument();
    // ...and no limited membership shell is shown.
    expect(screen.queryByTestId("membership.pending_shell")).toBeNull();
    expect(screen.queryByTestId("membership.suspended_shell")).toBeNull();
    expect(screen.queryByTestId("membership.left_shell")).toBeNull();
  });

  it("renders the normal family application when the caller has no membership", async () => {
    setMembership(null);

    renderApp();

    expect(
      await screen.findByRole("navigation", {
        name: "Family history sections",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("membership.pending_shell")).toBeNull();
  });

  it("renders the limited pending shell for a Pending membership, with no normal family navigation", async () => {
    setMembership(makeMembership(MembershipStatus.Pending));

    renderApp();

    expect(
      await screen.findByTestId("membership.pending_shell"),
    ).toBeInTheDocument();
    // A Pending member never receives the normal family navigation.
    expect(
      screen.queryByRole("navigation", { name: "Family history sections" }),
    ).toBeNull();
    expect(screen.queryByTestId("membership.suspended_shell")).toBeNull();
    expect(screen.queryByTestId("membership.left_shell")).toBeNull();
  });

  it("renders the under-review shell for a Suspended membership, distinct from the Left shell", async () => {
    setMembership(makeMembership(MembershipStatus.Suspended));

    renderApp();

    expect(
      await screen.findByTestId("membership.suspended_shell"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("membership.left_shell")).toBeNull();
    expect(screen.queryByTestId("membership.pending_shell")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Family history sections" }),
    ).toBeNull();
  });

  it("renders the neutral ended shell for a Left membership, distinct from the Suspended shell", async () => {
    setMembership(makeMembership(MembershipStatus.Left));

    renderApp();

    expect(
      await screen.findByTestId("membership.left_shell"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("membership.suspended_shell")).toBeNull();
    expect(screen.queryByTestId("membership.pending_shell")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Family history sections" }),
    ).toBeNull();
  });

  it("renders the neutral loading shell while the membership read is resolving, never the normal navigation", async () => {
    setMembershipPending(true);

    renderApp();

    expect(
      await screen.findByTestId("membership.loading_shell"),
    ).toBeInTheDocument();
    // The normal family navigation must not flash before the membership is
    // known.
    expect(
      screen.queryByRole("navigation", { name: "Family history sections" }),
    ).toBeNull();
    expect(screen.queryByTestId("membership.pending_shell")).toBeNull();
    expect(screen.queryByTestId("membership.suspended_shell")).toBeNull();
    expect(screen.queryByTestId("membership.left_shell")).toBeNull();
  });

  it("resolves from the loading shell to the pending shell once the membership read settles", async () => {
    setMembershipPending(true);

    renderApp();
    await screen.findByTestId("membership.loading_shell");

    // The in-flight read settles to a Pending membership; the shell resolves
    // rather than holding the loading state forever.
    resolveMembershipRead(makeMembership(MembershipStatus.Pending));

    await waitFor(() =>
      expect(
        screen.getByTestId("membership.pending_shell"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("membership.loading_shell")).toBeNull();
  });
});
