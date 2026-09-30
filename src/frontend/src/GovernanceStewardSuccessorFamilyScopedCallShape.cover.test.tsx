import "@testing-library/jest-dom/vitest";
import type {
  Result_14,
  Result_29,
  StewardIdentity,
  StewardRecord,
  SuccessorDesignation,
} from "@/backend";
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
  useActivateSuccessor,
  useDesignateSuccessor,
  useListStewardIdentities,
  useListSuccessors,
  usePromoteToSteward,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped Steward/Successor governance change.
//
// The Steward/Successor hooks in src/frontend/src/hooks/useGovernance.ts fork
// on the centralized active family (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy no-familyId
//     endpoints with the existing bare ['governance', ...] keys.
//   * NON-default family -> the canonical `*ForFamily` endpoints with the
//     active familyId as the FIRST argument and the familyId in the query key,
//     so caches never collide across families.
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint each hook calls and with which argument tuple — over a typed local
// actor mock. It does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
//
// The default-family contract is frozen separately by the existing
// GovernanceDefaultFamilyHookContractCharacterize,
// GovernanceSuccessorConsumerContractCharacterize, and
// GovernanceStewardReadAndRemovalDefaultFamilyCharacterize files; this file
// must not weaken them.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    promoteToSteward: [],
    promoteToStewardForFamily: [],
    designateSuccessor: [],
    designateSuccessorForFamily: [],
    activateSuccessor: [],
    activateSuccessorForFamily: [],
    listSuccessors: [],
    listSuccessorsForFamily: [],
    listStewardIdentities: [],
    listStewardIdentitiesForFamily: [],
  };

  const okSteward = (): Result_14 => ({
    __kind__: "ok",
    ok: {
      familyId: "norwood",
      stewardAccountId: OWNER,
      roleStatus: "Active",
      successorPriority: undefined,
      assignedBy: OWNER,
      assignedAt: 1_700_000_000_000_000_000n,
    } as StewardRecord,
  });

  const okSuccessor = (): Result_29 => ({
    __kind__: "ok",
    ok: {
      familyId: "norwood",
      personId: "julia",
      priority: 2n,
      status: "Designated",
      assignedBy: OWNER,
      assignedAt: 1_700_000_000_000_000_000n,
    } as SuccessorDesignation,
  });

  const mockActor = {
    async promoteToSteward(...args: unknown[]): Promise<Result_14> {
      calls.promoteToSteward.push(args);
      return okSteward();
    },
    async promoteToStewardForFamily(...args: unknown[]): Promise<Result_14> {
      calls.promoteToStewardForFamily.push(args);
      return okSteward();
    },
    async designateSuccessor(...args: unknown[]): Promise<Result_29> {
      calls.designateSuccessor.push(args);
      return okSuccessor();
    },
    async designateSuccessorForFamily(...args: unknown[]): Promise<Result_29> {
      calls.designateSuccessorForFamily.push(args);
      return okSuccessor();
    },
    async activateSuccessor(...args: unknown[]): Promise<Result_14> {
      calls.activateSuccessor.push(args);
      return okSteward();
    },
    async activateSuccessorForFamily(...args: unknown[]): Promise<Result_14> {
      calls.activateSuccessorForFamily.push(args);
      return okSteward();
    },
    async listSuccessors(...args: unknown[]): Promise<SuccessorDesignation[]> {
      calls.listSuccessors.push(args);
      return [];
    },
    async listSuccessorsForFamily(
      ...args: unknown[]
    ): Promise<SuccessorDesignation[]> {
      calls.listSuccessorsForFamily.push(args);
      return [];
    },
    async listStewardIdentities(
      ...args: unknown[]
    ): Promise<StewardIdentity[]> {
      calls.listStewardIdentities.push(args);
      return [];
    },
    async listStewardIdentitiesForFamily(
      ...args: unknown[]
    ): Promise<StewardIdentity[]> {
      calls.listStewardIdentitiesForFamily.push(args);
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

// ---------------------------------------------------------------------------
// Promote Steward
// ---------------------------------------------------------------------------

describe("usePromoteToSteward: non-default family routes to promoteToStewardForFamily (cover)", () => {
  it("calls promoteToStewardForFamily(familyId, personId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => usePromoteToSteward(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.promoteToStewardForFamily).toEqual([[FAMILY_A, "julia"]]);
    expect(calls.promoteToSteward).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => usePromoteToSteward(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.promoteToStewardForFamily).toEqual([[FAMILY_B, "julia"]]);
    expect(calls.promoteToSteward).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Designate successor
// ---------------------------------------------------------------------------

describe("useDesignateSuccessor: non-default family routes to designateSuccessorForFamily (cover)", () => {
  it("calls designateSuccessorForFamily(familyId, personId, priority) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useDesignateSuccessor(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({ personId: "julia", priority: 2n });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.designateSuccessorForFamily).toEqual([
      [FAMILY_A, "julia", 2n],
    ]);
    expect(calls.designateSuccessor).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useDesignateSuccessor(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({ personId: "julia", priority: 2n });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.designateSuccessorForFamily).toEqual([
      [FAMILY_B, "julia", 2n],
    ]);
    expect(calls.designateSuccessor).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Activate successor
// ---------------------------------------------------------------------------

describe("useActivateSuccessor: non-default family routes to activateSuccessorForFamily (cover)", () => {
  it("calls activateSuccessorForFamily(familyId, personId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useActivateSuccessor(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.activateSuccessorForFamily).toEqual([[FAMILY_A, "julia"]]);
    expect(calls.activateSuccessor).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useActivateSuccessor(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.activateSuccessorForFamily).toEqual([[FAMILY_B, "julia"]]);
    expect(calls.activateSuccessor).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Successor list
// ---------------------------------------------------------------------------

describe("useListSuccessors: non-default family routes to listSuccessorsForFamily (cover)", () => {
  it("calls listSuccessorsForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListSuccessors(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listSuccessorsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listSuccessors).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useListSuccessors(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listSuccessorsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listSuccessors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Steward identity list
// ---------------------------------------------------------------------------

describe("useListStewardIdentities: non-default family routes to listStewardIdentitiesForFamily (cover)", () => {
  it("calls listStewardIdentitiesForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListStewardIdentities(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listStewardIdentitiesForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listStewardIdentities).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useListStewardIdentities(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listStewardIdentitiesForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listStewardIdentities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Family-separated query/cache keys
// ---------------------------------------------------------------------------

describe("Steward/Successor query keys are family-separated (cover)", () => {
  it("useListSuccessors registers ['governance','successors',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ successors: useListSuccessors(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.successors.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "successors", FAMILY_A]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual(["governance", "successors"]);
  });

  it("useListStewardIdentities registers ['governance','stewardIdentities',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ identities: useListStewardIdentities(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.identities.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewardIdentities", FAMILY_A]);
    expect(keys).not.toContainEqual(["governance", "stewardIdentities"]);
  });

  it("Family A and Family B do not share a successor cache entry", async () => {
    const familyA = renderHook(
      () => ({ successors: useListSuccessors(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.successors.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({ successors: useListSuccessors(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.successors.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual(["governance", "successors", FAMILY_A]);
    expect(keysB).toContainEqual(["governance", "successors", FAMILY_B]);
    // Neither family's cache is reused for the other.
    expect(keysA).not.toContainEqual(["governance", "successors", FAMILY_B]);
    expect(keysB).not.toContainEqual(["governance", "successors", FAMILY_A]);
    expect(keysA).not.toEqual(keysB);
  });

  it("Family A and Family B do not share a steward-identity cache entry", async () => {
    const familyA = renderHook(
      () => ({ identities: useListStewardIdentities(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.identities.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({ identities: useListStewardIdentities(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.identities.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual(["governance", "stewardIdentities", FAMILY_A]);
    expect(keysB).toContainEqual(["governance", "stewardIdentities", FAMILY_B]);
    expect(keysA).not.toContainEqual([
      "governance",
      "stewardIdentities",
      FAMILY_B,
    ]);
    expect(keysB).not.toContainEqual([
      "governance",
      "stewardIdentities",
      FAMILY_A,
    ]);
    expect(keysA).not.toEqual(keysB);
  });
});

// ---------------------------------------------------------------------------
// Invalidation narrows to the active family
// ---------------------------------------------------------------------------

describe("Steward/Successor invalidation narrows to the active family (cover)", () => {
  /**
   * Seeds the active family's and another family's cache entries, runs the
   * mutation, and reports which of the two entries React Query actually marked
   * invalidated. This asserts the observable requirement — only the active
   * family's keys are invalidated — rather than the internal predicate shape.
   */
  function seedFamilyCaches(
    queryClient: QueryClient,
    keys: { active: unknown[]; other: unknown[] },
  ) {
    queryClient.setQueryData(keys.active, []);
    queryClient.setQueryData(keys.other, []);
  }

  function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
    return queryClient.getQueryState(key)?.isInvalidated ?? false;
  }

  it("promotion in a non-default family invalidates the active family's steward roster and audit history caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    // The steward roster and audit-history reads are both family-scoped: a
    // non-default family registers ['governance','stewards',familyId] and
    // ['governance','auditHistory',familyId]. Promotion must refresh the active
    // family's roster and audit caches and leave another family's untouched.
    queryClient.setQueryData(["governance", "stewards", FAMILY_A], []);
    queryClient.setQueryData(["governance", "stewards", FAMILY_B], []);
    queryClient.setQueryData(["governance", "auditHistory", FAMILY_A], []);
    queryClient.setQueryData(["governance", "auditHistory", FAMILY_B], []);

    const { result } = renderHook(() => usePromoteToSteward(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      isInvalidated(queryClient, ["governance", "stewards", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["governance", "stewards", FAMILY_B]),
    ).toBe(false);
    expect(
      isInvalidated(queryClient, ["governance", "auditHistory", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["governance", "auditHistory", FAMILY_B]),
    ).toBe(false);
  });

  it("designation in a non-default family invalidates the active family's successor list and not another family's", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    seedFamilyCaches(queryClient, {
      active: ["governance", "successors", FAMILY_A],
      other: ["governance", "successors", FAMILY_B],
    });

    const { result } = renderHook(() => useDesignateSuccessor(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    result.current.mutate({ personId: "julia", priority: 2n });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      isInvalidated(queryClient, ["governance", "successors", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["governance", "successors", FAMILY_B]),
    ).toBe(false);
  });

  it("activation in a non-default family invalidates the active family's successor list and not another family's", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    seedFamilyCaches(queryClient, {
      active: ["governance", "successors", FAMILY_A],
      other: ["governance", "successors", FAMILY_B],
    });

    const { result } = renderHook(() => useActivateSuccessor(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      isInvalidated(queryClient, ["governance", "successors", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["governance", "successors", FAMILY_B]),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior remains unchanged
// ---------------------------------------------------------------------------

describe("Steward/Successor hooks: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, promote/designate/activate/list call the legacy endpoints", async () => {
    const promote = renderHook(() => usePromoteToSteward(), {
      wrapper: wrapperFor(undefined),
    });
    promote.result.current.mutate("julia");
    await waitFor(() => expect(promote.result.current.isSuccess).toBe(true));

    const designate = renderHook(() => useDesignateSuccessor(), {
      wrapper: wrapperFor(undefined),
    });
    designate.result.current.mutate({ personId: "julia", priority: 2n });
    await waitFor(() => expect(designate.result.current.isSuccess).toBe(true));

    const activate = renderHook(() => useActivateSuccessor(), {
      wrapper: wrapperFor(undefined),
    });
    activate.result.current.mutate("julia");
    await waitFor(() => expect(activate.result.current.isSuccess).toBe(true));

    const successors = renderHook(() => useListSuccessors(), {
      wrapper: wrapperFor(undefined),
    });
    await waitFor(() => expect(successors.result.current.isSuccess).toBe(true));

    const identities = renderHook(() => useListStewardIdentities(), {
      wrapper: wrapperFor(undefined),
    });
    await waitFor(() => expect(identities.result.current.isSuccess).toBe(true));

    expect(calls.promoteToSteward).toEqual([["julia"]]);
    expect(calls.designateSuccessor).toEqual([["julia", 2n]]);
    expect(calls.activateSuccessor).toEqual([["julia"]]);
    expect(calls.listSuccessors).toEqual([[]]);
    expect(calls.listStewardIdentities).toEqual([[]]);
    // No non-default endpoint is used for the default family.
    expect(calls.promoteToStewardForFamily).toEqual([]);
    expect(calls.designateSuccessorForFamily).toEqual([]);
    expect(calls.activateSuccessorForFamily).toEqual([]);
    expect(calls.listSuccessorsForFamily).toEqual([]);
    expect(calls.listStewardIdentitiesForFamily).toEqual([]);
  });

  it("with familyId 'norwood', the hooks keep the legacy bare keys and no-familyId calls", async () => {
    const successors = renderHook(
      () => ({ successors: useListSuccessors(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );
    await waitFor(() =>
      expect(successors.result.current.successors.isSuccess).toBe(true),
    );
    const keys = successors.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "successors"]);
    expect(keys).not.toContainEqual(["governance", "successors", "norwood"]);

    const identities = renderHook(
      () => ({ identities: useListStewardIdentities(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );
    await waitFor(() =>
      expect(identities.result.current.identities.isSuccess).toBe(true),
    );
    const identityKeys = identities.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(identityKeys).toContainEqual(["governance", "stewardIdentities"]);
    expect(identityKeys).not.toContainEqual([
      "governance",
      "stewardIdentities",
      "norwood",
    ]);

    expect(calls.listSuccessors).toEqual([[]]);
    expect(calls.listStewardIdentities).toEqual([[]]);
    expect(calls.listSuccessorsForFamily).toEqual([]);
    expect(calls.listStewardIdentitiesForFamily).toEqual([]);
  });
});
