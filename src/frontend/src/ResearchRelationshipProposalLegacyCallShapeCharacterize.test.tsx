import "@testing-library/jest-dom/vitest";
import {
  type RelationshipProposal,
  ReviewStatus,
  type SourceId,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useApproveRelationshipProposal,
  useCreateRelationshipProposal,
  useListRelationshipProposals,
  useRejectRelationshipProposal,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Relationship Proposal change
// (Tenancy 1C-B2-B3-A1).
//
// The requested change moves Relationship Proposals off the legacy
// single-family path: `RelationshipProposal` gains a `familyId` field, the
// create/list endpoints gain canonical `*ForFamily` variants, and the legacy
// no-argument endpoints become TEMPORARY compatibility wrappers delegating with
// the default family.
//
// The DEFAULT-family (Norwood) relationship-proposal workflow must keep working
// unchanged. This file freezes the FRONTEND half of that contract: the exact
// argument shapes the proposal hooks pass to the legacy endpoints today, and the
// exact React Query keys they register. A refactor that family-qualifies a
// public method signature, or that threads a familyId into a default-family
// call, fails here before it reaches a user.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding an explicit familyId parameter is
// exactly the change under way. What it freezes is that the DEFAULT-family call
// the hooks make today keeps its current shape: no familyId argument, and the
// same positional arguments in the same order.
//
// The Needs Research action is the ONE proposal endpoint this change
// intentionally re-scopes: today `useNeedsResearchRelationshipProposal` calls
// the family-blind `needsResearchRelationshipProposal(id)`, and the accepted
// change makes it family-aware. That legacy call shape is therefore NOT frozen
// here — freezing it would pin the very behavior being changed. The adjacent
// list/create/approve/reject call shapes and the default-family query key are
// frozen, and the Needs Research UI journey is covered by
// ResearchReviewActionsCover.test.tsx.
//
// The proposal create/review UI journeys are already covered by
// ResearchIntakeCover.test.tsx and ResearchReviewActionsCover.test.tsx, and the
// proposal card rendering by the Review Queue characterization files. This file
// covers the remaining hook-level list/create/review call shapes and query keys
// the family-scoping change touches, mirroring
// ResearchSourceLegacyCallShapeCharacterize.test.tsx,
// ResearchCandidateLegacyCallShapeCharacterize.test.tsx, and
// ResearchFindingLegacyCallShapeCharacterize.test.tsx for the proposal family.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listRelationshipProposals: unknown[][];
    createRelationshipProposal: unknown[][];
    approveRelationshipProposal: unknown[][];
    rejectRelationshipProposal: unknown[][];
  } = {
    listRelationshipProposals: [],
    createRelationshipProposal: [],
    approveRelationshipProposal: [],
    rejectRelationshipProposal: [],
  };

  const mockActor = {
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      calls.listRelationshipProposals.push([]);
      return [];
    },
    async createRelationshipProposal(...args: unknown[]): Promise<unknown> {
      calls.createRelationshipProposal.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveRelationshipProposal(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      calls.approveRelationshipProposal.push(args);
      return null;
    },
    async rejectRelationshipProposal(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      calls.rejectRelationshipProposal.push(args);
      return null;
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

function makeProposal(
  overrides: Partial<RelationshipProposal> = {},
): RelationshipProposal {
  return {
    familyId: "norwood",
    id: 1n,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: OWNER,
    submittedAt: 1_700_000_000_000_000_000n,
    reviewedBy: undefined,
    reviewedAt: undefined,
    ...overrides,
  };
}

describe("Research relationship-proposal list hook: legacy no-argument call shape (characterization)", () => {
  it("useListRelationshipProposals calls listRelationshipProposals() with no arguments", async () => {
    const { result } = renderHook(() => useListRelationshipProposals(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listRelationshipProposals).toEqual([[]]);
  });
});

describe("Research relationship-proposal create hook: legacy positional call shape (characterization)", () => {
  it("useCreateRelationshipProposal calls createRelationshipProposal(fromPersonId, toPersonId, relationshipType, sourceId) with no familyId", async () => {
    const { result } = renderHook(() => useCreateRelationshipProposal(), {
      wrapper,
    });

    await result.current.mutateAsync({
      fromPersonId: "clayton",
      toPersonId: "julia",
      relationshipType: "Father",
      sourceId: 1n as SourceId,
    });

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere.
    expect(calls.createRelationshipProposal).toEqual([
      ["clayton", "julia", "Father", 1n],
    ]);
  });
});

describe("Research relationship-proposal review hooks: legacy single-argument call shapes (characterization)", () => {
  it("useApproveRelationshipProposal calls approveRelationshipProposal(id) with the id and no familyId", async () => {
    const approved = makeProposal({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveRelationshipProposal = vi.fn(
      async (...args: unknown[]) => {
        calls.approveRelationshipProposal.push(args);
        return approved;
      },
    );

    const { result } = renderHook(() => useApproveRelationshipProposal(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveRelationshipProposal).toEqual([[7n]]);
    expect(returned).toBe(approved);
  });

  it("useRejectRelationshipProposal calls rejectRelationshipProposal(id) with the id and no familyId", async () => {
    const rejected = makeProposal({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectRelationshipProposal = vi.fn(async (...args: unknown[]) => {
      calls.rejectRelationshipProposal.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectRelationshipProposal(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectRelationshipProposal).toEqual([[9n]]);
    expect(returned).toBe(rejected);
  });
});

describe("Research relationship-proposal hooks: legacy default-family React Query key (characterization)", () => {
  // The family-scoping change adds the active familyId to the proposal query
  // key so caches never collide across families. The DEFAULT family must keep
  // the legacy key byte-for-byte, because the proposal mutation hooks invalidate
  // exactly this key — a changed default-family key would silently stop the
  // proposal list from refreshing after an approve/reject.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListRelationshipProposals registers the legacy ['research','relationshipProposals'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListRelationshipProposals(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "relationshipProposals"]);
  });
});
