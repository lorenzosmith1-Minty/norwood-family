import "@testing-library/jest-dom/vitest";
import {
  type Mystery,
  type MysteryContribution,
  MysteryContributionStatus,
  type MysteryContributionType,
  MysteryStatus,
} from "@/backend";
import { DEFAULT_FAMILY_ID } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useCreateCanonicalMystery,
  useMarkMysteryResolved,
  useReviewMysteryContribution,
  useSubmitMysteryContribution,
  useUpdateCanonicalMystery,
} from "./hooks/useFamilyHistory";

// ---------------------------------------------------------------------------
// Characterization baseline for the Family Mysteries frontend MUTATION
// family-wiring change.
//
// The requested change makes the five Mystery MUTATION hooks
// (useSubmitMysteryContribution / useReviewMysteryContribution /
// useCreateCanonicalMystery / useUpdateCanonicalMystery /
// useMarkMysteryResolved) family-aware by reading the active family from
// `useFamilyScopedId()` and forking on it, exactly as the Story mutations were
// wired in D3-C and the Recipe mutations in D2-B:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook must keep making the legacy no-familyId call and keep the legacy
//     invalidation keys — the default-family behavior must be unchanged;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// The provider-mounted DEFAULT-family mutation call shapes and invalidation
// keys are frozen separately by FamilyHistoryMysteryReadsCharacterize.test.tsx.
// This file protects the two adjacent default-family mutation paths that file
// does NOT cover, both of which the change can silently break by introducing a
// family read:
//
//   1. NO PROVIDER MOUNTED. `useActiveFamily()` falls back to the default family
//      when no FamilyProvider is mounted, so `useFamilyScopedId()` resolves to
//      `undefined` and the mutation must still make the legacy no-familyId call.
//      A change that read the context directly, or that treated a missing
//      provider as a non-default family, would move every bare render onto a
//      `*ForFamily` endpoint and change default-family behavior.
//
//   2. ACTOR NOT READY. Every mutation throws the stable "Backend is not ready"
//      error when the actor is still loading, and must not call the backend. A
//      change that moved the family read or the actor guard around could fire an
//      unauthorized call on mount or change the surfaced error.
//
// It deliberately does NOT freeze the non-default branch (that is the new
// behavior) and does NOT freeze the legacy call shape as the only shape — the
// change replaces the unconditional legacy call with a fork. What it protects
// is that, absent a provider and before the actor is ready, the default-family
// mutation behavior is unchanged.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const mockState = vi.hoisted(() => {
  const calls: {
    submitMysteryContribution: unknown[][];
    reviewMysteryContribution: unknown[][];
    createCanonicalMystery: unknown[][];
    updateCanonicalMystery: unknown[][];
    markMysteryResolved: unknown[][];
  } = {
    submitMysteryContribution: [],
    reviewMysteryContribution: [],
    createCanonicalMystery: [],
    updateCanonicalMystery: [],
    markMysteryResolved: [],
  };

  const mockActor = {
    async submitMysteryContribution(
      ...args: unknown[]
    ): Promise<MysteryContribution> {
      calls.submitMysteryContribution.push(args);
      return makeContribution();
    },
    async reviewMysteryContribution(
      ...args: unknown[]
    ): Promise<MysteryContribution | null> {
      calls.reviewMysteryContribution.push(args);
      return null;
    },
    async createCanonicalMystery(...args: unknown[]): Promise<Mystery> {
      calls.createCanonicalMystery.push(args);
      return makeMystery();
    },
    async updateCanonicalMystery(...args: unknown[]): Promise<Mystery | null> {
      calls.updateCanonicalMystery.push(args);
      return null;
    },
    async markMysteryResolved(...args: unknown[]): Promise<Mystery | null> {
      calls.markMysteryResolved.push(args);
      return null;
    },
  };

  return {
    mockActor,
    calls,
    actorReady: true,
  };
});

const { calls } = mockState;

function resetCalls() {
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
    calls[key].length = 0;
  }
  mockState.actorReady = true;
}

