import "@testing-library/jest-dom/vitest";
import { type SuccessorDesignation, SuccessorStatus } from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDesignateSuccessor,
  useListSuccessors,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped successor change.
//
// The requested change makes a successor designation family-scoped: the backend
// `designateSuccessor` gains an explicit family, `activateSuccessorForFamily`
// filters its successor lookup by family, and a migration backfills every
// pre-existing designation to the default Norwood family. The accepted
// criterion is that legacy Norwood successor behavior is unchanged.
//
// This file freezes the frontend consumer contract for the two successor hooks
// the change touches: `useDesignateSuccessor` calls the legacy no-familyId
// `designateSuccessor(personId, priority)` with exactly that argument order and
// invalidates the successor list and audit history; `useListSuccessors` calls
// the legacy no-argument `listSuccessors()` and surfaces the designations
// unchanged. That is the seam the family-scoping refactor must keep compatible —
// a change that renames the method, reorders the arguments, or drops the
// invalidation surface breaks the governance UI even though the backend still
// compiles.
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

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    designateSuccessor: unknown[][];
    listSuccessors: unknown[][];
  } = {
    designateSuccessor: [],
    listSuccessors: [],
  };

  const mockActor = {
    async designateSuccessor(...args: unknown[]): Promise<unknown> {
      calls.designateSuccessor.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async listSuccessors(...args: unknown[]): Promise<unknown> {
      calls.listSuccessors.push(args);
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.designateSuccessor.length = 0;
      calls.listSuccessors.length = 0;
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

describe("useDesignateSuccessor: default-family consumer contract (characterization)", () => {
  it("calls designateSuccessor(personId, priority) with no familyId argument", async () => {
    const { result } = renderHook(() => useDesignateSuccessor(), { wrapper });

    result.current.mutate({ personId: "julia", priority: 2n });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy method takes exactly the personId and the priority; the default
    // family is the backend's concern, not an argument the hook supplies.
    expect(calls.designateSuccessor).toEqual([["julia", 2n]]);
  });

  it("surfaces the backend designation unchanged", async () => {
    const designation: SuccessorDesignation = {
      familyId: "norwood",
      personId: "julia",
      priority: 2n,
      status: SuccessorStatus.Designated,
      assignedBy: STEWARD,
      assignedAt: 1_700_000_000_000_000_000n,
    };
    mockActor.designateSuccessor = vi.fn(async (...args: unknown[]) => {
      calls.designateSuccessor.push(args);
      return { __kind__: "ok", ok: designation };
    });

    const { result } = renderHook(() => useDesignateSuccessor(), { wrapper });
    result.current.mutate({ personId: "julia", priority: 2n });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ __kind__: "ok", ok: designation });
  });

  it("designation invalidates the successor list and audit history", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDesignateSuccessor(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    result.current.mutate({ personId: "julia", priority: 2n });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["governance", "successors"]);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });
});

describe("useListSuccessors: default-family consumer contract (characterization)", () => {
  it("calls listSuccessors() with no arguments", async () => {
    const { result } = renderHook(() => useListSuccessors(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy read takes no family argument; the default family is the
    // backend's concern.
    expect(calls.listSuccessors).toEqual([[]]);
  });

  it("surfaces the designations the backend returns", async () => {
    const designations: SuccessorDesignation[] = [
      {
        familyId: "norwood",
        personId: "julia",
        priority: 1n,
        status: SuccessorStatus.Designated,
        assignedBy: STEWARD,
        assignedAt: 1_700_000_000_000_000_000n,
      },
      {
        familyId: "norwood",
        personId: "clayton",
        priority: 2n,
        status: SuccessorStatus.Activated,
        assignedBy: STEWARD,
        assignedAt: 1_700_000_000_000_000_001n,
      },
    ];
    mockActor.listSuccessors = vi.fn(async (...args: unknown[]) => {
      calls.listSuccessors.push(args);
      return designations;
    });

    const { result } = renderHook(() => useListSuccessors(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(designations);
  });
});
