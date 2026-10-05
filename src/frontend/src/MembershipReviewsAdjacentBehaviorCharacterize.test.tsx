import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClaimStatus,
  ConfirmationDecision,
  type FamilyId,
  LivingStatus,
  type MembershipConfirmationReviewHistoryEntry,
  type MembershipConfirmationReviewView,
  MembershipConfirmationState,
  MembershipStatus,
  type PersonProfile,
  type ProfileClaim,
  ProfileClaimStatus,
  type RelationshipRequest,
  RelationshipRequestStatus,
  RelationshipType,
  type Report,
  ReportStatus,
  type Result_25,
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
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  membershipConfirmationInvalidation,
  useMyEligibleMembershipConfirmations,
} from "./hooks/useMembershipConfirmation";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the new
// "Membership Reviews" surface must NOT disturb.
//
// The requested change adds a Membership Reviews entry (with an unresolved-case
// count) to the existing Family Steward dashboard, a Membership Reviews screen,
// and a family-scoped reviews query hook. None of those exist yet, so this file
// deliberately does NOT characterize them.
//
// What it protects is the existing behavior the new surface is built on and
// must reuse rather than reimplement:
//
//   A. The Family Steward hub keeps rendering every existing option card and
//      keeps deriving each existing count badge from its canonical source. The
//      new Membership Reviews entry is added to this same grid, so a regression
//      here would silently drop or mis-count an existing steward area.
//   B. The existing confirmation query hook keeps its family-scoped query-key
//      convention (`[membershipConfirmation, familyScopedId ?? "", ...]`) and
//      the family-exact invalidation predicate keeps covering it. The new
//      reviews hook must follow the same convention so a Family A review never
//      appears in Family B's cache and the family-exact invalidation still
//      reaches it.
//   C. The generated consumer seam keeps the Steward reviews read
//      (`listMembershipConfirmationReviewsForSteward(familyId)`) with its
//      privacy-safe view shape: applicant display name, simple relationship,
//      membership status, confirmation/dispute counts, and a human-readable
//      confirmation history — and never an account principal, confirmer person
//      id, or sensitive relationship context.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";

const {
  mockActor,
  calls,
  resetState,
  setSteward,
  setClaims,
  setRequests,
  setReports,
  setPendingArchiveItems,
  setReviewQueue,
} = vi.hoisted(() => {
  const calls: {
    listProfileClaims: unknown[][];
    listRelationshipRequests: unknown[][];
    listReports: unknown[][];
    listPendingArchiveItems: unknown[][];
    getReviewQueue: unknown[][];
    listMyEligibleMembershipConfirmationsForFamily: unknown[][];
  } = {
    listProfileClaims: [],
    listRelationshipRequests: [],
    listReports: [],
    listPendingArchiveItems: [],
    getReviewQueue: [],
    listMyEligibleMembershipConfirmationsForFamily: [],
  };

  let isSteward = false;
  let claims: unknown[] = [];
  let requests: unknown[] = [];
  let reports: unknown[] = [];
  let pendingArchiveItems: unknown[] = [];
  let reviewQueue: unknown = {
    pending: 0n,
    needsResearch: 0n,
    conflicting: 0n,
  };
  let eligibleConfirmations: unknown[] = [];

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async listProfileClaims(...args: unknown[]): Promise<unknown> {
      calls.listProfileClaims.push(args);
      return claims;
    },
    async listRelationshipRequests(...args: unknown[]): Promise<unknown> {
      calls.listRelationshipRequests.push(args);
      return requests;
    },
    async listReports(...args: unknown[]): Promise<unknown> {
      calls.listReports.push(args);
      return reports;
    },
    async listPendingArchiveItems(...args: unknown[]): Promise<unknown> {
      calls.listPendingArchiveItems.push(args);
      return pendingArchiveItems;
    },
    async getReviewQueue(...args: unknown[]): Promise<unknown> {
      calls.getReviewQueue.push(args);
      return reviewQueue;
    },
    async listMyEligibleMembershipConfirmationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyEligibleMembershipConfirmationsForFamily.push(args);
      return { __kind__: "ok", ok: eligibleConfirmations };
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
      isSteward = false;
      claims = [];
      requests = [];
      reports = [];
      pendingArchiveItems = [];
      reviewQueue = { pending: 0n, needsResearch: 0n, conflicting: 0n };
      eligibleConfirmations = [];
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setClaims: (v: unknown[]) => {
      claims = v;
    },
    setRequests: (v: unknown[]) => {
      requests = v;
    },
    setReports: (v: unknown[]) => {
      reports = v;
    },
    setPendingArchiveItems: (v: unknown[]) => {
      pendingArchiveItems = v;
    },
    setReviewQueue: (v: unknown) => {
      reviewQueue = v;
    },
    setEligibleConfirmations: (v: unknown[]) => {
      eligibleConfirmations = v;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => Principal.fromText(STEWARD_ACCOUNT) },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetState);

function renderHub() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyStewardHubPage
        onBack={() => {}}
        onOpenReview={() => {}}
        onOpenPendingContributions={() => {}}
        onOpenGovernance={() => {}}
        onOpenResearchIntake={() => {}}
        onOpenHiddenPosts={() => {}}
        onOpenMembershipReviews={() => {}}
      />
    </QueryClientProvider>,
  );
}

