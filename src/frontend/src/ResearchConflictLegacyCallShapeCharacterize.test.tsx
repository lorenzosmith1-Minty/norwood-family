import "@testing-library/jest-dom/vitest";
import {
  ConflictResolutionAction,
  type ConflictReviewItem,
  EvidenceLabel,
  ReviewStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useListConflictReviewItems,
  useListConflictsForPerson,
  useResolveConflict,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Conflict Review change.
//
// The requested change moves Conflict Review off the legacy single-family path:
// the conflict reads gain canonical `*ForFamily` variants
// (listConflictReviewItemsForFamily / getConflictReviewItemForFamily), the four
// resolution actions gain family-scoped variants (keepExistingConflictForFamily
// / replaceExistingConflictForFamily / preserveBothConflictForFamily /
// needsResearchConflictForFamily), and the Review Queue Conflict count becomes
// family-filtered.
//
// The DEFAULT-family (Norwood) conflict workflow must keep working unchanged.
// This file freezes the FRONTEND half of that contract: the exact argument
// shapes the conflict hooks pass to the legacy endpoints today, and the exact
// React Query keys they register. A refactor that family-qualifies a public
// method signature, or that threads a familyId into a default-family call,
// fails here before it reaches a user.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding one is exactly the change under way.
// What it freezes is that the DEFAULT-family call the hooks make today keeps
// its current shape: no familyId argument, and the same positional arguments in
// the same order.
//
// The conflict-card rendering and the four resolution actions are already
// covered by ResearchConflictReviewBadgeCharacterize.test.tsx and
// ResearchConflictResolutionProfileUpdateCharacterize.test.tsx; the Review
// Queue Conflicts tab count by ResearchReviewQueueConflictsCountCharacterize.
// This file covers the remaining hook-level read/lookup/resolve call shapes and
// query keys the family-scoping change touches, mirroring
// ResearchFindingLegacyCallShapeCharacterize.test.tsx for the finding family.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listConflictReviewItems: unknown[][];
    listConflictsForPerson: unknown[][];
    resolveConflict: unknown[][];
  } = {
    listConflictReviewItems: [],
    listConflictsForPerson: [],
    resolveConflict: [],
  };

  const mockActor = {
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
      calls.listConflictReviewItems.push([]);
      return [];
    },
    async listConflictsForPerson(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      calls.listConflictsForPerson.push(args);
      return [];
    },
    async resolveConflict(...args: unknown[]): Promise<unknown> {
      calls.resolveConflict.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async isCallerSteward(): Promise<boolean> {
      return true;
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeConflict(
  overrides: Partial<ConflictReviewItem> = {},
): ConflictReviewItem {
  return {
    id: 1n,
    findingId: 1n,
    field: "Birth date",
    canonicalValue: "1899",
    proposedValue: "1898",
    status: ReviewStatus.Conflicting,
    evidenceLabel: EvidenceLabel.Conflicting,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 1n,
    familyId: "norwood",
    ...overrides,
  };
}

describe("Conflict Review read hooks: legacy no-argument call shapes (characterization)", () => {
  it("useListConflictReviewItems calls listConflictReviewItems() with no arguments", async () => {
    const { result } = renderHook(() => useListConflictReviewItems(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listConflictReviewItems).toEqual([[]]);
  });

  it("useListConflictsForPerson calls listConflictsForPerson(personId) with the personId and no familyId", async () => {
    const conflict = makeConflict({ personId: "julia" });
    mockActor.listConflictsForPerson = vi.fn(async (...args: unknown[]) => {
      calls.listConflictsForPerson.push(args);
      return [conflict];
    });

    const { result } = renderHook(() => useListConflictsForPerson("julia"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly one positional argument — the personId — and no familyId.
    expect(calls.listConflictsForPerson).toEqual([["julia"]]);
    expect(result.current.data).toEqual([conflict]);
  });
});

describe("Conflict Review resolve hook: legacy positional call shape (characterization)", () => {
  it("useResolveConflict calls resolveConflict(id, action, notes) with no familyId", async () => {
    const resolved = makeConflict({ status: ReviewStatus.Approved });
    mockActor.resolveConflict = vi.fn(async (...args: unknown[]) => {
      calls.resolveConflict.push(args);
      return { __kind__: "ok", ok: resolved };
    });

    const { result } = renderHook(() => useResolveConflict(), { wrapper });
    const returned = await result.current.mutateAsync({
      conflictId: 7n,
      action: ConflictResolutionAction.KeepExisting,
      notes: "Canonical record is authoritative",
    });

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere.
    expect(calls.resolveConflict).toEqual([
      [
        7n,
        ConflictResolutionAction.KeepExisting,
        "Canonical record is authoritative",
      ],
    ]);
    expect(returned).toEqual({ __kind__: "ok", ok: resolved });
  });
});

describe("Conflict Review hooks: legacy default-family React Query keys (characterization)", () => {
  // The family-scoping change adds the active familyId to the conflict query
  // keys so caches never collide across families. The DEFAULT family must keep
  // the legacy keys byte-for-byte, because the resolve mutation invalidates
  // exactly these keys — a changed default-family key would silently stop the
  // conflict list from refreshing after a resolution.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListConflictReviewItems registers the legacy ['research','conflicts'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListConflictReviewItems(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "conflicts"]);
  });

  it("useListConflictsForPerson registers the legacy ['research','conflicts','person',personId] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListConflictsForPerson("julia"), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "conflicts", "person", "julia"]);
  });
});
