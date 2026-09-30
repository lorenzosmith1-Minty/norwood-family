import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuditActionType, type AuditEntry } from "@/backend";
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
  governanceAuditHistoryInvalidation,
  useListAuditHistory,
} from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Governance Audit History
// read.
//
// The requested change adds a canonical `listAuditHistoryForFamily(familyId)`
// backend read that returns only the entries for that family and is gated on an
// active Steward of that family, reduces the legacy `listAuditHistory()` to a
// thin DEFAULT_FAMILY_ID wrapper, forks `useListAuditHistory()` on
// `useFamilyScopedId()` with a family-separated query key, and makes
// `governanceAuditHistoryInvalidation` family-exact for both the default and a
// non-default family.
//
// This file freezes the DEFAULT-FAMILY behavior the change must not disturb:
//
//   1. DEFAULT-FAMILY HOOK CALL SHAPE — with the default family active (no
//      provider, or the default provider), `useListAuditHistory()` still calls
//      `actor.listAuditHistory()` with NO arguments and registers the legacy
//      bare key ['governance','auditHistory']. This is the accepted
//      "Default-family useListAuditHistory() still calls the legacy
//      listAuditHistory()" criterion: the change adds a non-default branch, it
//      must not move the default branch onto a `*ForFamily` endpoint or a
//      family-qualified key.
//
//   2. DEFAULT-FAMILY RESULTS — the hook still surfaces exactly the entries the
//      legacy endpoint resolves, in order, with the AuditEntry shape unchanged.
//
//   3. DEFAULT-FAMILY INVALIDATION STILL REACHES THE DEFAULT KEY — the accepted
//      requirement makes the default branch family-exact, but it must still
//      invalidate the bare ['governance','auditHistory'] key. This file asserts
//      only that the default key is invalidated; it deliberately does NOT assert
//      the current over-reach into a hypothetical family-appended key, which is
//      the behavior the change intentionally removes.
//
//   4. BACKEND DEFAULT-FAMILY ENDPOINT CONTRACT — the real Motoko
//      `listAuditHistory` endpoint still gates on the canonical active-Steward
//      check and delegates to the governance domain lib, so the default-family
//      wrapper path keeps the same authorization and the same single
//      implementation. This is a static read of the real source; the PocketIC
//      lane cannot run in this sandbox (no compiled wasm), so it is the only
//      executable protection for the endpoint contract.
//
// It deliberately does NOT freeze the non-default call shape, the non-default
// query key, or the current default invalidation's prefix over-reach: those are
// exactly the behavior the change replaces. It also does not assert two-family
// isolation, which is the new behavior the change introduces.
//
// The frontend half is component/integration coverage over a typed local actor
// mock; the backend half is a static read of the real Motoko source. Neither
// exercises the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("2vxsx-fae");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: { listAuditHistory: unknown[][] } = {
    listAuditHistory: [],
  };

  // The base implementation is restored before every test: a test that swaps in
  // its own `vi.fn` result must not leak that result into the next test.
  const baseListAuditHistory = async (
    ...args: unknown[]
  ): Promise<unknown[]> => {
    calls.listAuditHistory.push(args);
    return [];
  };

  const mockActor = {
    listAuditHistory: baseListAuditHistory,
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.listAuditHistory.length = 0;
      mockActor.listAuditHistory = baseListAuditHistory;
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

function auditEntry(id: bigint, summary: string): AuditEntry {
  return {
    id,
    affectedPersonIds: ["julia"],
    actionType: AuditActionType.StewardPromoted,
    summary,
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: OWNER,
    familyId: "norwood",
  };
}

// ---------------------------------------------------------------------------
// (1) Default-family hook call shape — the branch the change must not move.
// ---------------------------------------------------------------------------

describe("useListAuditHistory: default-family call shape (characterization)", () => {
  it("calls listAuditHistory() with no arguments when no family provider is mounted", async () => {
    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listAuditHistory).toEqual([[]]);
  });

  it("with familyId 'norwood', still calls the legacy no-argument endpoint", async () => {
    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor("norwood"),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listAuditHistory).toEqual([[]]);
  });

  it("registers the legacy ['governance','auditHistory'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
  });

  it("with familyId 'norwood', keeps the bare key and never a family-appended one", async () => {
    const { result } = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      { wrapper: wrapperFor("norwood") },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "auditHistory"]);
    expect(keys).not.toContainEqual(["governance", "auditHistory", "norwood"]);
  });
});

