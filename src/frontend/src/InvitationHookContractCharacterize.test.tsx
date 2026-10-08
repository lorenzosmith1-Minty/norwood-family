import {
  type FamilyInvitation,
  FamilyInvitationError,
  type FamilyInvitationPreview,
  type InvitationRedemptionState,
  InvitationStatus,
  InvitationType,
  type Result_39,
  type Result_43,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  invitationInvalidation,
  invitationPreviewKey,
  invitationRedemptionKey,
  useAcceptInvitation,
  useDeclineInvitation,
  useInvitationPreview,
  useInvitationRedemptionState,
} from "./hooks/useInvitation";

// ---------------------------------------------------------------------------
// Characterization baseline for the invitation redemption hooks.
//
// The upcoming change alters the InviteRedemptionPage's rendering of the
// #AlreadyMember disambiguation and some terminal copy, and the App.tsx
// lifecycle around the saved invite origin. It does NOT change the hook layer:
// the same four hooks keep calling the same backend methods with the same
// arguments, and the same per-token query keys and invalidation predicate stay
// in place.
//
// What this file protects:
//
//   A. `useInvitationPreview` calls `validateFamilyInvitationToken(rawToken)`
//      and is disabled until a token is present.
//   B. `useInvitationRedemptionState` calls
//      `getInvitationRedemptionState(rawToken)` and is disabled until a token
//      is present.
//   C. `useAcceptInvitation` / `useDeclineInvitation` call
//      `acceptFamilyInvitation(rawToken)` / `declineFamilyInvitation(rawToken)`,
//      throw `Error(result.err)` on an `#err`, and return the invitation on
//      `#ok`.
//   D. The query keys are per-token, and `invitationInvalidation` matches only
//      the exact token's preview/redemption entries — never another token's.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    validateFamilyInvitationToken: unknown[][];
    getInvitationRedemptionState: unknown[][];
    acceptFamilyInvitation: unknown[][];
    declineFamilyInvitation: unknown[][];
  } = {
    validateFamilyInvitationToken: [],
    getInvitationRedemptionState: [],
    acceptFamilyInvitation: [],
    declineFamilyInvitation: [],
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
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

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

describe("invitation query keys and invalidation are per-token (characterization)", () => {
  it("builds distinct preview and redemption keys per token", () => {
    expect(invitationPreviewKey("tok-a")).toEqual([
      "invitationPreview",
      "tok-a",
    ]);
    expect(invitationRedemptionKey("tok-a")).toEqual([
      "invitationRedemption",
      "tok-a",
    ]);
    expect(invitationPreviewKey("tok-a")).not.toEqual(
      invitationPreviewKey("tok-b"),
    );
  });

  it("matches only the exact token's preview and redemption entries", () => {
    const filter = invitationInvalidation("tok-a");
    const matches = (key: readonly unknown[]) =>
      filter.predicate?.({ queryKey: key } as never) ?? false;

    expect(matches(["invitationPreview", "tok-a"])).toBe(true);
    expect(matches(["invitationRedemption", "tok-a"])).toBe(true);
    // A different token's entry is never marked stale.
    expect(matches(["invitationPreview", "tok-b"])).toBe(false);
    expect(matches(["invitationRedemption", "tok-b"])).toBe(false);
    // An unrelated query is never matched.
    expect(matches(["profile", "tok-a"])).toBe(false);
  });
});

describe("invitation read hooks call the backend with the raw token (characterization)", () => {
  it("useInvitationPreview calls validateFamilyInvitationToken(rawToken)", async () => {
    const { result } = renderHook(() => useInvitationPreview("tok-a"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.validateFamilyInvitationToken).toEqual([["tok-a"]]);
  });

  it("useInvitationRedemptionState calls getInvitationRedemptionState(rawToken)", async () => {
    const { result } = renderHook(() => useInvitationRedemptionState("tok-a"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getInvitationRedemptionState).toEqual([["tok-a"]]);
  });

  it("does not call the backend when no token is present", async () => {
    const preview = renderHook(() => useInvitationPreview(null), { wrapper });
    const redemption = renderHook(() => useInvitationRedemptionState(null), {
      wrapper,
    });

    // The queries stay disabled; give React Query a tick to settle.
    await waitFor(() =>
      expect(preview.result.current.fetchStatus).toBe("idle"),
    );
    await waitFor(() =>
      expect(redemption.result.current.fetchStatus).toBe("idle"),
    );
    expect(calls.validateFamilyInvitationToken).toEqual([]);
    expect(calls.getInvitationRedemptionState).toEqual([]);
  });
});

describe("invitation mutation hooks call the backend and surface errors (characterization)", () => {
  it("useAcceptInvitation calls acceptFamilyInvitation(rawToken) and returns the invitation", async () => {
    const invitation = makeInvitation();
    mockActor.acceptFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.acceptFamilyInvitation.push(args);
      return { __kind__: "ok", ok: invitation } satisfies Result_43;
    });

    const { result } = renderHook(() => useAcceptInvitation(), { wrapper });
    const returned = await result.current.mutateAsync("tok-a");

    expect(calls.acceptFamilyInvitation).toEqual([["tok-a"]]);
    expect(returned).toBe(invitation);
  });

  it("useAcceptInvitation throws Error(result.err) on an #err result", async () => {
    mockActor.acceptFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.acceptFamilyInvitation.push(args);
      return {
        __kind__: "err",
        err: FamilyInvitationError.AlreadyMember,
      } satisfies Result_43;
    });

    const { result } = renderHook(() => useAcceptInvitation(), { wrapper });
    await expect(result.current.mutateAsync("tok-a")).rejects.toThrow(
      "AlreadyMember",
    );
  });

  it("useDeclineInvitation calls declineFamilyInvitation(rawToken) and returns the invitation", async () => {
    const invitation = makeInvitation({ status: InvitationStatus.Declined });
    mockActor.declineFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.declineFamilyInvitation.push(args);
      return { __kind__: "ok", ok: invitation } satisfies Result_43;
    });

    const { result } = renderHook(() => useDeclineInvitation(), { wrapper });
    const returned = await result.current.mutateAsync("tok-a");

    expect(calls.declineFamilyInvitation).toEqual([["tok-a"]]);
    expect(returned).toBe(invitation);
  });

  it("useDeclineInvitation throws Error(result.err) on an #err result", async () => {
    mockActor.declineFamilyInvitation = vi.fn(async (...args: unknown[]) => {
      calls.declineFamilyInvitation.push(args);
      return {
        __kind__: "err",
        err: FamilyInvitationError.InvalidTransition,
      } satisfies Result_43;
    });

    const { result } = renderHook(() => useDeclineInvitation(), { wrapper });
    await expect(result.current.mutateAsync("tok-a")).rejects.toThrow(
      "InvalidTransition",
    );
  });
});

describe("redemption state union is the typed consumer contract (characterization)", () => {
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

  it("types the redemption Result as an ok/err union over the state and error", () => {
    const ok: Result_39 = {
      __kind__: "ok",
      ok: { __kind__: "Valid", Valid: makePreview() },
    };
    const err: Result_39 = {
      __kind__: "err",
      err: FamilyInvitationError.FamilyNotFound,
    };
    expect(ok.__kind__).toBe("ok");
    expect(err.__kind__).toBe("err");
  });
});
