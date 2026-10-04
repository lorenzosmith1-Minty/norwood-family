import "@testing-library/jest-dom/vitest";
import {
  ConfirmationDecision,
  type EligibleMembershipConfirmationView,
  type MembershipConfirmation,
  MembershipConfirmationState,
  type Notification,
  NotificationType,
  SimpleRelationshipType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsPage } from "./pages/NotificationsPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the
// membership-confirmation READ-ONLY-STATE change must NOT disturb.
//
// The requested change makes the confirmation request card render a read-only
// state (no Confirm / Dispute buttons) when the eligible view's derived
// `confirmationState` is already settled: already confirmed, already
// disputed/rejected, Steward review required, or already resolved by Steward.
// That read-only rendering does not exist yet, so this file deliberately does
// NOT characterize it.
//
// What it protects is the existing behavior the acceptance criteria name as
// unchanged, on the Notifications surface where the card is wired:
//
//   A. The Notifications page still renders the caller's normal notification
//      list alongside the confirmation request section — the confirmation
//      surface is additive and never replaces the notification list.
//   B. The Notifications page still renders its empty state when there are no
//      notifications AND no eligible confirmation requests.
//   C. The Notifications page suppresses the empty state when an eligible
//      confirmation request is present (the request section is the content).
//   D. The pending card still shows the canonical view's family-safe fields:
//      the pending person's display name, the simple relationship label, and
//      the birth year when the view carries one.
//   E. The two primary actions still submit the correct decision through the
//      family-scoped confirmation API for the active family.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");

