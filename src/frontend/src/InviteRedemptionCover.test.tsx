import {
  type FamilyInvitation,
  FamilyInvitationError,
  type FamilyInvitationPreview,
  type InvitationRedemptionState,
  InvitationStatus,
  InvitationType,
  MembershipStatus,
  type Result_1,
  type Result_39,
  type Result_43,
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
// Cover for the accepted InviteRedemptionPage changes.
//
// The accepted change:
//
//   1. Disambiguates the shared `#AlreadyMember` accept error by querying the
//      caller's own membership in the invitation's family:
//        - a membership for the invitation's target profile that is Active is
//          the "Already connected" case,
//        - a membership for a different person, or one that is Suspended, Left,
//          or otherwise not active, renders the generic conflict state,
//        - no membership plus a claimed profile renders ClaimedUnavailable
//          without revealing the owner,
//        - a failed lookup renders the generic conflict state.
//   2. Uses neutral "Invitation accepted" wording for AlreadyAccepted and does
//      not claim family membership.
//   3. Keeps the FoundingSteward post-accept copy from directing a non-Steward
//      nominee to the Steward-only area and states Steward authority has NOT
//      been granted.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    validateFamilyInvitationToken: unknown[][];
    getInvitationRedemptionState: unknown[][];
    acceptFamilyInvitation: unknown[][];
    declineFamilyInvitation: unknown[][];
    getMyMembershipForFamily: unknown[][];
  } = {
    validateFamilyInvitationToken: [],
    getInvitationRedemptionState: [],
    acceptFamilyInvitation: [],
    declineFamilyInvitation: [],
    getMyMembershipForFamily: [],
  };

  const mockActor = {
    async validateFamilyInvitationToken(...args: unknown[]): Promise<unknown> {
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
      return { __kind__: "ok", ok: null };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
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

function makeMembership(
  overrides: Partial<{
    id: bigint;
    status: MembershipStatus;
    accountId: string;
    personId: string;
    familyId: string;
  }> = {},
) {
  return {
    id: 1n,
    status: MembershipStatus.Active,
    accountId: OWNER.toText(),
    approvedAt: undefined,
    approvedBy: undefined,
    createdAt: 1_700_000_000_000_000_000n,
    joinedAt: undefined,
    updatedAt: 1_700_000_000_000_000_000n,
    personId: "clayton",
    familyId: "norwood",
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

/** A valid signed-in invitation whose accept fails with #AlreadyMember. */
function mockValidInvitationWithAlreadyMemberAccept() {
  mockActor.getInvitationRedemptionState = vi.fn(async (...args: unknown[]) => {
    calls.getInvitationRedemptionState.push(args);
    return {
      __kind__: "ok",
      ok: { __kind__: "Valid", Valid: makePreview() },
    } satisfies Result_39;
  });
  mockActor.acceptFamilyInvitation = vi.fn(async (...args: unknown[]) => {
    calls.acceptFamilyInvitation.push(args);
    return {
      __kind__: "err",
      err: FamilyInvitationError.AlreadyMember,
    } satisfies Result_43;
  });
}

async function acceptAndSettle() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId("invite.accept_button"));
}

describe("AlreadyMember disambiguation (cover)", () => {
  it("renders 'Already connected' for the caller's own matching Active membership", async () => {
    mockValidInvitationWithAlreadyMemberAccept();
    mockActor.getMyMembershipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getMyMembershipForFamily.push(args);
      return {
        __kind__: "ok",
        ok: makeMembership({
          personId: "clayton",
          status: MembershipStatus.Active,
        }),
      };
    });

    renderPage({});
    await acceptAndSettle();

    expect(
      await screen.findByTestId("invite.already_member_state"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Already connected").length).toBeGreaterThan(0);
    // The caller's own membership is queried for the invitation's family.
    expect(calls.getMyMembershipForFamily).toEqual([["norwood"]]);
  });

  it("renders the generic conflict state for a membership for a different person", async () => {
    mockValidInvitationWithAlreadyMemberAccept();
    mockActor.getMyMembershipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getMyMembershipForFamily.push(args);
      return {
        __kind__: "ok",
        ok: makeMembership({
          personId: "someone-else",
          status: MembershipStatus.Active,
        }),
      };
    });

    renderPage({});
    await acceptAndSettle();

    expect(
      await screen.findByTestId("invite.conflict_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("invite.already_member_state")).toBeNull();
  });

  it("renders the generic conflict state for a Suspended membership", async () => {
    mockValidInvitationWithAlreadyMemberAccept();
    mockActor.getMyMembershipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getMyMembershipForFamily.push(args);
      return {
        __kind__: "ok",
        ok: makeMembership({
          personId: "clayton",
          status: MembershipStatus.Suspended,
        }),
      };
    });

    renderPage({});
    await acceptAndSettle();

    expect(
      await screen.findByTestId("invite.conflict_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("invite.already_member_state")).toBeNull();
  });

  it("renders the generic conflict state for a Left membership", async () => {
    mockValidInvitationWithAlreadyMemberAccept();
    mockActor.getMyMembershipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getMyMembershipForFamily.push(args);
      return {
        __kind__: "ok",
        ok: makeMembership({
          personId: "clayton",
          status: MembershipStatus.Left,
        }),
      };
    });

    renderPage({});
    await acceptAndSettle();

    expect(
      await screen.findByTestId("invite.conflict_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("invite.already_member_state")).toBeNull();
  });

  it("renders ClaimedUnavailable with no caller membership and never reveals the owner", async () => {
    mockValidInvitationWithAlreadyMemberAccept();
    mockActor.getMyMembershipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getMyMembershipForFamily.push(args);
      return { __kind__: "ok", ok: null };
    });

    renderPage({});
    await acceptAndSettle();

    expect(
      await screen.findByTestId("invite.claimed_unavailable_state"),
    ).toBeInTheDocument();
    // The owner of the claimed profile is never named.
    expect(screen.queryByText(/owner/i)).toBeNull();
    expect(screen.queryByText(/claimed by/i)).toBeNull();
  });

  it("renders the generic conflict state when the membership lookup fails", async () => {
    mockValidInvitationWithAlreadyMemberAccept();
    mockActor.getMyMembershipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getMyMembershipForFamily.push(args);
      throw new Error("network request failed");
    });

    renderPage({});
    await acceptAndSettle();

    expect(
      await screen.findByTestId("invite.conflict_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("invite.claimed_unavailable_state")).toBeNull();
  });
});

