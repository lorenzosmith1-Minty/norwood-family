import "@testing-library/jest-dom/vitest";
import {
  type FamilyMembership,
  MembershipConfirmationError,
  MembershipConfirmationResolution,
  type MembershipConfirmationReviewView,
  MembershipConfirmationState,
  MembershipStatus,
  type Result_5,
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
  isAlreadySettledError,
  useResolveMembershipConfirmation,
} from "./hooks/useMembershipReviews";
import { FamilyStewardMembershipReviewsPage } from "./pages/FamilyStewardMembershipReviewsPage";

// ---------------------------------------------------------------------------
// Cover for the Family Steward Membership Review RESOLUTION actions.
//
// The accepted change requires:
//
//   1. each review case shows Approve Membership, Reject Membership, and Needs
//      More Information;
//   2. Approve and Reject each open a confirmation dialog before submitting;
//      cancelling closes it without submitting;
//   3. Needs More Information submits directly, with no dialog;
//   4. all three call `resolveMembershipConfirmation(activeFamilyId,
//      caseMembershipId, resolution)`;
//   5. after a successful Approve or Reject the resolved case is removed from
//      the review list and a neutral success message is shown;
//   6. after a successful Needs More Information the case stays in the list and
//      a neutral success message is shown;
//   7. after a successful action only the active family's confirmation,
//      membership, and Steward review caches are invalidated — another family's
//      caches are untouched;
//   8. a case already resolved elsewhere settles into a neutral state with no
//      technical tag or private reason;
//   9. a failed resolution shows a neutral error message;
//  10. a failed review read shows a neutral error state with Retry and never an
//      empty list, and Retry re-runs the query.
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
  setReviewsError,
  setResolveResult,
  setRemoveResolvedOnSuccess,
} = vi.hoisted(() => {
  const calls: {
    listMembershipConfirmationReviewsForSteward: unknown[][];
    resolveMembershipConfirmation: unknown[][];
  } = {
    listMembershipConfirmationReviewsForSteward: [],
    resolveMembershipConfirmation: [],
  };

  let isSteward = false;
  let reviews: MembershipConfirmationReviewView[] = [];
  let reviewsError: MembershipConfirmationError | null = null;
  let resolveResult: unknown = null;
  // When true, a successful resolution removes the resolved membership from the
  // backend's unresolved list, so the next review read returns it without that
  // case. This models the real backend, where Approve/Reject resolve the case
  // and Needs More Information leaves it open.
  let removeResolvedOnSuccess = false;

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
      if (reviewsError !== null) {
        return { __kind__: "err", err: reviewsError };
      }
      return { __kind__: "ok", ok: reviews };
    },
    async resolveMembershipConfirmation(...args: unknown[]): Promise<Result_5> {
      calls.resolveMembershipConfirmation.push(args);
      const result = resolveResult as Result_5;
      if (
        removeResolvedOnSuccess &&
        result?.__kind__ === "ok" &&
        args[2] !== MembershipConfirmationResolution.NeedsMoreInformation
      ) {
        const resolvedId = args[1];
        reviews = reviews.filter(
          (review) => review.membershipId !== resolvedId,
        );
      }
      return result;
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
      resolveResult = null;
      removeResolvedOnSuccess = false;
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
    setResolveResult: (v: unknown) => {
      resolveResult = v;
    },
    setRemoveResolvedOnSuccess: (v: boolean) => {
      removeResolvedOnSuccess = v;
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

function makeMembership(
  overrides: Partial<FamilyMembership> = {},
): FamilyMembership {
  return {
    id: 3n,
    status: MembershipStatus.Active,
    accountId: Principal.fromText(STEWARD_ACCOUNT),
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    personId: "hudson",
    familyId: DEFAULT_FAMILY_ID,
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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderReviewsPage(
  familyId: string = DEFAULT_FAMILY_ID,
  queryClient: QueryClient = makeQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={familyId}>
        <FamilyStewardMembershipReviewsPage onBack={() => {}} />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

function renderCard(
  review: MembershipConfirmationReviewView,
  queryClient: QueryClient = makeQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={DEFAULT_FAMILY_ID}>
        <MembershipReviewCaseCard review={review} position={1} />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// 1. Each case shows the three resolution actions.
// ---------------------------------------------------------------------------

describe("Membership Review case card: resolution actions (cover)", () => {
  it("shows Approve Membership, Reject Membership, and Needs More Information", () => {
    renderCard(makeReview());

    expect(
      screen.getByTestId("membership_reviews.approve_button.1"),
    ).toHaveTextContent("Approve Membership");
    expect(
      screen.getByTestId("membership_reviews.reject_button.1"),
    ).toHaveTextContent("Reject Membership");
    expect(
      screen.getByTestId("membership_reviews.needs_info_button.1"),
    ).toHaveTextContent("Needs More Information");
  });

  // -------------------------------------------------------------------------
  // 2. Approve / Reject open a confirmation dialog; cancelling closes it
  //    without submitting.
  // -------------------------------------------------------------------------

  it("opens a confirmation dialog for Approve and cancelling does not submit", async () => {
    const user = userEvent.setup();
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));

    const dialog = await screen.findByTestId(
      "membership_reviews.confirm_dialog.1",
    );
    expect(
      within(dialog).getByText("Approve this membership?"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByTestId("membership_reviews.confirm_cancel_button.1"),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("membership_reviews.confirm_dialog.1"),
      ).not.toBeInTheDocument(),
    );
    expect(calls.resolveMembershipConfirmation).toEqual([]);
  });

  it("opens a confirmation dialog for Reject and cancelling does not submit", async () => {
    const user = userEvent.setup();
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.reject_button.1"));

    const dialog = await screen.findByTestId(
      "membership_reviews.confirm_dialog.1",
    );
    expect(
      within(dialog).getByText("Reject this membership?"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByTestId("membership_reviews.confirm_cancel_button.1"),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("membership_reviews.confirm_dialog.1"),
      ).not.toBeInTheDocument(),
    );
    expect(calls.resolveMembershipConfirmation).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 3. Confirming Approve / Reject calls resolveMembershipConfirmation with the
  //    active family, the case membership, and the resolution.
  // -------------------------------------------------------------------------

  it("confirming Approve calls resolveMembershipConfirmation with the active family, membership, and Approve", async () => {
    const user = userEvent.setup();
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    renderCard(makeReview({ membershipId: 7n }));

    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    await waitFor(() =>
      expect(calls.resolveMembershipConfirmation).toEqual([
        [DEFAULT_FAMILY_ID, 7n, MembershipConfirmationResolution.Approve],
      ]),
    );
  });

  it("confirming Reject calls resolveMembershipConfirmation with the active family, membership, and Reject", async () => {
    const user = userEvent.setup();
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    renderCard(makeReview({ membershipId: 9n }));

    await user.click(screen.getByTestId("membership_reviews.reject_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    await waitFor(() =>
      expect(calls.resolveMembershipConfirmation).toEqual([
        [DEFAULT_FAMILY_ID, 9n, MembershipConfirmationResolution.Reject],
      ]),
    );
  });

  it("Needs More Information submits directly with the active family, membership, and NeedsMoreInformation", async () => {
    const user = userEvent.setup();
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    renderCard(makeReview({ membershipId: 11n }));

    await user.click(
      screen.getByTestId("membership_reviews.needs_info_button.1"),
    );

    // No confirmation dialog for Needs More Information.
    expect(
      screen.queryByTestId("membership_reviews.confirm_dialog.1"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(calls.resolveMembershipConfirmation).toEqual([
        [
          DEFAULT_FAMILY_ID,
          11n,
          MembershipConfirmationResolution.NeedsMoreInformation,
        ],
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // 4. Neutral success messages after a successful action.
  // -------------------------------------------------------------------------

  it("shows a neutral success message after a successful Approve", async () => {
    const user = userEvent.setup();
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "membership_reviews.case_result.1",
    );
    expect(within(result).getByText("Membership approved")).toBeInTheDocument();
  });

  it("shows a neutral success message after a successful Reject", async () => {
    const user = userEvent.setup();
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.reject_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "membership_reviews.case_result.1",
    );
    expect(within(result).getByText("Membership rejected")).toBeInTheDocument();
  });

  it("shows a neutral success message after a successful Needs More Information", async () => {
    const user = userEvent.setup();
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    renderCard(makeReview());

    await user.click(
      screen.getByTestId("membership_reviews.needs_info_button.1"),
    );

    const result = await screen.findByTestId(
      "membership_reviews.case_result.1",
    );
    expect(
      within(result).getByText("More information requested"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 5. A case already resolved elsewhere settles into a neutral state with no
  //    technical tag or private reason.
  // -------------------------------------------------------------------------

  it("settles into a neutral state when the case was already resolved elsewhere", async () => {
    const user = userEvent.setup();
    setResolveResult({
      __kind__: "err",
      err: MembershipConfirmationError.AlreadyDecided,
    });
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "membership_reviews.case_result.1",
    );
    expect(
      within(result).getByText("This case was already settled"),
    ).toBeInTheDocument();
    // No technical error tag or private reason is exposed.
    expect(result.textContent ?? "").not.toContain("AlreadyDecided");
  });

  // -------------------------------------------------------------------------
  // 6. A failed resolution shows a neutral error message.
  // -------------------------------------------------------------------------

  it("shows a neutral error message when the resolution fails", async () => {
    const user = userEvent.setup();
    setResolveResult({
      __kind__: "err",
      err: MembershipConfirmationError.NotAuthorized,
    });
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "membership_reviews.case_result.1",
    );
    expect(
      within(result).getByText("We couldn't record your decision"),
    ).toBeInTheDocument();
    expect(result.textContent ?? "").not.toContain("NotAuthorized");
  });
});

// ---------------------------------------------------------------------------
// 7. Resolved cases are removed from the review list; Needs More Information
//    cases remain available.
// ---------------------------------------------------------------------------

describe("Membership Reviews page: resolved-case removal (cover)", () => {
  it("removes an approved case from the review list after a successful resolution", async () => {
    const user = userEvent.setup();
    setSteward(true);
    setReviews([makeReview({ membershipId: 3n })]);
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    // A successful Approve resolves the case, so the backend's unresolved list
    // no longer contains it on the next read.
    setRemoveResolvedOnSuccess(true);
    renderReviewsPage();

    await screen.findByTestId("membership_reviews.case_item.1");
    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    // The refreshed list is empty and the resolved case is gone.
    await waitFor(() =>
      expect(
        screen.queryByTestId("membership_reviews.case_item.1"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Nothing awaiting review")).toBeInTheDocument();
  });

  it("removes a rejected case from the review list after a successful resolution", async () => {
    const user = userEvent.setup();
    setSteward(true);
    setReviews([makeReview({ membershipId: 3n })]);
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    setRemoveResolvedOnSuccess(true);
    renderReviewsPage();

    await screen.findByTestId("membership_reviews.case_item.1");
    await user.click(screen.getByTestId("membership_reviews.reject_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("membership_reviews.case_item.1"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Nothing awaiting review")).toBeInTheDocument();
  });

  it("keeps a Needs More Information case in the review list after a successful resolution", async () => {
    const user = userEvent.setup();
    setSteward(true);
    setReviews([makeReview({ membershipId: 3n })]);
    setResolveResult({ __kind__: "ok", ok: makeMembership() });
    // Needs More Information leaves the case open, so the backend keeps it.
    setRemoveResolvedOnSuccess(true);
    renderReviewsPage();

    await screen.findByTestId("membership_reviews.case_item.1");
    await user.click(
      screen.getByTestId("membership_reviews.needs_info_button.1"),
    );

    // The case stays open on the backend, so the refreshed list still contains
    // it and the case remains available.
    await waitFor(() =>
      expect(
        screen.getByTestId("membership_reviews.case_item.1"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Nothing awaiting review"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. After a successful action only the active family's confirmation,
//    membership, and Steward review caches are invalidated.
// ---------------------------------------------------------------------------

describe("membership review resolution: family-exact invalidation (cover)", () => {
  it("invalidates only the active family's confirmation, membership, and review caches", async () => {
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    setResolveResult({ __kind__: "ok", ok: makeMembership() });

    const { result } = renderHook(() => useResolveMembershipConfirmation(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    queryClient.setQueryData(["membershipConfirmation", FAMILY_A, "x"], null);
    queryClient.setQueryData(["membershipConfirmation", FAMILY_B, "x"], null);
    queryClient.setQueryData(["myMembership", FAMILY_A], null);
    queryClient.setQueryData(["myMembership", FAMILY_B], null);
    queryClient.setQueryData(["membershipReviews", FAMILY_A, "list"], []);
    queryClient.setQueryData(["membershipReviews", FAMILY_B, "list"], []);

    await result.current.mutateAsync({
      membershipId: 3n,
      resolution: MembershipConfirmationResolution.Approve,
    });

    // The active family's caches are refreshed.
    expect(
      queryClient.getQueryState(["membershipConfirmation", FAMILY_A, "x"])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["myMembership", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["membershipReviews", FAMILY_A, "list"])
        ?.isInvalidated,
    ).toBe(true);

    // Family B's caches are untouched.
    expect(
      queryClient.getQueryState(["membershipConfirmation", FAMILY_B, "x"])
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["myMembership", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["membershipReviews", FAMILY_B, "list"])
        ?.isInvalidated,
    ).toBe(false);

    // No bare cross-family prefix is used for the review or confirmation caches.
    const reviewFilters = invalidateSpy.mock.calls
      .map(
        ([filters]) => filters as { queryKey?: unknown[]; predicate?: unknown },
      )
      .filter((filters) => filters.queryKey?.[0] === "membershipReviews");
    for (const filters of reviewFilters) {
      expect(filters.queryKey).toEqual(["membershipReviews"]);
      expect(typeof filters.predicate).toBe("function");
    }
  });

  it("maps every case-change error to the neutral already-settled state", () => {
    for (const err of [
      MembershipConfirmationError.MembershipNotPending,
      MembershipConfirmationError.AlreadyDecided,
      MembershipConfirmationError.MembershipNotFound,
      MembershipConfirmationError.FamilyNotFound,
      MembershipConfirmationError.NoActiveMembership,
      MembershipConfirmationError.NoQualifyingRelationship,
      MembershipConfirmationError.ActivationFailed,
    ]) {
      expect(isAlreadySettledError(err)).toBe(true);
    }
    // Authorization errors are not case changes and stay errors.
    expect(
      isAlreadySettledError(MembershipConfirmationError.NotAuthorized),
    ).toBe(false);
    expect(isAlreadySettledError(MembershipConfirmationError.NotSteward)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// 9. A failed review read shows a neutral error state with Retry and never an
//    empty list; Retry re-runs the query.
// ---------------------------------------------------------------------------

describe("Membership Reviews page: failed read (cover)", () => {
  it("shows a neutral error state with Retry and never an empty list", async () => {
    setSteward(true);
    setReviewsError(MembershipConfirmationError.NotAuthorized);
    renderReviewsPage();

    expect(
      await screen.findByTestId("membership_reviews.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("membership_reviews.retry_button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nothing awaiting review"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/NotAuthorized/)).not.toBeInTheDocument();
  });

  it("re-runs the review query when Retry is clicked", async () => {
    const user = userEvent.setup();
    setSteward(true);
    setReviewsError(MembershipConfirmationError.NotAuthorized);
    renderReviewsPage();

    await screen.findByTestId("membership_reviews.error_state");
    const callsBefore =
      calls.listMembershipConfirmationReviewsForSteward.length;

    // The backend recovers, so the retried read succeeds.
    setReviewsError(null);
    setReviews([makeReview()]);
    await user.click(screen.getByTestId("membership_reviews.retry_button"));

    await waitFor(() =>
      expect(
        calls.listMembershipConfirmationReviewsForSteward.length,
      ).toBeGreaterThan(callsBefore),
    );
    expect(
      await screen.findByTestId("membership_reviews.case_item.1"),
    ).toBeInTheDocument();
  });
});