function setActorReady(value: boolean) {
  mockState.actorReady = value;
}

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({
    actor: mockState.actorReady ? mockState.mockActor : null,
    isFetching: false,
  }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

/**
 * A QueryClientProvider with NO FamilyProvider, so `useActiveFamily()` takes its
 * documented default-family fallback.
 */
function bareWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeMystery(overrides: Partial<Mystery> = {}): Mystery {
  return {
    id: 1n,
    title: "Who was the first Norwood?",
    description: "Still researching.",
    relatedMemberIds: ["julia"],
    relatedBranchId: undefined,
    knownFacts: ["Settled in Ohio."],
    possibilities: ["May have come from Virginia."],
    relatedSourceIds: [],
    relatedArchiveItemIds: [],
    status: MysteryStatus.Open,
    contributor: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    resolution: undefined,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<MysteryContribution> = {},
): MysteryContribution {
  return {
    id: 1n,
    mysteryId: 1n,
    contributionType: "Note" as MysteryContributionType,
    text: "A note.",
    contributor: OWNER,
    status: MysteryContributionStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    reviewedBy: undefined,
    reviewedAt: undefined,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

describe("Mystery mutation hooks with no FamilyProvider: default-family fallback (characterization)", () => {
  it("useSubmitMysteryContribution calls submitMysteryContribution(mysteryId, type, text) with no familyId", async () => {
    const { result } = renderHook(() => useSubmitMysteryContribution(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync({
      mysteryId: 4n,
      contributionType: "Lead" as MysteryContributionType,
      text: "A lead.",
    });

    expect(calls.submitMysteryContribution).toEqual([[4n, "Lead", "A lead."]]);
  });

  it("useReviewMysteryContribution calls reviewMysteryContribution(id, approve) with no familyId", async () => {
    const { result } = renderHook(() => useReviewMysteryContribution(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync({ id: 7n, approve: true });

    expect(calls.reviewMysteryContribution).toEqual([[7n, true]]);
  });

  it("useCreateCanonicalMystery calls createCanonicalMystery with the nine positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useCreateCanonicalMystery(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync({
      title: "Where did the family originate?",
      description: "Still researching.",
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      knownFacts: ["Settled in Ohio."],
      possibilities: ["May have come from Virginia."],
      relatedSourceIds: [5n],
      relatedArchiveItemIds: [],
      status: MysteryStatus.Open,
    });

    expect(calls.createCanonicalMystery).toEqual([
      [
        "Where did the family originate?",
        "Still researching.",
        ["julia"],
        null,
        ["Settled in Ohio."],
        ["May have come from Virginia."],
        [5n],
        [],
        MysteryStatus.Open,
      ],
    ]);
  });

  it("useUpdateCanonicalMystery calls updateCanonicalMystery with the id first and no familyId", async () => {
    const { result } = renderHook(() => useUpdateCanonicalMystery(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync({
      id: 9n,
      title: "Revised question",
      description: "Updated context.",
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      knownFacts: ["Settled in Ohio."],
      possibilities: ["May have come from Virginia."],
      relatedSourceIds: [5n],
      relatedArchiveItemIds: [],
      status: MysteryStatus.Researching,
    });

    expect(calls.updateCanonicalMystery).toEqual([
      [
        9n,
        "Revised question",
        "Updated context.",
        ["julia"],
        null,
        ["Settled in Ohio."],
        ["May have come from Virginia."],
        [5n],
        [],
        MysteryStatus.Researching,
      ],
    ]);
  });

  it("useMarkMysteryResolved calls markMysteryResolved(id, summary, supportingEvidence) with no familyId", async () => {
    const { result } = renderHook(() => useMarkMysteryResolved(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync({
      id: 3n,
      summary: "Records show the family arrived in 1842.",
      supportingEvidence: ["1842 census record"],
    });

    expect(calls.markMysteryResolved).toEqual([
      [3n, "Records show the family arrived in 1842.", ["1842 census record"]],
    ]);
  });
});

describe("Mystery mutation hooks before the actor is ready: no eager backend call (characterization)", () => {
  it("throws the stable 'Backend is not ready' error and issues no call while the actor is null", async () => {
    setActorReady(false);

    const submit = renderHook(() => useSubmitMysteryContribution(), {
      wrapper: bareWrapper,
    });
    const review = renderHook(() => useReviewMysteryContribution(), {
      wrapper: bareWrapper,
    });
    const create = renderHook(() => useCreateCanonicalMystery(), {
      wrapper: bareWrapper,
    });
    const update = renderHook(() => useUpdateCanonicalMystery(), {
      wrapper: bareWrapper,
    });
    const resolve = renderHook(() => useMarkMysteryResolved(), {
      wrapper: bareWrapper,
    });

    await expect(
      submit.result.current.mutateAsync({
        mysteryId: 4n,
        contributionType: "Lead" as MysteryContributionType,
        text: "A lead.",
      }),
    ).rejects.toThrow("Backend is not ready");
    await expect(
      review.result.current.mutateAsync({ id: 7n, approve: true }),
    ).rejects.toThrow("Backend is not ready");
    await expect(
      create.result.current.mutateAsync({
        title: "Where did the family originate?",
        description: "Still researching.",
        relatedMemberIds: ["julia"],
        relatedBranchId: null,
        knownFacts: ["Settled in Ohio."],
        possibilities: ["May have come from Virginia."],
        relatedSourceIds: [5n],
        relatedArchiveItemIds: [],
        status: MysteryStatus.Open,
      }),
    ).rejects.toThrow("Backend is not ready");
    await expect(
      update.result.current.mutateAsync({
        id: 9n,
        title: "Revised question",
        description: "Updated context.",
        relatedMemberIds: ["julia"],
        relatedBranchId: null,
        knownFacts: ["Settled in Ohio."],
        possibilities: ["May have come from Virginia."],
        relatedSourceIds: [5n],
        relatedArchiveItemIds: [],
        status: MysteryStatus.Researching,
      }),
    ).rejects.toThrow("Backend is not ready");
    await expect(
      resolve.result.current.mutateAsync({
        id: 3n,
        summary: "Records show the family arrived in 1842.",
        supportingEvidence: ["1842 census record"],
      }),
    ).rejects.toThrow("Backend is not ready");

    // No mutation reached the backend while the actor was null.
    expect(calls.submitMysteryContribution).toEqual([]);
    expect(calls.reviewMysteryContribution).toEqual([]);
    expect(calls.createCanonicalMystery).toEqual([]);
    expect(calls.updateCanonicalMystery).toEqual([]);
    expect(calls.markMysteryResolved).toEqual([]);
  });
});
