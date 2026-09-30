import "@testing-library/jest-dom/vitest";
import { type StewardRecord, StewardRoleStatus } from "@/backend";
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
import { stewardsInvalidation, useListStewards } from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the Steward roster invalidation helper.
//
// The requested change narrows the DEFAULT-family branch of
// `stewardsInvalidation(undefined)` so it targets ONLY the exact two-element key
// ['governance','stewards']. Today that branch returns the bare
// `{ queryKey: ['governance','stewards'] }` with no `exact`/`predicate`
// narrowing, so React Query's PREFIX matching also invalidates
// ['governance','stewards','family-a'] and ['governance','stewards','family-b'].
//
// That over-invalidation is the behavior the request intentionally changes, so
// this file does NOT freeze it as correct. Instead it protects the adjacent
// working behavior the change must not disturb:
//
//   * the NON-default branch stays family-exact: `stewardsInvalidation('family-a')`
//     targets only ['governance','stewards','family-a'] and leaves the bare
//     default key and Family B's key untouched;
//   * `useListStewards` routing is unchanged: the default family calls
//     `listStewards()` with the bare ['governance','stewards'] key, a
//     non-default family calls `listStewardsForFamily(familyId)` with
//     ['governance','stewards',familyId].
//
// The default-family exactness itself is asserted as the accepted requirement
// (it currently fails against the unfixed helper and must pass once the helper
// is narrowed). This is component/integration coverage over a typed local actor
// mock; it does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    listStewards: [],
    listStewardsForFamily: [],
  };

  const mockActor = {
    async listStewards(...args: unknown[]): Promise<StewardRecord[]> {
      calls.listStewards.push(args);
      return [];
    },
    async listStewardsForFamily(...args: unknown[]): Promise<StewardRecord[]> {
      calls.listStewardsForFamily.push(args);
      return [];
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

function keyProbe() {
  return useQueryClient();
}

function stewardRecord(familyId: string, account: Principal): StewardRecord {
  return {
    familyId,
    stewardAccountId: account,
    roleStatus: StewardRoleStatus.Active,
    successorPriority: undefined,
    assignedBy: OWNER,
    assignedAt: 1_700_000_000_000_000_000n,
    founding: false,
  };
}

/** Seeds the three roster cache shapes and reports which are invalidated. */
function invalidationOutcome(filters: ReturnType<typeof stewardsInvalidation>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["governance", "stewards"], []);
  queryClient.setQueryData(["governance", "stewards", FAMILY_A], []);
  queryClient.setQueryData(["governance", "stewards", FAMILY_B], []);

  void queryClient.invalidateQueries(filters);

  const isInvalidated = (key: unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated ?? false;
  return {
    defaultKey: isInvalidated(["governance", "stewards"]),
    familyA: isInvalidated(["governance", "stewards", FAMILY_A]),
    familyB: isInvalidated(["governance", "stewards", FAMILY_B]),
  };
}

// ---------------------------------------------------------------------------
// Accepted requirement: default-family invalidation is exact
// ---------------------------------------------------------------------------

describe("stewardsInvalidation(undefined) targets only the exact default key (characterization)", () => {
  it("invalidates ['governance','stewards'] and leaves Family A and Family B untouched", () => {
    const outcome = invalidationOutcome(stewardsInvalidation(undefined));

    expect(outcome.defaultKey).toBe(true);
    // The accepted requirement: a default-family invalidation must not reach a
    // non-default family's roster cache.
    expect(outcome.familyA).toBe(false);
    expect(outcome.familyB).toBe(false);
  });

  it("records the bare ['governance','stewards'] query key narrowed to the exact two-element shape", () => {
    // The accepted requirement makes the default branch family-exact. Exactness
    // cannot be expressed by the bare key alone (React Query matches by prefix),
    // so the filter carries a narrowing predicate that admits only the exact
    // two-element shape. The recorded queryKey is still the bare default key.
    expect(stewardsInvalidation(undefined)).toEqual({
      queryKey: ["governance", "stewards"],
      predicate: expect.any(Function),
    });
  });
});

// ---------------------------------------------------------------------------
// Protected adjacent behavior: non-default branch stays family-exact
// ---------------------------------------------------------------------------

describe("stewardsInvalidation(familyId) stays family-exact (characterization)", () => {
  it("Family A invalidation affects only Family A", () => {
    const outcome = invalidationOutcome(stewardsInvalidation(FAMILY_A));

    expect(outcome.familyA).toBe(true);
    expect(outcome.familyB).toBe(false);
    expect(outcome.defaultKey).toBe(false);
  });

  it("Family B invalidation affects only Family B", () => {
    const outcome = invalidationOutcome(stewardsInvalidation(FAMILY_B));

    expect(outcome.familyB).toBe(true);
    expect(outcome.familyA).toBe(false);
    expect(outcome.defaultKey).toBe(false);
  });

  it("records the family-appended key for a non-default family", () => {
    expect(stewardsInvalidation(FAMILY_A)).toEqual({
      queryKey: ["governance", "stewards", FAMILY_A],
    });
  });
});

// ---------------------------------------------------------------------------
// Protected adjacent behavior: useListStewards routing is unchanged
// ---------------------------------------------------------------------------

describe("useListStewards routing is unchanged (characterization)", () => {
  it("default family calls listStewards() with the bare ['governance','stewards'] key", async () => {
    const { result } = renderHook(
      () => ({ stewards: useListStewards(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.stewards.isSuccess).toBe(true));
    expect(calls.listStewards).toEqual([[]]);
    expect(calls.listStewardsForFamily).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewards"]);
  });

  it("non-default family calls listStewardsForFamily(familyId) with the family-appended key", async () => {
    const { result } = renderHook(
      () => ({ stewards: useListStewards(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.stewards.isSuccess).toBe(true));
    expect(calls.listStewardsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listStewards).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewards", FAMILY_A]);
    expect(keys).not.toContainEqual(["governance", "stewards"]);
  });

  it("surfaces the steward records the backend returns for the active family", async () => {
    const records = [stewardRecord(FAMILY_A, OWNER)];
    mockActor.listStewardsForFamily = vi.fn(async (...args: unknown[]) => {
      calls.listStewardsForFamily.push(args);
      return records;
    });

    const { result } = renderHook(() => useListStewards(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(records);
  });
});
