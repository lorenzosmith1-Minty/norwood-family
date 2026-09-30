import "@testing-library/jest-dom/vitest";
import {
  type StewardIdentity,
  type StewardRecord,
  StewardRoleStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useListEligibleStewardCandidates,
  useListStewardIdentities,
  useListStewards,
  useRemoveSteward,
  useSingleStewardWarning,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Steward/Successor change.
//
// The requested change adds a family fork to the Steward/Successor hooks in
// src/frontend/src/hooks/useGovernance.ts: a non-default family routes to the
// `*ForFamily` actor methods with family-separated query keys, while the
// DEFAULT family (familyScopedId === undefined) must keep calling the legacy
// no-familyId methods with the existing bare ['governance', ...] keys.
//
// The existing GovernanceDefaultFamilyHookContractCharacterize and
// GovernanceSuccessorConsumerContractCharacterize files already freeze the
// default-family contract for usePromoteToSteward, useActivateSuccessor,
// useDesignateSuccessor, and useListSuccessors. This file freezes the remaining
// default-family Steward/Successor consumer contract the change touches:
//
//   * useListStewards            -> listStewards()            + ['governance','stewards']
//   * useListStewardIdentities   -> listStewardIdentities()   + ['governance','stewardIdentities']
//   * useListEligibleStewardCandidates -> listEligibleStewardCandidates()
//                                    + ['governance','eligibleStewardCandidates']
//   * useRemoveSteward           -> removeSteward(accountId)  + the exact invalidation surface
//   * useSingleStewardWarning    -> getSingleStewardWarning() + ['governance','singleStewardWarning']
//
// It deliberately does NOT assert the absence of a `familyId` argument or the
// absence of `*ForFamily` methods: adding those is exactly the change under way.
// It also does not assert two-family isolation, which is the new behavior the
// change introduces rather than existing behavior to protect.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");
const REMOVED = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listStewards: unknown[][];
    listStewardIdentities: unknown[][];
    listEligibleStewardCandidates: unknown[][];
    removeSteward: unknown[][];
    getSingleStewardWarning: unknown[][];
  } = {
    listStewards: [],
    listStewardIdentities: [],
    listEligibleStewardCandidates: [],
    removeSteward: [],
    getSingleStewardWarning: [],
  };

  const mockActor = {
    async listStewards(...args: unknown[]): Promise<unknown> {
      calls.listStewards.push(args);
      return [];
    },
    async listStewardIdentities(...args: unknown[]): Promise<unknown> {
      calls.listStewardIdentities.push(args);
      return [];
    },
    async listEligibleStewardCandidates(...args: unknown[]): Promise<unknown> {
      calls.listEligibleStewardCandidates.push(args);
      return [];
    },
    async removeSteward(...args: unknown[]): Promise<unknown> {
      calls.removeSteward.push(args);
      return { __kind__: "ok", ok: null };
    },
    async getSingleStewardWarning(...args: unknown[]): Promise<unknown> {
      calls.getSingleStewardWarning.push(args);
      return null;
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
    identity: { getPrincipal: () => STEWARD },
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
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

function stewardRecord(account: Principal): StewardRecord {
  return {
    familyId: "norwood",
    stewardAccountId: account,
    roleStatus: StewardRoleStatus.Active,
    successorPriority: undefined,
    assignedBy: STEWARD,
    assignedAt: 1_700_000_000_000_000_000n,
    founding: false,
  };
}

function stewardIdentity(
  personId: string,
  account: Principal,
): StewardIdentity {
  return {
    personId,
    accountId: account,
    displayName: "Julia Norwood",
    canonicalName: "Julia Norwood",
  };
}

describe("useListStewards: default-family consumer contract (characterization)", () => {
  it("calls listStewards() with no arguments", async () => {
    const { result } = renderHook(() => useListStewards(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy read takes no family argument; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listStewards).toEqual([[]]);
  });

  it("registers the legacy ['governance','stewards'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({ stewards: useListStewards(), client: useQueryClient() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.stewards.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewards"]);
  });

  it("surfaces the steward records the backend returns", async () => {
    const records = [stewardRecord(STEWARD), stewardRecord(REMOVED)];
    mockActor.listStewards = vi.fn(async (...args: unknown[]) => {
      calls.listStewards.push(args);
      return records;
    });

    const { result } = renderHook(() => useListStewards(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(records);
  });
});

describe("useListStewardIdentities: default-family consumer contract (characterization)", () => {
  it("calls listStewardIdentities() with no arguments", async () => {
    const { result } = renderHook(() => useListStewardIdentities(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listStewardIdentities).toEqual([[]]);
  });

  it("registers the legacy ['governance','stewardIdentities'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        identities: useListStewardIdentities(),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.identities.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewardIdentities"]);
  });

  it("surfaces the identities the backend returns", async () => {
    const identities = [stewardIdentity("julia", REMOVED)];
    mockActor.listStewardIdentities = vi.fn(async (...args: unknown[]) => {
      calls.listStewardIdentities.push(args);
      return identities;
    });

    const { result } = renderHook(() => useListStewardIdentities(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(identities);
  });
});

describe("useListEligibleStewardCandidates: default-family consumer contract (characterization)", () => {
  it("calls listEligibleStewardCandidates() with no arguments", async () => {
    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listEligibleStewardCandidates).toEqual([[]]);
  });

  it("registers the legacy ['governance','eligibleStewardCandidates'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "eligibleStewardCandidates"]);
  });

  it("surfaces the eligible candidates the backend returns", async () => {
    const candidates = [stewardIdentity("julia", REMOVED)];
    mockActor.listEligibleStewardCandidates = vi.fn(
      async (...args: unknown[]) => {
        calls.listEligibleStewardCandidates.push(args);
        return candidates;
      },
    );

    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(candidates);
  });
});

