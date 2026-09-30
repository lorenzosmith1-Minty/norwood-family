import "@testing-library/jest-dom/vitest";
import { AuditActionType, type AuditEntry } from "@/backend";
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
import {
  governanceAuditHistoryInvalidation,
  useListAuditHistory,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped Governance Audit History read.
//
// The accepted change adds a canonical `listAuditHistoryForFamily(familyId)`
// backend read that returns only the entries stamped with that family and is
// gated on an active Steward of that family, reduces the legacy
// `listAuditHistory()` to a thin DEFAULT_FAMILY_ID wrapper, and forks
// `useListAuditHistory()` on the centralized active family
// (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy
//     `listAuditHistory()` call with no arguments and the bare
//     ['governance','auditHistory'] key.
//   * NON-default family -> `listAuditHistoryForFamily(activeFamilyId)` with the
//     active familyId as the FIRST argument and the familyId appended to the
//     query key, so one family's audit cache is never reused for another.
//
// `governanceAuditHistoryInvalidation` is family-exact: the default family
// invalidates only the bare default key (narrowed to the exact two-element
// shape), a non-default family invalidates only its own family-appended key,
// and another family's audit cache is left untouched.
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint the hook calls and with which argument tuple, and which cache keys
// are invalidated — over a typed local actor mock. It does not exercise the
// real canister; the family boundary itself is covered by the PocketIC lane
// (see coverageLimits).
//
// The default-family contract is frozen separately by the existing
// GovernanceAuditHistoryDefaultFamilyCharacterize file; this file must not
// weaken it.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    listAuditHistory: [],
    listAuditHistoryForFamily: [],
  };

  const mockActor = {
    async listAuditHistory(...args: unknown[]): Promise<unknown[]> {
      calls.listAuditHistory.push(args);
      return [];
    },
    async listAuditHistoryForFamily(...args: unknown[]): Promise<unknown[]> {
      calls.listAuditHistoryForFamily.push(args);
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

function auditEntry(id: bigint, familyId: string, summary: string): AuditEntry {
  return {
    id,
    affectedPersonIds: ["julia"],
    actionType: AuditActionType.StewardPromoted,
    summary,
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: OWNER,
    familyId,
  };
}

// ---------------------------------------------------------------------------
// Non-default family routes to listAuditHistoryForFamily
// ---------------------------------------------------------------------------

describe("useListAuditHistory: non-default family routes to listAuditHistoryForFamily (cover)", () => {
  it("calls listAuditHistoryForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.listAuditHistoryForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listAuditHistory).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listAuditHistoryForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listAuditHistory).toEqual([]);
  });

  it("surfaces the entries the family-scoped endpoint resolves, in order", async () => {
    const entries = [
      auditEntry(2n, FAMILY_A, "Promoted julia in Family A"),
      auditEntry(1n, FAMILY_A, "Designated successor in Family A"),
    ];
    mockActor.listAuditHistoryForFamily = vi.fn(async (...args: unknown[]) => {
      calls.listAuditHistoryForFamily.push(args);
      return entries;
    });

    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(entries);
  });
});

// ---------------------------------------------------------------------------
// Family-separated query/cache keys
// ---------------------------------------------------------------------------

describe("Governance Audit History query keys are family-separated (cover)", () => {
  it("registers ['governance','auditHistory',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "auditHistory", FAMILY_A]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual(["governance", "auditHistory"]);
  });

  it("Family A and Family B do not share an audit-history cache entry", async () => {
    const familyA = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
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
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.audit.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual(["governance", "auditHistory", FAMILY_A]);
    expect(keysB).toContainEqual(["governance", "auditHistory", FAMILY_B]);
    // Neither family's cache is reused for the other.
    expect(keysA).not.toContainEqual(["governance", "auditHistory", FAMILY_B]);
    expect(keysB).not.toContainEqual(["governance", "auditHistory", FAMILY_A]);
    expect(keysA).not.toEqual(keysB);
  });
});

