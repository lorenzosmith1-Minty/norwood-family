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
// Phase 4E — terminal / stale-state cleanup cover.
//
// The accepted behavior this file asserts, through the real React component
// with a typed local actor mock:
//
//   1. A Steward decision that the backend reports as already settled
//      (`#AlreadyResolved` / `#RequestNotFound` / `#InvalidTransition`) settles
//      the card into a neutral read-only "already settled" state with NO
//      Approve/Reject controls and no private reason or technical tag exposed.
//   2. A decision that fails for any other reason settles into a neutral
//      read-only error state with NO Approve/Reject controls.
//   3. A stale frontend cache cannot resurrect actions: once a request has been
//      decided on this screen, a refetch that still returns the request as OPEN
//      keeps it read-only — the local decision wins over the stale backend
//      snapshot.
//   4. A decided card offers no duplicate Submit Recovery action.
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
  calls,
  resetState,
  setAuthenticated,
  setSteward,
  setRecoveryRequests,
  setApproveOutcome,
  setRejectOutcome,
  getAuthenticated,
  getSteward,
  getCurrentPrincipal,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let recoveryRequests: RecoveryRequest[] = [];
  let approveOutcome: "approved" | "alreadySettled" | "error" = "approved";
  let rejectOutcome: "rejected" | "alreadySettled" | "error" = "rejected";
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
      if (approveOutcome === "error") {
        return { __kind__: "err", err: "NotSteward" };
      }
      if (approveOutcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyResolved" };
      }
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
      if (rejectOutcome === "error") {
        return { __kind__: "err", err: "NotSteward" };
      }
      if (rejectOutcome === "alreadySettled") {
        return { __kind__: "err", err: "RequestNotFound" };
      }
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
      approveOutcome = "approved";
      rejectOutcome = "rejected";
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
    setApproveOutcome: (o: "approved" | "alreadySettled" | "error") => {
      approveOutcome = o;
    },
    setRejectOutcome: (o: "rejected" | "alreadySettled" | "error") => {
      rejectOutcome = o;
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

/** Asserts a decided card is read-only: no Approve/Reject controls remain. */
function expectNoActions(position: number) {
  expect(
    screen.queryByTestId(`recovery_reviews.approve_button.${position}`),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByTestId(`recovery_reviews.reject_button.${position}`),
  ).not.toBeInTheDocument();
}

// ---------------------------------------------------------------------------
// 1. Already-settled decision: neutral read-only state, no controls.
// ---------------------------------------------------------------------------

describe("Steward decision already settled elsewhere (terminal-state cover)", () => {
  it("settles an approve that the backend reports already resolved into a neutral read-only state", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setApproveOutcome("alreadySettled");
    setRecoveryRequests([
      recoveryRequest({
        id: 51n,
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

    const result = await screen.findByTestId(
      "recovery_reviews.request_result.1",
    );
    expect(
      within(result).getByText("This request was already settled"),
    ).toBeInTheDocument();
    // No private reason or technical tag is exposed.
    expect(result.textContent ?? "").not.toContain("AlreadyResolved");
    expectNoActions(1);
  });

  it("settles a reject that the backend reports not found into a neutral read-only state", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRejectOutcome("alreadySettled");
    setRecoveryRequests([
      recoveryRequest({
        id: 52n,
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
      within(result).getByText("This request was already settled"),
    ).toBeInTheDocument();
    expect(result.textContent ?? "").not.toContain("RequestNotFound");
    expectNoActions(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Error decision: neutral read-only state, no controls.
// ---------------------------------------------------------------------------

describe("Steward decision failure (terminal-state cover)", () => {
  it("settles a failed approve into a neutral read-only error state with no controls", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setApproveOutcome("error");
    setRecoveryRequests([
      recoveryRequest({
        id: 61n,
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

    const result = await screen.findByTestId(
      "recovery_reviews.request_result.1",
    );
    expect(
      within(result).getByText("We couldn't record your decision"),
    ).toBeInTheDocument();
    // The technical error tag is never surfaced.
    expect(result.textContent ?? "").not.toContain("NotSteward");
    expectNoActions(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Stale cache cannot resurrect actions after a decision.
// ---------------------------------------------------------------------------

describe("stale cache does not resurrect actions (terminal-state cover)", () => {
  it("keeps a decided request read-only when a refetch still returns it open", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 71n,
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

    await screen.findByTestId("recovery_reviews.request_result.1");

    // A stale backend snapshot still reports the request as OPEN. The local
    // decision must win, so the card stays read-only and the actions are not
    // resurrected.
    setRecoveryRequests([
      recoveryRequest({
        id: 71n,
        status: RecoveryStatus.Pending,
        replacementAccountId: Principal.fromText(OTHER_ACCOUNT),
      }),
    ]);

    await waitFor(() =>
      expect(
        screen.getByTestId("recovery_reviews.request_result.1"),
      ).toBeInTheDocument(),
    );
    expectNoActions(1);
    // The decision is not lost and the request is not re-rendered as actionable.
    expect(
      screen.queryByTestId("recovery_reviews.request_status.1"),
    ).not.toBeInTheDocument();
  });

  it("offers no duplicate Submit Recovery action on a decided card", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setSteward(true);
    setRecoveryRequests([
      recoveryRequest({
        id: 72n,
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

    await screen.findByTestId("recovery_reviews.request_result.1");

    // Exactly one decision was submitted; the resolved card exposes no action
    // that could submit a second one.
    expect(calls.approveAccountRecoveryForFamily).toHaveLength(1);
    expectNoActions(1);
    expect(
      screen.queryByTestId("recovery_reviews.confirm_submit_button.1"),
    ).not.toBeInTheDocument();
  });
});
