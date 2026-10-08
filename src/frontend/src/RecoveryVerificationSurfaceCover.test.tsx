import "@testing-library/jest-dom/vitest";
import {
  type Notification,
  RecoveryStatus,
  RecoveryVerificationDecision,
  type StewardRecoveryVerificationView,
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
import { NotificationsPage } from "./pages/NotificationsPage";

// ---------------------------------------------------------------------------
// Phase 4C — Steward Recovery verification surface (frontend cover).
//
// The accepted behavior this file asserts, through the real NotificationsPage
// and StewardRecoveryVerificationCard with a typed local actor mock:
//
//   1. An eligible approved family member sees a pending Steward Recovery
//      verification surface in Notifications, with Confirm and Dispute actions.
//   2. Confirming calls the EXISTING `verifyStewardRecoveryForFamily` action
//      with the active family id, the request's recovery id, and the Confirm
//      decision, and the surface reflects the backend's updated quorum state.
//   3. Disputing calls the same action with the Reject decision and removes
//      further verifier actions for that verifier.
//   4. The recovery candidate does not see verification actions for their own
//      request (the backend returns no entry; the surface renders none).
//   5. An unaffiliated user and a user in another family do not see the request
//      (the backend returns no entry for them).
//   6. The same verifier cannot act twice: a returned entry with
//      `callerHasVerified` renders read-only with no Confirm/Dispute controls.
//   7. The 2-of-2 state (`#ReadyForApproval`) is non-actionable as dictated by
//      backend state.
//   8. Resolved requests render read-only with no internal enum names shown.
//   9. No principals, internal recovery ids, or private family data are exposed.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; the real canister behavior is
// covered by the PocketIC lane (recovery-verification.cover.test.ts). See
// coverageLimits.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const {
  mockActor,
  calls,
  resetState,
  setAuthenticated,
  setVerifications,
  setVerifyOutcome,
  getAuthenticated,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let notifications: Notification[] = [];
  let verifications: StewardRecoveryVerificationView[] = [];
  // The outcome the backend returns for a verification action. The mock models
  // the backend's authorization gate: an ineligible caller gets no entry from
  // the read, and a second decision from the same verifier is refused.
  let verifyOutcome: "confirmed" | "disputed" | "alreadySettled" | "error" =
    "confirmed";
  const calls = {
    listNotificationsForFamily: [] as unknown[][],
    markNotificationReadForFamily: [] as unknown[][],
    listMyEligibleMembershipConfirmationsForFamily: [] as unknown[][],
    listMyRecoveryRequestsForFamily: [] as unknown[][],
    listStewardRecoveryVerificationsForFamily: [] as unknown[][],
    verifyStewardRecoveryForFamily: [] as unknown[][],
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
    async listNotificationsForFamily(
      ...args: unknown[]
    ): Promise<Notification[]> {
      calls.listNotificationsForFamily.push(args);
      return notifications;
    },
    async markNotificationReadForFamily(...args: unknown[]): Promise<null> {
      calls.markNotificationReadForFamily.push(args);
      return null;
    },
    async listMyEligibleMembershipConfirmationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyEligibleMembershipConfirmationsForFamily.push(args);
      return { __kind__: "ok", ok: [] };
    },
    async listMyRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyRecoveryRequestsForFamily.push(args);
      return { __kind__: "ok", ok: [] };
    },
    // The eligible-verifier read. The mock models the backend's caller filter:
    // it returns only the entries the backend would return for this caller, so
    // a candidate / unaffiliated / other-family caller gets an empty list.
    async listStewardRecoveryVerificationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listStewardRecoveryVerificationsForFamily.push(args);
      return { __kind__: "ok", ok: verifications };
    },
    // The EXISTING Phase 4A verification action. Both Confirm and Dispute call
    // this single endpoint.
    async verifyStewardRecoveryForFamily(...args: unknown[]): Promise<unknown> {
      calls.verifyStewardRecoveryForFamily.push(args);
      if (verifyOutcome === "error") {
        return { __kind__: "err", err: "NotAuthorized" };
      }
      if (verifyOutcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyVerifier" };
      }
      return { __kind__: "ok", ok: {} };
    },
    async getProfilePhotoForFamily(): Promise<null> {
      return null;
    },
    async getMyConfirmationForMembership(): Promise<unknown> {
      return { __kind__: "ok", ok: null };
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      isAuthenticated = false;
      notifications = [];
      verifications = [];
      verifyOutcome = "confirmed";
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setNotifications: (n: Notification[]) => {
      notifications = n;
    },
    setVerifications: (v: StewardRecoveryVerificationView[]) => {
      verifications = v;
    },
    setVerifyOutcome: (
      o: "confirmed" | "disputed" | "alreadySettled" | "error",
    ) => {
      verifyOutcome = o;
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

function verification(
  overrides: Partial<StewardRecoveryVerificationView> = {},
): StewardRecoveryVerificationView {
  return {
    recoveryId: 5n,
    candidateName: "Clayton Norwood",
    status: RecoveryStatus.AwaitingVerification,
    confirmationsReceived: 1n,
    confirmationsRequired: 2n,
    callerHasVerified: false,
    callerDecision: undefined,
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
// 1. An eligible approved family member sees the verification surface.
// ---------------------------------------------------------------------------

describe("eligible verifier sees the Steward Recovery surface (cover)", () => {
  it("renders the verification card with Confirm and Dispute actions", async () => {
    setAuthenticated(true);
    setVerifications([verification()]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    const card = await screen.findByTestId("recovery_verification.card");
    expect(
      within(card).getByText("Can you confirm this Steward Recovery?"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Clayton Norwood")).toBeInTheDocument();
    expect(
      within(card).getByTestId("recovery_verification.confirm_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("recovery_verification.dispute_button"),
    ).toBeInTheDocument();

    // The read is family-scoped with the ACTIVE family id, never a hard-coded
    // default.
    expect(calls.listStewardRecoveryVerificationsForFamily).toEqual([
      [FAMILY_A],
    ]);
  });

  it("shows quorum progress from backend state and never counts the candidate", async () => {
    setAuthenticated(true);
    // The backend's confirmationsReceived already excludes the candidate.
    setVerifications([
      verification({ confirmationsReceived: 1n, confirmationsRequired: 2n }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    const quorum = await screen.findByTestId("recovery_verification.quorum");
    expect(quorum).toHaveTextContent("1 of 2 family confirmations received");
  });
});

// ---------------------------------------------------------------------------
// 2. Confirming updates quorum progress from backend state.
// ---------------------------------------------------------------------------

describe("confirming a Steward Recovery (cover)", () => {
  it("calls the existing verification action with the Confirm decision and reflects the updated quorum", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setVerifications([
      verification({ confirmationsReceived: 1n, confirmationsRequired: 2n }),
    ]);
    setVerifyOutcome("confirmed");

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await user.click(
      await screen.findByTestId("recovery_verification.confirm_button"),
    );

    // The single existing backend action was called with the active family id,
    // the request's recovery id, and the Confirm decision.
    await waitFor(() =>
      expect(calls.verifyStewardRecoveryForFamily).toEqual([
        [FAMILY_A, 5n, RecoveryVerificationDecision.Confirm],
      ]),
    );

    // The surface settles into the recorded-confirmation state.
    const result = await screen.findByTestId("recovery_verification.result");
    expect(
      within(result).getByText(/your confirmation was recorded/i),
    ).toBeInTheDocument();
    // No further verifier actions are offered after acting.
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Disputing removes further verifier actions for that verifier.
// ---------------------------------------------------------------------------

describe("disputing a Steward Recovery (cover)", () => {
  it("calls the existing verification action with the Reject decision and removes further actions", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setVerifications([verification()]);
    setVerifyOutcome("disputed");

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await user.click(
      await screen.findByTestId("recovery_verification.dispute_button"),
    );

    await waitFor(() =>
      expect(calls.verifyStewardRecoveryForFamily).toEqual([
        [FAMILY_A, 5n, RecoveryVerificationDecision.Reject],
      ]),
    );

    const result = await screen.findByTestId("recovery_verification.result");
    expect(
      within(result).getByText(/your response was recorded/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4/5. The candidate, an unaffiliated user, and another family see nothing.
// ---------------------------------------------------------------------------

describe("ineligible callers see no verification surface (cover)", () => {
  it("renders no verification section when the backend returns no entry for the candidate", async () => {
    setAuthenticated(true);
    // The backend excludes the recovery candidate, so the read returns nothing.
    setVerifications([]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await screen.findByText("No notifications yet");
    expect(
      screen.queryByTestId("recovery_verification.section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
  });

  it("renders no verification section for an unaffiliated user", async () => {
    setAuthenticated(true);
    setVerifications([]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await screen.findByText("No notifications yet");
    expect(
      screen.queryByTestId("recovery_verification.section"),
    ).not.toBeInTheDocument();
  });

  it("reads the verification surface through the active family scope, so another family sees nothing", async () => {
    setAuthenticated(true);
    // The backend returns no entry for Family B, so the surface is empty there.
    setVerifications([]);

    renderWithFamily(FAMILY_B, <NotificationsPage />);

    await screen.findByText("No notifications yet");
    expect(calls.listStewardRecoveryVerificationsForFamily).toEqual([
      [FAMILY_B],
    ]);
    expect(calls.listStewardRecoveryVerificationsForFamily[0]?.[0]).not.toBe(
      "norwood",
    );
    expect(
      screen.queryByTestId("recovery_verification.section"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. The same verifier cannot act twice.
// ---------------------------------------------------------------------------

describe("one decision per verifier (cover)", () => {
  it("renders read-only with no actions when the caller has already verified", async () => {
    setAuthenticated(true);
    // The backend returns the entry with callerHasVerified true and the
    // recorded decision, so the UI must not offer a second action.
    setVerifications([
      verification({
        callerHasVerified: true,
        callerDecision: RecoveryVerificationDecision.Confirm,
      }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    const result = await screen.findByTestId("recovery_verification.result");
    expect(
      within(result).getByText(/your confirmation was recorded/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
  });

  it("maps a second-decision refusal to the neutral already-settled state", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setVerifications([verification()]);
    // The backend refuses a second decision from the same verifier.
    setVerifyOutcome("alreadySettled");

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await user.click(
      await screen.findByTestId("recovery_verification.confirm_button"),
    );

    const result = await screen.findByTestId("recovery_verification.result");
    expect(
      within(result).getByText(/no longer needs your response/i),
    ).toBeInTheDocument();
    // No private reason or technical error tag is exposed.
    expect(document.body.textContent ?? "").not.toContain("AlreadyVerifier");
  });
});

// ---------------------------------------------------------------------------
// 7. The 2-of-2 state is non-actionable as dictated by backend state.
// ---------------------------------------------------------------------------

describe("quorum-reached state is non-actionable (cover)", () => {
  it("renders read-only with no actions when the backend reports ReadyForApproval", async () => {
    setAuthenticated(true);
    setVerifications([
      verification({
        status: RecoveryStatus.ReadyForApproval,
        confirmationsReceived: 2n,
        confirmationsRequired: 2n,
      }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    const result = await screen.findByTestId("recovery_verification.result");
    expect(
      within(result).getByText("Ready for Steward review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8/9. Resolved requests are read-only and no private data is exposed.
// ---------------------------------------------------------------------------

describe("resolved verification state and privacy (cover)", () => {
  it("renders a resolved request read-only with no internal enum name", async () => {
    setAuthenticated(true);
    setVerifications([
      verification({
        status: RecoveryStatus.Approved,
        confirmationsReceived: 2n,
        confirmationsRequired: 2n,
      }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    const result = await screen.findByTestId("recovery_verification.result");
    expect(within(result).getByText("Access restored")).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.confirm_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.dispute_button"),
    ).not.toBeInTheDocument();
    // The raw enum name is never rendered.
    expect(document.body.textContent ?? "").not.toContain("Approved");
  });

  it("never renders a principal, internal recovery id, or private family data", async () => {
    setAuthenticated(true);
    setVerifications([
      verification({
        recoveryId: 987654321n,
        candidateName: "Clayton Norwood",
      }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await screen.findByTestId("recovery_verification.card");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(ACCOUNT);
    expect(body).not.toContain(OTHER_ACCOUNT);
    expect(body).not.toContain("987654321");
    expect(body).not.toContain("AwaitingVerification");
    expect(body).not.toContain("StewardRecovery");
  });
});
