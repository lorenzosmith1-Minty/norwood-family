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
import {
  eligibleStewardCandidatesInvalidation,
  useListEligibleStewardCandidates,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped eligible-Steward candidate read.
//
// The accepted change makes the eligible-candidate read family-scoped: the
// backend gains `listEligibleStewardCandidatesForFamily(familyId)` and reduces
// the legacy `listEligibleStewardCandidates()` to a thin DEFAULT_FAMILY_ID
// wrapper; `useListEligibleStewardCandidates()` forks on the centralized active
// family (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy
//     `listEligibleStewardCandidates()` call with no arguments and the bare
//     ['governance','eligibleStewardCandidates'] key.
//   * NON-default family -> `listEligibleStewardCandidatesForFamily(activeFamilyId)`
//     with the active familyId as the FIRST argument and the familyId appended
//     to the query key, so one family's candidate cache is never reused for
//     another.
//
// `eligibleStewardCandidatesInvalidation` is family-exact: the default family
// invalidates only the bare default key (narrowed to the exact two-element
// shape), a non-default family invalidates only its own family-appended key,
// and another family's candidate cache is left untouched.
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint the hook calls and with which argument tuple, and which cache keys
// are invalidated — over a typed local actor mock. It does not exercise the
// real canister; the family boundary itself is covered by the PocketIC lane
// (see coverageLimits).
//
// The default-family contract is frozen separately by the existing
// GovernanceEligibleCandidatesDefaultFamilyCharacterize and
// GovernanceStewardReadAndRemovalDefaultFamilyCharacterize files; this file
// must not weaken them.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");
const CANDIDATE_ACCOUNT = Principal.fromText("aaaaa-aa");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    listEligibleStewardCandidates: [],
    listEligibleStewardCandidatesForFamily: [],
  };

  const mockActor = {
    async listEligibleStewardCandidates(...args: unknown[]): Promise<unknown> {
      calls.listEligibleStewardCandidates.push(args);
      return [];
    },
    async listEligibleStewardCandidatesForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listEligibleStewardCandidatesForFamily.push(args);
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

function stewardIdentity(personId: string): StewardIdentity {
  return {
    personId,
    accountId: CANDIDATE_ACCOUNT,
    displayName: "Julia Norwood",
    canonicalName: "Julia Norwood",
  };
}

// ---------------------------------------------------------------------------
// Non-default family routes to listEligibleStewardCandidatesForFamily
// ---------------------------------------------------------------------------

describe("useListEligibleStewardCandidates: non-default family routes to the family-scoped read (cover)", () => {
  it("calls listEligibleStewardCandidatesForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.listEligibleStewardCandidatesForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listEligibleStewardCandidates).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listEligibleStewardCandidatesForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listEligibleStewardCandidates).toEqual([]);
  });

  it("surfaces the eligible candidates the backend returns for the active family", async () => {
    const candidates = [stewardIdentity("julia"), stewardIdentity("clayton")];
    mockActor.listEligibleStewardCandidatesForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listEligibleStewardCandidatesForFamily.push(args);
        return candidates;
      },
    );

    const { result } = renderHook(() => useListEligibleStewardCandidates(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(candidates);
  });
});

// ---------------------------------------------------------------------------
// Family-separated query/cache keys
// ---------------------------------------------------------------------------

describe("eligible-candidate query keys are family-separated (cover)", () => {
  it("registers ['governance','eligibleStewardCandidates',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "governance",
      "eligibleStewardCandidates",
      FAMILY_A,
    ]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual([
      "governance",
      "eligibleStewardCandidates",
    ]);
  });

  it("Family A and Family B do not share an eligible-candidate cache entry", async () => {
    const familyA = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.candidates.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.candidates.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual([
      "governance",
      "eligibleStewardCandidates",
      FAMILY_A,
    ]);
    expect(keysB).toContainEqual([
      "governance",
      "eligibleStewardCandidates",
      FAMILY_B,
    ]);
    // Neither family's cache is reused for the other.
    expect(keysA).not.toContainEqual([
      "governance",
      "eligibleStewardCandidates",
      FAMILY_B,
    ]);
    expect(keysB).not.toContainEqual([
      "governance",
      "eligibleStewardCandidates",
      FAMILY_A,
    ]);
    expect(keysA).not.toEqual(keysB);
  });
});

// ---------------------------------------------------------------------------
// eligibleStewardCandidatesInvalidation is family-exact
// ---------------------------------------------------------------------------

