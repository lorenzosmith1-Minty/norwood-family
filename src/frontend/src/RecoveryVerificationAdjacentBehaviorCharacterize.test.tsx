import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type MyRecoveryRequestView,
  type Notification,
  NotificationType,
  RecoveryStatus,
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
// surface.
//
// The requested change ADDS:
//
//   * one read-only, caller-scoped, family-scoped backend read letting an
//     eligible approved family member (not a Steward, not the recovery
//     candidate) discover a pending Steward Recovery request and read its
//     family-safe verification context and quorum progress;
//   * a Steward Recovery verification surface in Notifications for eligible
//     approved family members, with Confirm and Dispute actions wired to the
//     EXISTING Phase 4A `verifyStewardRecoveryForFamily` action;
//   * the recovery candidate's own Steward Recovery status via the EXISTING
//     caller-scoped recovery-status read, with no verifier controls.
//
// This file deliberately does NOT characterize the new read or the new
// verification surface, which do not exist yet. What it protects is the
// ADJACENT working behavior those additions must not disturb:
//
//   A. The Notifications page keeps rendering its existing content — the
//      membership-confirmation request section, the notification list with
//      message/type/mark-read, and the neutral empty state. The new recovery
//      verification surface is added to this same page, so a regression here
//      would silently displace or hide existing notification content.
//   B. The recovery candidate's own status page keeps rendering the caller's
//      own requests in plain language and never renders verifier controls
//      (Confirm/Dispute). The candidate must not be able to act on their own
//      request.
//   C. The EXISTING backend recovery reads and the verification action keep
//      their authorization contracts, which the new read and UI build on:
//      `listRecoveryVerificationsForFamily` is gated to Steward / requester /
//      owner / replacement, `listMyRecoveryRequestsForFamily` is caller-scoped,
//      `getRecoveryRequestForFamily` uses `canViewRequest`, and
//      `verifyStewardRecoveryForFamily` refuses self-verification and a second
//      decision by the same verifier.
//
// The frontend suite mocks the actor, so this is component/integration coverage
// of the frontend consumer contract; it does not exercise the real canister
// (see coverageLimits). The backend contracts in section C are a static-source
// characterization of the Motoko the bindings are generated from.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const FAMILY_A = "test-family-a";

// ---------------------------------------------------------------------------
// A/B. Frontend component/integration baseline over a typed local actor mock.
// ---------------------------------------------------------------------------

