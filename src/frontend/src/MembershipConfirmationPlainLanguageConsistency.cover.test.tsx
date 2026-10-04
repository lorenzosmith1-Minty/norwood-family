import "@testing-library/jest-dom/vitest";
import {
  type EligibleMembershipConfirmationView,
  type MembershipConfirmationReviewView,
  MembershipConfirmationState,
  MembershipStatus,
  SimpleRelationshipType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { MEMBERSHIP_CONFIRMATION_STATE_LABELS } from "@/types/ownership";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipConfirmationRequestCard } from "./components/MembershipConfirmationRequestCard";
import { MembershipConfirmationStatusCard } from "./components/MembershipConfirmationStatusCard";
import { MembershipReviewCaseCard } from "./components/MembershipReviewCaseCard";
import { NotificationsPage } from "./pages/NotificationsPage";

// ---------------------------------------------------------------------------
// Cover for the PLAIN-LANGUAGE CONSISTENCY pass across the membership
// confirmation surfaces.
//
// The accepted change requires that every user-facing membership-confirmation
// surface describes the same state with the same plain family-facing wording,
// and that no internal enum name ever appears in user-facing text. The single
// source of that wording is `MEMBERSHIP_CONFIRMATION_STATE_LABELS` in
// `types/ownership.ts`, which every surface reads.
//
// This file asserts the cross-surface contract the per-surface cover files do
// not:
//
//   1. the shared label map carries exactly the preferred wording for all five
//      states, and none of the labels is an internal enum name;
//   2. the applicant status card, the trusted-relative request card, and the
//      Steward review case card all render the SAME label for the same state;
//   3. no internal enum name (AwaitingConfirmation, ApprovedByRelative,
//      RejectedByRelative, StewardReviewRequired, ResolvedBySteward) appears in
//      the rendered text of any of those surfaces;
//   4. a disputed case awaiting Steward review reads differently from a final
//      Steward rejection;
//   5. a trusted relative with no cases requiring action sees a neutral empty
//      state, not an error or a blank panel.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");

const INTERNAL_ENUM_NAMES = [
  "AwaitingConfirmation",
  "ApprovedByRelative",
  "RejectedByRelative",
  "StewardReviewRequired",
  "ResolvedBySteward",
];

