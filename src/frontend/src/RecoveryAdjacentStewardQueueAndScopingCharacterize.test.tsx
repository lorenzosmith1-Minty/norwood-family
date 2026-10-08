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
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recoveryInvalidation,
  useRecoveryRequestsForSteward,
  useRequestRecovery,
} from "./hooks/useRecovery";
import { FamilyStewardRecoveryReviewsPage } from "./pages/FamilyStewardRecoveryReviewsPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 4B-H1 privacy + status-continuity
// change.
//
// The requested change intentionally replaces two things:
//
//   * RecoveryRequestPage's local FAMILY_GRAPH name matching and the generic
//     `searchPossibleMatchesForFamily` read (which returns parents) with a
//     dedicated family-scoped recovery discovery read returning only an opaque
//     target id and display name; and
//   * RecoveryStatusPage / useMyRecoveryRequests' sessionStorage request-id
//     tracking with a caller-scoped backend read as the source of truth.
//
// This file deliberately does NOT freeze either of those behaviors. What it
// protects is the SURROUNDING recovery behavior that must remain unchanged
// while those two seams are reworked:
//
//   A. The Steward review queue is the canonical, family-scoped
//      `listRecoveryRequestsForFamily` read, narrowed to OPEN ordinary
//      `#AccountRecovery` requests. The 2-member quorum path (`#StewardRecovery`)
//      and every resolved request are excluded, so the Steward decision surface
//      never shows work it cannot decide.
//   B. The queue read and the Approve/Reject actions carry the ACTIVE family id,
//      never a hard-coded default, so a Family A request is never decided under
//      Family B.
//   C. Self-approval prevention: a Steward's own request hides Approve/Reject
//      (the backend independently refuses self-approval).
//   D. `useRequestRecovery` still submits the signed-in caller as the
//      replacement account — the stable consumer seam the discovery rework must
//      not disturb.
//   E. `recoveryInvalidation` stays family-exact, so the status-continuity
//      rework cannot start marking another family's recovery cache stale.
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
const FAMILY_B = "test-family-b";

