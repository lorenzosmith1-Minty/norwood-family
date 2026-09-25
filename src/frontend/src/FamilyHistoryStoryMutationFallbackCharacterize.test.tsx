import "@testing-library/jest-dom/vitest";
import { EvidenceStatus, type Story, StoryStatus } from "@/backend";
import { DEFAULT_FAMILY_ID } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SubmitStoryInput,
  useAddCanonicalStory,
  useApproveStory,
  useRejectStory,
  useSubmitStory,
  useUpdateCanonicalStory,
} from "./hooks/useFamilyHistory";

// ---------------------------------------------------------------------------
// Characterization baseline for the Family Stories frontend MUTATION
// family-wiring change (D3-C).
//
// The requested change makes the five Story MUTATION hooks
// (useSubmitStory / useApproveStory / useRejectStory / useAddCanonicalStory /
// useUpdateCanonicalStory) family-aware by reading the active family from
// `useFamilyScopedId()` and forking on it, exactly as the Story READ hooks were
// wired in D3-B and the Recipe mutations in D2-B:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook must keep making the legacy no-familyId call and keep the legacy
//     invalidation keys — the default-family behavior must be unchanged;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// The provider-mounted DEFAULT-family mutation call shapes and invalidation
// keys are frozen separately by FamilyHistoryStoryReadsCharacterize.test.tsx.
// This file protects the two adjacent default-family mutation paths that file
// does NOT cover, both of which the D3-C change can silently break by
// introducing a family read:
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
    submitStory: unknown[][];
    approveStory: unknown[][];
    rejectStory: unknown[][];
    addCanonicalStory: unknown[][];
    updateCanonicalStory: unknown[][];
  } = {
    submitStory: [],
    approveStory: [],
    rejectStory: [],
    addCanonicalStory: [],
    updateCanonicalStory: [],
  };

  const mockActor = {
    async submitStory(...args: unknown[]): Promise<Story> {
      calls.submitStory.push(args);
      return makeStory();
    },
    async approveStory(...args: unknown[]): Promise<Story | null> {
      calls.approveStory.push(args);
      return null;
    },
    async rejectStory(...args: unknown[]): Promise<Story | null> {
      calls.rejectStory.push(args);
      return null;
    },
    async addCanonicalStory(...args: unknown[]): Promise<Story> {
      calls.addCanonicalStory.push(args);
      return makeStory();
    },
    async updateCanonicalStory(...args: unknown[]): Promise<Story | null> {
      calls.updateCanonicalStory.push(args);
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

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 1n,
    title: "The family farm",
    storyText: "How the farm came to be.",
    relatedMemberIds: ["julia"],
    era: "early 1900s",
    year: 1910n,
    location: "Ohio",
    contributor: OWNER,
    evidenceStatus: EvidenceStatus.FamilyHistory,
    relatedArchiveItemIds: [],
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    status: StoryStatus.Approved,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

function makeSubmitStoryInput(
  overrides: Partial<SubmitStoryInput> = {},
): SubmitStoryInput {
  return {
    title: "A story",
    storyText: "The story text.",
    relatedMemberIds: ["julia"],
    era: "1920s",
    year: 1920n,
    location: "Mississippi",
    evidenceStatus: EvidenceStatus.FamilyHistory,
    relatedArchiveItemIds: [],
    ...overrides,
  };
}

describe("Story mutation hooks with no FamilyProvider: default-family fallback (characterization)", () => {
  it("useSubmitStory calls submitStory with the eight positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useSubmitStory(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync(makeSubmitStoryInput());

    expect(calls.submitStory).toEqual([
      [
        "A story",
        "The story text.",
        ["julia"],
        "1920s",
        1920n,
        "Mississippi",
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
  });

  it("useApproveStory calls approveStory(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useApproveStory(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync(5n);

    expect(calls.approveStory).toEqual([[5n]]);
  });

  it("useRejectStory calls rejectStory(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useRejectStory(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync(6n);

    expect(calls.rejectStory).toEqual([[6n]]);
  });

  it("useAddCanonicalStory calls addCanonicalStory with the eight positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useAddCanonicalStory(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync(
      makeSubmitStoryInput({ title: "Canonical" }),
    );

    expect(calls.addCanonicalStory).toEqual([
      [
        "Canonical",
        "The story text.",
        ["julia"],
        "1920s",
        1920n,
        "Mississippi",
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
  });

  it("useUpdateCanonicalStory calls updateCanonicalStory with the id first and no familyId", async () => {
    const { result } = renderHook(() => useUpdateCanonicalStory(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync({
      ...makeSubmitStoryInput({ title: "Revised" }),
      id: 9n,
    });

    expect(calls.updateCanonicalStory).toEqual([
      [
        9n,
        "Revised",
        "The story text.",
        ["julia"],
        "1920s",
        1920n,
        "Mississippi",
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
  });
});

describe("Story mutation hooks before the actor is ready: no eager backend call (characterization)", () => {
  it("throws the stable 'Backend is not ready' error and issues no call while the actor is null", async () => {
    setActorReady(false);

    const submit = renderHook(() => useSubmitStory(), {
      wrapper: bareWrapper,
    });
    const approve = renderHook(() => useApproveStory(), {
      wrapper: bareWrapper,
    });
    const reject = renderHook(() => useRejectStory(), {
      wrapper: bareWrapper,
    });
    const addCanonical = renderHook(() => useAddCanonicalStory(), {
      wrapper: bareWrapper,
    });
    const updateCanonical = renderHook(() => useUpdateCanonicalStory(), {
      wrapper: bareWrapper,
    });

    await expect(
      submit.result.current.mutateAsync(makeSubmitStoryInput()),
    ).rejects.toThrow("Backend is not ready");
    await expect(approve.result.current.mutateAsync(5n)).rejects.toThrow(
      "Backend is not ready",
    );
    await expect(reject.result.current.mutateAsync(6n)).rejects.toThrow(
      "Backend is not ready",
    );
    await expect(
      addCanonical.result.current.mutateAsync(makeSubmitStoryInput()),
    ).rejects.toThrow("Backend is not ready");
    await expect(
      updateCanonical.result.current.mutateAsync({
        ...makeSubmitStoryInput(),
        id: 9n,
      }),
    ).rejects.toThrow("Backend is not ready");

    // No mutation reached the backend while the actor was null.
    expect(calls.submitStory).toEqual([]);
    expect(calls.approveStory).toEqual([]);
    expect(calls.rejectStory).toEqual([]);
    expect(calls.addCanonicalStory).toEqual([]);
    expect(calls.updateCanonicalStory).toEqual([]);
  });
});
