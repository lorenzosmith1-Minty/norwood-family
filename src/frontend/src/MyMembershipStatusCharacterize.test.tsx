import { type FamilyMembership, MembershipStatus } from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMyMembershipStatus } from "./hooks/useMyMembershipStatus";

// ---------------------------------------------------------------------------
// Characterization baseline for `useMyMembershipStatus`.
//
// The upcoming change narrows the Person Profile invite action to an approved
// family member or an active Family Steward. The approved-membership signal is
// the signed-in caller's own membership in the ACTIVE family, which this hook
// resolves. The hook itself is not changing, so its contract must be preserved:
//
//   A. It reads the caller's own membership through
//      `getMyMembershipForFamily(activeFamilyId)` — the always-defined active
//      family id, not the scoped id.
//   B. It exposes the membership on an `#ok` result and `null` on an `#err`
//      result (a caller with no membership in this family).
//   C. It tolerates an actor that does not implement the method at all,
//      resolving to `null` and reporting `isLoading: false` rather than
//      holding a perpetual loading state.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls, setMembershipResult, removeMethod } =
  vi.hoisted(() => {
    const calls: { getMyMembershipForFamily: unknown[][] } = {
      getMyMembershipForFamily: [],
    };

    let membershipResult: unknown = { __kind__: "ok", ok: null };

    const mockActor: Record<string, unknown> = {
      async getMyMembershipForFamily(...args: unknown[]): Promise<unknown> {
        calls.getMyMembershipForFamily.push(args);
        return membershipResult;
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        calls.getMyMembershipForFamily.length = 0;
        membershipResult = { __kind__: "ok", ok: null };
        mockActor.getMyMembershipForFamily = async (...args: unknown[]) => {
          calls.getMyMembershipForFamily.push(args);
          return membershipResult;
        };
      },
      setMembershipResult: (result: unknown) => {
        membershipResult = result;
      },
      removeMethod: () => {
        mockActor.getMyMembershipForFamily = undefined;
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
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeMembership(
  overrides: Partial<FamilyMembership> = {},
): FamilyMembership {
  return {
    id: 7n,
    status: MembershipStatus.Active,
    accountId: OWNER,
    approvedAt: 1_700_000_000_000_000_000n,
    approvedBy: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    joinedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    personId: "clayton",
    familyId: "norwood",
    ...overrides,
  };
}

describe("useMyMembershipStatus approved-membership signal (characterization)", () => {
  it("reads the caller's own membership for the active family", async () => {
    const membership = makeMembership();
    setMembershipResult({ __kind__: "ok", ok: membership });

    const { result } = renderHook(() => useMyMembershipStatus(), { wrapper });

    await waitFor(() => expect(result.current.membership).toEqual(membership));
    // The read is family-scoped to the always-defined active family id.
    expect(calls.getMyMembershipForFamily).toEqual([["norwood"]]);
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes an Active membership as the approved-membership signal", async () => {
    setMembershipResult({
      __kind__: "ok",
      ok: makeMembership({ status: MembershipStatus.Active }),
    });

    const { result } = renderHook(() => useMyMembershipStatus(), { wrapper });

    await waitFor(() =>
      expect(result.current.membership?.status).toBe(MembershipStatus.Active),
    );
  });

  it("resolves to null when the caller has no membership in the active family", async () => {
    setMembershipResult({ __kind__: "ok", ok: null });

    const { result } = renderHook(() => useMyMembershipStatus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.membership).toBeNull();
  });

  it("resolves to null on an #err result instead of throwing", async () => {
    setMembershipResult({ __kind__: "err", err: "NotSignedIn" });

    const { result } = renderHook(() => useMyMembershipStatus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.membership).toBeNull();
  });

  it("tolerates an actor without the membership method and does not stay loading", async () => {
    removeMethod();

    const { result } = renderHook(() => useMyMembershipStatus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.membership).toBeNull();
    expect(calls.getMyMembershipForFamily).toEqual([]);
  });
});
