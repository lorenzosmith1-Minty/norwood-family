import "@testing-library/jest-dom/vitest";
import { MembershipConfirmationState, MembershipStatus } from "@/backend";
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

import { MembershipPendingState } from "./pages/InviteRedemptionPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the EXISTING limited pending-membership
// onboarding surface.
//
// The requested change adds a NEW global pending-membership routing shell at the
// app-shell level. The discovery notes that the invite-based MembershipPending
// state is the ONLY existing pending-membership gating surface, so the new
// shell must not disturb it. This file freezes the parts of that surface the
// existing InviteRedemptionPageCharacterize file does not already pin:
//
//   A. The pending state renders its calm "Waiting for family confirmation"
//      plate and the applicant-safe confirmation status card for the caller's own
//      membership, and it does NOT render normal family navigation (no
//      "Family history sections" nav, no Message Board link).
//   B. The explicit "Go to Norwood" continue affordance calls `onConsumed`, so
//      the invite surface — not the new global shell — owns leaving the
//      onboarding state.
//   C. When the caller's own membership cannot be resolved (no membership id),
//      the pending plate still renders and the status card is simply absent;
//      the surface never crashes or falls through to normal family navigation.
//
// It deliberately does NOT freeze the notification-text parsing path or the
// absence of global pending gating, both of which the requested change
// intentionally alters.
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
      getMyMembershipForFamily: unknown[][];
      getMyMembershipConfirmationState: unknown[][];
    } = {
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

function renderPendingState(onConsumed: () => void = () => {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MembershipPendingState onConsumed={onConsumed} />
    </QueryClientProvider>,
  );
}

function setPendingMembership() {
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
}

describe("pending-membership onboarding surface (characterization)", () => {
  it("renders the pending plate and the applicant-safe status card, with no normal family navigation", async () => {
    setPendingMembership();

    renderPendingState();

    // The calm pending plate renders.
    expect(
      await screen.findByTestId("invite.membership_pending_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for family confirmation"),
    ).toBeInTheDocument();
    // The applicant-safe status card renders for the caller's own membership.
    expect(
      await screen.findByTestId("confirmation.status_card"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Waiting for a family member to confirm your connection.",
      ),
    ).toBeInTheDocument();
    // The read is family-scoped to the caller's own membership.
    expect(calls.getMyMembershipConfirmationState).toEqual([["norwood", 7n]]);
    // A Pending member never receives normal family navigation here.
    expect(
      screen.queryByRole("navigation", { name: "Family history sections" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Message Board" })).toBeNull();
  });

  it("leaves the onboarding state only through the explicit continue affordance", async () => {
    setPendingMembership();
    const onConsumed = vi.fn();

    renderPendingState(onConsumed);

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.continue_button"));

    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("still renders the pending plate when the caller's own membership cannot be resolved", async () => {
    // No membership: the status card has no membership id to read, so it is
    // simply absent, but the pending plate and its continue affordance remain.
    setMyMembership({ __kind__: "ok", ok: null });

    renderPendingState();

    expect(
      await screen.findByTestId("invite.membership_pending_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for family confirmation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invite.continue_button")).toBeInTheDocument();
    // No applicant read is issued without a membership id.
    await waitFor(() =>
      expect(calls.getMyMembershipForFamily.length).toBeGreaterThan(0),
    );
    expect(calls.getMyMembershipConfirmationState).toEqual([]);
    expect(screen.queryByTestId("confirmation.status_card")).toBeNull();
  });
});
