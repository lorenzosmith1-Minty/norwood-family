import "@testing-library/jest-dom/vitest";
import {
  type Relationship,
  RelationshipStatus,
  RelationshipType,
  type Result_11,
  type Result_41,
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
  useAddRelationship,
  useCorrectRelationshipType,
  useListPersonRelationships,
  useRemoveRelationship,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped direct relationship-governance change.
//
// The direct relationship hooks in src/frontend/src/hooks/useGovernance.ts fork
// on the centralized active family (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy no-familyId
//     endpoints with the existing bare ['governance','relationships',personId]
//     key, unchanged.
//   * NON-default family -> the canonical `*ForFamily` endpoint with the active
//     familyId as the FIRST argument, and the familyId appended to the read
//     query key so caches never collide:
//       - useListPersonRelationships -> listPersonRelationshipsForFamily(familyId, personId)
//       - useAddRelationship        -> addRelationshipForFamily(familyId, from, to, type)
//       - useRemoveRelationship     -> removeRelationshipForFamily(familyId, relationshipId)
//       - useCorrectRelationshipType-> correctRelationshipTypeForFamily(familyId, relationshipId, type)
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint each hook calls and with which argument tuple — over a typed local
// actor mock. It does not exercise the real canister (see coverageLimits).
//
// The default-family contract is frozen separately by
// GovernanceRelationshipDefaultFamilyCharacterize; this file must not weaken it.
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    listPersonRelationships: [],
    listPersonRelationshipsForFamily: [],
    addRelationship: [],
    addRelationshipForFamily: [],
    removeRelationship: [],
    removeRelationshipForFamily: [],
    correctRelationshipType: [],
    correctRelationshipTypeForFamily: [],
  };

  const mockActor = {
    async listPersonRelationships(...args: unknown[]): Promise<unknown> {
      calls.listPersonRelationships.push(args);
      return [];
    },
    async listPersonRelationshipsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listPersonRelationshipsForFamily.push(args);
      return [];
    },
    async addRelationship(...args: unknown[]): Promise<unknown> {
      calls.addRelationship.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async addRelationshipForFamily(...args: unknown[]): Promise<unknown> {
      calls.addRelationshipForFamily.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async removeRelationship(...args: unknown[]): Promise<unknown> {
      calls.removeRelationship.push(args);
      return { __kind__: "ok", ok: null };
    },
    async removeRelationshipForFamily(...args: unknown[]): Promise<unknown> {
      calls.removeRelationshipForFamily.push(args);
      return { __kind__: "ok", ok: null };
    },
    async correctRelationshipType(...args: unknown[]): Promise<unknown> {
      calls.correctRelationshipType.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async correctRelationshipTypeForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.correctRelationshipTypeForFamily.push(args);
      return { __kind__: "ok", ok: {} };
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
    identity: { getPrincipal: () => STEWARD },
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Wraps the hook in a QueryClient and an explicit active family. */
function wrapperFor(familyId: string | undefined) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = makeQueryClient();
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

/** Wraps the hook in a caller-supplied QueryClient and an explicit family. */
function wrapperWithClient(
  queryClient: QueryClient,
  familyId: string | undefined,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
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

function keyProbe() {
  return useQueryClient();
}

const seededRelationship: Relationship = {
  familyId: "norwood",
  id: 11n,
  fromPersonId: "clayton",
  toPersonId: "erma",
  relationshipType: RelationshipType.SpousePartner,
  status: RelationshipStatus.Confirmed,
};

// ---------------------------------------------------------------------------
// Direct add relationship: non-default family routes to addRelationshipForFamily
// ---------------------------------------------------------------------------

describe("useAddRelationship: non-default family routes to addRelationshipForFamily (cover)", () => {
  it("Family A calls addRelationshipForFamily('family-a', from, to, type) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.addRelationshipForFamily).toEqual([
      [FAMILY_A, "clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.addRelationship).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.addRelationshipForFamily).toEqual([
      [FAMILY_B, "clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.addRelationship).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const okResult: Result_41 = { __kind__: "ok", ok: seededRelationship };
    mockActor.addRelationshipForFamily = vi.fn(async (...args: unknown[]) => {
      calls.addRelationshipForFamily.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    expect(returned).toBe(okResult);
  });
});

// ---------------------------------------------------------------------------
// Direct add relationship: default family keeps the legacy call shape
// ---------------------------------------------------------------------------

describe("useAddRelationship: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, calls addRelationship(from, to, type) and not the family endpoint", async () => {
    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor(undefined),
    });

    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.addRelationship).toEqual([
      ["clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.addRelationshipForFamily).toEqual([]);
  });

  it("with familyId 'norwood', keeps the legacy no-familyId call", async () => {
    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor("norwood"),
    });

    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.addRelationship).toEqual([
      ["clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.addRelationshipForFamily).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Relationship read: non-default family routes to listPersonRelationshipsForFamily
// ---------------------------------------------------------------------------

describe("useListPersonRelationships: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls listPersonRelationshipsForFamily('family-a', personId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListPersonRelationships("clayton"), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPersonRelationshipsForFamily).toEqual([
      [FAMILY_A, "clayton"],
    ]);
    expect(calls.listPersonRelationships).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useListPersonRelationships("clayton"), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPersonRelationshipsForFamily).toEqual([
      [FAMILY_B, "clayton"],
    ]);
    expect(calls.listPersonRelationships).toEqual([]);
  });

  it("surfaces the relationships the family endpoint returns", async () => {
    mockActor.listPersonRelationshipsForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listPersonRelationshipsForFamily.push(args);
        return [seededRelationship];
      },
    );

    const { result } = renderHook(() => useListPersonRelationships("clayton"), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRelationship]);
  });
});

