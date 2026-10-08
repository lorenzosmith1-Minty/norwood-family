import "@testing-library/jest-dom/vitest";
import {
  type MyRecoveryRequestView,
  type Notification,
  NotificationType,
  RecoveryStatus,
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
import { RecoveryStatusPage } from "./pages/RecoveryStatusPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 4C Steward Recovery verification
// surface, focused on the ADJACENT behavior of the two pages it modifies.
//
// The requested change ADDS a verification surface to NotificationsPage and
// keeps the recovery candidate's own status on RecoveryStatusPage. This file
// deliberately does NOT characterize the new verification read or the new
// Confirm/Dispute card. What it protects is the surrounding behavior on those
// same pages that must remain unchanged:
//
//   A. NotificationsPage keeps rendering its EXISTING content — the
//      notification list with message/type/mark-read and the
//      membership-confirmation request section — even when the new recovery
//      verification section is also present. The new section is inserted above
//      the existing sections, so a regression there would silently displace or
//      hide existing notification content.
//   B. NotificationsPage keeps its neutral empty state when there is nothing at
//      all to show (no notifications, no confirmations, no verifications), and
//      does not render the verification section in that case.
//   C. RecoveryStatusPage keeps rendering a RESOLVED request as a closed,
//      read-only state with the closed-state note and no verifier controls.
//   D. RecoveryStatusPage keeps its neutral error state with a Retry action and
//      no verifier controls when the caller-scoped read fails.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const FAMILY_A = "test-family-a";

const {
  mockActor,
  calls,
  resetState,
  setAuthenticated,
  setNotifications,
  setEligibleConfirmations,
  setMyRequests,
  setMyRequestsError,
  setVerifications,
  getAuthenticated,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let notifications: Notification[] = [];
  let eligibleConfirmations: unknown[] = [];
  let myRequests: MyRecoveryRequestView[] = [];
  let myRequestsError = false;
  let verifications: StewardRecoveryVerificationView[] = [];
  const calls = {
    listNotificationsForFamily: [] as unknown[][],
    markNotificationReadForFamily: [] as unknown[][],
    listMyEligibleMembershipConfirmationsForFamily: [] as unknown[][],
    listMyRecoveryRequestsForFamily: [] as unknown[][],
    listStewardRecoveryVerificationsForFamily: [] as unknown[][],
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
      return { __kind__: "ok", ok: eligibleConfirmations };
    },
    async listMyRecoveryRequestsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyRecoveryRequestsForFamily.push(args);
      if (myRequestsError) {
        return { __kind__: "err", err: "NotAuthorized" };
      }
      return { __kind__: "ok", ok: myRequests };
    },
    async listStewardRecoveryVerificationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listStewardRecoveryVerificationsForFamily.push(args);
      return { __kind__: "ok", ok: verifications };
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
      eligibleConfirmations = [];
      myRequests = [];
      myRequestsError = false;
      verifications = [];
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
    setEligibleConfirmations: (c: unknown[]) => {
      eligibleConfirmations = c;
    },
    setMyRequests: (r: MyRecoveryRequestView[]) => {
      myRequests = r;
    },
    setMyRequestsError: (v: boolean) => {
      myRequestsError = v;
    },
    setVerifications: (v: StewardRecoveryVerificationView[]) => {
      verifications = v;
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

function makeNotification(
  id: bigint,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    recipient: Principal.fromText(ACCOUNT),
    notificationType: NotificationType.ProfileClaimReviewed,
    message: `Notification ${id.toString()}`,
    createdAt: 1_700_000_000_000_000_000n,
    read: false,
    familyId: FAMILY_A,
    ...overrides,
  };
}

function myRequest(
  overrides: Partial<MyRecoveryRequestView> = {},
): MyRecoveryRequestView {
  return {
    targetName: "Lula Mae Norwood",
    status: RecoveryStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

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
// A. NotificationsPage keeps its existing content alongside the new section.
// ---------------------------------------------------------------------------

describe("Notifications page existing content with a recovery verification present (recovery-verification-adjacent baseline)", () => {
  it("keeps the notification list and the confirmation section when a verification is also present", async () => {
    setAuthenticated(true);
    setNotifications([
      makeNotification(42n, {
        message: "Your profile claim was approved.",
        notificationType: NotificationType.ProfileClaimReviewed,
        read: false,
      }),
    ]);
    setEligibleConfirmations([
      {
        familyId: FAMILY_A,
        membershipId: 3n,
        pendingPersonId: "hudson",
        displayName: "Hudson Norwood",
        profilePhoto: undefined,
        birthYear: undefined,
        simpleRelationship: undefined,
        confirmationState: "AwaitingConfirmation",
      },
    ]);
    setVerifications([verification()]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    // The new verification section renders...
    expect(
      await screen.findByTestId("recovery_verification.section"),
    ).toBeInTheDocument();
    // ...and the existing notification list and confirmation section still
    // render alongside it, not displaced by the new section.
    expect(screen.getByTestId("notifications.list")).toBeInTheDocument();
    expect(
      screen.getByText("Your profile claim was approved."),
    ).toBeInTheDocument();
    expect(screen.getByText("Profile claim reviewed")).toBeInTheDocument();
    expect(
      screen.getByTestId("confirmation.request_section"),
    ).toBeInTheDocument();
  });

  it("keeps mark-read working while a verification is present", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setNotifications([
      makeNotification(42n, {
        message: "A family update.",
        read: false,
      }),
    ]);
    setVerifications([verification()]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    const markRead = await screen.findByRole("button", {
      name: "Mark as read",
    });
    await user.click(markRead);
    // The active family is non-default, so the family-scoped mark-read call
    // carries the family id first.
    await waitFor(() =>
      expect(calls.markNotificationReadForFamily).toEqual([[FAMILY_A, 42n]]),
    );
  });
});

// ---------------------------------------------------------------------------
// B. NotificationsPage keeps its neutral empty state when nothing is present.
// ---------------------------------------------------------------------------

describe("Notifications page empty state (recovery-verification-adjacent baseline)", () => {
  it("shows the neutral empty state and no verification section when nothing is present", async () => {
    setAuthenticated(true);
    setNotifications([]);
    setEligibleConfirmations([]);
    setVerifications([]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
    expect(
      screen.queryByTestId("recovery_verification.section"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. RecoveryStatusPage keeps a resolved request read-only.
// ---------------------------------------------------------------------------

describe("recovery candidate resolved status (recovery-verification-adjacent baseline)", () => {
  it("renders a resolved request as a closed read-only state with no verifier controls", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.Approved })]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(within(item).getByText("Access restored")).toBeInTheDocument();
    expect(
      within(item).getByTestId("recovery_status.resolved_note.0"),
    ).toBeInTheDocument();
    // The candidate tracks their own request; they never verify it.
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dispute/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// D. RecoveryStatusPage keeps its neutral error state.
// ---------------------------------------------------------------------------

describe("recovery candidate error state (recovery-verification-adjacent baseline)", () => {
  it("renders a neutral error state with a Retry action and no verifier controls", async () => {
    setAuthenticated(true);
    setMyRequestsError(true);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    expect(
      await screen.findByTestId("recovery_status.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recovery_status.retry_button"),
    ).toBeInTheDocument();
    // The technical error tag is never surfaced to the user.
    expect(document.body.textContent ?? "").not.toContain("NotAuthorized");
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dispute/i }),
    ).not.toBeInTheDocument();
  });
});
