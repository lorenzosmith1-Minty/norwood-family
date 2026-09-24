import "@testing-library/jest-dom/vitest";
import type { ResearchAuditEntry } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import { useGetResearchAuditLog } from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B2-B5 frontend half of the family-scoped Research
// audit log change: the Audit/History hook must fork on the centralized active
// family.
//
//   * DEFAULT family (familyScopedId === undefined) -> the legacy no-argument
//     `getResearchAuditLog()` with the legacy key ['research','audit'].
//   * NON-default family -> the canonical `getResearchAuditLogForFamily(familyId)`
//     with the familyId in the key, ['research','audit', familyId], so caches
//     never collide across families.
//
// The legacy default-family branch is frozen separately by the existing
// ResearchAuditHistoryCharacterize.test.tsx (which renders the Audit tab through
// the default family); this file pins both sides of the fork at the hook level
// and asserts the familyId is never hard-coded to "norwood".
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint the hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    getResearchAuditLog: unknown[][];
    getResearchAuditLogForFamily: unknown[][];
  } = {
    getResearchAuditLog: [],
    getResearchAuditLogForFamily: [],
  };

  const mockActor = {
    async getResearchAuditLog(
      ...args: unknown[]
    ): Promise<ResearchAuditEntry[]> {
      calls.getResearchAuditLog.push(args);
      return [];
    },
    async getResearchAuditLogForFamily(
      ...args: unknown[]
    ): Promise<ResearchAuditEntry[]> {
      calls.getResearchAuditLogForFamily.push(args);
      return [];
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
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
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

describe("Research audit hook: default family keeps the legacy call shape (cover)", () => {
  it("useGetResearchAuditLog calls getResearchAuditLog() with no arguments and not the family-scoped endpoint", async () => {
    const { result } = renderHook(() => useGetResearchAuditLog(), {
      wrapper: wrapperFor(undefined),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.getResearchAuditLog).toEqual([[]]);
    expect(calls.getResearchAuditLogForFamily).toEqual([]);
  });

  it("useGetResearchAuditLog registers the legacy ['research','audit'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useGetResearchAuditLog(), client: keyProbe() }),
      { wrapper: wrapperFor(undefined) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "audit"]);
    // The family-qualified key must not be registered for the default family.
    expect(keys).not.toContainEqual(["research", "audit", FAMILY_A]);
  });
});

describe("Research audit hook: non-default family routes to *ForFamily (cover)", () => {
  it("useGetResearchAuditLog calls getResearchAuditLogForFamily(familyId) and not the legacy endpoint", async () => {
    const { result } = renderHook(() => useGetResearchAuditLog(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The active familyId is the single positional argument — never hard-coded
    // to "norwood".
    expect(calls.getResearchAuditLogForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getResearchAuditLog).toEqual([]);
  });

  it("useGetResearchAuditLog registers ['research','audit',familyId] for a non-default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useGetResearchAuditLog(), client: keyProbe() }),
      { wrapper: wrapperFor(FAMILY_A) },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "audit", FAMILY_A]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["research", "audit"]);
  });

  it("returns the entries the family-scoped endpoint resolves", async () => {
    const entry: ResearchAuditEntry = {
      id: 1n,
      action: "SourceCreated",
      findingId: undefined,
      sourceId: 1n,
      actorId: OWNER,
      summary: "Source 'Family A census' created",
      timestamp: 1_700_000_000_000_000_000n,
      familyId: FAMILY_A,
    };
    mockActor.getResearchAuditLogForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.getResearchAuditLogForFamily.push(args);
        return [entry];
      },
    );

    const { result } = renderHook(() => useGetResearchAuditLog(), {
      wrapper: wrapperFor(FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([entry]);
  });
});