// ---------------------------------------------------------------------------
// Relationship read: family-separated query key
// ---------------------------------------------------------------------------

describe("useListPersonRelationships: family-separated query key (cover)", () => {
  it("registers ['governance','relationships',personId,familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({
        relationships: useListPersonRelationships("clayton"),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() =>
      expect(result.current.relationships.isSuccess).toBe(true),
    );
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "governance",
      "relationships",
      "clayton",
      FAMILY_A,
    ]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual(["governance", "relationships", "clayton"]);
  });

  it("registers the legacy ['governance','relationships',personId] key for the default family", async () => {
    const { result } = renderHook(
      () => ({
        relationships: useListPersonRelationships("clayton"),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() =>
      expect(result.current.relationships.isSuccess).toBe(true),
    );
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "relationships", "clayton"]);
    expect(keys).not.toContainEqual([
      "governance",
      "relationships",
      "clayton",
      "norwood",
    ]);
  });

  it("Family A and Family B do not share a relationship cache entry", async () => {
    const familyA = renderHook(
      () => ({
        relationships: useListPersonRelationships("clayton"),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.relationships.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({
        relationships: useListPersonRelationships("clayton"),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.relationships.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual([
      "governance",
      "relationships",
      "clayton",
      FAMILY_A,
    ]);
    expect(keysB).toContainEqual([
      "governance",
      "relationships",
      "clayton",
      FAMILY_B,
    ]);
    expect(keysA).not.toContainEqual([
      "governance",
      "relationships",
      "clayton",
      FAMILY_B,
    ]);
    expect(keysB).not.toContainEqual([
      "governance",
      "relationships",
      "clayton",
      FAMILY_A,
    ]);
    expect(keysA).not.toEqual(keysB);
  });
});

// ---------------------------------------------------------------------------
// Remove: non-default family routes to removeRelationshipForFamily
// ---------------------------------------------------------------------------

describe("useRemoveRelationship: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls removeRelationshipForFamily('family-a', relationshipId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate(11n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.removeRelationshipForFamily).toEqual([[FAMILY_A, 11n]]);
    expect(calls.removeRelationship).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate(11n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.removeRelationshipForFamily).toEqual([[FAMILY_B, 11n]]);
    expect(calls.removeRelationship).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const okResult: Result_11 = { __kind__: "ok", ok: null };
    mockActor.removeRelationshipForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.removeRelationshipForFamily.push(args);
        return okResult;
      },
    );

    const { result } = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync(11n);

    expect(returned).toBe(okResult);
  });

  it("a non-default family invalidates only the active family's relationship keys", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      ["governance", "relationships", "clayton", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "relationships", "clayton", FAMILY_B],
      [],
    );

    const { result } = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate(11n);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "relationships", "clayton", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "relationships", "clayton", FAMILY_B]),
    ).toBe(false);
  });

  it("the default family keeps the legacy bare relationship prefix invalidation", async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperWithClient(queryClient, undefined),
    });
    result.current.mutate(11n);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "relationships"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

