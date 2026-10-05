import "@testing-library/jest-dom/vitest";
import {
  type Relationship,
  RelationshipStatus,
  RelationshipType,
  type Result_12,
  type Result_46,
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
  useAddRelationship,
  useCorrectRelationshipType,
  useListPersonRelationships,
  useRemoveRelationship,
} from "./hooks/useGovernance";
import {
  confirmedRelationshipsInvalidation,
  myRelationshipRequestsInvalidation,
  relationshipRequestsInvalidation,
} from "./hooks/useRelationshipRequests";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped governance relationship
// change.
//
// The requested change adds a non-default-family branch to `useAddRelationship`
// in src/frontend/src/hooks/useGovernance.ts: a non-default family will call
// `actor.addRelationshipForFamily(familyScopedId, ...)` while the DEFAULT family
// keeps `actor.addRelationship(...)`. The same family fork is expected to reach
// the sibling relationship actions (`useRemoveRelationship`,
// `useCorrectRelationshipType`) and the relationship read
// (`useListPersonRelationships`).
//
// This file freezes the CURRENT DEFAULT-FAMILY behavior of those four hooks:
// which legacy no-familyId method each calls, with which argument tuple, the
// query key the read registers, and the invalidation surface each mutation
// applies. That is the seam the family fork must keep compatible for the
// default family.
//
// It deliberately does NOT assert the absence of a `familyId` argument or the
// absence of `*ForFamily` methods: adding those is exactly the change under way.
// It also does NOT freeze the legacy-only call shape for a non-default family,
// which is the behavior the change intentionally introduces. It does not assert
// two-family isolation, which is new behavior rather than existing behavior to
// protect.
//
// It also characterizes the family-aware invalidation helpers exported by
// src/frontend/src/hooks/useRelationshipRequests.ts. Those helpers are already
// family-exact; the change must not broaden them. The default branch is
// asserted to target only the default (`null` family slot) keys, and the
// non-default branch to target only the active family's keys.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listPersonRelationships: unknown[][];
    addRelationship: unknown[][];
    removeRelationship: unknown[][];
    correctRelationshipType: unknown[][];
  } = {
    listPersonRelationships: [],
    addRelationship: [],
    removeRelationship: [],
    correctRelationshipType: [],
  };

  const mockActor = {
    async listPersonRelationships(...args: unknown[]): Promise<unknown> {
      calls.listPersonRelationships.push(args);
      return [];
    },
    async addRelationship(...args: unknown[]): Promise<unknown> {
      calls.addRelationship.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async removeRelationship(...args: unknown[]): Promise<unknown> {
      calls.removeRelationship.push(args);
      return { __kind__: "ok", ok: null };
    },
    async correctRelationshipType(...args: unknown[]): Promise<unknown> {
      calls.correctRelationshipType.push(args);
      return { __kind__: "ok", ok: {} };
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

afterEach(cleanup);
beforeEach(resetCalls);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = makeQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const seededRelationship: Relationship = {
  familyId: "norwood",
  id: 11n,
  fromPersonId: "clayton",
  toPersonId: "erma",
  relationshipType: RelationshipType.SpousePartner,
  status: RelationshipStatus.Confirmed,
};

describe("useListPersonRelationships: default-family consumer contract (characterization)", () => {
  it("calls listPersonRelationships(personId) with no familyId argument", async () => {
    const { result } = renderHook(() => useListPersonRelationships("clayton"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy read identifies the person by personId; the default family is
    // the backend's concern, not an argument the hook supplies.
    expect(calls.listPersonRelationships).toEqual([["clayton"]]);
  });

  it("registers the legacy ['governance','relationships',personId] key", async () => {
    const { result } = renderHook(
      () => ({
        relationships: useListPersonRelationships("clayton"),
        client: useQueryClient(),
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.relationships.isSuccess).toBe(true),
    );
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "relationships", "clayton"]);
  });

  it("surfaces the relationships the backend returns", async () => {
    mockActor.listPersonRelationships = vi.fn(async (...args: unknown[]) => {
      calls.listPersonRelationships.push(args);
      return [seededRelationship];
    });

    const { result } = renderHook(() => useListPersonRelationships("clayton"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([seededRelationship]);
  });
});

describe("useAddRelationship: default-family consumer contract (characterization)", () => {
  it("calls addRelationship(fromPersonId, toPersonId, relationshipType) in that order", async () => {
    const { result } = renderHook(() => useAddRelationship(), { wrapper });

    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.addRelationship).toEqual([
      ["clayton", "erma", RelationshipType.SpousePartner],
    ]);
  });

  it("surfaces the backend Result unchanged", async () => {
    const okResult: Result_46 = {
      __kind__: "ok",
      ok: seededRelationship,
    };
    mockActor.addRelationship = vi.fn(async (...args: unknown[]) => {
      calls.addRelationship.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useAddRelationship(), { wrapper });
    const returned = await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    expect(returned).toBe(okResult);
  });

  it("invalidates both endpoints' relationship lists and the audit history", async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "relationships", "clayton"]);
    expect(keys).toContainEqual(["governance", "relationships", "erma"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useRemoveRelationship: default-family consumer contract (characterization)", () => {
  it("calls removeRelationship(relationshipId) with no familyId argument", async () => {
    const { result } = renderHook(() => useRemoveRelationship(), { wrapper });

    result.current.mutate(11n);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.removeRelationship).toEqual([[11n]]);
  });

  it("surfaces the backend Result unchanged", async () => {
    const okResult: Result_12 = { __kind__: "ok", ok: null };
    mockActor.removeRelationship = vi.fn(async (...args: unknown[]) => {
      calls.removeRelationship.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useRemoveRelationship(), { wrapper });
    const returned = await result.current.mutateAsync(11n);

    expect(returned).toBe(okResult);
  });

  it("invalidates the relationship list prefix and the audit history", async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveRelationship(), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(11n);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "relationships"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useCorrectRelationshipType: default-family consumer contract (characterization)", () => {
  it("calls correctRelationshipType(relationshipId, relationshipType) in that order", async () => {
    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper,
    });

    result.current.mutate({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.correctRelationshipType).toEqual([
      [11n, RelationshipType.Sibling],
    ]);
  });

  it("surfaces the backend Result unchanged", async () => {
    const corrected: Relationship = {
      ...seededRelationship,
      relationshipType: RelationshipType.Sibling,
    };
    const okResult: Result_46 = { __kind__: "ok", ok: corrected };
    mockActor.correctRelationshipType = vi.fn(async (...args: unknown[]) => {
      calls.correctRelationshipType.push(args);
      return okResult;
    });

    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync({
      relationshipId: 11n,
      relationshipType: RelationshipType.Sibling,
    });

    expect(returned).toBe(okResult);
  });

  it("invalidates the relationship list prefix and the audit history", async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCorrectRelationshipType(), {
      wrapper: wrapperFor(queryClient),
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
// Family-aware invalidation helpers in useRelationshipRequests.ts.
//
// These helpers are already family-exact. The change must not broaden them: the
// default branch must target only the default (`null` family slot) keys, and a
// non-default branch must target only the active family's keys. The helpers are
// pure functions of `familyScopedId`, so they are asserted directly against
// representative query keys.
// ---------------------------------------------------------------------------

type Predicate = (query: { queryKey: unknown[] }) => boolean;

function predicateOf(filters: {
  predicate?: unknown;
}): Predicate {
  expect(typeof filters.predicate).toBe("function");
  return filters.predicate as Predicate;
}

describe("relationshipRequestsInvalidation: family-exact filter (characterization)", () => {
  it("the default branch admits only the default list and detail keys", () => {
    const filters = relationshipRequestsInvalidation(undefined);
    expect(filters.queryKey).toEqual(["relationshipRequests"]);
    const predicate = predicateOf(filters);

    expect(predicate({ queryKey: ["relationshipRequests", null] })).toBe(true);
    expect(predicate({ queryKey: ["relationshipRequests", null, "13"] })).toBe(
      true,
    );
    // A non-default family's key is never matched by the default branch.
    expect(predicate({ queryKey: ["relationshipRequests", "family-a"] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["relationshipRequests", "family-a", "13"] }),
    ).toBe(false);
  });

  it("a non-default branch admits only the active family's keys", () => {
    const filters = relationshipRequestsInvalidation("family-a");
    expect(filters.queryKey).toEqual(["relationshipRequests"]);
    const predicate = predicateOf(filters);

    expect(predicate({ queryKey: ["relationshipRequests", "family-a"] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["relationshipRequests", "family-a", "13"] }),
    ).toBe(true);
    expect(predicate({ queryKey: ["relationshipRequests", null] })).toBe(false);
    expect(predicate({ queryKey: ["relationshipRequests", "family-b"] })).toBe(
      false,
    );
  });
});

describe("confirmedRelationshipsInvalidation: family-exact filter (characterization)", () => {
  it("the default branch admits only the exact default key", () => {
    const filters = confirmedRelationshipsInvalidation(undefined);
    expect(filters.queryKey).toEqual(["confirmedRelationships"]);
    const predicate = predicateOf(filters);

    expect(predicate({ queryKey: ["confirmedRelationships", null] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["confirmedRelationships", "family-a"] }),
    ).toBe(false);
  });

  it("a non-default branch admits only the active family's key", () => {
    const filters = confirmedRelationshipsInvalidation("family-a");
    expect(filters.queryKey).toEqual(["confirmedRelationships"]);
    const predicate = predicateOf(filters);

    expect(
      predicate({ queryKey: ["confirmedRelationships", "family-a"] }),
    ).toBe(true);
    expect(predicate({ queryKey: ["confirmedRelationships", null] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["confirmedRelationships", "family-b"] }),
    ).toBe(false);
  });
});

describe("myRelationshipRequestsInvalidation: family-exact filter (characterization)", () => {
  it("the default branch admits only the exact default key", () => {
    const filters = myRelationshipRequestsInvalidation(undefined);
    expect(filters.queryKey).toEqual(["myRelationshipRequests"]);
    const predicate = predicateOf(filters);

    expect(predicate({ queryKey: ["myRelationshipRequests", null] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["myRelationshipRequests", "family-a"] }),
    ).toBe(false);
  });

  it("a non-default branch admits only the active family's key", () => {
    const filters = myRelationshipRequestsInvalidation("family-a");
    expect(filters.queryKey).toEqual(["myRelationshipRequests"]);
    const predicate = predicateOf(filters);

    expect(
      predicate({ queryKey: ["myRelationshipRequests", "family-a"] }),
    ).toBe(true);
    expect(predicate({ queryKey: ["myRelationshipRequests", null] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["myRelationshipRequests", "family-b"] }),
    ).toBe(false);
  });
});
