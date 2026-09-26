import "@testing-library/jest-dom/vitest";
import { type SourceRecord, SourceType } from "@/backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilyProvider } from "./context/FamilyContext";
import { useCreateSource } from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the non-upload Research Source creation path.
//
// The requested change adds a canonical family-scoped `createSourceForFamily`
// endpoint and turns the existing `createSource` into a thin default-family
// wrapper. The DEFAULT-family (Norwood) behavior of `createSource` must NOT
// change.
//
// This file freezes the FRONTEND half of that contract for the non-upload
// create path: `useCreateSource` (the hook the "Record a source" form uses when
// linking an existing Archive item) must keep calling the legacy
// `createSource(title, sourceType, description, archiveItemId)` with exactly
// four positional arguments and no familyId, and must keep surfacing the
// backend's `#err` result and rejection unchanged.
//
// It deliberately does NOT freeze the absence of `createSourceForFamily` as a
// permanent property of the API — adding that endpoint is exactly the change
// under way. What it freezes is that the DEFAULT-family call the hook makes
// today keeps its current shape and result handling.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: { createSource: unknown[][] } = { createSource: [] };

  const mockActor = {
    async createSource(...args: unknown[]): Promise<unknown> {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: {} };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.createSource.length = 0;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

function makeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    familyId: "norwood",
    id: 1n,
    title: "1900 census, Norwood household",
    sourceType: SourceType.CensusCitation,
    description: "Census record listing the Norwood family.",
    archiveItemId: 12n,
    contributor: undefined as unknown as SourceRecord["contributor"],
    status: undefined as unknown as SourceRecord["status"],
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

describe("useCreateSource: non-upload default-family call shape (characterization)", () => {
  it("calls createSource(title, sourceType, description, archiveItemId) with no familyId", async () => {
    const created = makeSource({ id: 3n });
    mockActor.createSource = vi.fn(async (...args: unknown[]) => {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: created };
    });

    const { result } = renderHook(() => useCreateSource(), { wrapper });

    const returned = await result.current.mutateAsync({
      title: "A source",
      sourceType: SourceType.CensusCitation,
      description: "A source description.",
      archiveItemId: 7n,
    });

    // Exactly the four positional arguments and no familyId — the unchanged
    // public signature the default-family wrapper must keep serving.
    expect(calls.createSource).toEqual([
      ["A source", SourceType.CensusCitation, "A source description.", 7n],
    ]);
    expect(returned).toEqual({ __kind__: "ok", ok: created });
  });

  it("passes a null archiveItemId through unchanged", async () => {
    mockActor.createSource = vi.fn(async (...args: unknown[]) => {
      calls.createSource.push(args);
      return { __kind__: "ok", ok: makeSource({ archiveItemId: undefined }) };
    });

    const { result } = renderHook(() => useCreateSource(), { wrapper });

    await result.current.mutateAsync({
      title: "Unlinked source",
      sourceType: SourceType.ResearchNotes,
      description: "No archive link.",
      archiveItemId: null,
    });

    expect(calls.createSource).toEqual([
      ["Unlinked source", SourceType.ResearchNotes, "No archive link.", null],
    ]);
  });

  it("surfaces the backend #err result unchanged to the caller", async () => {
    // The backend denies an unapproved caller with a stable #notAuthorized
    // variant. The hook must pass the result through without rewriting it, so
    // the page can render the definitive error message.
    const denial = { __kind__: "err", err: { notAuthorized: null } };
    mockActor.createSource = vi.fn(async (...args: unknown[]) => {
      calls.createSource.push(args);
      return denial;
    });

    const { result } = renderHook(() => useCreateSource(), { wrapper });

    const returned = await result.current.mutateAsync({
      title: "Denied source",
      sourceType: SourceType.CensusCitation,
      description: "Denied.",
      archiveItemId: null,
    });

    expect(returned).toBe(denial);
  });

  it("propagates a backend rejection unchanged", async () => {
    const rejection = new Error(
      "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.",
    );
    mockActor.createSource = vi.fn(async (...args: unknown[]) => {
      calls.createSource.push(args);
      throw rejection;
    });

    const { result } = renderHook(() => useCreateSource(), { wrapper });

    await expect(
      result.current.mutateAsync({
        title: "Rejected source",
        sourceType: SourceType.CensusCitation,
        description: "Rejected.",
        archiveItemId: null,
      }),
    ).rejects.toBe(rejection);
  });

  it("stays idle until the mutation is invoked", async () => {
    // The hook is a mutation, not a query: rendering it must not call the
    // backend. A refactor that turns it into an eager query would fire an
    // unauthorized call on mount.
    renderHook(() => useCreateSource(), { wrapper });

    await waitFor(() => {
      expect(calls.createSource).toEqual([]);
    });
  });
});