// ---------------------------------------------------------------------------
// governanceAuditHistoryInvalidation is family-exact
// ---------------------------------------------------------------------------

describe("governanceAuditHistoryInvalidation is family-exact (cover)", () => {
  it("the default family invalidates only the bare default key", () => {
    expect(governanceAuditHistoryInvalidation(undefined)).toEqual({
      queryKey: ["governance", "auditHistory"],
      predicate: expect.any(Function),
    });
  });

  it("a non-default family invalidates only its own family-appended key", () => {
    expect(governanceAuditHistoryInvalidation(FAMILY_A)).toEqual({
      queryKey: ["governance", "auditHistory", FAMILY_A],
    });
  });

  it("a non-default family's invalidation leaves another family's audit cache untouched", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "auditHistory", FAMILY_A], []);
    queryClient.setQueryData(["governance", "auditHistory", FAMILY_B], []);
    queryClient.setQueryData(["governance", "auditHistory"], []);

    void queryClient.invalidateQueries(
      governanceAuditHistoryInvalidation(FAMILY_A),
    );

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "auditHistory", FAMILY_A])).toBe(true);
    expect(isInvalidated(["governance", "auditHistory", FAMILY_B])).toBe(false);
    // The bare default key is not a prefix match for a family-appended key.
    expect(isInvalidated(["governance", "auditHistory"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default-family invalidation is exact: it must not reach a non-default
// family's audit cache. React Query matches by key PREFIX, so the bare
// ['governance','auditHistory'] filter would otherwise also invalidate
// ['governance','auditHistory','family-a'] and
// ['governance','auditHistory','family-b'].
// ---------------------------------------------------------------------------

describe("governanceAuditHistoryInvalidation(undefined) is exact to the default key (cover)", () => {
  /** Seeds the three audit cache shapes and reports which are invalidated. */
  function invalidationOutcome(
    filters: ReturnType<typeof governanceAuditHistoryInvalidation>,
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "auditHistory"], []);
    queryClient.setQueryData(["governance", "auditHistory", FAMILY_A], []);
    queryClient.setQueryData(["governance", "auditHistory", FAMILY_B], []);

    void queryClient.invalidateQueries(filters);

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    return {
      defaultKey: isInvalidated(["governance", "auditHistory"]),
      familyA: isInvalidated(["governance", "auditHistory", FAMILY_A]),
      familyB: isInvalidated(["governance", "auditHistory", FAMILY_B]),
    };
  }

  it("matches only ['governance','auditHistory']", () => {
    const outcome = invalidationOutcome(
      governanceAuditHistoryInvalidation(undefined),
    );

    expect(outcome.defaultKey).toBe(true);
    expect(outcome.familyA).toBe(false);
    expect(outcome.familyB).toBe(false);
  });

  it("leaves the Family A audit cache untouched", () => {
    const outcome = invalidationOutcome(
      governanceAuditHistoryInvalidation(undefined),
    );
    expect(outcome.familyA).toBe(false);
  });

  it("leaves the Family B audit cache untouched", () => {
    const outcome = invalidationOutcome(
      governanceAuditHistoryInvalidation(undefined),
    );
    expect(outcome.familyB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior remains unchanged
// ---------------------------------------------------------------------------

describe("useListAuditHistory: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, calls listAuditHistory() with no arguments and the bare key", async () => {
    const { result } = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    expect(calls.listAuditHistory).toEqual([[]]);
    expect(calls.listAuditHistoryForFamily).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });

  it("with familyId 'norwood', keeps the legacy bare key and no-familyId call", async () => {
    const { result } = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    expect(calls.listAuditHistory).toEqual([[]]);
    expect(calls.listAuditHistoryForFamily).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
    expect(keys).not.toContainEqual(["governance", "auditHistory", "norwood"]);
  });
});
