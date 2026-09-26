import "@testing-library/jest-dom/vitest";
import {
  type Relationship,
  RelationshipStatus,
  RelationshipType,
  type StewardRecord,
  StewardRoleStatus,
  type SuccessorDesignation,
  SuccessorStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useActivateSuccessor,
  useAddRelationship,
  usePromoteToSteward,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped governance change.
//
// The requested change makes `promoteToStewardForFamily`,
// `activateSuccessorForFamily`, and `addRelationshipForFamily` the canonical
// backend paths, and reduces the existing `promoteToSteward`,
// `activateSuccessor`, and `addRelationship` to thin wrappers that delegate to
// the default Norwood family. The accepted criterion is that the wrappers
// "produce the same default-family behavior as before".
//
// This file freezes the frontend consumer contract for those three operations:
// the Family Governance hooks call the legacy no-familyId methods with exactly
// the argument shapes they use today, and invalidate the same query keys. That
// is the seam the wrapper refactor must keep compatible — a wrapper that
// changes the method name, the argument order, or the invalidation surface
// breaks the governance UI even though the backend still compiles.
//
// It deliberately does NOT assert the absence of a `familyId` argument or the
// absence of `*ForFamily` methods: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");
const PROMOTED = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    promoteToSteward: unknown[][];
    activateSuccessor: unknown[][];
    addRelationship: unknown[][];
  } = {
    promoteToSteward: [],
    activateSuccessor: [],
    addRelationship: [],
  };

  const mockActor = {
    async promoteToSteward(...args: unknown[]): Promise<unknown> {
      calls.promoteToSteward.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async activateSuccessor(...args: unknown[]): Promise<unknown> {
      calls.activateSuccessor.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async addRelationship(...args: unknown[]): Promise<unknown> {
      calls.addRelationship.push(args);
      return { __kind__: "ok", ok: {} };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.promoteToSteward.length = 0;
      calls.activateSuccessor.length = 0;
      calls.addRelationship.length = 0;
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
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

describe("usePromoteToSteward: default-family consumer contract (characterization)", () => {
  it("calls promoteToSteward(personId) with no familyId argument", async () => {
    const { result } = renderHook(() => usePromoteToSteward(), { wrapper });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy method takes exactly the personId; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.promoteToSteward).toEqual([["julia"]]);
  });

  it("surfaces the backend result unchanged", async () => {
    const record: StewardRecord = {
      familyId: "norwood",
      stewardAccountId: PROMOTED,
      roleStatus: StewardRoleStatus.Active,
      successorPriority: undefined,
      assignedBy: STEWARD,
      assignedAt: 1_700_000_000_000_000_000n,
    };
    mockActor.promoteToSteward = vi.fn(async (...args: unknown[]) => {
      calls.promoteToSteward.push(args);
      return { __kind__: "ok", ok: record };
    });

    const { result } = renderHook(() => usePromoteToSteward(), { wrapper });
    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: record });
  });
});

describe("useActivateSuccessor: default-family consumer contract (characterization)", () => {
  it("calls activateSuccessor(personId) with no familyId argument", async () => {
    const { result } = renderHook(() => useActivateSuccessor(), { wrapper });

    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.activateSuccessor).toEqual([["julia"]]);
  });

  it("surfaces the backend result unchanged", async () => {
    const record: StewardRecord = {
      familyId: "norwood",
      stewardAccountId: PROMOTED,
      roleStatus: StewardRoleStatus.Active,
      successorPriority: 1n,
      assignedBy: STEWARD,
      assignedAt: 1_700_000_000_000_000_000n,
    };
    mockActor.activateSuccessor = vi.fn(async (...args: unknown[]) => {
      calls.activateSuccessor.push(args);
      return { __kind__: "ok", ok: record };
    });

    const { result } = renderHook(() => useActivateSuccessor(), { wrapper });
    result.current.mutate("julia");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: record });
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
    // The legacy method takes the two endpoints and the type; the default
    // family is the backend's concern, not an argument the hook supplies.
    expect(calls.addRelationship).toEqual([
      ["clayton", "erma", RelationshipType.SpousePartner],
    ]);
  });

  it("surfaces the backend result unchanged", async () => {
    const relationship: Relationship = {
      familyId: "norwood",
      id: 1n,
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
      status: RelationshipStatus.Confirmed,
    };
    mockActor.addRelationship = vi.fn(async (...args: unknown[]) => {
      calls.addRelationship.push(args);
      return { __kind__: "ok", ok: relationship };
    });

    const { result } = renderHook(() => useAddRelationship(), { wrapper });
    result.current.mutate({
      fromPersonId: "clayton",
      toPersonId: "erma",
      relationshipType: RelationshipType.SpousePartner,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: relationship });
  });
});

describe("governance mutation invalidation surface (characterization)", () => {
  it("promotion invalidates the steward roster, audit history, and authority queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePromoteToSteward(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "stewards"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
    expect(keys).toContainEqual(["isSteward"]);
    expect(keys).toContainEqual(["hasActiveSteward"]);
  });

  it("activation invalidates the successor list, steward roster, audit history, and authority queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useActivateSuccessor(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate("julia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "successors"]);
    expect(keys).toContainEqual(["governance", "stewards"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
    expect(keys).toContainEqual(["isSteward"]);
    expect(keys).toContainEqual(["hasActiveSteward"]);
  });

  it("adding a relationship invalidates both endpoints' relationship lists and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddRelationship(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
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
