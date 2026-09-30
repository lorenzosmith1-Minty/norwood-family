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
import {
  singleStewardWarningInvalidation,
  useSingleStewardWarning,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Cover for the family-scoped single-Steward continuity warning.
//
// The accepted change makes the warning family-scoped: it counts only Steward
// records belonging to the requested family. `useSingleStewardWarning()` forks
// on the centralized active family (`useFamilyScopedId()`):
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy
//     `getSingleStewardWarning()` call with no arguments and the bare
//     ['governance','singleStewardWarning'] key.
//   * NON-default family -> `getSingleStewardWarningForFamily(activeFamilyId)`
//     with the active familyId as the FIRST argument and the familyId appended
//     to the query key, so one family's warning cache is never reused for
//     another.
//
// `singleStewardWarningInvalidation` is family-exact: the default family
// invalidates only the bare default key, a non-default family invalidates only
// its own family-appended key, and another family's warning cache is left
// untouched.
//
// This file pins the non-default branch (the new behavior) and re-asserts the
// default branch at the hook level. It proves the consumer contract — which
// endpoint the hook calls and with which argument tuple, and which cache keys
// are invalidated — over a typed local actor mock. It does not exercise the
// real canister; the family boundary itself is covered by the PocketIC lane
// (see coverageLimits).
//
// The default-family contract is frozen separately by the existing
// GovernanceStewardWarningDefaultFamilyCharacterize files; this file must not
// weaken them.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");
const FAMILY_A = "family-a";
const FAMILY_B = "family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    getSingleStewardWarning: [],
    getSingleStewardWarningForFamily: [],
  };

  const mockActor = {
    async getSingleStewardWarning(...args: unknown[]): Promise<unknown> {
      calls.getSingleStewardWarning.push(args);
      return null;
    },
    async getSingleStewardWarningForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.getSingleStewardWarningForFamily.push(args);
      return null;
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
// Non-default family routes to getSingleStewardWarningForFamily
// ---------------------------------------------------------------------------

describe("useSingleStewardWarning: non-default family routes to getSingleStewardWarningForFamily (cover)", () => {
  it("calls getSingleStewardWarningForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the FIRST positional argument — never hard-coded
    // to "norwood".
    expect(calls.getSingleStewardWarningForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getSingleStewardWarning).toEqual([]);
  });

  it("Family B receives its own familyId", async () => {
    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getSingleStewardWarningForFamily).toEqual([[FAMILY_B]]);
    expect(calls.getSingleStewardWarning).toEqual([]);
  });

  it("surfaces the warning string the backend returns for the active family", async () => {
    const warning =
      "Only one Family Steward remains. Designate a successor steward to ensure continuity.";
    mockActor.getSingleStewardWarningForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.getSingleStewardWarningForFamily.push(args);
        return warning;
      },
    );

    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(warning);
  });

  it("surfaces null when the active family has no warning", async () => {
    mockActor.getSingleStewardWarningForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.getSingleStewardWarningForFamily.push(args);
        return null;
      },
    );

    const { result } = renderHook(() => useSingleStewardWarning(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Family-separated query/cache keys
// ---------------------------------------------------------------------------

describe("single-Steward warning query keys are family-separated (cover)", () => {
  it("registers ['governance','singleStewardWarning',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.warning.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "governance",
      "singleStewardWarning",
      FAMILY_A,
    ]);
    // The legacy bare key must not be registered for a non-default family.
    expect(keys).not.toContainEqual(["governance", "singleStewardWarning"]);
  });

  it("Family A and Family B do not share a warning cache entry", async () => {
    const familyA = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );
    await waitFor(() =>
      expect(familyA.result.current.warning.isSuccess).toBe(true),
    );
    const keysA = familyA.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    const familyB = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_B) },
    );
    await waitFor(() =>
      expect(familyB.result.current.warning.isSuccess).toBe(true),
    );
    const keysB = familyB.result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);

    expect(keysA).toContainEqual([
      "governance",
      "singleStewardWarning",
      FAMILY_A,
    ]);
    expect(keysB).toContainEqual([
      "governance",
      "singleStewardWarning",
      FAMILY_B,
    ]);
    // Neither family's cache is reused for the other.
    expect(keysA).not.toContainEqual([
      "governance",
      "singleStewardWarning",
      FAMILY_B,
    ]);
    expect(keysB).not.toContainEqual([
      "governance",
      "singleStewardWarning",
      FAMILY_A,
    ]);
    expect(keysA).not.toEqual(keysB);
  });
});

