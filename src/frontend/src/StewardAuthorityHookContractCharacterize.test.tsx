import "@testing-library/jest-dom/vitest";
import { StewardClaimError } from "@/backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useClaimSteward,
  useHasActiveSteward,
  useIsSteward,
} from "./hooks/useStewardAuthority";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped authorization refactor.
//
// The change makes the backend authorization helpers family-scoped: the
// canonical Steward authority, approved-family membership, and photo/profile
// ownership helpers each take an explicit familyId, and the legacy helpers
// become thin wrappers delegating with DEFAULT_FAMILY_ID ("norwood"). The
// PUBLIC API and its observable default-family behavior must NOT change.
//
// This file freezes the frontend half of that contract: the Steward authority
// hooks are the app's single consumer of the public `isCallerSteward`,
// `hasActiveSteward`, and `claimSteward` methods, and they must keep calling
// exactly those methods with no arguments and keep surfacing the same results
// and cache invalidation. A refactor that renames, re-signatures, or
// family-qualifies the public methods — or that changes what the default-family
// call returns — fails here before it reaches a user.
//
// The per-caller authorization rules themselves live in the PocketIC lane,
// because the frontend suite mocks the actor and has no principals at all. This
// is component/integration coverage over a typed local actor mock; it does not
// exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    isCallerSteward: number;
    hasActiveSteward: number;
    claimSteward: number;
  } = { isCallerSteward: 0, hasActiveSteward: 0, claimSteward: 0 };

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      calls.isCallerSteward += 1;
      return false;
    },
    async hasActiveSteward(): Promise<boolean> {
      calls.hasActiveSteward += 1;
      return false;
    },
    async claimSteward(): Promise<unknown> {
      calls.claimSteward += 1;
      return { __kind__: "ok", ok: {} };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.isCallerSteward = 0;
      calls.hasActiveSteward = 0;
      calls.claimSteward = 0;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
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

describe("Steward authority hook contract (family-scoped authorization baseline)", () => {
  it("useIsSteward calls isCallerSteward() with no arguments and surfaces the boolean", async () => {
    mockActor.isCallerSteward = vi.fn(async () => {
      calls.isCallerSteward += 1;
      return true;
    });

    const { result } = renderHook(() => useIsSteward(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    // The hook calls the public method with no arguments — the default-family
    // call the legacy wrapper must keep serving.
    expect(calls.isCallerSteward).toBe(1);
  });

  it("useHasActiveSteward calls hasActiveSteward() with no arguments and surfaces the boolean", async () => {
    mockActor.hasActiveSteward = vi.fn(async () => {
      calls.hasActiveSteward += 1;
      return true;
    });

    const { result } = renderHook(() => useHasActiveSteward(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(calls.hasActiveSteward).toBe(1);
  });

  it("useClaimSteward calls claimSteward() with no arguments and returns the Result", async () => {
    const okResult = { __kind__: "ok", ok: {} };
    mockActor.claimSteward = vi.fn(async () => {
      calls.claimSteward += 1;
      return okResult;
    });

    const { result } = renderHook(() => useClaimSteward(), { wrapper });

    const returned = await result.current.mutateAsync();
    expect(returned).toBe(okResult);
    expect(calls.claimSteward).toBe(1);
  });

  it("surfaces a refused claim (StewardAlreadyExists) unchanged", async () => {
    // The one-time bootstrap refuses once an active Steward exists. The hook
    // must pass the backend's error variant through without rewriting it.
    const errResult = {
      __kind__: "err",
      err: StewardClaimError.StewardAlreadyExists,
    };
    mockActor.claimSteward = vi.fn(async () => {
      calls.claimSteward += 1;
      return errResult;
    });

    const { result } = renderHook(() => useClaimSteward(), { wrapper });

    const returned = await result.current.mutateAsync();
    expect(returned).toBe(errResult);
  });

  it("invalidates the isSteward and hasActiveSteward query keys after a successful claim", async () => {
    // A successful bootstrap changes both the caller's authority and the global
    // active-Steward flag, so both query keys must be invalidated or the nav
    // entry and claim control go stale.
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    const { result } = renderHook(() => useClaimSteward(), { wrapper });
    await result.current.mutateAsync();

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["isSteward"]);
    expect(invalidatedKeys).toContainEqual(["hasActiveSteward"]);

    invalidateSpy.mockRestore();
  });
});
