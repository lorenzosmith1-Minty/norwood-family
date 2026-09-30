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
// Cover for the family-scoped Steward roster read.
//
// The accepted change adds a canonical `listStewardsForFamily(familyId)`
// endpoint and makes `useListStewards()` fork on the centralized active family
// (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy
//     `listStewards()` call with no arguments and the bare
//     ['governance','stewards'] key.
//   * NON-default family -> `listStewardsForFamily(activeFamilyId)` with the
//     active familyId as the FIRST argument and the familyId appended to the
//     query key, so one family's roster cache is never reused for another.
//
// `stewardsInvalidation` is family-exact: the default family invalidates only
// the bare default key, a non-default family invalidates only its own
// family-appended key, and another family's roster cache is left untouched.
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
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    listStewards: [],
    listStewardsForFamily: [],
    removeSteward: [],
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
    async removeSteward(...args: unknown[]): Promise<unknown> {
      calls.removeSteward.push(args);
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

// ---------------------------------------------------------------------------
// Non-default family routes to listStewardsForFamily
// ---------------------------------------------------------------------------

describe("useListStewards: non-default family routes to listStewardsForFamily (cover)", () => {
  it("calls listStewardsForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListStewards(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.listStewardsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listStewards).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useListStewards(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listStewardsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listStewards).toEqual([]);
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

// ---------------------------------------------------------------------------
// Family-separated query/cache keys
// ---------------------------------------------------------------------------

describe("Steward roster query keys are family-separated (cover)", () => {
  it("useListStewards registers ['governance','stewards',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ stewards: useListStewards(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.stewards.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewards", FAMILY_A]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual(["governance", "stewards"]);
  });

  it("Family A and Family B do not share a steward roster cache entry", async () => {
    const familyA = renderHook(
      () => ({ stewards: useListStewards(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.stewards.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({ stewards: useListStewards(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.stewards.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual(["governance", "stewards", FAMILY_A]);
    expect(keysB).toContainEqual(["governance", "stewards", FAMILY_B]);
    // Neither family's cache is reused for the other.
    expect(keysA).not.toContainEqual(["governance", "stewards", FAMILY_B]);
    expect(keysB).not.toContainEqual(["governance", "stewards", FAMILY_A]);
    expect(keysA).not.toEqual(keysB);
  });
});

// ---------------------------------------------------------------------------
// stewardsInvalidation is family-exact
// ---------------------------------------------------------------------------

describe("stewardsInvalidation is family-exact (cover)", () => {
  it("the default family invalidates only the bare default key", () => {
    expect(stewardsInvalidation(undefined)).toEqual({
      queryKey: ["governance", "stewards"],
      predicate: expect.any(Function),
    });
  });

  it("a non-default family invalidates only its own family-appended key", () => {
    expect(stewardsInvalidation(FAMILY_A)).toEqual({
      queryKey: ["governance", "stewards", FAMILY_A],
    });
  });

  it("a non-default family's invalidation leaves another family's roster cache untouched", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "stewards", FAMILY_A], []);
    queryClient.setQueryData(["governance", "stewards", FAMILY_B], []);
    queryClient.setQueryData(["governance", "stewards"], []);

    void queryClient.invalidateQueries(stewardsInvalidation(FAMILY_A));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "stewards", FAMILY_A])).toBe(true);
    expect(isInvalidated(["governance", "stewards", FAMILY_B])).toBe(false);
    // The bare default key is not a prefix match for a family-appended key.
    expect(isInvalidated(["governance", "stewards"])).toBe(false);
  });

  it("the default family invalidates the bare default key", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "stewards"], []);

    void queryClient.invalidateQueries(stewardsInvalidation(undefined));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "stewards"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Default-family invalidation is exact: it must not reach a non-default
// family's roster cache. React Query matches by key PREFIX, so the bare
// ['governance','stewards'] filter would otherwise also invalidate
// ['governance','stewards','family-a'] and ['governance','stewards','family-b'].
// ---------------------------------------------------------------------------

describe("stewardsInvalidation(undefined) is exact to the default key (cover)", () => {
  /** Seeds the three roster cache shapes and reports which are invalidated. */
  function invalidationOutcome(
    filters: ReturnType<typeof stewardsInvalidation>,
  ) {
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

  it("matches only ['governance','stewards']", () => {
    const outcome = invalidationOutcome(stewardsInvalidation(undefined));

    expect(outcome.defaultKey).toBe(true);
    expect(outcome.familyA).toBe(false);
    expect(outcome.familyB).toBe(false);
  });

  it("leaves the Family A roster cache untouched", () => {
    const outcome = invalidationOutcome(stewardsInvalidation(undefined));
    expect(outcome.familyA).toBe(false);
  });

  it("leaves the Family B roster cache untouched", () => {
    const outcome = invalidationOutcome(stewardsInvalidation(undefined));
    expect(outcome.familyB).toBe(false);
  });

  it("still records the bare ['governance','stewards'] query key", () => {
    expect(stewardsInvalidation(undefined)).toEqual({
      queryKey: ["governance", "stewards"],
      predicate: expect.any(Function),
    });
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior remains unchanged
// ---------------------------------------------------------------------------

describe("useListStewards: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, calls listStewards() with no arguments and the bare key", async () => {
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

  it("with familyId 'norwood', keeps the legacy bare key and no-familyId call", async () => {
    const { result } = renderHook(
      () => ({ stewards: useListStewards(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.stewards.isSuccess).toBe(true));
    expect(calls.listStewards).toEqual([[]]);
    expect(calls.listStewardsForFamily).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewards"]);
    expect(keys).not.toContainEqual(["governance", "stewards", "norwood"]);
  });
});