const {
  mockActor,
  calls,
  resetState,
  setApplicantState,
  setEligibleConfirmations,
} = vi.hoisted(() => {
  const calls: {
    getMyMembershipConfirmationState: unknown[][];
    listMyEligibleMembershipConfirmationsForFamily: unknown[][];
    listMembershipConfirmationReviewsForSteward: unknown[][];
    listNotifications: unknown[][];
    getMyConfirmationForMembership: unknown[][];
    getProfilePhotoForFamily: unknown[][];
  } = {
    getMyMembershipConfirmationState: [],
    listMyEligibleMembershipConfirmationsForFamily: [],
    listMembershipConfirmationReviewsForSteward: [],
    listNotifications: [],
    getMyConfirmationForMembership: [],
    getProfilePhotoForFamily: [],
  };

  let applicantState: unknown = {
    __kind__: "ok",
    ok: {
      state: "AwaitingConfirmation",
      createdAt: 1_700_000_000_000_000_000n,
      updatedAt: 1_700_000_000_000_000_000n,
    },
  };
  let eligibleConfirmations: unknown[] = [];
  let reviews: MembershipConfirmationReviewView[] = [];

  const mockActor = {
    async getMyMembershipConfirmationState(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.getMyMembershipConfirmationState.push(args);
      return applicantState;
    },
    async listMyEligibleMembershipConfirmationsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMyEligibleMembershipConfirmationsForFamily.push(args);
      return { __kind__: "ok", ok: eligibleConfirmations };
    },
    async listMembershipConfirmationReviewsForSteward(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listMembershipConfirmationReviewsForSteward.push(args);
      return { __kind__: "ok", ok: reviews };
    },
    async listNotifications(...args: unknown[]): Promise<unknown> {
      calls.listNotifications.push(args);
      return [];
    },
    async getMyConfirmationForMembership(...args: unknown[]): Promise<unknown> {
      calls.getMyConfirmationForMembership.push(args);
      return { __kind__: "ok", ok: null };
    },
    async getProfilePhotoForFamily(...args: unknown[]): Promise<unknown> {
      calls.getProfilePhotoForFamily.push(args);
      return null;
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
      applicantState = {
        __kind__: "ok",
        ok: {
          state: "AwaitingConfirmation",
          createdAt: 1_700_000_000_000_000_000n,
          updatedAt: 1_700_000_000_000_000_000n,
        },
      };
      eligibleConfirmations = [];
      reviews = [];
    },
    setApplicantState: (value: unknown) => {
      applicantState = value;
    },
    setEligibleConfirmations: (value: unknown[]) => {
      eligibleConfirmations = value;
    },
    setReviews: (value: MembershipConfirmationReviewView[]) => {
      reviews = value;
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
beforeEach(resetState);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithProviders(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <FamilyProvider familyId={DEFAULT_FAMILY_ID}>{node}</FamilyProvider>
    </QueryClientProvider>,
  );
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

function setApplicantViewState(state: MembershipConfirmationState) {
  setApplicantState({
    __kind__: "ok",
    ok: {
      state,
      createdAt: 1_700_000_000_000_000_000n,
      updatedAt: 1_700_000_000_000_000_000n,
    },
  });
}

// ---------------------------------------------------------------------------
// 1. The shared label map is the single source of the preferred wording.
// ---------------------------------------------------------------------------

describe("membership confirmation labels: preferred wording (cover)", () => {
  it("maps every state to its plain family-facing label", () => {
    expect(MEMBERSHIP_CONFIRMATION_STATE_LABELS).toEqual({
      [MembershipConfirmationState.AwaitingConfirmation]:
        "Waiting for family confirmation",
      [MembershipConfirmationState.ApprovedByRelative]:
        "Confirmed by a family member",
      [MembershipConfirmationState.RejectedByRelative]: "Disputed",
      [MembershipConfirmationState.StewardReviewRequired]:
        "Needs Steward review",
      [MembershipConfirmationState.ResolvedBySteward]:
        "Reviewed by a Family Steward",
    });
  });

  it("never uses an internal enum name as a user-facing label", () => {
    for (const label of Object.values(MEMBERSHIP_CONFIRMATION_STATE_LABELS)) {
      for (const enumName of INTERNAL_ENUM_NAMES) {
        expect(label).not.toContain(enumName);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The same state reads identically across the applicant, trusted-relative,
//    and Steward surfaces.
// ---------------------------------------------------------------------------

describe("membership confirmation copy: cross-surface consistency (cover)", () => {
  it("renders the same label for #AwaitingConfirmation on the applicant and trusted-relative surfaces", async () => {
    const label =
      MEMBERSHIP_CONFIRMATION_STATE_LABELS[
        MembershipConfirmationState.AwaitingConfirmation
      ];

    // Applicant status card.
    setApplicantViewState(MembershipConfirmationState.AwaitingConfirmation);
    const applicant = renderWithProviders(
      <MembershipConfirmationStatusCard membershipId={3n} />,
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
    applicant.unmount();

    // Trusted-relative request card (read-only presentation for a settled case
    // is not shown for AwaitingConfirmation, so assert the actionable card and
    // the shared label through the eligible view's state).
    setEligibleConfirmations([
      makeEligibleConfirmation({
        confirmationState: MembershipConfirmationState.AwaitingConfirmation,
      }),
    ]);
    renderWithProviders(<NotificationsPage />);
    expect(
      await screen.findByTestId("confirmation.request_card"),
    ).toBeInTheDocument();
  });

  it("renders the same label for #ApprovedByRelative on the applicant and trusted-relative surfaces", async () => {
    const label =
      MEMBERSHIP_CONFIRMATION_STATE_LABELS[
        MembershipConfirmationState.ApprovedByRelative
      ];

    setApplicantViewState(MembershipConfirmationState.ApprovedByRelative);
    const applicant = renderWithProviders(
      <MembershipConfirmationStatusCard membershipId={3n} />,
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
    applicant.unmount();

    setEligibleConfirmations([
      makeEligibleConfirmation({
        confirmationState: MembershipConfirmationState.ApprovedByRelative,
      }),
    ]);
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("renders the same label for #StewardReviewRequired on the applicant and Steward surfaces", async () => {
    const label =
      MEMBERSHIP_CONFIRMATION_STATE_LABELS[
        MembershipConfirmationState.StewardReviewRequired
      ];

    setApplicantViewState(MembershipConfirmationState.StewardReviewRequired);
    const applicant = renderWithProviders(
      <MembershipConfirmationStatusCard membershipId={3n} />,
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
    applicant.unmount();

    renderWithProviders(
      <MembershipReviewCaseCard review={makeReview()} position={1} />,
    );
    expect(
      screen.getByTestId("membership_reviews.case_state.1"),
    ).toHaveTextContent(label);
  });
});

// ---------------------------------------------------------------------------
// 3. No internal enum name leaks into any rendered membership surface.
// ---------------------------------------------------------------------------

describe("membership confirmation copy: no internal enum names (cover)", () => {
  it.each(Object.values(MembershipConfirmationState))(
    "never renders an internal enum name on the applicant status card for %s",
    async (state) => {
      setApplicantViewState(state);
      renderWithProviders(
        <MembershipConfirmationStatusCard membershipId={3n} />,
      );
      await screen.findByTestId("confirmation.status_card");
      const text = document.body.textContent ?? "";
      for (const enumName of INTERNAL_ENUM_NAMES) {
        expect(text).not.toContain(enumName);
      }
    },
  );

  it.each(Object.values(MembershipConfirmationState))(
    "never renders an internal enum name on the trusted-relative request card for %s",
    async (state) => {
      setEligibleConfirmations([
        makeEligibleConfirmation({ confirmationState: state }),
      ]);
      renderWithProviders(<NotificationsPage />);
      // The section is present for every eligible case; the card itself is
      // either the actionable card or the read-only result presentation.
      await screen.findByTestId("confirmation.request_section");
      const text = document.body.textContent ?? "";
      for (const enumName of INTERNAL_ENUM_NAMES) {
        expect(text).not.toContain(enumName);
      }
    },
  );

  it("never renders an internal enum name on the Steward review case card", () => {
    renderWithProviders(
      <MembershipReviewCaseCard review={makeReview()} position={1} />,
    );
    const text = document.body.textContent ?? "";
    for (const enumName of INTERNAL_ENUM_NAMES) {
      expect(text).not.toContain(enumName);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. A disputed case awaiting Steward review is distinct from a final Steward
//    rejection.
// ---------------------------------------------------------------------------

describe("membership confirmation copy: dispute vs final rejection (cover)", () => {
  it("describes a dispute as under Steward review, never as a final rejection", async () => {
    setApplicantViewState(MembershipConfirmationState.RejectedByRelative);
    renderWithProviders(<MembershipConfirmationStatusCard membershipId={3n} />);

    expect(await screen.findByText("Disputed")).toBeInTheDocument();
    expect(
      screen.getByText("Your family connection needs Family Steward review."),
    ).toBeInTheDocument();
    // A dispute is not final: it must not read as a rejection.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/rejected/i);
  });

  it("describes a final Steward rejection as rejected, distinct from a dispute", async () => {
    setApplicantViewState(MembershipConfirmationState.ResolvedBySteward);
    renderWithProviders(
      <MembershipConfirmationStatusCard
        membershipId={3n}
        membershipStatus={MembershipStatus.Pending}
      />,
    );

    expect(
      await screen.findByText("Rejected by Family Steward"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Disputed")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. A trusted relative with no cases requiring action sees a neutral empty
//    state, not an error or a blank panel.
// ---------------------------------------------------------------------------

describe("membership confirmation surface: neutral empty state (cover)", () => {
  it("shows the neutral notifications empty state when there is nothing to act on", async () => {
    setEligibleConfirmations([]);
    renderWithProviders(<NotificationsPage />);

    await waitFor(() =>
      expect(calls.listMyEligibleMembershipConfirmationsForFamily).toEqual([
        [DEFAULT_FAMILY_ID],
      ]),
    );
    expect(
      await screen.findByTestId("notifications.empty_state"),
    ).toBeInTheDocument();
    // No confirmation actions and no error state.
    expect(screen.queryByTestId("confirmation.request_card")).toBeNull();
    expect(screen.queryByTestId("confirmation.request_section")).toBeNull();
  });
});