const {
  mockActor,
  calls,
  resetCalls,
  setNotifications,
  setEligibleConfirmations,
} = vi.hoisted(() => {
  const calls: {
    confirmPendingMembership: unknown[][];
    getMyConfirmationForMembership: unknown[][];
    getProfilePhotoForFamily: unknown[][];
    listMyEligibleMembershipConfirmationsForFamily: unknown[][];
    listNotifications: unknown[][];
  } = {
    confirmPendingMembership: [],
    getMyConfirmationForMembership: [],
    getProfilePhotoForFamily: [],
    listMyEligibleMembershipConfirmationsForFamily: [],
    listNotifications: [],
  };

  let notifications: Notification[] = [];
  let eligibleConfirmations: unknown[] = [];

  const mockActor = {
    async confirmPendingMembership(...args: unknown[]): Promise<unknown> {
      calls.confirmPendingMembership.push(args);
      return {
        __kind__: "ok",
        ok: {
          id: 1n,
          familyId: "norwood",
          membershipId: 3n,
          pendingPersonId: "hudson",
          confirmerAccountId: OWNER,
          confirmerPersonId: "clayton",
          decision: ConfirmationDecision.Confirmed,
          relationshipId: 11n,
          createdAt: 1_700_000_000_000_000_000n,
          updatedAt: 1_700_000_000_000_000_000n,
        } satisfies MembershipConfirmation,
      };
    },
    async getMyConfirmationForMembership(...args: unknown[]): Promise<unknown> {
      calls.getMyConfirmationForMembership.push(args);
      return { __kind__: "ok", ok: null };
    },
    async getProfilePhotoForFamily(...args: unknown[]): Promise<unknown> {
      calls.getProfilePhotoForFamily.push(args);
      return null;
    },
    async listMyEligibleMembershipConfirmationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyEligibleMembershipConfirmationsForFamily.push(args);
      return { __kind__: "ok", ok: eligibleConfirmations };
    },
    async listNotifications(...args: unknown[]): Promise<unknown> {
      calls.listNotifications.push(args);
      return notifications;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
      notifications = [];
      eligibleConfirmations = [];
    },
    setNotifications: (value: Notification[]) => {
      notifications = value;
    },
    setEligibleConfirmations: (value: unknown[]) => {
      eligibleConfirmations = value;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function makeNotification(
  id: bigint,
  message: string,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    recipient: OWNER,
    notificationType: NotificationType.ProfileClaimReviewed,
    message,
    createdAt: 1_700_000_000_000_000_000n,
    read: false,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

function makeEligibleConfirmation(
  overrides: Partial<EligibleMembershipConfirmationView> = {},
): EligibleMembershipConfirmationView {
  return {
    familyId: DEFAULT_FAMILY_ID,
    membershipId: 3n,
    pendingPersonId: "hudson",
    displayName: "Hudson Norwood",
    profilePhoto: undefined,
    birthYear: undefined,
    simpleRelationship: SimpleRelationshipType.Sibling,
    confirmationState: MembershipConfirmationState.AwaitingConfirmation,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={DEFAULT_FAMILY_ID}>
        <NotificationsPage />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

describe("Notifications page: confirmation section is additive (characterization)", () => {
  it("renders the normal notification list alongside the confirmation request section", async () => {
    setNotifications([
      makeNotification(1n, "Your profile claim was approved."),
    ]);
    setEligibleConfirmations([makeEligibleConfirmation()]);

    renderPage();

    // The confirmation request section renders...
    expect(
      await screen.findByTestId("confirmation.request_section"),
    ).toBeInTheDocument();
    // ...and the ordinary notification list is still present, not replaced.
    expect(screen.getByTestId("notifications.list")).toBeInTheDocument();
    expect(
      screen.getByText("Your profile claim was approved."),
    ).toBeInTheDocument();
  });

  it("renders the empty state when there are no notifications and no eligible requests", async () => {
    setNotifications([]);
    setEligibleConfirmations([]);

    renderPage();

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
    expect(screen.queryByTestId("confirmation.request_section")).toBeNull();
  });

  it("suppresses the empty state when an eligible confirmation request is present", async () => {
    setNotifications([]);
    setEligibleConfirmations([makeEligibleConfirmation()]);

    renderPage();

    expect(
      await screen.findByTestId("confirmation.request_section"),
    ).toBeInTheDocument();
    // With a request to act on, the page does not show the "nothing here"
    // empty state.
    expect(screen.queryByText("No notifications yet")).toBeNull();
  });
});

describe("pending confirmation card: canonical family-safe fields (characterization)", () => {
  it("shows the pending person's display name and simple relationship from the canonical view", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({
        displayName: "Hudson Norwood",
        simpleRelationship: SimpleRelationshipType.Sibling,
      }),
    ]);

    renderPage();

    expect(await screen.findByText(/Hudson Norwood/)).toBeInTheDocument();
    expect(screen.getByText("Sibling")).toBeInTheDocument();
  });

  it("shows the birth year when the canonical view carries one", async () => {
    setEligibleConfirmations([makeEligibleConfirmation({ birthYear: 1948n })]);

    renderPage();

    expect(await screen.findByText(/Born 1948/)).toBeInTheDocument();
  });

  it("omits the birth year when the canonical view carries none", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({ birthYear: undefined }),
    ]);

    renderPage();

    await screen.findByTestId("confirmation.request_card");
    expect(screen.queryByText(/Born/)).toBeNull();
  });
});

describe("pending confirmation card: primary actions (characterization)", () => {
  it("submits a #Confirmed decision for the active family", async () => {
    setEligibleConfirmations([makeEligibleConfirmation()]);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    await waitFor(() =>
      expect(calls.confirmPendingMembership).toEqual([
        [DEFAULT_FAMILY_ID, 3n, ConfirmationDecision.Confirmed],
      ]),
    );
  });

  it("submits a #Disputed decision for the active family", async () => {
    setEligibleConfirmations([makeEligibleConfirmation()]);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByTestId("confirmation.dispute_button"));

    await waitFor(() =>
      expect(calls.confirmPendingMembership).toEqual([
        [DEFAULT_FAMILY_ID, 3n, ConfirmationDecision.Disputed],
      ]),
    );
  });
});
