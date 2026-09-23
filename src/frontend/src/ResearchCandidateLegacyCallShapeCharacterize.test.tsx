import "@testing-library/jest-dom/vitest";
import { type NewPersonCandidate, ReviewStatus } from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useApproveNewPersonCandidate,
  useCreateNewPersonCandidate,
  useListNewPersonCandidates,
  useNeedsResearchNewPersonCandidate,
  useRejectNewPersonCandidate,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped New Person Candidate change.
//
// The requested change moves New Person Candidates off the legacy single-family
// path: `NewPersonCandidate` gains a `familyId` field, the candidate
// create/list/approve/reject/needs-research endpoints gain canonical
// `*ForFamily` variants, and the Review Queue Candidates count becomes
// family-scoped.
//
// The DEFAULT-family (Norwood) candidate workflow must keep working unchanged.
// This file freezes the FRONTEND half of that contract: the exact argument
// shapes the candidate hooks pass to the legacy endpoints today, and the exact
// React Query keys they register. A refactor that family-qualifies a public
// method signature, or that threads a familyId into a default-family call,
// fails here before it reaches a user.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding an explicit familyId parameter is
// exactly the change under way. What it freezes is that the DEFAULT-family call
// the hooks make today keeps its current shape: no familyId argument, and the
// same positional arguments in the same order.
//
// The candidate review UI journeys (Approve/Reject/Needs Research buttons and
// their effects) are already covered by ResearchReviewActionsCover.test.tsx, and
// the candidate card rendering and Review Queue Candidates tab count by
// ResearchReviewQueueTabsCharacterize.test.tsx. This file covers the remaining
// hook-level list/create/review call shapes and query keys the family-scoping
// change touches, mirroring ResearchFindingLegacyCallShapeCharacterize.test.tsx
// and ResearchSourceLegacyCallShapeCharacterize.test.tsx for the candidate
// family.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listNewPersonCandidates: unknown[][];
    createNewPersonCandidate: unknown[][];
    approveNewPersonCandidate: unknown[][];
    rejectNewPersonCandidate: unknown[][];
    needsResearchNewPersonCandidate: unknown[][];
  } = {
    listNewPersonCandidates: [],
    createNewPersonCandidate: [],
    approveNewPersonCandidate: [],
    rejectNewPersonCandidate: [],
    needsResearchNewPersonCandidate: [],
  };

  const mockActor = {
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      calls.listNewPersonCandidates.push([]);
      return [];
    },
    async createNewPersonCandidate(...args: unknown[]): Promise<unknown> {
      calls.createNewPersonCandidate.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveNewPersonCandidate(
      ...args: unknown[]
    ): Promise<NewPersonCandidate | null> {
      calls.approveNewPersonCandidate.push(args);
      return null;
    },
    async rejectNewPersonCandidate(
      ...args: unknown[]
    ): Promise<NewPersonCandidate | null> {
      calls.rejectNewPersonCandidate.push(args);
      return null;
    },
    async needsResearchNewPersonCandidate(
      ...args: unknown[]
    ): Promise<NewPersonCandidate | null> {
      calls.needsResearchNewPersonCandidate.push(args);
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

function makeCandidate(
  overrides: Partial<NewPersonCandidate> = {},
): NewPersonCandidate {
  return {
    familyId: "norwood",
    id: 1n,
    name: "Unknown Norwood",
    details: "A previously unrecorded family member.",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: OWNER,
    submittedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

describe("Research candidate list hook: legacy no-argument call shape (characterization)", () => {
  it("useListNewPersonCandidates calls listNewPersonCandidates() with no arguments", async () => {
    const { result } = renderHook(() => useListNewPersonCandidates(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listNewPersonCandidates).toEqual([[]]);
  });
});

describe("Research candidate create hook: legacy positional call shape (characterization)", () => {
  it("useCreateNewPersonCandidate calls createNewPersonCandidate(name, details, sourceId) with no familyId", async () => {
    const { result } = renderHook(() => useCreateNewPersonCandidate(), {
      wrapper,
    });

    await result.current.mutateAsync({
      name: "Unknown Norwood",
      details: "A previously unrecorded family member.",
      sourceId: 1n,
    });

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere.
    expect(calls.createNewPersonCandidate).toEqual([
      ["Unknown Norwood", "A previously unrecorded family member.", 1n],
    ]);
  });
});

describe("Research candidate review hooks: legacy single-argument call shapes (characterization)", () => {
  it("useApproveNewPersonCandidate calls approveNewPersonCandidate(id) with the id and no familyId", async () => {
    const approved = makeCandidate({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveNewPersonCandidate = vi.fn(async (...args: unknown[]) => {
      calls.approveNewPersonCandidate.push(args);
      return approved;
    });

    const { result } = renderHook(() => useApproveNewPersonCandidate(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveNewPersonCandidate).toEqual([[7n]]);
    expect(returned).toBe(approved);
  });

  it("useRejectNewPersonCandidate calls rejectNewPersonCandidate(id) with the id and no familyId", async () => {
    const rejected = makeCandidate({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectNewPersonCandidate = vi.fn(async (...args: unknown[]) => {
      calls.rejectNewPersonCandidate.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectNewPersonCandidate(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectNewPersonCandidate).toEqual([[9n]]);
    expect(returned).toBe(rejected);
  });

  it("useNeedsResearchNewPersonCandidate calls needsResearchNewPersonCandidate(id) with the id and no familyId", async () => {
    const needsResearch = makeCandidate({
      id: 11n,
      status: ReviewStatus.NeedsResearch,
    });
    mockActor.needsResearchNewPersonCandidate = vi.fn(
      async (...args: unknown[]) => {
        calls.needsResearchNewPersonCandidate.push(args);
        return needsResearch;
      },
    );

    const { result } = renderHook(() => useNeedsResearchNewPersonCandidate(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(11n);

    expect(calls.needsResearchNewPersonCandidate).toEqual([[11n]]);
    expect(returned).toBe(needsResearch);
  });
});

describe("Research candidate hooks: legacy default-family React Query key (characterization)", () => {
  // The family-scoping change adds the active familyId to the candidate query
  // key so caches never collide across families. The DEFAULT family must keep
  // the legacy key byte-for-byte, because the candidate mutation hooks
  // invalidate exactly this key — a changed default-family key would silently
  // stop the candidate list from refreshing after an approve/reject.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListNewPersonCandidates registers the legacy ['research','candidates'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListNewPersonCandidates(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "candidates"]);
  });
});
