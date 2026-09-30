import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  ConfirmationDecision,
  type EligibleMembershipConfirmationView,
  LivingStatus,
  type MembershipConfirmation,
  MembershipConfirmationState,
  type Notification,
  NotificationType,
  type PersonProfile,
  type Relationship,
  RelationshipStatus,
  RelationshipType,
  SimpleRelationshipType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipConfirmationRequestCard } from "./components/MembershipConfirmationRequestCard";
import {
  membershipConfirmationInvalidation,
  useConfirmPendingMembership,
} from "./hooks/useMembershipConfirmation";
import { NotificationsPage } from "./pages/NotificationsPage";

// ---------------------------------------------------------------------------
// Cover for the confirmation surface's FAMILY SCOPING.
//
// The accepted change requires that:
//
//   1. the confirmation request card is scoped to the active family — a Family
//      A request never renders while Family B is active;
//   2. every confirmation read and action uses the active familyId, never a
//      hard-coded default family id;
//   3. after Confirm or Dispute, only the active family's confirmation request
//      data, the applicant-safe confirmation status, the active family's
//      membership-related status, and the active family's notification count
//      refresh — never a bare cross-family invalidation prefix.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const {
  mockActor,
  calls,
  resetCalls,
  setNotifications,
  setEligibleConfirmations,
} = vi.hoisted(() => {
  const familyA = "test-family-a";
  const calls: {
    confirmPendingMembership: unknown[][];
    getMyConfirmationForMembership: unknown[][];
    getProfilePhotoForFamily: unknown[][];
    listMyEligibleMembershipConfirmationsForFamily: unknown[][];
    listNotificationsForFamily: unknown[][];
    listNotifications: unknown[][];
    unreadNotificationCountForFamily: unknown[][];
    getPersonProfileForFamily: unknown[][];
    getMyProfileForFamily: unknown[][];
    listConfirmedRelationshipsForFamily: unknown[][];
  } = {
    confirmPendingMembership: [],
    getMyConfirmationForMembership: [],
    getProfilePhotoForFamily: [],
    listMyEligibleMembershipConfirmationsForFamily: [],
    listNotificationsForFamily: [],
    listNotifications: [],
    unreadNotificationCountForFamily: [],
    getPersonProfileForFamily: [],
    getMyProfileForFamily: [],
    listConfirmedRelationshipsForFamily: [],
  };

  let notifications: Notification[] = [];
  let eligibleConfirmations: unknown[] = [];
  let pendingProfile: unknown = null;
  let myProfile: unknown = null;
  let confirmedRelationships: unknown[] = [];

  const mockActor = {
    async confirmPendingMembership(...args: unknown[]): Promise<unknown> {
      calls.confirmPendingMembership.push(args);
      return {
        __kind__: "ok",
        ok: {
          id: 1n,
          familyId: familyA,
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
    async listNotificationsForFamily(...args: unknown[]): Promise<unknown> {
      calls.listNotificationsForFamily.push(args);
      return notifications;
    },
    async listNotifications(...args: unknown[]): Promise<unknown> {
      calls.listNotifications.push(args);
      return notifications;
    },
    async unreadNotificationCountForFamily(
      ...args: unknown[]
    ): Promise<bigint> {
      calls.unreadNotificationCountForFamily.push(args);
      return 0n;
    },
    async getPersonProfileForFamily(...args: unknown[]): Promise<unknown> {
      calls.getPersonProfileForFamily.push(args);
      return pendingProfile;
    },
    async getMyProfileForFamily(...args: unknown[]): Promise<unknown> {
      calls.getMyProfileForFamily.push(args);
      return myProfile;
    },
    async listConfirmedRelationshipsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listConfirmedRelationshipsForFamily.push(args);
      return confirmedRelationships;
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
      pendingProfile = null;
      myProfile = null;
      confirmedRelationships = [];
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
  familyId: string,
): Notification {
  return {
    id,
    recipient: OWNER,
    notificationType: NotificationType.ProfileClaimReviewed,
    message,
    createdAt: 1_700_000_000_000_000_000n,
    read: false,
    familyId,
  };
}

function makeEligibleConfirmation(
  overrides: Partial<EligibleMembershipConfirmationView> = {},
): EligibleMembershipConfirmationView {
  return {
    familyId: FAMILY_A,
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

describe("confirmation request card: active-family scoping (cover)", () => {
  it("passes the active familyId to the confirmation action, never the default literal", async () => {
    const user = userEvent.setup();
    renderWithFamily(
      FAMILY_A,
      <MembershipConfirmationRequestCard
        membershipId={3n}
        pendingPersonId="hudson"
      />,
    );

    await user.click(await screen.findByTestId("confirmation.confirm_button"));

    await waitFor(() =>
      expect(calls.confirmPendingMembership).toEqual([
        [FAMILY_A, 3n, ConfirmationDecision.Confirmed],
      ]),
    );
    expect(calls.confirmPendingMembership[0]?.[0]).not.toBe(DEFAULT_FAMILY_ID);
  });

  it("reads the caller's own decision for the active family", async () => {
    renderWithFamily(
      FAMILY_A,
      <MembershipConfirmationRequestCard
        membershipId={3n}
        pendingPersonId="hudson"
      />,
    );

    await waitFor(() =>
      expect(calls.getMyConfirmationForMembership).toEqual([[FAMILY_A, 3n]]),
    );
  });

  it("resolves the pending person's photo within the active family", async () => {
    renderWithFamily(
      FAMILY_A,
      <MembershipConfirmationRequestCard
        membershipId={3n}
        pendingPersonId="hudson"
      />,
    );

    await waitFor(() =>
      expect(calls.getProfilePhotoForFamily).toEqual([[FAMILY_A, "hudson"]]),
    );
  });
});

describe("confirmation request surface: discovered from the canonical query, family-scoped (cover)", () => {
  it("renders the Family A request from the canonical eligible query while Family A is active", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({ familyId: FAMILY_A }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    expect(
      await screen.findByTestId("confirmation.request_card"),
    ).toBeInTheDocument();
    // Discovery is the canonical family-scoped query, not notification text.
    expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
      [FAMILY_A],
    ]);
  });

  it("does not render the Family A request while Family B is active", async () => {
    // The backend is family-scoped: while Family B is active the canonical
    // eligible query returns no Family A request, so no confirmation card
    // renders.
    setEligibleConfirmations([]);

    renderWithFamily(FAMILY_B, <NotificationsPage />);

    await waitFor(() =>
      expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
        [FAMILY_B],
      ]),
    );
    expect(screen.queryByTestId("confirmation.request_card")).toBeNull();
    expect(screen.queryByTestId("confirmation.request_section")).toBeNull();
  });

  it("renders the pending person's display name and simple relationship from the canonical view", async () => {
    setEligibleConfirmations([
      makeEligibleConfirmation({
        familyId: FAMILY_A,
        displayName: "Hudson Norwood",
        simpleRelationship: SimpleRelationshipType.Sibling,
      }),
    ]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    // The card shows the canonical view's family-safe display name and simple
    // relationship label, resolved within the active family.
    expect(await screen.findByText(/Hudson Norwood/)).toBeInTheDocument();
    expect(await screen.findByText("Sibling")).toBeInTheDocument();
    expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
      [FAMILY_A],
    ]);
  });

  it("does not render a confirmation card from notification message text alone", async () => {
    // A notification whose message carries the legacy `membership:<id>
    // person:<id>` references must NOT be parsed into a confirmation request:
    // the canonical eligible query is the single source of truth, and it
    // returned nothing.
    setNotifications([
      makeNotification(1n, "membership:3 person:hudson", FAMILY_A),
    ]);
    setEligibleConfirmations([]);

    renderWithFamily(FAMILY_A, <NotificationsPage />);

    await waitFor(() =>
      expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
        [FAMILY_A],
      ]),
    );
    expect(screen.queryByTestId("confirmation.request_card")).toBeNull();
    expect(screen.queryByTestId("confirmation.request_section")).toBeNull();
  });
});

