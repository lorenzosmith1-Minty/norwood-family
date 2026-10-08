import "@testing-library/jest-dom/vitest";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryRequestPage } from "./pages/RecoveryRequestPage";

// ---------------------------------------------------------------------------
// Phase 4B-H1 — recovery discovery privacy (frontend consumer contract cover).
//
// The accepted behavior this file asserts, through the real RecoveryRequestPage
// with a typed local actor mock:
//
//   1. The recovery page discovers targets ONLY through the dedicated
//      family-scoped `searchRecoveryTargetsForFamily` read. It never calls the
//      generic `searchPossibleMatchesForFamily`, which returns `PersonMatch`
//      with `parents` and would leak the family graph to an unaffiliated
//      replacement account.
//   2. A match card renders only the display name and the "This is my profile"
//      action — no parent, relationship, sibling, story, photo, principal, or
//      membership data.
//   3. The discovery read is family-scoped with the ACTIVE family id, never a
//      hard-coded default.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; the real canister behavior is
// covered by the PocketIC lane (recovery-privacy.cover.test.ts). See
// coverageLimits.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const FAMILY_A = "test-family-a";

const {
  mockActor,
  calls,
  resetState,
  setAuthenticated,
  setSearchMatches,
  getAuthenticated,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let searchMatches: Array<{ personId: string; name: string }> = [];
  const calls: {
    searchRecoveryTargetsForFamily: unknown[][];
    searchPossibleMatchesForFamily: unknown[][];
    listMyRecoveryRequestsForFamily: unknown[][];
  } = {
    searchRecoveryTargetsForFamily: [],
    searchPossibleMatchesForFamily: [],
    listMyRecoveryRequestsForFamily: [],
  };

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
    async getMyProfile(): Promise<null> {
      return null;
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getPersonProfileForFamily(): Promise<null> {
      return null;
    },
    async getPersonProfile(): Promise<null> {
      return null;
    },
    // The dedicated recovery discovery read: only an opaque person id and a
    // display name, never parents or relationships.
    async searchRecoveryTargetsForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: Array<{ personId: string; name: string }> }
      | { __kind__: "err"; err: string }
    > {
      calls.searchRecoveryTargetsForFamily.push(args);
      return { __kind__: "ok", ok: searchMatches };
    },
    // The generic possible-match read returns `PersonMatch` WITH `parents`. The
    // recovery page must never call it; the mock records any call so the test
    // can prove the recovery flow does not use it.
    async searchPossibleMatchesForFamily(
      ...args: unknown[]
    ): Promise<Array<{ personId: string; name: string; parents: string[] }>> {
      calls.searchPossibleMatchesForFamily.push(args);
      return searchMatches.map((m) => ({
        ...m,
        parents: ["parent-a", "parent-b"],
      }));
    },
    async listMyRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<{ __kind__: "ok"; ok: unknown[] }> {
      calls.listMyRecoveryRequestsForFamily.push(args);
      return { __kind__: "ok", ok: [] };
    },
    async listProfileClaims(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listReports(): Promise<unknown[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue() {
      return { pending: 0n, needsResearch: 0n, conflicting: 0n };
    },
    async listMembershipConfirmationReviewsForSteward() {
      return { __kind__: "ok", ok: [] };
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      isAuthenticated = false;
      searchMatches = [];
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSearchMatches: (m: Array<{ personId: string; name: string }>) => {
      searchMatches = m;
    },
    getAuthenticated: () => isAuthenticated,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: getAuthenticated(),
    isInitializing: false,
    accountId: getAuthenticated() ? ACCOUNT : undefined,
    signOut: () => {},
  }),
}));

vi.mock("./hooks/useStewardAuthority", () => ({
  useIsSteward: () => ({ data: false, isLoading: false }),
  useHasActiveSteward: () => ({ data: true, isLoading: false }),
  useClaimSteward: () => ({ mutate: () => {}, isPending: false }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

function renderWithFamily(familyId: string, node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={familyId}>{node}</FamilyProvider>
    </QueryClientProvider>,
  );
}

describe("recovery discovery privacy (cover)", () => {
  it("uses only the dedicated recovery discovery read, never the generic match read", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryRequestPage onBack={() => {}} onViewStatus={() => {}} />,
    );

    await user.type(
      await screen.findByTestId("recovery_request.name_input"),
      "Lula Mae",
    );
    await user.click(screen.getByTestId("recovery_request.search_button"));

    await screen.findByTestId("recovery_request.match_list");

    // The dedicated read was used, family-scoped with the active family id.
    expect(calls.searchRecoveryTargetsForFamily).toEqual([
      [FAMILY_A, "Lula Mae"],
    ]);
    // The generic read (which returns parents) was never called by recovery.
    expect(calls.searchPossibleMatchesForFamily).toHaveLength(0);
  });

  it("renders only the display name and the choose action on a match card", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSearchMatches([{ personId: "lula-mae", name: "Lula Mae Norwood" }]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryRequestPage onBack={() => {}} onViewStatus={() => {}} />,
    );

    await user.type(
      await screen.findByTestId("recovery_request.name_input"),
      "Lula Mae",
    );
    await user.click(screen.getByTestId("recovery_request.search_button"));

    const card = await screen.findByTestId("recovery_request.match.0");
    expect(within(card).getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(
      within(card).getByTestId("recovery_request.choose.0"),
    ).toHaveTextContent("This is my profile");

    // No parent, relationship, sibling, story, photo, principal, or membership
    // data is rendered on the card.
    const cardText = card.textContent ?? "";
    expect(cardText).not.toContain("parent-a");
    expect(cardText).not.toContain("parent-b");
    expect(cardText).not.toContain("Child of");
    expect(cardText).not.toContain("Sibling");
    expect(cardText).not.toContain(ACCOUNT);
    expect(cardText).not.toContain("lula-mae");
  });
});