// ---------------------------------------------------------------------------
// (2) Default-family results — the entries the legacy endpoint resolves.
// ---------------------------------------------------------------------------

describe("useListAuditHistory: default-family results (characterization)", () => {
  it("returns the entries the legacy endpoint resolves, in order", async () => {
    const entries = [
      auditEntry(2n, "Promoted julia"),
      auditEntry(1n, "Designated successor"),
    ];
    mockActor.listAuditHistory = vi.fn(async (...args: unknown[]) => {
      calls.listAuditHistory.push(args);
      return entries;
    });

    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(entries);
  });

  it("returns an empty list when the legacy endpoint resolves no entries", async () => {
    const { result } = renderHook(() => useListAuditHistory(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (3) Default-family invalidation still reaches the default key.
//
// The accepted requirement makes the default branch family-exact. This file
// asserts only the part that must remain true — the bare default key is
// invalidated — and deliberately does not freeze the current prefix over-reach
// into a hypothetical family-appended key, which the change removes.
// ---------------------------------------------------------------------------

describe("governanceAuditHistoryInvalidation(undefined) still reaches the default key (characterization)", () => {
  it("invalidates the bare ['governance','auditHistory'] cache entry", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["governance", "auditHistory"], []);

    void queryClient.invalidateQueries(
      governanceAuditHistoryInvalidation(undefined),
    );

    const isInvalidated = (key: unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;
    expect(isInvalidated(["governance", "auditHistory"])).toBe(true);
  });

  it("records the bare ['governance','auditHistory'] query key", () => {
    // The recorded key stays the bare default key; the change may add a
    // narrowing predicate, but it must not move the key to a family-appended
    // shape for the default family.
    expect(governanceAuditHistoryInvalidation(undefined).queryKey).toEqual([
      "governance",
      "auditHistory",
    ]);
  });

  it("refreshes the default-family hook's cache after a mutation-style invalidation", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => ({ audit: useListAuditHistory(), client: keyProbe() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(["governance", "auditHistory"])?.isInvalidated,
    ).toBe(false);

    void queryClient.invalidateQueries(
      governanceAuditHistoryInvalidation(undefined),
    );

    expect(
      queryClient.getQueryState(["governance", "auditHistory"])?.isInvalidated,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (4) Backend default-family endpoint contract — static read of the real source.
//
// The PocketIC lane cannot run in this sandbox (no compiled wasm), so this is
// the only executable protection for the endpoint contract. It asserts the
// authorization gate and the delegation the default-family wrapper path must
// keep, and deliberately does NOT assert the lib body's current unfiltered
// `auditLog.toArray()` return, which the change replaces with a delegation.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

const governanceApi = readBackend(path.join("mixins", "governance-api.mo"));

/** The body of a named `func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

describe("listAuditHistory endpoint: default-family contract (characterization)", () => {
  it("gates on the canonical active-Steward check, not the platform admin role", () => {
    const body = functionBody(governanceApi, "listAuditHistory");
    expect(body).toContain(
      "StewardAuthorityLib.isActiveSteward(stewards, caller)",
    );
    expect(body).not.toContain("isAdmin");
    expect(body).not.toContain("accessControl");
  });

  it("delegates to the governance domain lib", () => {
    const body = functionBody(governanceApi, "listAuditHistory");
    expect(body).toContain("GovernanceLib.listAuditHistory(");
  });
});