// ---------------------------------------------------------------------------
// Correct: non-default family routes to correctRelationshipTypeForFamily
// ---------------------------------------------------------------------------

describe("useCorrectRelationshipType: non-default family routes to the family endpoint (cover)", () => {
  it("Family A calls correctRelationshipTypeForFamily('family-a', relationshipId, type) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    result.current.mutate({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.correctRelationshipTypeForFamily).toEqual([
      [FAMILY_A, 11n, RelationshipType.Sibling],
    ]);
    expect(calls.correctRelationshipType).toEqual([]);
  });

  it("Family B passes 'family-b' as the first argument", async () => {
    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    result.current.mutate({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.correctRelationshipTypeForFamily).toEqual([
      [FAMILY_B, 11n, RelationshipType.Sibling],
    ]);
    expect(calls.correctRelationshipType).toEqual([]);
  });

  it("surfaces the backend Result unchanged for a non-default family", async () => {
    const corrected: Relationship = {
      ...seededRelationship,
      relationshipType: RelationshipType.Sibling,
    };
    const okResult: Result_41 = { __kind__: "ok", ok: corrected };
    mockActor.correctRelationshipTypeForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.correctRelationshipTypeForFamily.push(args);
        return okResult;
      },
    );

    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const returned = await result.current.mutateAsync({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });

    expect(returned).toBe(okResult);
  });

  it("a non-default family invalidates only the active family's relationship keys", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      ["governance", "relationships", "clayton", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "relationships", "clayton", FAMILY_B],
      [],
    );

    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "relationships", "clayton", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "relationships", "clayton", FAMILY_B]),
    ).toBe(false);
  });

  it("the default family keeps the legacy bare relationship prefix invalidation", async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperWithClient(queryClient, undefined),
    });
    result.current.mutate({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "relationships"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

// ---------------------------------------------------------------------------
// Add relationship invalidation is family-exact for a non-default family
// ---------------------------------------------------------------------------

describe("useAddRelationship: non-default invalidation is family-exact (cover)", () => {
  it("invalidates the active family's from/to person keys and not another family's", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      ["governance", "relationships", "clayton", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "relationships", "erma", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "relationships", "clayton", FAMILY_B],
      [],
    );

    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperWithClient(queryClient, FAMILY_A),
    });
    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "relationships", "clayton", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "relationships", "erma", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "relationships", "clayton", FAMILY_B]),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No non-default relationship-governance hook calls a legacy no-familyId endpoint
// ---------------------------------------------------------------------------

describe("non-default relationship governance never calls a legacy no-familyId endpoint (cover)", () => {
  it("every hook uses only its family endpoint and never the legacy endpoint", async () => {
    const add = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    add.result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });
    await waitFor(() => expect(add.result.current.isSuccess).toBe(true));

    const remove = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    remove.result.current.mutate(11n);
    await waitFor(() => expect(remove.result.current.isSuccess).toBe(true));

    const correct = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    correct.result.current.mutate({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });
    await waitFor(() => expect(correct.result.current.isSuccess).toBe(true));

    const list = renderHook(() => useListPersonRelationships("clayton"), {
      wrapper: wrapperFor(FAMILY_A),
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    // Every non-default hook routes to its family-scoped endpoint with the
    // active familyId as the first argument, and never to the legacy endpoint.
    expect(calls.addRelationshipForFamily).toEqual([
      [FAMILY_A, "clayton", "erma", RelationshipType.SpousePartner],
    ]);
    expect(calls.removeRelationshipForFamily).toEqual([[FAMILY_A, 11n]]);
    expect(calls.correctRelationshipTypeForFamily).toEqual([
      [FAMILY_A, 11n, RelationshipType.Sibling],
    ]);
    expect(calls.listPersonRelationshipsForFamily).toEqual([
      [FAMILY_A, "clayton"],
    ]);
    expect(calls.addRelationship).toEqual([]);
    expect(calls.removeRelationship).toEqual([]);
    expect(calls.correctRelationshipType).toEqual([]);
    expect(calls.listPersonRelationships).toEqual([]);
  });
});