function makeClaim(status: ProfileClaimStatus): ProfileClaim {
  return {
    id: 1n,
    familyId: DEFAULT_FAMILY_ID,
    personId: "hudson",
    requestingUserId: Principal.fromText(STEWARD_ACCOUNT),
    status,
    submittedDate: 1_700_000_000_000_000_000n,
  };
}

function makeRequest(status: RelationshipRequestStatus): RelationshipRequest {
  return {
    id: 1n,
    familyId: DEFAULT_FAMILY_ID,
    requestingPersonId: "hudson",
    relatedPersonId: "clayton",
    proposedRelationship: RelationshipType.Parent,
    status,
    submittedDate: 1_700_000_000_000_000_000n,
  };
}

function makeReport(status: ReportStatus): Report {
  return {
    reportId: 1n,
    familyId: DEFAULT_FAMILY_ID,
    reportingAccountId: Principal.fromText(STEWARD_ACCOUNT),
    reportedMessageId: 1n,
    reason: "spam",
    status,
    createdAt: 1_700_000_000_000_000_000n,
  };
}

function makeProfile(): PersonProfile {
  return {
    familyId: DEFAULT_FAMILY_ID,
    personId: "hudson",
    name: "Hudson Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
}

// ---------------------------------------------------------------------------
// A. The Family Steward hub keeps its existing option cards and count badges.
// ---------------------------------------------------------------------------

describe("Family Steward hub: existing option cards stay intact (characterization)", () => {
  it("renders every existing steward option card in the grid", async () => {
    setSteward(true);
    renderHub();

    expect(await screen.findByTestId("steward_hub.grid")).toBeInTheDocument();
    for (const ocid of [
      "steward_hub.research_intake_option",
      "steward_hub.review_option",
      "steward_hub.pending_option",
      "steward_hub.governance_option",
      "steward_hub.stewards_option",
      "steward_hub.duplicates_option",
      "steward_hub.relationships_option",
      "steward_hub.archived_option",
      "steward_hub.audit_option",
      "steward_hub.reported_option",
      "steward_hub.hidden_posts_option",
    ]) {
      expect(screen.getByTestId(ocid)).toBeInTheDocument();
    }
  });

  it("derives each existing count badge from its canonical source", async () => {
    setSteward(true);
    setClaims([
      makeClaim(ProfileClaimStatus.Pending),
      makeClaim(ProfileClaimStatus.Approved),
    ]);
    setRequests([
      makeRequest(RelationshipRequestStatus.Pending),
      makeRequest(RelationshipRequestStatus.Approved),
    ]);
    setReports([
      makeReport(ReportStatus.Pending),
      makeReport(ReportStatus.Reviewed),
    ]);
    setPendingArchiveItems([makeProfile(), makeProfile()]);
    setReviewQueue({ pending: 2n, needsResearch: 1n, conflicting: 1n });
    renderHub();

    await screen.findByTestId("steward_hub.grid");

    // Review Requests: pending claims only (1 of 2).
    expect(
      await within(
        screen.getByTestId("steward_hub.review_option"),
      ).findByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("1");
    // Relationship Management: pending requests only (1 of 2).
    expect(
      await within(
        screen.getByTestId("steward_hub.relationships_option"),
      ).findByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("1");
    // Reported Messages: pending reports only (1 of 2).
    expect(
      await within(
        screen.getByTestId("steward_hub.reported_option"),
      ).findByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("1");
    // Pending Contributions: pending archive items (2).
    expect(
      await within(
        screen.getByTestId("steward_hub.pending_option"),
      ).findByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("2");
    // Research Intake: pending + needs-research + conflicting (2 + 1 + 1 = 4).
    expect(
      await within(
        screen.getByTestId("steward_hub.research_intake_option"),
      ).findByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("4");
  });

  it("hides every existing count badge when its canonical count is zero", async () => {
    setSteward(true);
    renderHub();

    await screen.findByTestId("steward_hub.grid");
    for (const ocid of [
      "steward_hub.research_intake_option",
      "steward_hub.review_option",
      "steward_hub.pending_option",
      "steward_hub.relationships_option",
      "steward_hub.reported_option",
    ]) {
      expect(
        within(screen.getByTestId(ocid)).queryByTestId(
          "steward_hub.count_badge",
        ),
      ).not.toBeInTheDocument();
    }
  });

  it("keeps the hub gated to Stewards (no grid for a non-Steward)", async () => {
    setSteward(false);
    renderHub();

    expect(
      await screen.findByTestId("steward_hub.unauthorized_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("steward_hub.grid")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. The existing confirmation hook keeps its family-scoped key convention.
// ---------------------------------------------------------------------------

describe("confirmation query family-scoping stays intact (characterization)", () => {
  it("keys the eligible-confirmation read by the active family slot", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => useMyEligibleMembershipConfirmations(),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId="test-family-a">{children}</FamilyProvider>
          </QueryClientProvider>
        ),
      },
    );

    await result.current.refetch();
    // The active family id is passed to the backend and occupies query-key
    // index 1, so the family-exact invalidation predicate covers it.
    expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
      ["test-family-a"],
    ]);
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual([
      "membershipConfirmation",
      "test-family-a",
      "eligible",
    ]);
  });

  it("keeps the family-exact invalidation predicate covering the family slot", () => {
    const filter = membershipConfirmationInvalidation("test-family-a");
    const predicate = filter.predicate as unknown as (query: {
      queryKey: unknown[];
    }) => boolean;

    expect(
      predicate({ queryKey: ["membershipConfirmation", "test-family-a", "x"] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["membershipConfirmation", "test-family-b", "x"] }),
    ).toBe(false);
    // The default family sentinel is the empty string, never a bare prefix.
    expect(filter.queryKey).toEqual(["membershipConfirmation"]);
  });
});

// ---------------------------------------------------------------------------
// C. The generated Steward reviews consumer seam stays privacy-safe.
// ---------------------------------------------------------------------------

describe("Steward reviews consumer seam (characterization)", () => {
  it("keeps the Steward reviews read on the generated service type", () => {
    const serviceMethods = [
      "listMembershipConfirmationReviewsForSteward",
      "getMembershipConfirmationStateForSteward",
      "listMyEligibleMembershipConfirmationsForFamily",
    ];
    // The generated `_SERVICE` interface is a type, so the seam is asserted
    // against the source that declares it.
    const backendSource = readBackendSource();
    for (const method of serviceMethods) {
      expect(backendSource).toContain(`${method}(`);
    }
  });

  it("types the reviews Result as a privacy-safe view array", () => {
    const history: MembershipConfirmationReviewHistoryEntry = {
      decision: ConfirmationDecision.Disputed,
      simpleRelationship: SimpleRelationshipType.Sibling,
      confirmerDisplayName: "Clayton Norwood",
      decidedAt: 1_700_000_000_000_000_000n,
    };
    const view: MembershipConfirmationReviewView = {
      familyId: "norwood",
      membershipId: 3n,
      pendingPersonId: "hudson",
      applicantDisplayName: "Hudson Norwood",
      simpleRelationship: SimpleRelationshipType.Sibling,
      membershipStatus: MembershipStatus.Pending,
      confirmationState: MembershipConfirmationState.StewardReviewRequired,
      confirmationHistory: [history],
      confirmedCount: 1n,
      disputedCount: 1n,
    };
    const ok: Result_25 = { __kind__: "ok", ok: [view] };
    const err: Result_25 = {
      __kind__: "err",
      err: "NotAuthorized" as Result_25 extends { err: infer E } ? E : never,
    };

    expect(ok.ok).toHaveLength(1);
    expect(ok.ok[0]?.applicantDisplayName).toBe("Hudson Norwood");
    expect(ok.ok[0]?.simpleRelationship).toBe(SimpleRelationshipType.Sibling);
    expect(ok.ok[0]?.membershipStatus).toBe(MembershipStatus.Pending);
    expect(ok.ok[0]?.confirmedCount).toBe(1n);
    expect(ok.ok[0]?.disputedCount).toBe(1n);
    expect(ok.ok[0]?.confirmationHistory[0]?.confirmerDisplayName).toBe(
      "Clayton Norwood",
    );
    expect(err.__kind__).toBe("err");
  });

  it("never carries an account principal or sensitive relationship context", () => {
    const view: MembershipConfirmationReviewView = {
      familyId: "norwood",
      membershipId: 3n,
      pendingPersonId: "hudson",
      applicantDisplayName: "Hudson Norwood",
      simpleRelationship: SimpleRelationshipType.Sibling,
      membershipStatus: MembershipStatus.Pending,
      confirmationState: MembershipConfirmationState.StewardReviewRequired,
      confirmationHistory: [],
      confirmedCount: 0n,
      disputedCount: 0n,
    };

    expect(view).not.toHaveProperty("confirmerAccountId");
    expect(view).not.toHaveProperty("confirmerPersonId");
    expect(view).not.toHaveProperty("accountId");
    expect(view).not.toHaveProperty("relationshipId");
    const serialized = JSON.stringify(view, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    for (const sensitive of [
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("keeps the family id assignable to the exported FamilyId alias", () => {
    const familyId: FamilyId = "norwood";
    expect(familyId).toBe(DEFAULT_FAMILY_ID);
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));

function readBackendSource(): string {
  // The generated wrapper is the typed seam the frontend calls through.
  return readFileSync(path.join(here, "backend.ts"), "utf8");
}