const {
  mockActor,
  calls,
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
  const calls: {
    listRecoveryRequestsForFamily: unknown[][];
    approveAccountRecoveryForFamily: unknown[][];
    rejectRecoveryForFamily: unknown[][];
    requestRecoveryForFamily: unknown[][];
  } = {
    listRecoveryRequestsForFamily: [],
    approveAccountRecoveryForFamily: [],
    rejectRecoveryForFamily: [],
    requestRecoveryForFamily: [],
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
    async requestRecoveryForFamily(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      calls.requestRecoveryForFamily.push(args);
      return { __kind__: "ok", ok: recoveryRequest() };
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
// A. The Steward queue is narrowed to open ordinary Account Recovery requests.
// ---------------------------------------------------------------------------

describe("Steward recovery queue filtering (recovery-adjacent baseline)", () => {
  it("shows only open ordinary Account Recovery requests, excluding the quorum path and resolved requests", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 1n,
        personId: "lula-mae",
        recoveryType: RecoveryType.AccountRecovery,
        status: RecoveryStatus.Pending,
      }),
      // The 2-member quorum path is out of scope for the Steward decision
      // surface and must not appear.
      recoveryRequest({
        id: 2n,
        personId: "clayton",
        recoveryType: RecoveryType.StewardRecovery,
        status: RecoveryStatus.Pending,
      }),
      // A resolved ordinary request is no longer awaiting a decision.
      recoveryRequest({
        id: 3n,
        personId: "julia",
        recoveryType: RecoveryType.AccountRecovery,
        status: RecoveryStatus.Approved,
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    // Exactly one card renders: the open ordinary Account Recovery request.
    const item = await screen.findByTestId("recovery_reviews.request_item.1");
    expect(
      await within(item).findByText("Lula Mae Norwood"),
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

  it("shows the neutral empty state when only the quorum path and resolved requests exist", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 2n,
        recoveryType: RecoveryType.StewardRecovery,
        status: RecoveryStatus.Pending,
      }),
      recoveryRequest({
        id: 3n,
        recoveryType: RecoveryType.AccountRecovery,
        status: RecoveryStatus.Rejected,
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    expect(
      await screen.findByText("Nothing needs a decision"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_reviews.list"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. The queue read and the decisions carry the ACTIVE family id.
// ---------------------------------------------------------------------------

describe("Steward recovery queue family scoping (recovery-adjacent baseline)", () => {
  it("reads the queue for the active family, never a hard-coded default", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(calls.listRecoveryRequestsForFamily).toEqual([[FAMILY_A]]),
    );
    expect(calls.listRecoveryRequestsForFamily[0]?.[0]).not.toBe("norwood");
  });

  it("approves and rejects with the active family id", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 11n,
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
    await waitFor(() =>
      expect(calls.approveAccountRecoveryForFamily).toEqual([[FAMILY_A, 11n]]),
    );

    // A second, independent request is rejected under the same active family.
    setRecoveryRequests([
      recoveryRequest({
        id: 12n,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);
    cleanup();
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
    await waitFor(() =>
      expect(calls.rejectRecoveryForFamily).toEqual([[FAMILY_A, 12n]]),
    );
  });
});

// ---------------------------------------------------------------------------
// C. Self-approval prevention: a Steward's own request hides the controls.
// ---------------------------------------------------------------------------

describe("Steward self-approval prevention (recovery-adjacent baseline)", () => {
  it("hides Approve/Reject for the Steward's own request", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 12n,
        replacementAccountId: Principal.fromText(STEWARD_ACCOUNT),
      }),
    ]);

    renderWithFamily(
      FAMILY_A,
      <FamilyStewardRecoveryReviewsPage onBack={() => {}} />,
    );

    const item = await screen.findByTestId("recovery_reviews.request_item.1");
    expect(
      within(item).getByTestId("recovery_reviews.own_request_note.1"),
    ).toBeInTheDocument();
    expect(
      within(item).queryByTestId("recovery_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      within(item).queryByTestId("recovery_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// D. useRequestRecovery submits the signed-in caller as the replacement.
// ---------------------------------------------------------------------------

describe("recovery request submission seam (recovery-adjacent baseline)", () => {
  it("submits the signed-in caller as the replacement account for the active family", async () => {
    setAuthenticated(true);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { result } = renderHook(() => useRequestRecovery(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ personId: "lula-mae" });

    expect(calls.requestRecoveryForFamily).toHaveLength(1);
    const [familyId, personId, replacement] =
      calls.requestRecoveryForFamily[0] ?? [];
    expect(familyId).toBe(FAMILY_A);
    expect(personId).toBe("lula-mae");
    // The caller is the replacement account: no arbitrary third-party
    // nomination is possible through this seam.
    expect((replacement as Principal).toString()).toBe(ACCOUNT);
  });
});

// ---------------------------------------------------------------------------
// E. recoveryInvalidation stays family-exact.
// ---------------------------------------------------------------------------

describe("recovery invalidation family scoping (recovery-adjacent baseline)", () => {
  it("targets only the active family's recovery keys", () => {
    const filter = recoveryInvalidation(FAMILY_A);
    const predicate = filter.predicate as unknown as (query: {
      queryKey: unknown[];
    }) => boolean;

    expect(
      predicate({ queryKey: ["recovery", FAMILY_A, "mine", ACCOUNT] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["recovery", FAMILY_B, "mine", ACCOUNT] }),
    ).toBe(false);
  });

  it("targets the default family sentinel when no family is scoped", () => {
    const filter = recoveryInvalidation(undefined);
    const predicate = filter.predicate as unknown as (query: {
      queryKey: unknown[];
    }) => boolean;

    expect(predicate({ queryKey: ["recovery", "", "mine", ACCOUNT] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["recovery", FAMILY_A, "mine", ACCOUNT] }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The Steward queue hook is the canonical read the review page consumes.
// ---------------------------------------------------------------------------

describe("useRecoveryRequestsForSteward canonical read (recovery-adjacent baseline)", () => {
  it("reads the active family and returns only open ordinary Account Recovery requests", async () => {
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 1n,
        recoveryType: RecoveryType.AccountRecovery,
        status: RecoveryStatus.Pending,
      }),
      recoveryRequest({
        id: 2n,
        recoveryType: RecoveryType.StewardRecovery,
        status: RecoveryStatus.Pending,
      }),
      recoveryRequest({
        id: 3n,
        recoveryType: RecoveryType.AccountRecovery,
        status: RecoveryStatus.Expired,
      }),
    ]);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRecoveryRequestsForSteward(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual([1n]);
    expect(calls.listRecoveryRequestsForFamily).toEqual([[FAMILY_A]]);
  });
});
