import "@testing-library/jest-dom/vitest";
import type { StewardIdentity } from "@/backend";
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
import { useListEligibleStewardCandidates } from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped eligible-Steward candidate
// read.
//
// The requested change makes the eligible-candidate read family-scoped: the
// backend gains `listEligibleStewardCandidatesForFamily(familyId)` and reduces
// the legacy `listEligibleStewardCandidates()` to a thin DEFAULT_FAMILY_ID
// wrapper; the frontend hook forks on `useFamilyScopedId()` so the default
// family keeps the legacy no-argument call and the bare
// ['governance','eligibleStewardCandidates'] key, while a non-default family
// calls `listEligibleStewardCandidatesForFamily(activeFamilyId)` with a
// family-separated key.
//
// This file freezes exactly the DEFAULT-family behavior the change must
// preserve, so the family fork cannot silently alter it:
//
//   * DEFAULT family (no provider mounted, and an explicit `familyId="norwood"`
//     provider) -> the legacy `listEligibleStewardCandidates()` call with NO
//     arguments and the bare ['governance','eligibleStewardCandidates'] key.
//   * The candidate list the backend returns is surfaced unchanged.
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
const CANDIDATE_ACCOUNT = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: { listEligibleStewardCandidates: unknown[][] } = {
    listEligibleStewardCandidates: [],
  };

  const mockActor = {
    async listEligibleStewardCandidates(...args: unknown[]): Promise<unknown> {
      calls.listEligibleStewardCandidates.push(args);
      return [];
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.listEligibleStewardCandidates.length = 0;
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

function stewardIdentity(personId: string): StewardIdentity {
  return {
    personId,
    accountId: CANDIDATE_ACCOUNT,
    displayName: "Julia Norwood",
    canonicalName: "Julia Norwood",
  };
}

describe("useListEligibleStewardCandidates: default family keeps the legacy call shape (characterization)", () => {
  it("with no family provider mounted, calls listEligibleStewardCandidates() with no arguments", async () => {
    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy read takes no family argument; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listEligibleStewardCandidates).toEqual([[]]);
  });

  it("with no family provider mounted, registers the bare ['governance','eligibleStewardCandidates'] key", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "eligibleStewardCandidates"]);
  });

  it("with familyId 'norwood', keeps the legacy no-familyId call and the bare key", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    // Norwood is the default family: it must keep the exact legacy call and the
    // bare key, never a family-appended key.
    expect(calls.listEligibleStewardCandidates).toEqual([[]]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "eligibleStewardCandidates"]);
    expect(keys).not.toContainEqual([
      "governance",
      "eligibleStewardCandidates",
      "norwood",
    ]);
  });
});

describe("useListEligibleStewardCandidates: default-family value contract (characterization)", () => {
  it("surfaces the eligible candidates the backend returns unchanged", async () => {
    const candidates = [stewardIdentity("julia"), stewardIdentity("clayton")];
    mockActor.listEligibleStewardCandidates = vi.fn(
      async (...args: unknown[]) => {
        calls.listEligibleStewardCandidates.push(args);
        return candidates;
      },
    );

    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(candidates);
  });

  it("surfaces an empty candidate list when the backend returns none", async () => {
    mockActor.listEligibleStewardCandidates = vi.fn(
      async (...args: unknown[]) => {
        calls.listEligibleStewardCandidates.push(args);
        return [];
      },
    );

    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
