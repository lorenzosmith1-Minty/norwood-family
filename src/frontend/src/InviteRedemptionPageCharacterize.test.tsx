import {
  type FamilyInvitation,
  FamilyInvitationError,
  type FamilyInvitationPreview,
  type InvitationRedemptionState,
  InvitationStatus,
  InvitationType,
  MembershipConfirmationState,
  MembershipStatus,
  type Result,
  type Result_29,
  type Result_31,
} from "@/backend";
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

import { InviteRedemptionPage } from "./pages/InviteRedemptionPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the InviteRedemptionPage terminal and
// signed-out states that the upcoming change must NOT disturb.
//
// The upcoming change intentionally alters:
//
//   - the #AlreadyMember disambiguation (today any membership renders
//     "Already connected"; the new behavior distinguishes same-profile Active
//     from different-profile/Suspended/Left and from claimed-by-someone-else),
//   - the AlreadyAccepted and FoundingSteward post-accept copy,
//   - the App-level lifecycle around the saved invite origin and the URL token.
//
// This file deliberately does NOT freeze any of those. What it protects is the
// EXISTING page contract the change must leave intact:
//
//   A. A missing token renders the invalid-link state.
//   B. A signed-out visitor sees the safe preview (family name, invited
//      profile, invitation type, expiry) and the sign-in gate, and the raw
//      token is persisted before sign-in.
//   C. The terminal states that are NOT changing — Declined, Cancelled,
//      Expired, InvalidToken — render their safe notice, and the
//      `onConsumed` affordance is wired.
//   D. A successful #FamilyMember accept renders the pending-membership state
//      and does NOT call `onConsumed` immediately; a successful
//      #FoundingSteward accept renders the steward-nomination state.
//   E. The preview never surfaces sensitive relationship context.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls, setMyMembership, setApplicantState } =
  vi.hoisted(() => {
    const calls: {
      validateFamilyInvitationToken: unknown[][];
      getInvitationRedemptionState: unknown[][];
      acceptFamilyInvitation: unknown[][];
      declineFamilyInvitation: unknown[][];
      getMyMembershipForFamily: unknown[][];
      getMyMembershipConfirmationState: unknown[][];
    } = {
      validateFamilyInvitationToken: [],
      getInvitationRedemptionState: [],
      acceptFamilyInvitation: [],
      declineFamilyInvitation: [],
      getMyMembershipForFamily: [],
      getMyMembershipConfirmationState: [],
    };

    let myMembership: unknown = { __kind__: "ok", ok: null };
    let applicantState: unknown = {
      __kind__: "ok",
      ok: {
        state: "AwaitingConfirmation",
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      },
    };

    const mockActor = {
      async validateFamilyInvitationToken(
        ...args: unknown[]
      ): Promise<unknown> {
        calls.validateFamilyInvitationToken.push(args);
        return { __kind__: "err", err: FamilyInvitationError.InvalidToken };
      },
      async getInvitationRedemptionState(...args: unknown[]): Promise<unknown> {
        calls.getInvitationRedemptionState.push(args);
        return {
          __kind__: "ok",
          ok: { __kind__: "InvalidToken", InvalidToken: null },
        };
      },
      async acceptFamilyInvitation(...args: unknown[]): Promise<unknown> {
        calls.acceptFamilyInvitation.push(args);
        return { __kind__: "err", err: FamilyInvitationError.InvalidToken };
      },
      async declineFamilyInvitation(...args: unknown[]): Promise<unknown> {
        calls.declineFamilyInvitation.push(args);
        return { __kind__: "err", err: FamilyInvitationError.InvalidToken };
      },
      async getMyMembershipForFamily(...args: unknown[]): Promise<unknown> {
        calls.getMyMembershipForFamily.push(args);
        return myMembership;
      },
      async getMyMembershipConfirmationState(
        ...args: unknown[]
      ): Promise<unknown> {
        calls.getMyMembershipConfirmationState.push(args);
        return applicantState;
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
          calls[key].length = 0;
        }
        myMembership = { __kind__: "ok", ok: null };
        applicantState = {
          __kind__: "ok",
          ok: {
            state: "AwaitingConfirmation",
            createdAt: 1_700_000_000_000_000_000n,
            updatedAt: 1_700_000_000_000_000_000n,
          },
        };
      },
      setMyMembership: (value: unknown) => {
        myMembership = value;
      },
      setApplicantState: (value: unknown) => {
        applicantState = value;
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
beforeEach(() => {
  resetCalls();
  sessionStorage.clear();
});

function makePreview(
  overrides: Partial<FamilyInvitationPreview> = {},
): FamilyInvitationPreview {
  return {
    invitationId: 1n,
    familyId: "norwood",
    familyDisplayName: "Norwood",
    targetPersonId: "clayton",
    targetDisplayName: "Clayton Norwood",
    invitationType: InvitationType.FamilyMember,
    status: InvitationStatus.Pending,
    expiresAt: 1_800_000_000_000_000_000n,
    ...overrides,
  };
}

function makeInvitation(
  overrides: Partial<FamilyInvitation> = {},
): FamilyInvitation {
  return {
    id: 1n,
    familyId: "norwood",
    personId: "clayton",
    invitedEmail: undefined,
    invitedByAccountId: OWNER,
    invitedByPersonId: undefined,
    invitationType: InvitationType.FamilyMember,
    tokenHash: "hash",
    status: InvitationStatus.Accepted,
    createdAt: 1_700_000_000_000_000_000n,
    expiresAt: 1_800_000_000_000_000_000n,
    acceptedAt: 1_700_000_000_000_000_000n,
    acceptedByAccountId: OWNER,
    cancelledAt: undefined,
    ...overrides,
  };
}

function renderPage(props: {
  rawToken?: string | null;
  isAuthenticated?: boolean;
  onSignIn?: () => void;
  onConsumed?: () => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InviteRedemptionPage
        rawToken={props.rawToken === undefined ? "tok-a" : props.rawToken}
        isAuthenticated={props.isAuthenticated ?? true}
        onSignIn={props.onSignIn ?? (() => {})}
        onConsumed={props.onConsumed ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

describe("InviteRedemptionPage: missing token (characterization)", () => {
  it("renders the invalid-link state when no token is present", () => {
    renderPage({ rawToken: null });
    expect(screen.getByTestId("invite.invalid_state")).toBeInTheDocument();
    expect(screen.getByText("Invitation link not found")).toBeInTheDocument();
  });
});

describe("InviteRedemptionPage: signed-out preview and sign-in gate (characterization)", () => {
  it("shows the safe preview and the sign-in gate for a signed-out visitor", async () => {
    mockActor.validateFamilyInvitationToken = vi.fn(
      async (...args: unknown[]) => {
        calls.validateFamilyInvitationToken.push(args);
        return { __kind__: "ok", ok: makePreview() } satisfies Result;
      },
    );

    renderPage({ isAuthenticated: false });

    expect(
      await screen.findByText(/You’re invited to Norwood/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invite.signin_gate")).toBeInTheDocument();
    // The preview shows the invited profile and the family-safe invitation type.
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();
    expect(screen.getAllByText("Family member").length).toBeGreaterThan(0);
    // The signed-out preview is fetched with the raw token.
    expect(calls.validateFamilyInvitationToken).toEqual([["tok-a"]]);
  });

  it("persists the raw token before starting sign-in", async () => {
    mockActor.validateFamilyInvitationToken = vi.fn(
      async (...args: unknown[]) => {
        calls.validateFamilyInvitationToken.push(args);
        return { __kind__: "ok", ok: makePreview() } satisfies Result;
      },
    );
    const onSignIn = vi.fn();

    renderPage({ isAuthenticated: false, onSignIn });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.google_button"));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    // The token is persisted through the short-lived session mechanism so the
    // invitation resumes after the auth redirect.
    expect(sessionStorage.getItem("app.originatingView.v1")).toContain("tok-a");
  });

  it("never surfaces sensitive relationship context in the preview", async () => {
    mockActor.validateFamilyInvitationToken = vi.fn(
      async (...args: unknown[]) => {
        calls.validateFamilyInvitationToken.push(args);
        return { __kind__: "ok", ok: makePreview() } satisfies Result;
      },
    );

    renderPage({ isAuthenticated: false });
    await screen.findByText(/You’re invited to Norwood/);

    for (const label of [
      "adopted",
      "foster",
      "step",
      "biological",
      "guardian",
    ]) {
      expect(
        screen.queryByText(new RegExp(label, "i")),
      ).not.toBeInTheDocument();
    }
  });
});

describe("InviteRedemptionPage: unchanged terminal states (characterization)", () => {
  function mockRedemption(state: InvitationRedemptionState) {
    mockActor.getInvitationRedemptionState = vi.fn(
      async (...args: unknown[]) => {
        calls.getInvitationRedemptionState.push(args);
        return { __kind__: "ok", ok: state } satisfies Result_29;
      },
    );
  }

  it("renders the declined state", async () => {
    mockRedemption({ __kind__: "Declined", Declined: null });
    renderPage({});
    expect(
      await screen.findByTestId("invite.declined_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invitation declined")).toBeInTheDocument();
  });

  it("renders the cancelled state", async () => {
    mockRedemption({ __kind__: "Cancelled", Cancelled: null });
    renderPage({});
    expect(
      await screen.findByTestId("invite.cancelled_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invitation cancelled")).toBeInTheDocument();
  });

  it("renders the expired state", async () => {
    mockRedemption({ __kind__: "Expired", Expired: null });
    renderPage({});
    expect(
      await screen.findByTestId("invite.expired_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invitation expired")).toBeInTheDocument();
  });

  it("renders the invalid-token state", async () => {
    mockRedemption({ __kind__: "InvalidToken", InvalidToken: null });
    renderPage({});
    expect(
      await screen.findByTestId("invite.invalid_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("This invitation isn't valid")).toBeInTheDocument();
  });

  it("wires the onConsumed affordance on the already-accepted state", async () => {
    // The AlreadyAccepted copy is intentionally changing, so only the
    // affordance wiring is frozen here, not the wording.
    mockRedemption({ __kind__: "AlreadyAccepted", AlreadyAccepted: null });
    const onConsumed = vi.fn();
    renderPage({ onConsumed });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.continue_button"));
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });
});

describe("InviteRedemptionPage: post-acceptance onboarding (characterization)", () => {
  it("renders the pending-membership state after a #FamilyMember accept without consuming immediately", async () => {
    mockActor.getInvitationRedemptionState = vi.fn(
      async (...args: unknown[]) => {
        calls.getInvitationRedemptionState.push(args);
        return {
          __kind__: "ok",
          ok: { __kind__: "Valid", Valid: makePreview() },
        } satisfies Result_29;
      },
    );
    mockActor.acceptFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.acceptFamilyInvitation.push(args);
      return {
        __kind__: "ok",
        ok: makeInvitation({ invitationType: InvitationType.FamilyMember }),
      } satisfies Result_31;
    });
    // The caller's own membership is Pending, so the limited onboarding state
    // renders the applicant-safe confirmation status card for that membership.
    setMyMembership({
      __kind__: "ok",
      ok: {
        id: 7n,
        status: MembershipStatus.Pending,
        accountId: OWNER,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
        personId: "clayton",
        familyId: "norwood",
      },
    });
    setApplicantState({
      __kind__: "ok",
      ok: {
        state: MembershipConfirmationState.AwaitingConfirmation,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      },
    });
    const onConsumed = vi.fn();

    renderPage({ onConsumed });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.accept_button"));

    expect(
      await screen.findByTestId("invite.membership_pending_state"),
    ).toBeInTheDocument();
    // The applicant-safe status card renders inside the limited onboarding
    // state, reading the caller's own membership confirmation state.
    expect(
      await screen.findByTestId("confirmation.status_card"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Waiting for a family member to confirm your connection.",
      ),
    ).toBeInTheDocument();
    expect(calls.getMyMembershipConfirmationState).toEqual([["norwood", 7n]]);
    // The invite surface owns the onboarding state; it must not navigate away
    // on accept.
    expect(onConsumed).not.toHaveBeenCalled();
    expect(calls.acceptFamilyInvitation).toEqual([["tok-a"]]);
  });

  it("renders the steward-nomination state after a #FoundingSteward accept", async () => {
    mockActor.getInvitationRedemptionState = vi.fn(
      async (...args: unknown[]) => {
        calls.getInvitationRedemptionState.push(args);
        return {
          __kind__: "ok",
          ok: {
            __kind__: "Valid",
            Valid: makePreview({
              invitationType: InvitationType.FoundingSteward,
            }),
          },
        } satisfies Result_29;
      },
    );
    mockActor.acceptFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.acceptFamilyInvitation.push(args);
      return {
        __kind__: "ok",
        ok: makeInvitation({ invitationType: InvitationType.FoundingSteward }),
      } satisfies Result_31;
    });

    renderPage({});

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.accept_button"));

    expect(
      await screen.findByTestId("invite.steward_nomination_state"),
    ).toBeInTheDocument();
  });

  it("declines through the backend and consumes on success", async () => {
    mockActor.getInvitationRedemptionState = vi.fn(
      async (...args: unknown[]) => {
        calls.getInvitationRedemptionState.push(args);
        return {
          __kind__: "ok",
          ok: { __kind__: "Valid", Valid: makePreview() },
        } satisfies Result_29;
      },
    );
    mockActor.declineFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.declineFamilyInvitation.push(args);
      return {
        __kind__: "ok",
        ok: makeInvitation({ status: InvitationStatus.Declined }),
      } satisfies Result_31;
    });
    const onConsumed = vi.fn();

    renderPage({ onConsumed });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.decline_button"));

    await waitFor(() => expect(onConsumed).toHaveBeenCalledTimes(1));
    expect(calls.declineFamilyInvitation).toEqual([["tok-a"]]);
  });
});
