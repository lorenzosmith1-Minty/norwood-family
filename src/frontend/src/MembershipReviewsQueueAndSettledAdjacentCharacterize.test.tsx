import "@testing-library/jest-dom/vitest";
import {
  type FamilyMembership,
  MembershipConfirmationError,
  MembershipConfirmationResolution,
  type MembershipConfirmationReviewView,
  MembershipConfirmationState,
  MembershipStatus,
  type Result_6,
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
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipReviewCaseCard } from "./components/MembershipReviewCaseCard";
import { FamilyStewardMembershipReviewsPage } from "./pages/FamilyStewardMembershipReviewsPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the
// Phase 1D-C Steward membership-review change must NOT disturb.
//
// The request may intentionally change the review surface's action set (the
// accepted requirements name exactly two resolution actions) and the way a
// resolved case is presented (a read-only resolved state rather than removal
// from the list). This file deliberately does NOT freeze either of those: it
// asserts neither the number of action buttons nor that a resolved case leaves
// the list.
//
// What it protects is the existing behavior the change is layered onto and must
// reuse rather than reimplement:
//
//   A. The queue renders BOTH reviewable case kinds the canonical Steward read
//      returns — a conflicting `#StewardReviewRequired` case and a standalone
//      `#RejectedByRelative` case — and never client-side drops one. The
//      accepted requirement ("only NeedsStewardReview and
//      Rejected/Disputed-awaiting-resolution cases") depends on this.
//   B. A case already settled elsewhere (`#AlreadyDecided` and the other
//      case-change errors) settles into a neutral, read-only state with no
//      action buttons and no technical tag or private reason. The accepted
//      "read-only resolved states" requirement builds on this.
//   C. While a resolution is in flight the action controls are disabled, so a
//      second submission cannot be started from the same card. The accepted
//      "duplicate-submission prevention" requirement builds on this.
//   D. The queue keeps rendering only family-safe fields: no account principal,
//      no technical id, and no sensitive relationship-context label.
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
  setReviews,
  setResolveResult,
  setResolvePending,
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
  let resolveResult: unknown = null;
  let resolvePending = false;

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async listMembershipConfirmationReviewsForSteward(
      ...args: unknown[]
    ): Promise<Result_25> {
      calls.listMembershipConfirmationReviewsForSteward.push(args);
      return { __kind__: "ok", ok: reviews };
    },
    async resolveMembershipConfirmation(...args: unknown[]): Promise<Result_6> {
      calls.resolveMembershipConfirmation.push(args);
      if (resolvePending) {
        return new Promise<Result_6>(() => {});
      }
      return resolveResult as Result_6;
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
      resolveResult = null;
      resolvePending = false;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setReviews: (v: MembershipConfirmationReviewView[]) => {
      reviews = v;
    },
    setResolveResult: (v: unknown) => {
      resolveResult = v;
    },
    setResolvePending: (v: boolean) => {
      resolvePending = v;
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

function renderReviewsPage(queryClient: QueryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={DEFAULT_FAMILY_ID}>
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
// A. The queue renders both reviewable case kinds and never drops one.
// ---------------------------------------------------------------------------

describe("Membership Reviews queue: both reviewable case kinds render (characterization)", () => {
  it("renders a conflicting #StewardReviewRequired case and a standalone #RejectedByRelative case", async () => {
    setSteward(true);
    setReviews([
      makeReview({
        membershipId: 3n,
        applicantDisplayName: "Hudson Norwood",
        confirmationState: MembershipConfirmationState.StewardReviewRequired,
        confirmedCount: 1n,
        disputedCount: 1n,
      }),
      makeReview({
        membershipId: 4n,
        applicantDisplayName: "Versie Norwood",
        confirmationState: MembershipConfirmationState.RejectedByRelative,
        confirmedCount: 0n,
        disputedCount: 1n,
      }),
    ]);
    renderReviewsPage();

    // Both cases are present; neither reviewable kind is filtered out
    // client-side.
    const first = await screen.findByTestId("membership_reviews.case_item.1");
    const second = await screen.findByTestId("membership_reviews.case_item.2");
    expect(within(first).getByText("Hudson Norwood")).toBeInTheDocument();
    expect(within(second).getByText("Versie Norwood")).toBeInTheDocument();
    expect(
      screen.getByTestId("membership_reviews.confirmed_count.1"),
    ).toHaveTextContent("1 confirmed");
    expect(
      screen.getByTestId("membership_reviews.disputed_count.2"),
    ).toHaveTextContent("1 disputed");
  });

  it("keeps the queue scoped to the active family's canonical read", async () => {
    setSteward(true);
    setReviews([makeReview()]);
    renderReviewsPage();

    await screen.findByTestId("membership_reviews.case_item.1");
    expect(calls.listMembershipConfirmationReviewsForSteward).toEqual([
      [DEFAULT_FAMILY_ID],
    ]);
  });
});

// ---------------------------------------------------------------------------
// B. A case already settled elsewhere settles into a neutral read-only state.
// ---------------------------------------------------------------------------

describe("Membership Review case card: settled case is read-only (characterization)", () => {
  it("renders a neutral settled state with no action buttons when the case was already decided", async () => {
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
    // The settled state is read-only: no resolution controls remain.
    expect(
      screen.queryByTestId("membership_reviews.approve_button.1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("membership_reviews.reject_button.1"),
    ).not.toBeInTheDocument();
    // No technical error tag or private reason is exposed.
    expect(result.textContent ?? "").not.toContain("AlreadyDecided");
  });

  it("renders a neutral settled state for a membership that is no longer pending", async () => {
    const user = userEvent.setup();
    setResolveResult({
      __kind__: "err",
      err: MembershipConfirmationError.MembershipNotPending,
    });
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.reject_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    const result = await screen.findByTestId(
      "membership_reviews.case_result.1",
    );
    expect(
      within(result).getByText("This case was already settled"),
    ).toBeInTheDocument();
    expect(result.textContent ?? "").not.toContain("MembershipNotPending");
  });
});

// ---------------------------------------------------------------------------
// C. Duplicate-submission prevention while a resolution is in flight.
// ---------------------------------------------------------------------------

describe("Membership Review case card: in-flight submission is guarded (characterization)", () => {
  it("disables the action controls while a resolution is submitting", async () => {
    const user = userEvent.setup();
    setResolvePending(true);
    renderCard(makeReview());

    await user.click(screen.getByTestId("membership_reviews.approve_button.1"));
    await user.click(
      await screen.findByTestId("membership_reviews.confirm_submit_button.1"),
    );

    // The card reports the in-flight state and the action controls are
    // disabled, so a second submission cannot be started from this card.
    await screen.findByTestId("membership_reviews.submitting_state.1");
    expect(
      screen.getByTestId("membership_reviews.approve_button.1"),
    ).toBeDisabled();
    expect(
      screen.getByTestId("membership_reviews.reject_button.1"),
    ).toBeDisabled();
    // Only the single confirmed submission was sent.
    expect(calls.resolveMembershipConfirmation).toEqual([
      [DEFAULT_FAMILY_ID, 3n, MembershipConfirmationResolution.Approve],
    ]);
  });
});

// ---------------------------------------------------------------------------
// D. The queue keeps rendering only family-safe fields.
// ---------------------------------------------------------------------------

describe("Membership Reviews queue: privacy-safe rendering (characterization)", () => {
  it("never renders a principal, technical id, or sensitive relationship label", async () => {
    setSteward(true);
    setReviews([
      makeReview({
        membershipId: 987654321n,
        pendingPersonId: "hudson",
        applicantDisplayName: "Hudson Norwood",
        confirmationState: MembershipConfirmationState.RejectedByRelative,
      }),
    ]);
    const { container } = renderReviewsPage();

    await screen.findByTestId("membership_reviews.case_item.1");
    const text = container.textContent ?? "";

    expect(text).toContain("Hudson Norwood");
    expect(text).not.toContain(STEWARD_ACCOUNT);
    expect(text).not.toContain("987654321");
    expect(text).not.toContain("hudson");
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

  it("keeps the resolved membership shape assignable to the exported type", () => {
    const membership: FamilyMembership = makeMembership();
    expect(membership.status).toBe(MembershipStatus.Active);
    expect(membership.familyId).toBe(DEFAULT_FAMILY_ID);
  });
});

// ---------------------------------------------------------------------------
// E. The page keeps self-gating on the canonical Steward authority.
// ---------------------------------------------------------------------------

describe("Membership Reviews page: Steward gating stays intact (characterization)", () => {
  it("renders the unauthorized state for a non-Steward and never the queue", async () => {
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

  it("renders the queue for an authorized Steward", async () => {
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
});