// ---------------------------------------------------------------------------
// singleStewardWarningInvalidation is family-exact
// ---------------------------------------------------------------------------

describe("singleStewardWarningInvalidation is family-exact (cover)", () => {
  it("the default family invalidates only the bare default key", () => {
    expect(singleStewardWarningInvalidation(undefined)).toEqual({
      queryKey: ["governance", "singleStewardWarning"],
      predicate: expect.any(Function),
    });
  });

  it("a non-default family invalidates only its own family-appended key", () => {
    expect(singleStewardWarningInvalidation(FAMILY_A)).toEqual({
      queryKey: ["governance", "singleStewardWarning", FAMILY_A],
    });
  });

  it("a non-default family's invalidation leaves another family's warning cache untouched", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ["governance", "singleStewardWarning", FAMILY_A],
      null,
    );
    queryClient.setQueryData(
      ["governance", "singleStewardWarning", FAMILY_B],
      null,
    );
    queryClient.setQueryData(["governance", "singleStewardWarning"], null);

    void queryClient.invalidateQueries(
      singleStewardWarningInvalidation(FAMILY_A),
    );

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(
      isInvalidated(["governance", "singleStewardWarning", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(["governance", "singleStewardWarning", FAMILY_B]),
    ).toBe(false);
    // The bare default key is not a prefix match for a family-appended key.
    expect(isInvalidated(["governance", "singleStewardWarning"])).toBe(false);
  });

  it("the default family invalidates the bare default key", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "singleStewardWarning"], null);

    void queryClient.invalidateQueries(
      singleStewardWarningInvalidation(undefined),
    );

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "singleStewardWarning"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Default-family invalidation is exact: it must not reach a non-default
// family's warning cache. React Query matches by key PREFIX, so the bare
// ['governance','singleStewardWarning'] filter would otherwise also invalidate
// ['governance','singleStewardWarning','family-a'] and
// ['governance','singleStewardWarning','family-b'].
// ---------------------------------------------------------------------------

describe("singleStewardWarningInvalidation(undefined) is exact to the default key (cover)", () => {
  /** Seeds the three warning cache shapes and reports which are invalidated. */
  function invalidationOutcome(
    filters: ReturnType<typeof singleStewardWarningInvalidation>,
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "singleStewardWarning"], null);
    queryClient.setQueryData(
      ["governance", "singleStewardWarning", FAMILY_A],
      null,
    );
    queryClient.setQueryData(
      ["governance", "singleStewardWarning", FAMILY_B],
      null,
    );

    void queryClient.invalidateQueries(filters);

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    return {
      defaultKey: isInvalidated(["governance", "singleStewardWarning"]),
      familyA: isInvalidated(["governance", "singleStewardWarning", FAMILY_A]),
      familyB: isInvalidated(["governance", "singleStewardWarning", FAMILY_B]),
    };
  }

  it("matches only ['governance','singleStewardWarning']", () => {
    const outcome = invalidationOutcome(
      singleStewardWarningInvalidation(undefined),
    );

    expect(outcome.defaultKey).toBe(true);
    expect(outcome.familyA).toBe(false);
    expect(outcome.familyB).toBe(false);
  });

  it("leaves the Family A warning cache untouched", () => {
    const outcome = invalidationOutcome(
      singleStewardWarningInvalidation(undefined),
    );
    expect(outcome.familyA).toBe(false);
  });

  it("leaves the Family B warning cache untouched", () => {
    const outcome = invalidationOutcome(
      singleStewardWarningInvalidation(undefined),
    );
    expect(outcome.familyB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior remains unchanged
// ---------------------------------------------------------------------------

describe("useSingleStewardWarning: default family keeps the legacy call shape (cover)", () => {
  it("with no family provider mounted, calls getSingleStewardWarning() with no arguments and the bare key", async () => {
    const { result } = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.warning.isSuccess).toBe(true));
    expect(calls.getSingleStewardWarning).toEqual([[]]);
    expect(calls.getSingleStewardWarningForFamily).toEqual([]);
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "singleStewardWarning"]);
  });

  it("with familyId 'norwood', keeps the legacy bare key and no-familyId call", async () => {
    const { result } = renderHook(
      () => ({ warning: useSingleStewardWarning(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.warning.isSuccess).toBe(true));
    expect(calls.getSingleStewardWarning).toEqual([[]]);
    expect(calls.getSingleStewardWarningForFamily).toEqual([]);
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