describe("AlreadyAccepted neutral wording (cover)", () => {
  it("uses neutral 'Invitation accepted' wording and does not claim family membership", async () => {
    mockActor.getInvitationRedemptionState = vi.fn(
      async (...args: unknown[]) => {
        calls.getInvitationRedemptionState.push(args);
        return {
          __kind__: "ok",
          ok: { __kind__: "AlreadyAccepted", AlreadyAccepted: null },
        } satisfies Result_39;
      },
    );

    renderPage({});

    expect(
      await screen.findByTestId("invite.already_accepted_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invitation accepted")).toBeInTheDocument();
    // The copy must not assert the user is part of the family.
    expect(screen.queryByText(/you're part of/i)).toBeNull();
    expect(screen.queryByText(/you are part of/i)).toBeNull();
    expect(screen.queryByText(/welcome to the family/i)).toBeNull();
  });
});

describe("FoundingSteward post-accept copy (cover)", () => {
  it("preserves the nomination, states authority was not granted, and never points to the Steward-only area", async () => {
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
        } satisfies Result_39;
      },
    );
    mockActor.acceptFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.acceptFamilyInvitation.push(args);
      return {
        __kind__: "ok",
        ok: makeInvitation({ invitationType: InvitationType.FoundingSteward }),
      } satisfies Result_43;
    });

    renderPage({});
    await acceptAndSettle();

    const state = await screen.findByTestId("invite.steward_nomination_state");
    expect(state).toBeInTheDocument();
    // The nomination is preserved and authority is explicitly not granted.
    expect(state.textContent).toMatch(/nomination is preserved/i);
    expect(state.textContent).toMatch(
      /Steward authority has not been granted/i,
    );
    // A non-Steward nominee is never directed into the Steward-only area.
    expect(state.textContent).not.toMatch(/steward hub/i);
    expect(state.textContent).not.toMatch(/steward-only/i);
    expect(state.textContent).not.toMatch(/go to the steward/i);
  });
});

describe("signed-out preview still works (cover)", () => {
  it("shows the safe preview and sign-in gate for a signed-out visitor", async () => {
    mockActor.validateFamilyInvitationToken = vi.fn(
      async (...args: unknown[]) => {
        calls.validateFamilyInvitationToken.push(args);
        return { __kind__: "ok", ok: makePreview() } satisfies Result_1;
      },
    );

    renderPage({ isAuthenticated: false });

    expect(
      await screen.findByText(/You’re invited to Norwood/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invite.signin_gate")).toBeInTheDocument();
    expect(calls.validateFamilyInvitationToken).toEqual([["tok-a"]]);
  });
});

describe("redemption state union is the typed consumer contract (cover)", () => {
  it("carries the six discriminated redemption variants", () => {
    const states: InvitationRedemptionState[] = [
      { __kind__: "Valid", Valid: makePreview() },
      { __kind__: "Expired", Expired: null },
      { __kind__: "Cancelled", Cancelled: null },
      { __kind__: "Declined", Declined: null },
      { __kind__: "AlreadyAccepted", AlreadyAccepted: null },
      { __kind__: "InvalidToken", InvalidToken: null },
    ];
    expect(states.map((s) => s.__kind__).sort()).toEqual(
      [
        "AlreadyAccepted",
        "Cancelled",
        "Declined",
        "Expired",
        "InvalidToken",
        "Valid",
      ].sort(),
    );
  });
});

describe("decline consumes the invitation (cover)", () => {
  it("declines through the backend and consumes on success", async () => {
    mockActor.getInvitationRedemptionState = vi.fn(
      async (...args: unknown[]) => {
        calls.getInvitationRedemptionState.push(args);
        return {
          __kind__: "ok",
          ok: { __kind__: "Valid", Valid: makePreview() },
        } satisfies Result_39;
      },
    );
    mockActor.declineFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.declineFamilyInvitation.push(args);
      return {
        __kind__: "ok",
        ok: makeInvitation({ status: InvitationStatus.Declined }),
      } satisfies Result_43;
    });
    const onConsumed = vi.fn();

    renderPage({ onConsumed });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.decline_button"));

    await waitFor(() => expect(onConsumed).toHaveBeenCalledTimes(1));
    expect(calls.declineFamilyInvitation).toEqual([["tok-a"]]);
  });
});
