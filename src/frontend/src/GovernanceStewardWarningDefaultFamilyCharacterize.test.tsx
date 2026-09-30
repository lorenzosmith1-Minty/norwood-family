import "@testing-library/jest-dom/vitest";
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
import { useSingleStewardWarning } from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped single-Steward warning.
//
// The requested change makes the single-Steward continuity warning
// family-scoped: it must count only Steward records belonging to the requested
// family. The accepted criterion is that the legacy default-family warning call
// and its bare query key remain unchanged for Norwood.
//
// This file freezes exactly that default-family consumer contract, so the
// family fork cannot silently change it:
//
//   * DEFAULT family (no provider mounted, and an explicit `familyId="norwood"`
//     provider) -> the legacy `getSingleStewardWarning()` call with NO arguments
//     and the bare ['governance','singleStewardWarning'] key.
//   * The warning string the backend returns is surfaced unchanged, and a null
//     backend result surfaces as null.
//
// It deliberately does NOT assert the absence of a `familyId` argument or the
// absence of a `*ForFamily` variant: adding those is exactly the change under
// way. It also does not assert two-family isolation, which is the new behavior
// the change introduces rather than existing behavior to protect.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const STEWARD = Principal.fromText("2vxsx-fae");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: { getSingleStewardWarning: unknown[][] } = {
    getSingleStewardWarning: [],
  };

  const mockActor = {
    async getSingleStewardWarning(...args: unknown[]): Promise<unknown> {
      calls.getSingleStewardWarning.push(args);
      return null;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.getSingleStewardWarning.length = 0;
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

describe("useSingleStewardWarning: default family keeps the legacy call shape (characterization)", () => {
  it("with no family provider mounted, calls getSingleStewardWarning() with no arguments", async () => {
    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy read takes no family argument; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.getSingleStewardWarning).toEqual([[]]);
  });

  it("with no family provider mounted, registers the bare ['governance','singleStewardWarning'] key", async () => {
    const { result } = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.warning.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "singleStewardWarning"]);
  });

  it("with familyId 'norwood', keeps the legacy no-familyId call and the bare key", async () => {
    const { result } = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.warning.isSuccess).toBe(true));
    // Norwood is the default family: it must keep the exact legacy call and the
    // bare key, never a family-appended key.
    expect(calls.getSingleStewardWarning).toEqual([[]]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "singleStewardWarning"]);
    expect(keys).not.toContainEqual([
      "governance",
      "singleStewardWarning",
      "norwood",
    ]);
  });
});

describe("useSingleStewardWarning: default-family value contract (characterization)", () => {
  it("surfaces the warning string the backend returns", async () => {
    const warning =
      "Only one Family Steward remains. Designate a successor steward to ensure continuity.";
    mockActor.getSingleStewardWarning = vi.fn(async (...args: unknown[]) => {
      calls.getSingleStewardWarning.push(args);
      return warning;
    });

    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(warning);
  });

  it("surfaces null when the backend reports no warning", async () => {
    mockActor.getSingleStewardWarning = vi.fn(async (...args: unknown[]) => {
      calls.getSingleStewardWarning.push(args);
      return null;
    });

    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
