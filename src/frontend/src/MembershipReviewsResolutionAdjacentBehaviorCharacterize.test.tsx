import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConfirmationDecision,
  type FamilyId,
  MembershipConfirmationResolution,
  type MembershipConfirmationReviewHistoryEntry,
  type MembershipConfirmationReviewView,
  MembershipConfirmationState,
  MembershipStatus,
  type Result_21,
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
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipReviewCaseCard } from "./components/MembershipReviewCaseCard";
import {
  membershipConfirmationInvalidation,
  useMyEligibleMembershipConfirmations,
} from "./hooks/useMembershipConfirmation";
import {
  useMembershipReviews,
  useUnresolvedMembershipReviewCount,
} from "./hooks/useMembershipReviews";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";
import { FamilyStewardMembershipReviewsPage } from "./pages/FamilyStewardMembershipReviewsPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the new
// Membership Review RESOLUTION actions (Approve / Reject / Needs More
// Information) must NOT disturb.
//
// The requested change adds three resolution actions to each review case, a
// confirmation dialog for Approve/Reject, a direct submit for Needs More
// Information, a resolve mutation that calls the existing
// `resolveMembershipConfirmation` backend API, family-exact cache
// invalidation, and neutral success/error messaging. None of that exists yet,
// so this file deliberately does NOT characterize it.
//
// What it protects is the existing Membership Reviews behavior the new actions
// are layered onto and must reuse rather than reimplement:
//
//   A. The read-only case card keeps rendering its family-safe fields
//      (applicant display name, simple relationship, membership status,
//      confirmed/disputed counts) and keeps expanding to a human-readable
//      confirmation history. Adding action buttons must not drop or reorder
//      these fields, and must not start leaking a technical id or principal.
//   B. The screen keeps self-gating on the canonical Steward authority: a
//      non-Steward sees the unauthorized state and never the review data, so a
//      new action control can never be reached by a non-Steward.
//   C. The Steward hub keeps deriving the Membership Reviews count badge from
//      the canonical review list, so resolving a case and refreshing the list
//      keeps the hub badge and the page in agreement.
//   D. The reviews read keeps its family-scoped query-key convention
//      (`["membershipReviews", familyScopedId ?? "", "list"]`) and the
//      confirmation invalidation predicate keeps covering the family slot, so
//      the new mutation's family-exact invalidation can reach the right caches
//      and never another family's.
//   E. The generated consumer seam keeps the Steward reviews read and the
//      `resolveMembershipConfirmation` method with its three-argument arity and
//      its three-value resolution enum, so the new action's typed call keeps
//      compiling and decoding.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const {
  mockActor,
  calls,
  resetState,
  setSteward,
  setReviews,
  setReviewsPending,
} = vi.hoisted(() => {
  const calls: {
    listMembershipConfirmationReviewsForSteward: unknown[][];
    listMyEligibleMembershipConfirmationsForFamily: unknown[][];
  } = {
    listMembershipConfirmationReviewsForSteward: [],
    listMyEligibleMembershipConfirmationsForFamily: [],
  };

  let isSteward = false;
  let reviews: MembershipConfirmationReviewView[] = [];
  let reviewsPending = false;

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async listMembershipConfirmationReviewsForSteward(
      ...args: unknown[]
    ): Promise<Result_21> {
      calls.listMembershipConfirmationReviewsForSteward.push(args);
      if (reviewsPending) {
        return new Promise<Result_21>(() => {});
      }
      return { __kind__: "ok", ok: reviews };
    },
    async listMyEligibleMembershipConfirmationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyEligibleMembershipConfirmationsForFamily.push(args);
      return { __kind__: "ok", ok: [] };
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
      reviews = [];
      reviewsPending = false;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setReviews: (v: MembershipConfirmationReviewView[]) => {
      reviews = v;
    },
    setReviewsPending: (v: boolean) => {
      reviewsPending = v;
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

function makeHistoryEntry(
  overrides: Partial<MembershipConfirmationReviewHistoryEntry> = {},
): MembershipConfirmationReviewHistoryEntry {
  return {
    decision: ConfirmationDecision.Confirmed,
    simpleRelationship: SimpleRelationshipType.Sibling,
    confirmerDisplayName: "Clayton Norwood",
    decidedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

function makeReview(
  overrides: Partial<MembershipConfirmationReviewView> = {},
): MembershipConfirmationReviewView {
  return {
    familyId: DEFAULT_FAMILY_ID,
    membershipId: 3n,
    pendingPersonId: "hudson",
    applicantDisplayName: "Hudson Norwood",
    simpleRelationship: SimpleRelationshipType.Sibling,
    membershipStatus: MembershipStatus.Pending,
    confirmationState: MembershipConfirmationState.StewardReviewRequired,
    confirmationHistory: [],
    confirmedCount: 0n,
    disputedCount: 0n,
    ...overrides,
  };
}

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

function renderReviewsPage(familyId: string = DEFAULT_FAMILY_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={familyId}>
        <FamilyStewardMembershipReviewsPage onBack={() => {}} />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

function renderCard(review: MembershipConfirmationReviewView) {
  // The case card now hosts the resolution mutation, which reads the React
  // Query client, so a bare render must be wrapped in a provider.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MembershipReviewCaseCard review={review} position={1} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// A. The read-only case card keeps its family-safe fields and expandable
//    history.
// ---------------------------------------------------------------------------

describe("Membership Review case card: existing fields stay intact (characterization)", () => {
  it("renders the applicant, relationship, status, and counts", () => {
    renderCard(
      makeReview({
        applicantDisplayName: "Hudson Norwood",
        simpleRelationship: SimpleRelationshipType.Sibling,
        membershipStatus: MembershipStatus.Pending,
        confirmedCount: 2n,
        disputedCount: 1n,
      }),
    );

    const item = screen.getByTestId("membership_reviews.case_item.1");
    expect(within(item).getByText("Hudson Norwood")).toBeInTheDocument();
    expect(within(item).getByText(/Sibling/)).toBeInTheDocument();
    expect(within(item).getByText(/Membership Pending/)).toBeInTheDocument();
    expect(
      within(item).getByTestId("membership_reviews.confirmed_count.1"),
    ).toHaveTextContent("2 confirmed");
    expect(
      within(item).getByTestId("membership_reviews.disputed_count.1"),
    ).toHaveTextContent("1 disputed");
  });

  it("keeps the case state marker and the history toggle", () => {
    renderCard(makeReview());

    expect(
      screen.getByTestId("membership_reviews.case_state.1"),
    ).toHaveTextContent("Needs review");
    expect(
      screen.getByTestId("membership_reviews.history_toggle.1"),
    ).toBeInTheDocument();
  });

  it("expands to a human-readable confirmation history", async () => {
    const user = userEvent.setup();
    renderCard(
      makeReview({
        confirmationHistory: [
          makeHistoryEntry({
            decision: ConfirmationDecision.Confirmed,
            confirmerDisplayName: "Clayton Norwood",
          }),
          makeHistoryEntry({
            decision: ConfirmationDecision.Disputed,
            simpleRelationship: SimpleRelationshipType.Parent,
            confirmerDisplayName: "Versie Norwood",
          }),
        ],
      }),
    );

    expect(
      screen.queryByTestId("membership_reviews.history.1"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("membership_reviews.history_toggle.1"));

    const history = await screen.findByTestId("membership_reviews.history.1");
    expect(
      within(history).getByText("Clayton Norwood · Confirmed"),
    ).toBeInTheDocument();
    expect(
      within(history).getByText("Versie Norwood · Disputed"),
    ).toBeInTheDocument();
  });

  it("never renders a technical id or account principal on the case card", () => {
    const { container } = renderCard(
      makeReview({
        membershipId: 987654321n,
        pendingPersonId: "hudson",
        applicantDisplayName: "Hudson Norwood",
      }),
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Hudson Norwood");
    expect(text).not.toContain("987654321");
    expect(text).not.toContain("hudson");
    expect(text).not.toContain(STEWARD_ACCOUNT);
  });
});

// ---------------------------------------------------------------------------
// B. The screen keeps self-gating on the canonical Steward authority.
// ---------------------------------------------------------------------------

describe("Membership Reviews screen: Steward gating stays intact (characterization)", () => {
  it("renders the unauthorized state for a non-Steward and never the review data", async () => {
    setSteward(false);
    setReviews([makeReview()]);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.unauthorized_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.case_item.1"),
    ).not.toBeInTheDocument();
  });

  it("renders the review list for an authorized Steward", async () => {
    setSteward(true);
    setReviews([makeReview()]);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.case_item.1"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.unauthorized_state"),
    ).not.toBeInTheDocument();
  });

  it("shows the loading state while the reviews read is pending", async () => {
    setSteward(true);
    setReviewsPending(true);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.loading_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.panel"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. The Steward hub keeps deriving the Membership Reviews count badge from the
//    canonical review list.
// ---------------------------------------------------------------------------

describe("Family Steward hub: Membership Reviews count stays canonical (characterization)", () => {
  it("shows the unresolved-case count from the canonical review list", async () => {
    setSteward(true);
    setReviews([makeReview(), makeReview({ membershipId: 4n })]);
    renderHub();

    const option = await screen.findByTestId(
      "steward_hub.membership_reviews_option",
    );
    expect(
      within(option).getByTestId("steward_hub.count_badge"),
    ).toHaveTextContent("2");
  });

  it("hides the count badge when there are no unresolved cases", async () => {
    setSteward(true);
    renderHub();

    const option = await screen.findByTestId(
      "steward_hub.membership_reviews_option",
    );
    expect(
      within(option).queryByTestId("steward_hub.count_badge"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// D. The reviews read keeps its family-scoped key convention and the
//    confirmation invalidation predicate keeps covering the family slot.
// ---------------------------------------------------------------------------

describe("membership reviews family scoping stays intact (characterization)", () => {
  it("keys the reviews read by the active family slot and passes the familyId", async () => {
    setSteward(true);
    setReviews([makeReview({ familyId: FAMILY_A })]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useMembershipReviews(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(calls.listMembershipConfirmationReviewsForSteward).toEqual([
      [FAMILY_A],
    ]);
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual(["membershipReviews", FAMILY_A, "list"]);
  });

  it("keeps the default family on the empty-string family slot", async () => {
    setSteward(true);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderHook(() => useMembershipReviews(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={DEFAULT_FAMILY_ID}>
            {children}
          </FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(calls.listMembershipConfirmationReviewsForSteward).toEqual([
        [DEFAULT_FAMILY_ID],
      ]);
    });
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual(["membershipReviews", "", "list"]);
  });

  it("derives the unresolved count from the canonical review list", async () => {
    setSteward(true);
    setReviews([makeReview(), makeReview({ membershipId: 4n })]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useUnresolvedMembershipReviewCount(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBe(2);
    });
  });

  it("keeps the confirmation invalidation predicate family-exact", () => {
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
    // The default family sentinel is the empty string, never a bare prefix.
    expect(filter.queryKey).toEqual(["membershipConfirmation"]);
  });

  it("keeps the eligible-confirmation read keyed by the active family slot", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => useMyEligibleMembershipConfirmations(),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
          </QueryClientProvider>
        ),
      },
    );

    await result.current.refetch();
    expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
      [FAMILY_A],
    ]);
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual([
      "membershipConfirmation",
      FAMILY_A,
      "eligible",
    ]);
  });
});

// ---------------------------------------------------------------------------
// E. The generated consumer seam keeps the reviews read and the resolution
//    method with its arity and resolution enum.
// ---------------------------------------------------------------------------

describe("membership review resolution consumer seam (characterization)", () => {
  it("keeps the Steward reviews read and the resolution method on the service type", () => {
    // The generated `_SERVICE` interface is a type, so the seam is asserted
    // against the source that declares it. The new action calls
    // `resolveMembershipConfirmation(familyId, membershipId, resolution)`.
    const backendSource = readBackendSource();
    for (const method of [
      "listMembershipConfirmationReviewsForSteward",
      "resolveMembershipConfirmation",
    ]) {
      expect(backendSource).toContain(`${method}(`);
    }
  });

  it("keeps the three Steward resolutions the new actions submit", () => {
    expect(Object.values(MembershipConfirmationResolution).sort()).toEqual(
      ["Approve", "NeedsMoreInformation", "Reject"].sort(),
    );
  });

  it("keeps the family id assignable to the exported FamilyId alias", () => {
    const familyId: FamilyId = DEFAULT_FAMILY_ID;
    expect(familyId).toBe("norwood");
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));

function readBackendSource(): string {
  // The generated wrapper is the typed seam the frontend calls through.
  return readFileSync(path.join(here, "backend.ts"), "utf8");
}