const {
  mockActor,
  calls,
  resetState,
  setAuthenticated,
  setNotifications,
  setEligibleConfirmations,
  setMyRequests,
  getAuthenticated,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let notifications: Notification[] = [];
  let eligibleConfirmations: unknown[] = [];
  let myRequests: MyRecoveryRequestView[] = [];
  const calls = {
    listNotifications: 0,
    listNotificationsForFamily: [] as unknown[][],
    markNotificationRead: [] as bigint[],
    markNotificationReadForFamily: [] as unknown[][],
    listMyEligibleMembershipConfirmationsForFamily: [] as unknown[][],
    listMyRecoveryRequestsForFamily: [] as unknown[][],
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
    async listNotifications(): Promise<Notification[]> {
      calls.listNotifications += 1;
      return notifications;
    },
    async listNotificationsForFamily(
      ...args: unknown[]
    ): Promise<Notification[]> {
      calls.listNotificationsForFamily.push(args);
      return notifications;
    },
    async markNotificationRead(id: bigint): Promise<null> {
      calls.markNotificationRead.push(id);
      return null;
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
      return { __kind__: "ok", ok: myRequests };
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
      calls.listNotifications = 0;
      calls.listNotificationsForFamily.length = 0;
      calls.markNotificationRead.length = 0;
      calls.markNotificationReadForFamily.length = 0;
      calls.listMyEligibleMembershipConfirmationsForFamily.length = 0;
      calls.listMyRecoveryRequestsForFamily.length = 0;
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
    familyId: "norwood",
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
// A. The Notifications page keeps its existing content.
// ---------------------------------------------------------------------------

describe("Notifications page existing content (recovery-verification-adjacent baseline)", () => {
  it("keeps rendering the notification list with message, type label, and mark-read", async () => {
    const user = userEvent.setup();
    setAuthenticated(true);
    setNotifications([
      makeNotification(42n, {
        message: "Your profile claim was approved.",
        notificationType: NotificationType.ProfileClaimReviewed,
        read: false,
      }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    expect(
      await screen.findByText("Your profile claim was approved."),
    ).toBeInTheDocument();
    expect(screen.getByText("Profile claim reviewed")).toBeInTheDocument();

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

  it("keeps the neutral empty state when there are no notifications and nothing to act on", async () => {
    setAuthenticated(true);
    setNotifications([]);
    setEligibleConfirmations([]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });

  it("keeps rendering the membership-confirmation request section alongside notifications", async () => {
    setAuthenticated(true);
    setNotifications([makeNotification(1n, { message: "A family update." })]);
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

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    // The existing confirmation section and the notification list coexist.
    expect(
      await screen.findByTestId("confirmation.request_section"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notifications.list")).toBeInTheDocument();
    expect(screen.getByText("A family update.")).toBeInTheDocument();
  });

  it("does not render verifier controls on the Notifications page for a caller with no eligible request", async () => {
    setAuthenticated(true);
    setNotifications([]);
    setEligibleConfirmations([]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await screen.findByText("No notifications yet");
    // The new verification surface must be gated on an eligible request; with
    // none, no Confirm/Dispute control is present.
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dispute/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. The recovery candidate's own status page has no verifier controls.
// ---------------------------------------------------------------------------

describe("recovery candidate status page (recovery-verification-adjacent baseline)", () => {
  it("renders the caller's own request in plain language", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.AwaitingVerification })]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    const item = await screen.findByTestId("recovery_status.item.0");
    expect(
      await within(item).findByText("Lula Mae Norwood"),
    ).toBeInTheDocument();
    expect(
      within(item).getByText("Waiting for family review"),
    ).toBeInTheDocument();
    // The caller-scoped read is family-scoped with the active family id.
    expect(calls.listMyRecoveryRequestsForFamily).toEqual([[FAMILY_A]]);
  });

  it("never renders Confirm/Dispute verifier controls for the candidate", async () => {
    setAuthenticated(true);
    setMyRequests([myRequest({ status: RecoveryStatus.AwaitingVerification })]);

    renderWithFamily(
      FAMILY_A,
      <RecoveryStatusPage onBack={() => {}} onStartRequest={() => {}} />,
    );

    await screen.findByTestId("recovery_status.item.0");
    // The candidate tracks their own request; they cannot verify it.
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dispute/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. Existing backend recovery read/verify contracts (static source).
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/src/frontend/src; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

/** The body of a named `func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

const recoveryApi = stripComments(
  readBackend(path.join("mixins", "recovery-api.mo")),
);
const recoveryLib = stripComments(readBackend(path.join("lib", "recovery.mo")));

describe("existing recovery read authorization contracts (recovery-verification-adjacent baseline)", () => {
  it("keeps listRecoveryVerificationsForFamily gated by canViewRequest", () => {
    const body = functionBody(
      recoveryApi,
      "listRecoveryVerificationsForFamily",
    );
    // Anonymous callers are refused first.
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    // A missing request is #RequestNotFound; an unauthorized caller is
    // #NotAuthorized. The new read must not widen this gate.
    expect(body).toContain(
      "getRequestForFamily(recoveryRequests, familyId, recoveryId)",
    );
    expect(body).toContain("#err(#RequestNotFound)");
    expect(body).toContain("canViewRequest(r, caller)");
    expect(body).toContain("#err(#NotAuthorized)");
  });

  it("keeps canViewRequest limited to Steward / requester / owner / replacement", () => {
    // The Phase 4D change moved the authorization predicate into the recovery
    // library (`canViewRequestForFamily`) and left the mixin's `canViewRequest`
    // as a thin delegate. The authorization semantics are unchanged, so assert
    // them at their new home rather than freezing the old mixin body.
    const delegate = functionBody(recoveryApi, "canViewRequest");
    expect(delegate).toContain(
      "RecoveryLib.canViewRequestForFamily(stewards, request, caller)",
    );

    const body = functionBody(recoveryLib, "canViewRequestForFamily");
    expect(body).toContain(
      "isActiveStewardForFamily(stewards, caller, request.familyId)",
    );
    expect(body).toContain("caller == request.requestedByAccountId");
    expect(body).toContain("caller == request.ownerAccountId");
    expect(body).toContain("caller == request.replacementAccountId");
  });

  it("keeps listMyRecoveryRequestsForFamily caller-scoped and family-scoped", () => {
    const body = functionBody(recoveryLib, "listMyRecoveryRequestsForFamily");
    // Only the caller's own requests in the requested family are returned.
    expect(body).toContain("r.familyId == familyId");
    expect(body).toContain("r.requestedByAccountId == caller");
    expect(body).toContain("r.replacementAccountId == caller");
    // The projection carries only the family-safe view fields. The filter
    // predicate above legitimately compares `replacementAccountId == caller`,
    // so the projection is isolated before asserting it never assigns an
    // account principal as an output field.
    const projectionStart = body.indexOf(".map(func r = {");
    expect(projectionStart).toBeGreaterThan(-1);
    const projection = body.slice(projectionStart);
    expect(projection).toContain("targetName");
    expect(projection).toContain("status = r.status");
    expect(projection).not.toContain("ownerAccountId =");
    expect(projection).not.toContain("replacementAccountId =");
    expect(projection).not.toContain("requestedByAccountId =");
  });

  it("keeps getRecoveryRequestForFamily gated by canViewRequest", () => {
    const body = functionBody(recoveryApi, "getRecoveryRequestForFamily");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("#err(#NotSignedIn)");
    expect(body).toContain("canViewRequest(r, caller)");
    expect(body).toContain("#err(#NotAuthorized)");
  });
});

describe("existing verification action contracts (recovery-verification-adjacent baseline)", () => {
  it("keeps verifyStewardRecoveryForFamily refusing self-verification", () => {
    const body = functionBody(recoveryLib, "verifyStewardRecoveryForFamily");
    // Only an approved family member may verify.
    expect(body).toContain(
      "isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)",
    );
    expect(body).toContain("#err(#NotAuthorized)");
    // The candidate cannot verify their own request.
    expect(body).toContain("caller == request.requestedByAccountId");
    expect(body).toContain("caller == request.ownerAccountId");
    expect(body).toContain("caller == request.replacementAccountId");
    expect(body).toContain("#err(#SelfVerification)");
  });

  it("keeps verifyStewardRecoveryForFamily refusing a second decision by the same verifier", () => {
    const body = functionBody(recoveryLib, "verifyStewardRecoveryForFamily");
    expect(body).toContain("v.verifierAccountId == caller");
    expect(body).toContain("#err(#AlreadyVerifier)");
  });

  it("keeps the 2-confirmation quorum and the #Reject resolution", () => {
    const body = functionBody(recoveryLib, "verifyStewardRecoveryForFamily");
    // A #Reject resolves immediately; two distinct #Confirm decisions satisfy
    // the quorum and transfer ownership.
    expect(body).toContain("#Reject");
    expect(body).toContain("#Rejected");
    expect(body).toContain("confirmations.size() >= 2");
    expect(body).toContain("#ReadyForApproval");
    expect(body).toContain("transferOwnership(");
  });
});
