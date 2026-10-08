import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilyStewardRecoveryReviewsPage } from "./pages/FamilyStewardRecoveryReviewsPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 4E terminal/stale-state cleanup.
//
// The requested change tightens how resolved recovery requests are presented:
// Approved / Rejected / Cancelled / Expired requests must show no stale
// Approve/Reject controls, resolved requests stay read-only, and a stale
// frontend cache must not resurrect actions.
//
// This file deliberately does NOT freeze the behavior the change is allowed to
// alter (for example, whether a request that is still returned by the backend
// as OPEN should keep its controls). What it protects is the SURROUNDING
// terminal-state behavior that must remain unchanged:
//
//   A. After a Steward decides a request on this screen, the request stays
//      visible in a read-only resolved state even once the backend's
//      open-request list stops returning it (the real backend drops resolved
//      requests from `listRecoveryRequestsForFamily`). The decision is not
//      lost and the request is not silently removed.
//   B. That kept-visible resolved request offers NO Approve/Reject controls, so
//      a stale or refreshed cache cannot resurrect the actions and a duplicate
//      decision is impossible.
//   C. A request the backend reports as already resolved (Approved / Rejected /
//      Cancelled / Expired) is never rendered as an actionable card, even if a
//      stale cache still holds it — the queue read narrows to open ordinary
//      Account Recovery requests.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const FAMILY_A = "test-family-a";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setSteward,
  setRecoveryRequests,
  getAuthenticated,
  getSteward,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let recoveryRequests: RecoveryRequest[] = [];
  const calls = {
    listRecoveryRequestsForFamily: [] as unknown[][],
    approveAccountRecoveryForFamily: [] as unknown[][],
    rejectRecoveryForFamily: [] as unknown[][],
  };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isSteward;
    },
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getPersonProfileForFamily(
      _familyId: string,
      personId: string,
    ): Promise<PersonProfile | null> {
      return {
        familyId: "norwood",
        personId,
        name: personId === "lula-mae" ? "Lula Mae Norwood" : "Clayton Norwood",
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_ACCOUNT),
      };
    },
    async getPersonProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async listRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: RecoveryRequest[] }
      | { __kind__: "err"; err: string }
    > {
      calls.listRecoveryRequestsForFamily.push(args);
      return { __kind__: "ok", ok: recoveryRequests };
    },
    async approveAccountRecoveryForFamily(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      calls.approveAccountRecoveryForFamily.push(args);
      return {
        __kind__: "ok",
        ok: recoveryRequest({ status: RecoveryStatus.Approved }),
      };
    },
    async rejectRecoveryForFamily(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      calls.rejectRecoveryForFamily.push(args);
      return {
        __kind__: "ok",
        ok: recoveryRequest({ status: RecoveryStatus.Rejected }),
      };
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      recoveryRequests = [];
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setRecoveryRequests: (r: RecoveryRequest[]) => {
      recoveryRequests = r;
    },
    getAuthenticated: () => isAuthenticated,
    getSteward: () => isSteward,
    getCurrentPrincipal: () => (isSteward ? STEWARD_ACCOUNT : ACCOUNT),
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
    isLoginError: false,
    loginError: null,
  }),
}));

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: getAuthenticated(),
    isInitializing: false,
    accountId: getAuthenticated() ? getCurrentPrincipal() : undefined,
    signOut: () => {},
  }),
}));

vi.mock("./hooks/useStewardAuthority", () => ({
  useIsSteward: () => ({
    data: getAuthenticated() && getSteward(),
    isLoading: false,
  }),
  useHasActiveSteward: () => ({ data: true, isLoading: false }),
  useClaimSteward: () => ({ mutate: () => {}, isPending: false }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

function recoveryRequest(
  overrides: Partial<RecoveryRequest> = {},
): RecoveryRequest {
  return {
    familyId: "norwood",
    id: 7n,
    recoveryType: RecoveryType.AccountRecovery,
    personId: "lula-mae",
    ownerAccountId: Principal.fromText(OTHER_ACCOUNT),
    replacementAccountId: Principal.fromText(ACCOUNT),
    status: RecoveryStatus.Pending,
    requestedByAccountId: Principal.fromText(ACCOUNT),
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    decidedByAccountId: undefined,
    decidedAt: undefined,
    transferredAt: undefined,
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// A + B. A decided request stays visible read-only after the backend drops it.
// ---------------------------------------------------------------------------

describe("Steward decided request terminal state (recovery terminal-state baseline)", () => {
  it("keeps an approved request visible read-only after the backend stops returning it", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 21n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    await user.click(
      await screen.findByTestId("recovery_reviews.approve_button.1"),
    );
    await user.click(
      await screen.findByTestId("recovery_reviews.confirm_submit_button.1"),
    );

    // The decision settles into a read-only resolved state.
    const result = await screen.findByTestId(
      "recovery_reviews.request_result.1",
    );
    expect(within(result).getByText("Access restored")).toBeInTheDocument();

    // The real backend drops a resolved request from the open-request list.
    // Simulate the invalidated refetch returning an empty queue.
    setRecoveryRequests([]);

    // The decided request stays visible in place — the decision is not lost and
    // the request is not silently removed.
    expect(
      await screen.findByTestId("recovery_reviews.request_item.1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_reviews.request_result.1"),
    ).toBeInTheDocument();

    // No stale Approve/Reject controls can be resurrected by the refreshed
    // cache, so a duplicate decision is impossible.
    expect(
      screen.queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
  });

  it("keeps a rejected request visible read-only after the backend stops returning it", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 22n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    await user.click(
      await screen.findByTestId("recovery_reviews.reject_button.1"),
    );
    await user.click(
      await screen.findByTestId("recovery_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "recovery_reviews.request_result.1",
    );
    expect(
      within(result).getByText("Request not approved"),
    ).toBeInTheDocument();

    setRecoveryRequests([]);

    expect(
      await screen.findByTestId("recovery_reviews.request_item.1"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. A backend-resolved request is never rendered as an actionable card.
// ---------------------------------------------------------------------------

describe("Steward queue excludes resolved requests (recovery terminal-state baseline)", () => {
  it("never renders Approve/Reject for a request the backend reports resolved", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 31n,
        status: RecoveryStatus.Approved,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
      recoveryRequest({
        id: 32n,
        status: RecoveryStatus.Rejected,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
      recoveryRequest({
        id: 33n,
        status: RecoveryStatus.Cancelled,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
      recoveryRequest({
        id: 34n,
        status: RecoveryStatus.Expired,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    // Every resolved request is filtered out of the decision queue.
    expect(
      await screen.findByText("Nothing needs a decision"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.list"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
  });

  it("keeps only the open request actionable when resolved requests share the queue", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 41n,
        status: RecoveryStatus.Pending,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
      recoveryRequest({
        id: 42n,
        status: RecoveryStatus.Approved,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    // Exactly one actionable card: the open request.
    const item = await screen.findByTestId("recovery_reviews.request_item.1");
    expect(
      within(item).getByTestId("recovery_reviews.approve_button.1"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.request_item.2"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("recovery_reviews.section")).getByText(
        "Awaiting your decision (1)",
      ),
    ).toBeInTheDocument();
  });
});
