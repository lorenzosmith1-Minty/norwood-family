import "@testing-library/jest-dom/vitest";
import { StewardError } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoveSteward } from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped Steward removal mutation.
//
// The accepted change makes `removeStewardForFamily(familyId, stewardAccountId)`
// the canonical removal path and makes `useRemoveSteward()` fork on the
// centralized active family (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy
//     `removeSteward(stewardAccountId)` call with no family argument.
//   * NON-default family -> `removeStewardForFamily(activeFamilyId,
//     stewardAccountId)` with the active familyId as the FIRST argument, never
//     hard-coded to "norwood".
//
// After a successful removal the hook invalidates only the active family's
// Steward roster and governance audit/history caches, through the existing
// family-safe helpers (`stewardsInvalidation` /
// `governanceAuditHistoryInvalidation`), so Family A's removal never marks
// Family B's roster or audit cache stale.
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint the hook calls and with which argument tuple, and which cache keys
// are invalidated — over a typed local actor mock. It does not exercise the
// real canister; the family boundary itself is covered by the PocketIC lane
// (see coverageLimits).
//
// The default-family contract is frozen separately by the existing
// GovernanceStewardReadAndRemovalDefaultFamilyCharacterize file; this file must
// not weaken it.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");
const REMOVED = Principal.fromText("aaaaa-aa");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    removeSteward: [],
    removeStewardForFamily: [],
  };

  const mockActor = {
    async removeSteward(...args: unknown[]): Promise<unknown> {
      calls.removeSteward.push(args);
      return { __kind__: "ok", ok: null };
    },
    async removeStewardForFamily(...args: unknown[]): Promise<unknown> {
      calls.removeStewardForFamily.push(args);
      return { __kind__: "ok", ok: null };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls)) {
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

/** Wraps the hook in a QueryClient and an explicit active family. */
function wrapperFor(familyId: string | undefined) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const inner = (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return familyId === undefined ? (
      inner
    ) : (
      <FamilyProvider familyId={familyId}>{inner}</FamilyProvider>
    );
  };
}

afterEach(cleanup);
beforeEach(resetCalls);

// ---------------------------------------------------------------------------
// Non-default family routes to removeStewardForFamily
// ---------------------------------------------------------------------------

describe("useRemoveSteward: non-default family routes to removeStewardForFamily (cover)", () => {
  it("calls removeStewardForFamily(familyId, stewardAccountId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.removeStewardForFamily).toEqual([[FAMILY_A, REMOVED]]);
    expect(calls.removeSteward).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.removeStewardForFamily).toEqual([[FAMILY_B, REMOVED]]);
    expect(calls.removeSteward).toEqual([]);
  });

  it("surfaces the backend result unchanged", async () => {
    mockActor.removeStewardForFamily = vi.fn(async (...args: unknown[]) => {
      calls.removeStewardForFamily.push(args);
      return { __kind__: "ok", ok: null };
    });

    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: null });
  });

  it("surfaces a #LastSteward rejection unchanged", async () => {
    mockActor.removeStewardForFamily = vi.fn(async (...args: unknown[]) => {
      calls.removeStewardForFamily.push(args);
      return { __kind__: "err", err: StewardError.LastSteward };
    });

    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      __kind__: "err",
      err: StewardError.LastSteward,
    });
  });
});

// ---------------------------------------------------------------------------
// Non-default invalidation is family-exact
// ---------------------------------------------------------------------------

describe("useRemoveSteward: non-default invalidation is family-exact (cover)", () => {
  it("invalidates the active family's roster and audit caches via the family-safe helpers", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FamilyProvider familyId={FAMILY_A}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </FamilyProvider>
      ),
    });
    result.current.mutate(REMOVED);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const filters = invalidate.mock.calls.map((call) => call[0]);
    // The roster filter is the family-appended key for the active family, not
    // the bare cross-family prefix.
    expect(filters).toContainEqual({
      queryKey: ["governance", "stewards", FAMILY_A],
    });
    // The audit/history filter is the family-appended key for the active
    // family, so Family A's removal never marks Family B's audit cache stale.
    expect(filters).toContainEqual({
      queryKey: ["governance", "auditHistory", FAMILY_A],
    });
    // No bare cross-family roster prefix is used.
    expect(filters).not.toContainEqual({
      queryKey: ["governance", "stewards"],
    });
    // No bare cross-family audit prefix is used either.
    expect(filters).not.toContainEqual({
      queryKey: ["governance", "auditHistory"],
    });
  });

  it("does not invalidate Family B's roster when removing in Family A", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["governance", "stewards", FAMILY_B], []);

    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FamilyProvider familyId={FAMILY_A}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </FamilyProvider>
      ),
    });
    result.current.mutate(REMOVED);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Give any queued invalidation a chance to run before asserting the
    // negative, so the assertion cannot pass merely by racing ahead of it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      queryClient.getQueryState(["governance", "stewards", FAMILY_B])
        ?.isInvalidated ?? false,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior remains unchanged
// ---------------------------------------------------------------------------

describe("useRemoveSteward: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, calls removeSteward(stewardAccountId) with no family argument", async () => {
    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: wrapperFor(undefined),
    });

    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.removeSteward).toEqual([[REMOVED]]);
    expect(calls.removeStewardForFamily).toEqual([]);
  });

  it("with familyId 'norwood', keeps the legacy no-familyId call", async () => {
    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: wrapperFor("norwood"),
    });

    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.removeSteward).toEqual([[REMOVED]]);
    expect(calls.removeStewardForFamily).toEqual([]);
  });

  it("default-family removal invalidates the bare default roster key and not a family-appended key", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveSteward(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate(REMOVED);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const filters = invalidate.mock.calls.map((call) => call[0]);
    // The default family keeps the exact legacy bare key, narrowed to the
    // two-element shape so it never reaches a family-appended roster cache.
    expect(filters).toContainEqual({
      queryKey: ["governance", "stewards"],
      predicate: expect.any(Function),
    });
    // No family-appended roster key is targeted.
    expect(filters).not.toContainEqual({
      queryKey: ["governance", "stewards", FAMILY_A],
    });
  });
});
