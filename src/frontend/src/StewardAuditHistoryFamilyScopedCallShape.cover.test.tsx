import "@testing-library/jest-dom/vitest";
import type { StewardAuditEntry } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import { useGetStewardAuditHistory } from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped Steward Audit History change: the Audit/History
// hook must fork on the centralized active family.
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy no-argument
//     `getStewardAuditHistory()` with the legacy key
//     ['governance','stewardAuditHistory'].
//   * NON-default family -> the canonical
//     `getStewardAuditHistoryForFamily(familyId)` with the familyId in the key,
//     ['governance','stewardAuditHistory', familyId], so caches never collide
//     across families.
//
// The legacy default-family branch is frozen separately by the existing
// StewardAuditHistoryFamilyScopeCharacterize.test.tsx (which renders the Audit
// History tab through the default family); this file pins both sides of the
// fork at the hook level and asserts the familyId is never hard-coded to
// "norwood".
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint the hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    getStewardAuditHistory: unknown[][];
    getStewardAuditHistoryForFamily: unknown[][];
  } = {
    getStewardAuditHistory: [],
    getStewardAuditHistoryForFamily: [],
  };

  const mockActor = {
    async getStewardAuditHistory(
      ...args: unknown[]
    ): Promise<StewardAuditEntry[]> {
      calls.getStewardAuditHistory.push(args);
      return [];
    },
    async getStewardAuditHistoryForFamily(
      ...args: unknown[]
    ): Promise<StewardAuditEntry[]> {
      calls.getStewardAuditHistoryForFamily.push(args);
      return [];
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

describe("Steward audit history hook: default family keeps the legacy call shape (cover)", () => {
  it("useGetStewardAuditHistory calls getStewardAuditHistory() with no arguments and not the family-scoped endpoint", async () => {
    const { result } = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.getStewardAuditHistory).toEqual([[]]);
    expect(calls.getStewardAuditHistoryForFamily).toEqual([]);
  });

  it("useGetStewardAuditHistory registers the legacy ['governance','stewardAuditHistory'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useGetStewardAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewardAuditHistory"]);
    // The family-qualified key must not be registered for the default family.
    expect(keys).not.toContainEqual([
      "governance",
      "stewardAuditHistory",
      FAMILY_A,
    ]);
  });
});

describe("Steward audit history hook: non-default family routes to *ForFamily (cover)", () => {
  it("useGetStewardAuditHistory calls getStewardAuditHistoryForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the single positional argument — never hard-coded
    // to "norwood".
    expect(calls.getStewardAuditHistoryForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getStewardAuditHistory).toEqual([]);
  });

  it("useGetStewardAuditHistory registers ['governance','stewardAuditHistory',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useGetStewardAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "governance",
      "stewardAuditHistory",
      FAMILY_A,
    ]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["governance", "stewardAuditHistory"]);
  });

  it("returns the entries the family-scoped endpoint resolves", async () => {
    const entry: StewardAuditEntry = {
      id: 1n,
      kind: "Governance",
      actionType: "StewardPromoted",
      summary: "Promoted julia",
      affectedPersonIds: ["julia"],
      timestamp: 1_700_000_000_000_000_000n,
      actorAccountId: OWNER,
    } as StewardAuditEntry;
    mockActor.getStewardAuditHistoryForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.getStewardAuditHistoryForFamily.push(args);
        return [entry];
      },
    );

    const { result } = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([entry]);
  });
});

describe("Steward audit history hook: caches are family-separated (cover)", () => {
  it("two different non-default families produce two distinct query keys", async () => {
    const familyA = renderHook(
      () => ({ audit: useGetStewardAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.audit.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({ audit: useGetStewardAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.audit.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    // Each family registers its own family-qualified key...
    expect(keysA).toContainEqual([
      "governance",
      "stewardAuditHistory",
      FAMILY_A,
    ]);
    expect(keysB).toContainEqual([
      "governance",
      "stewardAuditHistory",
      FAMILY_B,
    ]);
    // ...and neither family's cache is reused for the other.
    expect(keysA).not.toContainEqual([
      "governance",
      "stewardAuditHistory",
      FAMILY_B,
    ]);
    expect(keysB).not.toContainEqual([
      "governance",
      "stewardAuditHistory",
      FAMILY_A,
    ]);
    // The two keys are distinct, so cached history is never reused across
    // families.
    expect(keysA).not.toEqual(keysB);
  });

  it("each non-default family calls the family-scoped endpoint with its own familyId", async () => {
    const familyA = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    await waitFor(() => expect(familyA.result.current.isSuccess).toBe(true));

    const familyB = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: wrapperFor(FAMILY_B),
    });
    await waitFor(() => expect(familyB.result.current.isSuccess).toBe(true));

    expect(calls.getStewardAuditHistoryForFamily).toEqual([
      [FAMILY_A],
      [FAMILY_B],
    ]);
    expect(calls.getStewardAuditHistory).toEqual([]);
  });
});
