import "@testing-library/jest-dom/vitest";
import {
  type NewPersonCandidate,
  type ReviewQueue,
  ReviewStatus,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useApproveNewPersonCandidate,
  useCreateNewPersonCandidate,
  useGetReviewQueue,
  useListNewPersonCandidates,
  useNeedsResearchNewPersonCandidate,
  useRejectNewPersonCandidate,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B2-B2 frontend half of the family-scoped New Person
// Candidate change: when a NON-default family is active, every candidate hook
// must route to the canonical `*ForFamily` endpoint with the explicit familyId,
// and the familyId must be part of the React Query key so caches never collide
// across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by ResearchCandidateLegacyCallShapeCharacterize.test.tsx; this file
// only asserts the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listNewPersonCandidatesForFamily: unknown[][];
    createNewPersonCandidateForFamily: unknown[][];
    approveNewPersonCandidateForFamily: unknown[][];
    rejectNewPersonCandidateForFamily: unknown[][];
    needsResearchNewPersonCandidateForFamily: unknown[][];
    getReviewQueueForFamily: unknown[][];
    listNewPersonCandidates: unknown[][];
    createNewPersonCandidate: unknown[][];
    approveNewPersonCandidate: unknown[][];
    rejectNewPersonCandidate: unknown[][];
    needsResearchNewPersonCandidate: unknown[][];
    getReviewQueue: unknown[][];
  } = {
    listNewPersonCandidatesForFamily: [],
    createNewPersonCandidateForFamily: [],
    approveNewPersonCandidateForFamily: [],
    rejectNewPersonCandidateForFamily: [],
    needsResearchNewPersonCandidateForFamily: [],
    getReviewQueueForFamily: [],
    listNewPersonCandidates: [],
    createNewPersonCandidate: [],
    approveNewPersonCandidate: [],
    rejectNewPersonCandidate: [],
    needsResearchNewPersonCandidate: [],
    getReviewQueue: [],
  };

  const mockActor = {
    async listNewPersonCandidatesForFamily(
      ...args: unknown[]
    ): Promise<NewPersonCandidate[]> {
      calls.listNewPersonCandidatesForFamily.push(args);
      return [];
    },
    async createNewPersonCandidateForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.createNewPersonCandidateForFamily.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveNewPersonCandidateForFamily(
      ...args: unknown[]
    ): Promise<NewPersonCandidate | null> {
      calls.approveNewPersonCandidateForFamily.push(args);
      return null;
    },
    async rejectNewPersonCandidateForFamily(
      ...args: unknown[]
    ): Promise<NewPersonCandidate | null> {
      calls.rejectNewPersonCandidateForFamily.push(args);
      return null;
    },
    async needsResearchNewPersonCandidateForFamily(
      ...args: unknown[]
    ): Promise<NewPersonCandidate | null> {
      calls.needsResearchNewPersonCandidateForFamily.push(args);
      return null;
    },
    async getReviewQueueForFamily(...args: unknown[]): Promise<ReviewQueue> {
      calls.getReviewQueueForFamily.push(args);
      return {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
    },
    // The legacy endpoints must NOT be reached for a non-default family; they
    // are recorded so a regression that falls back to them is visible.
    async listNewPersonCandidates(
      ...args: unknown[]
    ): Promise<NewPersonCandidate[]> {
      calls.listNewPersonCandidates.push(args);
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
    async getReviewQueue(...args: unknown[]): Promise<ReviewQueue> {
      calls.getReviewQueue.push(args);
      return {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
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
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeCandidate(
  overrides: Partial<NewPersonCandidate> = {},
): NewPersonCandidate {
  return {
    familyId: FAMILY_A,
    id: 1n,
    name: "Unknown Family A",
    details: "A previously unrecorded family member.",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: OWNER,
    submittedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

describe("Research candidate list hook: non-default family routes to *ForFamily (cover)", () => {
  it("useListNewPersonCandidates calls listNewPersonCandidatesForFamily(familyId) and not the legacy list", async () => {
    const { result } = renderHook(() => useListNewPersonCandidates(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listNewPersonCandidatesForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listNewPersonCandidates).toEqual([]);
  });
});

describe("Research candidate create hook: non-default family routes to *ForFamily (cover)", () => {
  it("useCreateNewPersonCandidate calls createNewPersonCandidateForFamily(familyId, name, details, sourceId)", async () => {
    const { result } = renderHook(() => useCreateNewPersonCandidate(), {
      wrapper,
    });

    await result.current.mutateAsync({
      name: "Unknown Family A",
      details: "A previously unrecorded family member.",
      sourceId: 1n,
    });

    // The familyId is the first positional argument; the remaining three mirror
    // the legacy createNewPersonCandidate order.
    expect(calls.createNewPersonCandidateForFamily).toEqual([
      [
        FAMILY_A,
        "Unknown Family A",
        "A previously unrecorded family member.",
        1n,
      ],
    ]);
    expect(calls.createNewPersonCandidate).toEqual([]);
  });
});

describe("Research candidate review hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useApproveNewPersonCandidate calls approveNewPersonCandidateForFamily(familyId, id)", async () => {
    const approved = makeCandidate({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveNewPersonCandidateForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.approveNewPersonCandidateForFamily.push(args);
        return approved;
      },
    );

    const { result } = renderHook(() => useApproveNewPersonCandidate(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveNewPersonCandidateForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.approveNewPersonCandidate).toEqual([]);
    expect(returned).toBe(approved);
  });

  it("useRejectNewPersonCandidate calls rejectNewPersonCandidateForFamily(familyId, id)", async () => {
    const rejected = makeCandidate({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectNewPersonCandidateForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.rejectNewPersonCandidateForFamily.push(args);
        return rejected;
      },
    );

    const { result } = renderHook(() => useRejectNewPersonCandidate(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectNewPersonCandidateForFamily).toEqual([[FAMILY_A, 9n]]);
    expect(calls.rejectNewPersonCandidate).toEqual([]);
    expect(returned).toBe(rejected);
  });

  it("useNeedsResearchNewPersonCandidate calls needsResearchNewPersonCandidateForFamily(familyId, id)", async () => {
    const needsResearch = makeCandidate({
      id: 11n,
      status: ReviewStatus.NeedsResearch,
    });
    mockActor.needsResearchNewPersonCandidateForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.needsResearchNewPersonCandidateForFamily.push(args);
        return needsResearch;
      },
    );

    const { result } = renderHook(() => useNeedsResearchNewPersonCandidate(), {
      wrapper,
    });
    const returned = await result.current.mutateAsync(11n);

    expect(calls.needsResearchNewPersonCandidateForFamily).toEqual([
      [FAMILY_A, 11n],
    ]);
    expect(calls.needsResearchNewPersonCandidate).toEqual([]);
    expect(returned).toBe(needsResearch);
  });
});

describe("Research candidate hooks: non-default family React Query keys are family-qualified (cover)", () => {
  // The familyId must be part of the key so a Family A cache entry can never be
  // served to a Family B render. The default-family legacy keys are frozen by
  // the characterization file.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListNewPersonCandidates registers ['research','candidates',familyId]", async () => {
    const { result } = renderHook(
      () => ({ list: useListNewPersonCandidates(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "candidates", FAMILY_A]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["research", "candidates"]);
  });

  it("useGetReviewQueue registers ['research','queue',familyId]", async () => {
    const { result } = renderHook(
      () => ({ queue: useGetReviewQueue(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.queue.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "queue", FAMILY_A]);
    expect(keys).not.toContainEqual(["research", "queue"]);
  });
});