describe("useRemoveSteward: default-family consumer contract (characterization)", () => {
  it("calls removeSteward(stewardAccountId) with no familyId argument", async () => {
    const { result } = renderHook(() => useRemoveSteward(), { wrapper });

    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy method takes exactly the steward account id; the default family
    // is the backend's concern, not an argument the hook supplies.
    expect(calls.removeSteward).toEqual([[REMOVED]]);
  });

  it("surfaces the backend result unchanged", async () => {
    mockActor.removeSteward = vi.fn(async (...args: unknown[]) => {
      calls.removeSteward.push(args);
      return { __kind__: "ok", ok: null };
    });

    const { result } = renderHook(() => useRemoveSteward(), { wrapper });
    result.current.mutate(REMOVED);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: null });
  });

  it("removal invalidates the steward roster, audit history, and authority queries", async () => {
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

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "stewards"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
    expect(keys).toContainEqual(["isSteward"]);
    expect(keys).toContainEqual(["hasActiveSteward"]);
  });
});

describe("useSingleStewardWarning: default-family consumer contract (characterization)", () => {
  it("calls getSingleStewardWarning() with no arguments", async () => {
    const { result } = renderHook(() => useSingleStewardWarning(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getSingleStewardWarning).toEqual([[]]);
  });

  it("registers the legacy ['governance','singleStewardWarning'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: useQueryClient() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.warning.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "singleStewardWarning"]);
  });

  it("surfaces the warning string the backend returns", async () => {
    const warning =
      "Designate a successor so the family tree is never left without a steward.";
    mockActor.getSingleStewardWarning = vi.fn(async (...args: unknown[]) => {
      calls.getSingleStewardWarning.push(args);
      return warning;
    });

    const { result } = renderHook(() => useSingleStewardWarning(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(warning);
  });

  it("surfaces null when the backend reports no warning", async () => {
    mockActor.getSingleStewardWarning = vi.fn(async (...args: unknown[]) => {
      calls.getSingleStewardWarning.push(args);
      return null;
    });

    const { result } = renderHook(() => useSingleStewardWarning(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
