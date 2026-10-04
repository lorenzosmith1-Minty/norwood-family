import "@testing-library/jest-dom/vitest";
import { RelationshipType } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StewardActionBadge } from "./components/StewardActionBadge";
import { AddMyselfPage } from "./pages/AddMyselfPage";
import { ConversationPage } from "./pages/ConversationPage";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";
import { FamilyStewardReviewPage } from "./pages/FamilyStewardReviewPage";
import HeritageBranchPage from "./pages/HeritageBranchPage";

// ---------------------------------------------------------------------------
// Cover for the multi-family isolation wiring of the remaining changed
// frontend surfaces (the Phase 3 tenancy audit fix).
//
// The audit threaded the centralized active family (`useFamilyScopedId()`)
// into the family-scoped hooks used by these components. This file mounts the
// real components under a NON-default `FamilyProvider` and asserts that every
// family-scoped backend call receives the active familyId as its FIRST
// argument — never a bare record id alone, and never a hard-coded "norwood".
//
// It proves the component-to-hook wiring over a typed local actor mock. It does
// not exercise the real canister; the backend family boundary is covered by the
// PocketIC lane (see coverageLimits).
//
// The default-family contract (legacy no-familyId call) is frozen separately by
// the existing characterize/cover suites and is not weakened here.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    // StewardActionBadge / FamilyStewardHubPage / FamilyStewardReviewPage reads.
    listProfileClaims: [],
    listProfileClaimsForFamily: [],
    listRelationshipRequests: [],
    listRelationshipRequestsForFamily: [],
    listPendingArchiveItems: [],
    listPendingArchiveItemsForFamily: [],
    listReports: [],
    listReportsForFamily: [],
    getReviewQueue: [],
    getReviewQueueForFamily: [],
    listMembershipConfirmationReviewsForSteward: [],
    // FamilyStewardReviewPage mutations.
    approveProfileClaim: [],
    approveProfileClaimForFamily: [],
    rejectProfileClaim: [],
    rejectProfileClaimForFamily: [],
    approveRelationshipRequest: [],
    approveRelationshipRequestForFamily: [],
    rejectRelationshipRequest: [],
    rejectRelationshipRequestForFamily: [],
    setRelationshipRequestPending: [],
    setRelationshipRequestPendingForFamily: [],
    // ConversationPage reads.
    listConversations: [],
    listConversationsForFamily: [],
    getConversation: [],
    getConversationForFamily: [],
    listBlockedUsers: [],
    listBlockedUsersForFamily: [],
    listNotifications: [],
    listNotificationsForFamily: [],
    getPersonProfile: [],
    getPersonProfileForFamily: [],
    getMyProfile: [],
    getMyProfileForFamily: [],
    // AddMyselfPage reads/mutations.
    searchPossibleMatches: [],
    searchPossibleMatchesForFamily: [],
    getMyProfileClaim: [],
    getMyProfileClaimForFamily: [],
    // HeritageBranchPage reads.
    listConfirmedRelationships: [],
    listConfirmedRelationshipsForFamily: [],
    listArchivedProfileIds: [],
    listArchivedProfileIdsForFamily: [],
    // Steward authority (not family-scoped by contract).
    isCallerSteward: [],
  };

  const mockActor: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    async isCallerSteward(...args: unknown[]): Promise<boolean> {
      calls.isCallerSteward.push(args);
      return true;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async listProfileClaims(...args: unknown[]) {
      calls.listProfileClaims.push(args);
      return [];
    },
    async listProfileClaimsForFamily(...args: unknown[]) {
      calls.listProfileClaimsForFamily.push(args);
      return [];
    },
    async listRelationshipRequests(...args: unknown[]) {
      calls.listRelationshipRequests.push(args);
      return [];
    },
    async listRelationshipRequestsForFamily(...args: unknown[]) {
      calls.listRelationshipRequestsForFamily.push(args);
      return [];
    },
    async listPendingArchiveItems(...args: unknown[]) {
      calls.listPendingArchiveItems.push(args);
      return [];
    },
    async listPendingArchiveItemsForFamily(...args: unknown[]) {
      calls.listPendingArchiveItemsForFamily.push(args);
      return [];
    },
    async listReports(...args: unknown[]) {
      calls.listReports.push(args);
      return [];
    },
    async listReportsForFamily(...args: unknown[]) {
      calls.listReportsForFamily.push(args);
      return [];
    },
    async getReviewQueue(...args: unknown[]) {
      calls.getReviewQueue.push(args);
      return null;
    },
    async getReviewQueueForFamily(...args: unknown[]) {
      calls.getReviewQueueForFamily.push(args);
      return null;
    },
    async listMembershipConfirmationReviewsForSteward(...args: unknown[]) {
      calls.listMembershipConfirmationReviewsForSteward.push(args);
      return { __kind__: "ok", ok: [] };
    },
    async approveProfileClaim(...args: unknown[]) {
      calls.approveProfileClaim.push(args);
      return null;
    },
    async approveProfileClaimForFamily(...args: unknown[]) {
      calls.approveProfileClaimForFamily.push(args);
      return null;
    },
    async rejectProfileClaim(...args: unknown[]) {
      calls.rejectProfileClaim.push(args);
      return null;
    },
    async rejectProfileClaimForFamily(...args: unknown[]) {
      calls.rejectProfileClaimForFamily.push(args);
      return null;
    },
    async approveRelationshipRequest(...args: unknown[]) {
      calls.approveRelationshipRequest.push(args);
      return null;
    },
    async approveRelationshipRequestForFamily(...args: unknown[]) {
      calls.approveRelationshipRequestForFamily.push(args);
      return null;
    },
    async rejectRelationshipRequest(...args: unknown[]) {
      calls.rejectRelationshipRequest.push(args);
      return null;
    },
    async rejectRelationshipRequestForFamily(...args: unknown[]) {
      calls.rejectRelationshipRequestForFamily.push(args);
      return null;
    },
    async setRelationshipRequestPending(...args: unknown[]) {
      calls.setRelationshipRequestPending.push(args);
      return null;
    },
    async setRelationshipRequestPendingForFamily(...args: unknown[]) {
      calls.setRelationshipRequestPendingForFamily.push(args);
      return null;
    },
    async listConversations(...args: unknown[]) {
      calls.listConversations.push(args);
      return [];
    },
    async listConversationsForFamily(...args: unknown[]) {
      calls.listConversationsForFamily.push(args);
      return [];
    },
    async getConversation(...args: unknown[]) {
      calls.getConversation.push(args);
      return null;
    },
    async getConversationForFamily(...args: unknown[]) {
      calls.getConversationForFamily.push(args);
      return null;
    },
    async listBlockedUsers(...args: unknown[]) {
      calls.listBlockedUsers.push(args);
      return [];
    },
    async listBlockedUsersForFamily(...args: unknown[]) {
      calls.listBlockedUsersForFamily.push(args);
      return [];
    },
    async listNotifications(...args: unknown[]) {
      calls.listNotifications.push(args);
      return [];
    },
    async listNotificationsForFamily(...args: unknown[]) {
      calls.listNotificationsForFamily.push(args);
      return [];
    },
    async getPersonProfile(...args: unknown[]) {
      calls.getPersonProfile.push(args);
      return null;
    },
    async getPersonProfileForFamily(...args: unknown[]) {
      calls.getPersonProfileForFamily.push(args);
      return null;
    },
    async getMyProfile(...args: unknown[]) {
      calls.getMyProfile.push(args);
      return null;
    },
    async getMyProfileForFamily(...args: unknown[]) {
      calls.getMyProfileForFamily.push(args);
      return null;
    },
    async searchPossibleMatches(...args: unknown[]) {
      calls.searchPossibleMatches.push(args);
      return [];
    },
    async searchPossibleMatchesForFamily(...args: unknown[]) {
      calls.searchPossibleMatchesForFamily.push(args);
      return [];
    },
    async getMyProfileClaim(...args: unknown[]) {
      calls.getMyProfileClaim.push(args);
      return null;
    },
    async getMyProfileClaimForFamily(...args: unknown[]) {
      calls.getMyProfileClaimForFamily.push(args);
      return null;
    },
    async listConfirmedRelationships(...args: unknown[]) {
      calls.listConfirmedRelationships.push(args);
      return [];
    },
    async listConfirmedRelationshipsForFamily(...args: unknown[]) {
      calls.listConfirmedRelationshipsForFamily.push(args);
      return [];
    },
    async listArchivedProfileIds(...args: unknown[]) {
      calls.listArchivedProfileIds.push(args);
      return [];
    },
    async listArchivedProfileIdsForFamily(...args: unknown[]) {
      calls.listArchivedProfileIdsForFamily.push(args);
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls)) {
        calls[key].length = 0;
      }
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
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function wrapperFor(familyId: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// StewardActionBadge: the aggregate steward badge sums only the active
// family's pending work. It has no prior test, so this is its first cover.
// ---------------------------------------------------------------------------

describe("StewardActionBadge: non-default family reads only the family endpoints (cover)", () => {
  it("routes every family-scoped read to the active familyId", async () => {
    render(<StewardActionBadge />, { wrapper: wrapperFor(FAMILY_A) });

    await waitFor(() =>
      expect(calls.listProfileClaimsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listRelationshipRequestsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listPendingArchiveItemsForFamily).toHaveLength(1),
    );
    await waitFor(() => expect(calls.listReportsForFamily).toHaveLength(1));
    await waitFor(() => expect(calls.getReviewQueueForFamily).toHaveLength(1));

    // The active familyId is the FIRST positional argument.
    expect(calls.listProfileClaimsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listRelationshipRequestsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listPendingArchiveItemsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listReportsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getReviewQueueForFamily).toEqual([[FAMILY_A]]);

    // The legacy no-familyId endpoints are never called for a non-default family.
    expect(calls.listProfileClaims).toEqual([]);
    expect(calls.listRelationshipRequests).toEqual([]);
    expect(calls.listPendingArchiveItems).toEqual([]);
    expect(calls.listReports).toEqual([]);
    expect(calls.getReviewQueue).toEqual([]);
  });

  it("Family B reads Family B's records, never Family A's", async () => {
    render(<StewardActionBadge />, { wrapper: wrapperFor(FAMILY_B) });

    await waitFor(() =>
      expect(calls.listProfileClaimsForFamily).toHaveLength(1),
    );
    expect(calls.listProfileClaimsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listRelationshipRequestsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listPendingArchiveItemsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listReportsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.getReviewQueueForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listProfileClaimsForFamily).not.toContainEqual([[FAMILY_A]]);
  });
});

// ---------------------------------------------------------------------------
// FamilyStewardHubPage: the hub's pending counts read only the active family.
// ---------------------------------------------------------------------------

describe("FamilyStewardHubPage: non-default family reads only the family endpoints (cover)", () => {
  it("routes every family-scoped read to the active familyId", async () => {
    render(
      <FamilyStewardHubPage
        onBack={() => {}}
        onOpenReview={() => {}}
        onOpenPendingContributions={() => {}}
        onOpenGovernance={() => {}}
        onOpenResearchIntake={() => {}}
        onOpenHiddenPosts={() => {}}
        onOpenMembershipReviews={() => {}}
      />,
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() =>
      expect(calls.listProfileClaimsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listRelationshipRequestsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listPendingArchiveItemsForFamily).toHaveLength(1),
    );
    await waitFor(() => expect(calls.listReportsForFamily).toHaveLength(1));
    await waitFor(() => expect(calls.getReviewQueueForFamily).toHaveLength(1));
    await waitFor(() =>
      expect(calls.listMembershipConfirmationReviewsForSteward).toHaveLength(1),
    );

    expect(calls.listProfileClaimsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listRelationshipRequestsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listPendingArchiveItemsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listReportsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getReviewQueueForFamily).toEqual([[FAMILY_A]]);
    // The membership-review read always passes the active family id explicitly.
    expect(calls.listMembershipConfirmationReviewsForSteward).toEqual([
      [FAMILY_A],
    ]);

    expect(calls.listProfileClaims).toEqual([]);
    expect(calls.listRelationshipRequests).toEqual([]);
    expect(calls.listPendingArchiveItems).toEqual([]);
    expect(calls.listReports).toEqual([]);
    expect(calls.getReviewQueue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FamilyStewardReviewPage: the review surface reads and mutates only the
// active family's claims and relationship requests.
// ---------------------------------------------------------------------------

describe("FamilyStewardReviewPage: non-default family routes every call to the family endpoint (cover)", () => {
  it("reads claims and relationship requests for the active family", async () => {
    render(<FamilyStewardReviewPage onBack={() => {}} />, {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() =>
      expect(calls.listProfileClaimsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listRelationshipRequestsForFamily).toHaveLength(1),
    );

    expect(calls.listProfileClaimsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listRelationshipRequestsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listProfileClaims).toEqual([]);
    expect(calls.listRelationshipRequests).toEqual([]);
  });

  it("passes the active familyId to the claim and relationship mutations", async () => {
    // Seed one pending claim and one pending relationship request so the action
    // buttons render.
    mockActor.listProfileClaimsForFamily = vi.fn(async (...args: unknown[]) => {
      calls.listProfileClaimsForFamily.push(args);
      return [
        {
          familyId: FAMILY_A,
          id: 7n,
          personId: "clayton",
          requestingUserId: OWNER,
          status: "Pending",
          submittedDate: 1n,
          reviewedBy: [],
          reviewedDate: [],
        },
      ];
    });
    mockActor.listRelationshipRequestsForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listRelationshipRequestsForFamily.push(args);
        return [
          {
            familyId: FAMILY_A,
            id: 9n,
            requestingPersonId: "clayton",
            relatedPersonId: "erma",
            proposedRelationship: RelationshipType.SpousePartner,
            status: "Pending",
            submittedDate: 1n,
            reviewer: [],
            reviewedDate: [],
          },
        ];
      },
    );

    const { container } = render(
      <FamilyStewardReviewPage onBack={() => {}} />,
      { wrapper: wrapperFor(FAMILY_A) },
    );

    const approveClaim = await waitFor(() => {
      const el = container.querySelector(
        '[data-ocid="steward_review.claim_approve_button.1"]',
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    approveClaim.click();
    await waitFor(() =>
      expect(calls.approveProfileClaimForFamily).toEqual([[FAMILY_A, 7n]]),
    );
    expect(calls.approveProfileClaim).toEqual([]);

    const approveRequest = await waitFor(() => {
      const el = container.querySelector(
        '[data-ocid="steward_review.request_approve_button.1"]',
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    approveRequest.click();
    await waitFor(() =>
      expect(calls.approveRelationshipRequestForFamily).toEqual([
        [FAMILY_A, 9n],
      ]),
    );
    expect(calls.approveRelationshipRequest).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ConversationPage: the messaging surface reads only the active family's
// conversations, blocked users, notifications, and person profiles.
// ---------------------------------------------------------------------------

describe("ConversationPage: non-default family reads only the family endpoints (cover)", () => {
  it("routes conversation, block, notification, and profile reads to the active familyId", async () => {
    render(
      <ConversationPage
        conversationId={5n}
        personId="erma"
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(calls.getConversationForFamily).toHaveLength(1));
    await waitFor(() =>
      expect(calls.listConversationsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listBlockedUsersForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listNotificationsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.getPersonProfileForFamily).toHaveLength(1),
    );

    // The active familyId is the FIRST positional argument.
    expect(calls.getConversationForFamily).toEqual([[FAMILY_A, 5n]]);
    expect(calls.listConversationsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listBlockedUsersForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listNotificationsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getPersonProfileForFamily).toEqual([[FAMILY_A, "erma"]]);

    // The legacy no-familyId endpoints are never called for a non-default family.
    expect(calls.getConversation).toEqual([]);
    expect(calls.listConversations).toEqual([]);
    expect(calls.listBlockedUsers).toEqual([]);
    expect(calls.listNotifications).toEqual([]);
    expect(calls.getPersonProfile).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AddMyselfPage: the name search and match-card claim reads target the active
// family.
// ---------------------------------------------------------------------------

describe("AddMyselfPage: non-default family routes search and claim reads to the family endpoint (cover)", () => {
  it("passes the active familyId to searchPossibleMatches and the match-card reads", async () => {
    const { container } = render(
      <AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />,
      { wrapper: wrapperFor(FAMILY_A) },
    );

    // Drive the name step so the search mutation fires.
    const input = container.querySelector(
      '[data-ocid="add_myself.name_input"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Clayton Norwood" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() =>
      expect(calls.searchPossibleMatchesForFamily).toHaveLength(1),
    );
    expect(calls.searchPossibleMatchesForFamily).toEqual([
      [FAMILY_A, "Clayton Norwood"],
    ]);
    expect(calls.searchPossibleMatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// HeritageBranchPage: the branch overview reads only the active family's
// confirmed relationships and archived profile ids.
// ---------------------------------------------------------------------------

describe("HeritageBranchPage: non-default family reads only the family endpoints (cover)", () => {
  it("routes confirmed-relationship and archived-profile reads to the active familyId", async () => {
    render(
      <HeritageBranchPage onOpenExploreFamily={() => {}} onSignIn={() => {}} />,
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() =>
      expect(calls.listConfirmedRelationshipsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listArchivedProfileIdsForFamily).toHaveLength(1),
    );

    expect(calls.listConfirmedRelationshipsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listArchivedProfileIdsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listConfirmedRelationships).toEqual([]);
    expect(calls.listArchivedProfileIds).toEqual([]);
  });
});
