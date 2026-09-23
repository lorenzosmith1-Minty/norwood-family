import "@testing-library/jest-dom/vitest";
import {
  EvidenceLabel,
  type FindingContent,
  FindingType,
  type ProposedFinding,
  type ReviewQueue,
  ReviewStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useApproveFinding,
  useCreateFinding,
  useGetFinding,
  useGetReviewQueue,
  useListFindings,
  useNeedsResearchFinding,
  useRejectFinding,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Proposed Findings change.
//
// The requested change moves Proposed Findings off the legacy single-family
// path: `createFinding` / `listFindings` / `getFinding` / `approveFinding` /
// `rejectFinding` / `needsResearchFinding` gain canonical `*ForFamily`
// variants, `ProposedFinding` gains a `familyId` field, and the Review Queue
// Findings count becomes family-scoped.
//
// The DEFAULT-family (Norwood) finding workflow must keep working unchanged.
// This file freezes the FRONTEND half of that contract: the exact argument
// shapes the finding hooks pass to the legacy endpoints today, and the exact
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
// The finding create/approve/reject/needs-research UI journeys are already
// covered by ResearchIntakeCover.test.tsx, and the finding card rendering and
// Review Queue Findings tab count by ResearchReviewQueueTabsCharacterize.test.tsx.
// This file covers the remaining hook-level read/lookup/create/review call
// shapes and query keys the family-scoping change touches, mirroring
// ResearchSourceLegacyCallShapeCharacterize.test.tsx for the source family.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listFindings: unknown[][];
    getFinding: unknown[][];
    createFinding: unknown[][];
    approveFinding: unknown[][];
    rejectFinding: unknown[][];
    needsResearchFinding: unknown[][];
    getReviewQueue: unknown[][];
  } = {
    listFindings: [],
    getFinding: [],
    createFinding: [],
    approveFinding: [],
    rejectFinding: [],
    needsResearchFinding: [],
    getReviewQueue: [],
  };

  const mockActor = {
    async listFindings(...args: unknown[]): Promise<ProposedFinding[]> {
      calls.listFindings.push(args);
      return [];
    },
    async getFinding(...args: unknown[]): Promise<ProposedFinding | null> {
      calls.getFinding.push(args);
      return null;
    },
    async createFinding(...args: unknown[]): Promise<unknown> {
      calls.createFinding.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveFinding(...args: unknown[]): Promise<ProposedFinding | null> {
      calls.approveFinding.push(args);
      return null;
    },
    async rejectFinding(...args: unknown[]): Promise<ProposedFinding | null> {
      calls.rejectFinding.push(args);
      return null;
    },
    async needsResearchFinding(
      ...args: unknown[]
    ): Promise<ProposedFinding | null> {
      calls.needsResearchFinding.push(args);
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeFinding(
  overrides: Partial<ProposedFinding> = {},
): ProposedFinding {
  return {
    id: 1n,
    title: "Birth date of Julia Norwood",
    evidenceLabel: EvidenceLabel.Documented,
    findingType: FindingType.PersonFact,
    content: {
      __kind__: "PersonFact",
      PersonFact: {
        field: "birthDate",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId: 1n,
    personId: "julia",
    status: ReviewStatus.Pending,
    submittedBy: OWNER,
    submittedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    familyId: "norwood",
    ...overrides,
  };
}

const FINDING_CONTENT: FindingContent = {
  __kind__: "PersonFact",
  PersonFact: { field: "birthDate", value: "12 March 1898", personId: "julia" },
};

describe("Research finding read hooks: legacy no-argument call shapes (characterization)", () => {
  it("useListFindings calls listFindings() with no arguments", async () => {
    const { result } = renderHook(() => useListFindings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listFindings).toEqual([[]]);
  });

  it("useGetFinding calls getFinding(id) with the id and no familyId", async () => {
    const finding = makeFinding({ id: 7n });
    mockActor.getFinding = vi.fn(async (...args: unknown[]) => {
      calls.getFinding.push(args);
      return finding;
    });

    const { result } = renderHook(() => useGetFinding(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly one positional argument — the finding id — and no familyId.
    expect(calls.getFinding).toEqual([[7n]]);
    expect(result.current.data).toBe(finding);
  });

  it("useGetReviewQueue calls getReviewQueue() with no arguments", async () => {
    const { result } = renderHook(() => useGetReviewQueue(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReviewQueue).toEqual([[]]);
  });
});

describe("Research finding create hook: legacy positional call shape (characterization)", () => {
  it("useCreateFinding calls createFinding(title, evidenceLabel, findingType, content, sourceId, personId, newPersonCandidateId) with no familyId", async () => {
    const { result } = renderHook(() => useCreateFinding(), { wrapper });

    await result.current.mutateAsync({
      title: "Birth date of Julia Norwood",
      evidenceLabel: EvidenceLabel.Documented,
      findingType: FindingType.PersonFact,
      content: FINDING_CONTENT,
      sourceId: 1n,
      personId: "julia",
      newPersonCandidateId: null,
    });

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere.
    expect(calls.createFinding).toEqual([
      [
        "Birth date of Julia Norwood",
        EvidenceLabel.Documented,
        FindingType.PersonFact,
        FINDING_CONTENT,
        1n,
        "julia",
        null,
      ],
    ]);
  });
});

describe("Research finding review hooks: legacy single-argument call shapes (characterization)", () => {
  it("useApproveFinding calls approveFinding(id) with the id and no familyId", async () => {
    const approved = makeFinding({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveFinding = vi.fn(async (...args: unknown[]) => {
      calls.approveFinding.push(args);
      return approved;
    });

    const { result } = renderHook(() => useApproveFinding(), { wrapper });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveFinding).toEqual([[7n]]);
    expect(returned).toBe(approved);
  });

  it("useRejectFinding calls rejectFinding(id) with the id and no familyId", async () => {
    const rejected = makeFinding({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectFinding = vi.fn(async (...args: unknown[]) => {
      calls.rejectFinding.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectFinding(), { wrapper });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectFinding).toEqual([[9n]]);
    expect(returned).toBe(rejected);
  });

  it("useNeedsResearchFinding calls needsResearchFinding(id) with the id and no familyId", async () => {
    const needsResearch = makeFinding({
      id: 11n,
      status: ReviewStatus.NeedsResearch,
    });
    mockActor.needsResearchFinding = vi.fn(async (...args: unknown[]) => {
      calls.needsResearchFinding.push(args);
      return needsResearch;
    });

    const { result } = renderHook(() => useNeedsResearchFinding(), { wrapper });
    const returned = await result.current.mutateAsync(11n);

    expect(calls.needsResearchFinding).toEqual([[11n]]);
    expect(returned).toBe(needsResearch);
  });
});

describe("Research finding hooks: legacy default-family React Query keys (characterization)", () => {
  // The family-scoping change adds the active familyId to the finding query
  // keys so caches never collide across families. The DEFAULT family must keep
  // the legacy keys byte-for-byte, because the mutation hooks invalidate exactly
  // these keys — a changed default-family key would silently stop the findings
  // list and the review queue from refreshing after an approve/reject.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListFindings registers the legacy ['research','findings'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListFindings(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "findings"]);
  });

  it("useGetFinding registers the legacy ['research','findings',id] key", async () => {
    const { result } = renderHook(
      () => ({ finding: useGetFinding(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.finding.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "findings", "7"]);
  });

  it("useGetReviewQueue registers the legacy ['research','queue'] key", async () => {
    const { result } = renderHook(
      () => ({ queue: useGetReviewQueue(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.queue.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "queue"]);
  });
});