describe("confirmation invalidation: family-exact, never a bare cross-family prefix (cover)", () => {
  it("targets only the active family's confirmation keys", () => {
    const filter = membershipConfirmationInvalidation(FAMILY_A);
    const predicate = filter.predicate as unknown as (query: {
      queryKey: unknown[];
    }) => boolean;

    expect(
      predicate({ queryKey: ["membershipConfirmation", FAMILY_A, "x"] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["membershipConfirmation", FAMILY_B, "x"] }),
    ).toBe(false);
  });

  it("targets the default family sentinel when no family is scoped", () => {
    const filter = membershipConfirmationInvalidation(undefined);
    const predicate = filter.predicate as unknown as (query: {
      queryKey: unknown[];
    }) => boolean;

    expect(predicate({ queryKey: ["membershipConfirmation", "", "x"] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["membershipConfirmation", FAMILY_A, "x"] }),
    ).toBe(false);
  });

  it("invalidates only the active family's confirmation, membership, and notification caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useConfirmPendingMembership(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    queryClient.setQueryData(
      ["membershipConfirmation", FAMILY_A, "myMembership"],
      null,
    );
    queryClient.setQueryData(
      ["membershipConfirmation", FAMILY_B, "myMembership"],
      null,
    );
    queryClient.setQueryData(["myMembership", FAMILY_A], null);
    queryClient.setQueryData(["myMembership", FAMILY_B], null);
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);

    await result.current.mutateAsync({
      membershipId: 3n,
      decision: ConfirmationDecision.Confirmed,
    });

    // The active family's caches are refreshed.
    expect(
      queryClient.getQueryState([
        "membershipConfirmation",
        FAMILY_A,
        "myMembership",
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["myMembership", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);

    // Family B's caches are untouched.
    expect(
      queryClient.getQueryState([
        "membershipConfirmation",
        FAMILY_B,
        "myMembership",
      ])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["myMembership", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);

    // No bare cross-family confirmation prefix is ever used.
    const confirmationFilters = invalidateSpy.mock.calls
      .map(
        ([filters]) => filters as { queryKey?: unknown[]; predicate?: unknown },
      )
      .filter((filters) => filters.queryKey?.[0] === "membershipConfirmation");
    for (const filters of confirmationFilters) {
      expect(filters.queryKey).toEqual(["membershipConfirmation"]);
      expect(typeof filters.predicate).toBe("function");
    }
  });
});
