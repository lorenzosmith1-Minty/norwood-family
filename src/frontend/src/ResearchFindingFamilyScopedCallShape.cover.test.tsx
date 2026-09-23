import "@testing-library/jest-dom/vitest";
import {
  EvidenceLabel,
  type FindingContent,
  FindingType,
  type ProposedFinding,
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
  useApproveFinding,
  useCreateFinding,
  useGetFinding,
  useGetReviewQueue,
  useListFindings,
  useNeedsResearchFinding,
  useRejectFinding,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B2-B1 frontend half of the family-scoped Proposed
// Finding change: when a NON-default family is active, every finding hook must
// route to the canonical `*ForFamily` endpoint with the explicit familyId, and
// the familyId must be part of the React Query key so caches never collide
// across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by ResearchFindingLegacyCallShapeCharacterize.test.tsx; this file
// only asserts the non-default branch, so the two together pin both sides of
// the `familyScopedId === undefined` fork.
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
    listFindingsForFamily: unknown[][];
    getFindingForFamily: unknown[][];
    createFindingForFamily: unknown[][];
    approveFindingForFamily: unknown[][];
    rejectFindingForFamily: unknown[][];
    needsResearchFindingForFamily: unknown[][];
    getReviewQueueForFamily: unknown[][];
    listFindings: unknown[][];
    getFinding: unknown[][];
    createFinding: unknown[][];
    approveFinding: unknown[][];
    rejectFinding: unknown[][];
    needsResearchFinding: unknown[][];
    getReviewQueue: unknown[][];
  } = {
    listFindingsForFamily: [],
    getFindingForFamily: [],
    createFindingForFamily: [],
    approveFindingForFamily: [],
    rejectFindingForFamily: [],
    needsResearchFindingForFamily: [],
    getReviewQueueForFamily: [],
    listFindings: [],
    getFinding: [],
    createFinding: [],
    approveFinding: [],
    rejectFinding: [],
    needsResearchFinding: [],
    getReviewQueue: [],
  };

  const mockActor = {
    async listFindingsForFamily(
      ...args: unknown[]
    ): Promise<ProposedFinding[]> {
      calls.listFindingsForFamily.push(args);
      return [];
    },
    async getFindingForFamily(
      ...args: unknown[]
    ): Promise<ProposedFinding | null> {
      calls.getFindingForFamily.push(args);
      return null;
    },
    async createFindingForFamily(...args: unknown[]): Promise<unknown> {
      calls.createFindingForFamily.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
    },
    async approveFindingForFamily(
      ...args: unknown[]
    ): Promise<ProposedFinding | null> {
      calls.approveFindingForFamily.push(args);
      return null;
    },
    async rejectFindingForFamily(
      ...args: unknown[]
    ): Promise<ProposedFinding | null> {
      calls.rejectFindingForFamily.push(args);
      return null;
    },
    async needsResearchFindingForFamily(
      ...args: unknown[]
    ): Promise<ProposedFinding | null> {
      calls.needsResearchFindingForFamily.push(args);
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
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
    </QueryClientProvider>
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
    familyId: FAMILY_A,
    ...overrides,
  };
}

const FINDING_CONTENT: FindingContent = {
  __kind__: "PersonFact",
  PersonFact: { field: "birthDate", value: "12 March 1898", personId: "julia" },
};

describe("Research finding read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useListFindings calls listFindingsForFamily(familyId) and not the legacy listFindings", async () => {
    const { result } = renderHook(() => useListFindings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listFindingsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listFindings).toEqual([]);
  });

  it("useGetFinding calls getFindingForFamily(familyId, id) and not the legacy getFinding", async () => {
    const finding = makeFinding({ id: 7n });
    mockActor.getFindingForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getFindingForFamily.push(args);
      return finding;
    });

    const { result } = renderHook(() => useGetFinding(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getFindingForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.getFinding).toEqual([]);
    expect(result.current.data).toBe(finding);
  });

  it("useGetReviewQueue calls getReviewQueueForFamily(familyId) and not the legacy getReviewQueue", async () => {
    const { result } = renderHook(() => useGetReviewQueue(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReviewQueueForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getReviewQueue).toEqual([]);
  });
});

describe("Research finding create hook: non-default family routes to *ForFamily (cover)", () => {
  it("useCreateFinding calls createFindingForFamily(familyId, ...) with the familyId first", async () => {
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

    // The familyId is the first positional argument; the remaining seven mirror
    // the legacy createFinding order.
    expect(calls.createFindingForFamily).toEqual([
      [
        FAMILY_A,
        "Birth date of Julia Norwood",
        EvidenceLabel.Documented,
        FindingType.PersonFact,
        FINDING_CONTENT,
        1n,
        "julia",
        null,
      ],
    ]);
    expect(calls.createFinding).toEqual([]);
  });
});

describe("Research finding review hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useApproveFinding calls approveFindingForFamily(familyId, id)", async () => {
    const approved = makeFinding({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveFindingForFamily = vi.fn(async (...args: unknown[]) => {
      calls.approveFindingForFamily.push(args);
      return approved;
    });

    const { result } = renderHook(() => useApproveFinding(), { wrapper });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveFindingForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.approveFinding).toEqual([]);
    expect(returned).toBe(approved);
  });

  it("useRejectFinding calls rejectFindingForFamily(familyId, id)", async () => {
    const rejected = makeFinding({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectFindingForFamily = vi.fn(async (...args: unknown[]) => {
      calls.rejectFindingForFamily.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectFinding(), { wrapper });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectFindingForFamily).toEqual([[FAMILY_A, 9n]]);
    expect(calls.rejectFinding).toEqual([]);
    expect(returned).toBe(rejected);
  });

  it("useNeedsResearchFinding calls needsResearchFindingForFamily(familyId, id)", async () => {
    const needsResearch = makeFinding({
      id: 11n,
      status: ReviewStatus.NeedsResearch,
    });
    mockActor.needsResearchFindingForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.needsResearchFindingForFamily.push(args);
        return needsResearch;
      },
    );

    const { result } = renderHook(() => useNeedsResearchFinding(), { wrapper });
    const returned = await result.current.mutateAsync(11n);

    expect(calls.needsResearchFindingForFamily).toEqual([[FAMILY_A, 11n]]);
    expect(calls.needsResearchFinding).toEqual([]);
    expect(returned).toBe(needsResearch);
  });
});

describe("Research finding hooks: non-default family React Query keys are family-qualified (cover)", () => {
  // The familyId must be part of the key so a Family A cache entry can never be
  // served to a Family B render. The default-family legacy keys are frozen by
  // the characterization file.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListFindings registers ['research','findings',familyId]", async () => {
    const { result } = renderHook(
      () => ({ list: useListFindings(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "findings", FAMILY_A]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["research", "findings"]);
  });

  it("useGetFinding registers ['research','findings',familyId,id]", async () => {
    const { result } = renderHook(
      () => ({ finding: useGetFinding(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.finding.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "findings", FAMILY_A, "7"]);
    expect(keys).not.toContainEqual(["research", "findings", "7"]);
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