describe("eligibleStewardCandidatesInvalidation is family-exact (cover)", () => {
  it("the default family invalidates only the bare default key", () => {
    expect(eligibleStewardCandidatesInvalidation(undefined)).toEqual({
      queryKey: ["governance", "eligibleStewardCandidates"],
      predicate: expect.any(Function),
    });
  });

  it("a non-default family invalidates only its own family-appended key", () => {
    expect(eligibleStewardCandidatesInvalidation(FAMILY_A)).toEqual({
      queryKey: ["governance", "eligibleStewardCandidates", FAMILY_A],
    });
  });

  it("a non-default family's invalidation leaves another family's candidate cache untouched", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ["governance", "eligibleStewardCandidates", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "eligibleStewardCandidates", FAMILY_B],
      [],
    );
    queryClient.setQueryData(["governance", "eligibleStewardCandidates"], []);

    void queryClient.invalidateQueries(
      eligibleStewardCandidatesInvalidation(FAMILY_A),
    );

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "eligibleStewardCandidates", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "eligibleStewardCandidates", FAMILY_B]),
    ).toBe(false);
    // The bare default key is not a prefix match for a family-appended key.
    expect(isInvalidated(["governance", "eligibleStewardCandidates"])).toBe(
      false,
    );
  });

  it("the default family invalidates the bare default key", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "eligibleStewardCandidates"], []);

    void queryClient.invalidateQueries(
      eligibleStewardCandidatesInvalidation(undefined),
    );

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "eligibleStewardCandidates"])).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Default-family invalidation is exact: it must not reach a non-default
// family's candidate cache. React Query matches by key PREFIX, so the bare
// ['governance','eligibleStewardCandidates'] filter would otherwise also
// invalidate ['governance','eligibleStewardCandidates','family-a'] and
// ['governance','eligibleStewardCandidates','family-b'].
// ---------------------------------------------------------------------------

describe("eligibleStewardCandidatesInvalidation(undefined) is exact to the default key (cover)", () => {
  /** Seeds the three candidate cache shapes and reports which are invalidated. */
  function invalidationOutcome(
    filters: ReturnType<typeof eligibleStewardCandidatesInvalidation>,
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "eligibleStewardCandidates"], []);
    queryClient.setQueryData(
      ["governance", "eligibleStewardCandidates", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["governance", "eligibleStewardCandidates", FAMILY_B],
      [],
    );

    void queryClient.invalidateQueries(filters);

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    return {
      defaultKey: isInvalidated(["governance", "eligibleStewardCandidates"]),
      familyA: isInvalidated([
        "governance",
        "eligibleStewardCandidates",
        FAMILY_A,
      ]),
      familyB: isInvalidated([
        "governance",
        "eligibleStewardCandidates",
        FAMILY_B,
      ]),
    };
  }

  it("matches only ['governance','eligibleStewardCandidates']", () => {
    const outcome = invalidationOutcome(
      eligibleStewardCandidatesInvalidation(undefined),
    );

    expect(outcome.defaultKey).toBe(true);
    expect(outcome.familyA).toBe(false);
    expect(outcome.familyB).toBe(false);
  });

  it("leaves the Family A candidate cache untouched", () => {
    const outcome = invalidationOutcome(
      eligibleStewardCandidatesInvalidation(undefined),
    );
    expect(outcome.familyA).toBe(false);
  });

  it("leaves the Family B candidate cache untouched", () => {
    const outcome = invalidationOutcome(
      eligibleStewardCandidatesInvalidation(undefined),
    );
    expect(outcome.familyB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior remains unchanged
// ---------------------------------------------------------------------------

describe("useListEligibleStewardCandidates: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, calls listEligibleStewardCandidates() with no arguments and the bare key", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    expect(calls.listEligibleStewardCandidates).toEqual([[]]);
    expect(calls.listEligibleStewardCandidatesForFamily).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "eligibleStewardCandidates"]);
  });

  it("with familyId 'norwood', keeps the legacy bare key and no-familyId call", async () => {
    const { result } = renderHook(
      () => ({
        candidates: useListEligibleStewardCandidates(),
        client: keyProbe(),
      }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.candidates.isSuccess).toBe(true));
    expect(calls.listEligibleStewardCandidates).toEqual([[]]);
    expect(calls.listEligibleStewardCandidatesForFamily).toEqual([]);
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
