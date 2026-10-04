import "@testing-library/jest-dom/vitest";
import {
  ConfirmationDecision,
  type FamilyId,
  MembershipConfirmationError,
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
  useMembershipReviews,
  useUnresolvedMembershipReviewCount,
} from "./hooks/useMembershipReviews";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";
import { FamilyStewardMembershipReviewsPage } from "./pages/FamilyStewardMembershipReviewsPage";

// ---------------------------------------------------------------------------
// Cover for the Family Steward "Membership Reviews" surface.
//
// The accepted change requires:
//
//   1. the Family Steward dashboard shows a Membership Reviews entry with the
//      number of unresolved cases (hidden at zero);
//   2. the Membership Reviews screen lists unresolved cases with applicant
//      name, simple relationship, membership status, and confirmation/dispute
//      counts;
//   3. each review case expands to a human-readable confirmation history;
//   4. the reviews query is scoped to the active family and handles loading,
//      empty, and error states;
//   5. no account principals, technical ids, or sensitive relationship
//      metadata appear in the UI.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const FAMILY_A = "test-family-a";

const {
  mockActor,
  calls,
  resetState,
  setSteward,
  setReviews,
  setReviewsError,
  setReviewsPending,
} = vi.hoisted(() => {
  const calls: {
    listMembershipConfirmationReviewsForSteward: unknown[][];
  } = {
    listMembershipConfirmationReviewsForSteward: [],
  };

  let isSteward = false;
  let reviews: MembershipConfirmationReviewView[] = [];
  let reviewsError: MembershipConfirmationError | null = null;
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
      if (reviewsError !== null) {
        return { __kind__: "err", err: reviewsError };
      }
      return { __kind__: "ok", ok: reviews };
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
      reviewsError = null;
      reviewsPending = false;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setReviews: (v: MembershipConfirmationReviewView[]) => {
      reviews = v;
    },
    setReviewsError: (v: MembershipConfirmationError | null) => {
      reviewsError = v;
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
// 1. The Family Steward dashboard shows the Membership Reviews entry with the
//    unresolved-case count.
// ---------------------------------------------------------------------------

describe("Family Steward hub: Membership Reviews entry", () => {
  it("shows the Membership Reviews entry with the unresolved-case count", async () => {
    setSteward(true);
    setReviews([makeReview(), makeReview({ membershipId: 4n })]);
    renderHub();

    const option = await screen.findByTestId(
      "steward_hub.membership_reviews_option",
    );
    expect(option).toBeInTheDocument();
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
// 2. The Membership Reviews screen lists unresolved cases with the required
//    family-safe fields.
// ---------------------------------------------------------------------------

describe("Membership Reviews screen: case list", () => {
  it("lists each unresolved case with applicant, relationship, status, and counts", async () => {
    setSteward(true);
    setReviews([
      makeReview({
        applicantDisplayName: "Hudson Norwood",
        simpleRelationship: SimpleRelationshipType.Sibling,
        membershipStatus: MembershipStatus.Pending,
        confirmedCount: 2n,
        disputedCount: 1n,
      }),
    ]);
    renderReviewsPage();

    const item = await screen.findByTestId("membership_reviews.case_item.1");
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

  it("renders the empty state when there are no unresolved cases", async () => {
    setSteward(true);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.panel"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing needs review")).toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.list"),
    ).not.toBeInTheDocument();
  });

  it("renders the loading state while the reviews read is pending", async () => {
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

  it("shows a neutral error state with Retry when the reviews read errors", async () => {
    // Accepted behavior: a failed review request must never be collapsed into
    // an empty list. The page shows a neutral error message and a Retry action
    // instead, and the backend error tag is never surfaced.
    setSteward(true);
    setReviewsError(MembershipConfirmationError.NotAuthorized);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("membership_reviews.retry_button"),
    ).toBeInTheDocument();
    // No empty review list and no empty-state copy on failure.
    expect(
      screen.queryByTestId("membership_reviews.panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nothing awaiting review"),
    ).not.toBeInTheDocument();
    // The technical error tag is never exposed.
    expect(screen.queryByText(/NotAuthorized/)).not.toBeInTheDocument();
  });

  it("gates the screen to Stewards (unauthorized state for a non-Steward)", async () => {
    setSteward(false);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.unauthorized_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.panel"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Each review case expands to a human-readable confirmation history.
// ---------------------------------------------------------------------------

describe("Membership Review case card: expandable history", () => {
  it("expands to show a human-readable confirmation history", async () => {
    const user = userEvent.setup();
    renderCard(
      makeReview({
        confirmationHistory: [
          makeHistoryEntry({
            decision: ConfirmationDecision.Confirmed,
            simpleRelationship: SimpleRelationshipType.Sibling,
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

    // History is hidden until the case is expanded.
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
    expect(within(history).getByText(/Sibling/)).toBeInTheDocument();
    expect(within(history).getByText(/Parent/)).toBeInTheDocument();
  });

  it("shows a neutral message when no history has been recorded", async () => {
    const user = userEvent.setup();
    renderCard(makeReview({ confirmationHistory: [] }));

    await user.click(screen.getByTestId("membership_reviews.history_toggle.1"));

    expect(
      await screen.findByText(
        "No confirmations or disputes have been recorded yet.",
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. The reviews query is scoped to the active family.
// ---------------------------------------------------------------------------

describe("membership reviews query: family scoping", () => {
  it("passes the active familyId and keys the read by the family slot", async () => {
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

    // The active family id is passed to the backend and occupies query-key
    // index 1, so a Family A review never appears in Family B's cache.
    expect(calls.listMembershipConfirmationReviewsForSteward).toEqual([
      [FAMILY_A],
    ]);
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual(["membershipReviews", FAMILY_A, "list"]);
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
});

// ---------------------------------------------------------------------------
// 5. No account principals, technical ids, or sensitive relationship metadata
//    appear in the UI.
// ---------------------------------------------------------------------------

describe("Membership Reviews UI: privacy-safe rendering", () => {
  it("never renders a principal, technical id, or sensitive relationship label", async () => {
    setSteward(true);
    setReviews([
      makeReview({
        membershipId: 987654321n,
        pendingPersonId: "hudson",
        familyId: DEFAULT_FAMILY_ID,
        applicantDisplayName: "Hudson Norwood",
        simpleRelationship: SimpleRelationshipType.Sibling,
        confirmationHistory: [
          makeHistoryEntry({ confirmerDisplayName: "Clayton Norwood" }),
        ],
      }),
    ]);
    const { container } = renderReviewsPage();

    await screen.findByTestId("membership_reviews.case_item.1");
    const text = container.textContent ?? "";

    // No account principal and no technical id from the view.
    expect(text).not.toContain(STEWARD_ACCOUNT);
    expect(text).not.toContain("987654321");
    expect(text).not.toContain("hudson");
    // No sensitive relationship-context labels.
    for (const sensitive of [
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
    ]) {
      expect(text).not.toContain(sensitive);
    }
  });

  it("renders only the family-safe fields on the case card", () => {
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
  });

  it("keeps the family id assignable to the exported FamilyId alias", () => {
    const familyId: FamilyId = DEFAULT_FAMILY_ID;
    expect(familyId).toBe("norwood");
  });
});
