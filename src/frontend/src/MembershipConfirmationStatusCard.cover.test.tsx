import "@testing-library/jest-dom/vitest";
import {
  ConfirmationDecision,
  MembershipConfirmationState,
  MembershipStatus,
  SimpleRelationshipType,
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
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipConfirmationStatusCard } from "./components/MembershipConfirmationStatusCard";

// ---------------------------------------------------------------------------
// Cover for the applicant-safe confirmation STATUS card.
//
// A user whose own membership is Pending sees this simple status card inside
// the existing limited onboarding state. It reads through the applicant-safe
// confirmation-state read (`getMyMembershipConfirmationState`), which is
// redacted: it never reveals who disputed them, any confirmer account id, or
// sensitive relationship context.
//
// The accepted change renders one calm line per derived state:
//   - AWAITING             -> "Waiting for a family member to confirm your connection."
//   - APPROVED BY RELATIVE -> "Your family connection has been confirmed."
//   - STEWARD REVIEW       -> "Your family connection needs Family Steward review."
//   - RESOLVED / APPROVED  -> "Your family membership is confirmed."
//   - RESOLVED / NOT APPROVED -> "Your membership request was not approved."
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls, setApplicantView } = vi.hoisted(() => {
  const calls: { getMyMembershipConfirmationState: unknown[][] } = {
    getMyMembershipConfirmationState: [],
  };

  let applicantView: unknown = {
    __kind__: "ok",
    ok: {
      state: "AwaitingConfirmation",
      myDecision: undefined,
      myRelationship: undefined,
      myDecidedAt: undefined,
      createdAt: 1_700_000_000_000_000_000n,
      updatedAt: 1_700_000_000_000_000_000n,
    },
  };

  const mockActor = {
    async getMyMembershipConfirmationState(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.getMyMembershipConfirmationState.push(args);
      return applicantView;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.getMyMembershipConfirmationState.length = 0;
      applicantView = {
        __kind__: "ok",
        ok: {
          state: "AwaitingConfirmation",
          myDecision: undefined,
          myRelationship: undefined,
          myDecidedAt: undefined,
          createdAt: 1_700_000_000_000_000_000n,
          updatedAt: 1_700_000_000_000_000_000n,
        },
      };
    },
    setApplicantView: (value: unknown) => {
      applicantView = value;
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

function renderCard(props: {
  membershipId?: bigint | null;
  membershipStatus?: MembershipStatus | null;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>
        <MembershipConfirmationStatusCard
          membershipId={
            props.membershipId === undefined ? 3n : props.membershipId
          }
          membershipStatus={props.membershipStatus ?? null}
        />
      </FamilyProvider>
    </QueryClientProvider>,
  );
}

function setState(
  state: MembershipConfirmationState,
  overrides: Record<string, unknown> = {},
) {
  setApplicantView({
    __kind__: "ok",
    ok: {
      state,
      myDecision: undefined,
      myRelationship: undefined,
      myDecidedAt: undefined,
      createdAt: 1_700_000_000_000_000_000n,
      updatedAt: 1_700_000_000_000_000_000n,
      ...overrides,
    },
  });
}

describe("applicant status card: derived states (cover)", () => {
  it("AWAITING shows the waiting-for-a-family-member line", async () => {
    setState(MembershipConfirmationState.AwaitingConfirmation);
    renderCard({});

    expect(
      await screen.findByText(
        "Waiting for a family member to confirm your connection.",
      ),
    ).toBeInTheDocument();
  });

  it("APPROVED BY RELATIVE shows the connection-confirmed line", async () => {
    setState(MembershipConfirmationState.ApprovedByRelative);
    renderCard({});

    expect(
      await screen.findByText("Your family connection has been confirmed."),
    ).toBeInTheDocument();
  });

  it("STEWARD REVIEW shows the Family Steward review line", async () => {
    setState(MembershipConfirmationState.StewardReviewRequired);
    renderCard({});

    expect(
      await screen.findByText(
        "Your family connection needs Family Steward review.",
      ),
    ).toBeInTheDocument();
  });

  it("RESOLVED / APPROVED shows the membership-confirmed line", async () => {
    setState(MembershipConfirmationState.ResolvedBySteward);
    renderCard({ membershipStatus: MembershipStatus.Active });

    expect(
      await screen.findByText("Your family membership is confirmed."),
    ).toBeInTheDocument();
  });

  it("RESOLVED / NOT APPROVED shows the not-approved line", async () => {
    setState(MembershipConfirmationState.ResolvedBySteward);
    renderCard({ membershipStatus: MembershipStatus.Pending });

    expect(
      await screen.findByText("Your membership request was not approved."),
    ).toBeInTheDocument();
  });
});

describe("applicant status card: redaction (cover)", () => {
  it("never reveals who disputed the applicant or any confirmer account id", async () => {
    setState(MembershipConfirmationState.StewardReviewRequired, {
      myDecision: ConfirmationDecision.Disputed,
      myRelationship: SimpleRelationshipType.Sibling,
    });
    renderCard({});

    await screen.findByText(
      "Your family connection needs Family Steward review.",
    );
    const text = document.body.textContent ?? "";
    for (const leaked of [
      "confirmerAccountId",
      "confirmerPersonId",
      "relationshipId",
      "Biological",
      "Adoptive",
      "Foster",
      "Step",
      "Guardian",
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("issues no applicant read when the caller has no pending membership id", () => {
    renderCard({ membershipId: null });

    // The read is disabled without a membership id, so the backend is never
    // queried for a membership the caller does not have.
    expect(calls.getMyMembershipConfirmationState).toEqual([]);
  });

  it("renders no status content when the applicant read is not authorized", async () => {
    setApplicantView({
      __kind__: "err",
      err: "NotAuthorized",
    });
    renderCard({});

    // The hook resolves the error to null, so no status card is rendered.
    await waitFor(() =>
      expect(screen.queryByTestId("confirmation.status_card")).toBeNull(),
    );
  });
});

describe("applicant status card: family-scoped read (cover)", () => {
  it("reads the applicant-safe state for the active family and membership", async () => {
    renderCard({ membershipId: 9n });

    await screen.findByTestId("confirmation.status_card");
    expect(calls.getMyMembershipConfirmationState).toEqual([[FAMILY_A, 9n]]);
  });
});
