import "@testing-library/jest-dom/vitest";
import { EvidenceStatus, type Story, StoryStatus } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { StoriesPage } from "@/pages/StoriesPage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useApprovedStories,
  usePendingStories,
  useStory,
} from "./hooks/useFamilyHistory";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Cover for the Family Stories frontend family-wiring change: when a
// NON-default family is active, every Story READ hook must route to the
// canonical `*ForFamily` endpoint with the explicit familyId, and the familyId
// must be part of the React Query key so caches never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by FamilyHistoryStoryReadsCharacterize.test.tsx; this file only
// asserts the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Story read path hard-codes the default family id:
// the non-default-family calls must never receive the literal default family id
// as their familyId argument, and the legacy no-familyId endpoints must stay
// untouched on the non-default branch.
//
// There is no per-person Story read hook in the app (the generated bindings
// expose no family-scoped per-person Story endpoint), so per-person Story reads
// are deferred and not covered here.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls, setApprovedStories, setStory } =
  vi.hoisted(() => {
    const calls: {
      // Canonical family-scoped Story read endpoints.
      listApprovedStoriesForFamily: unknown[][];
      listPendingStoriesForFamily: unknown[][];
      getStoryForFamily: unknown[][];
      // Legacy no-familyId Story read endpoints: recorded so the cover can prove
      // the non-default branch never falls back to them.
      listApprovedStories: unknown[][];
      listPendingStories: unknown[][];
      // Steward authority (used by the StoriesPage journey).
      isCallerSteward: unknown[][];
    } = {
      listApprovedStoriesForFamily: [],
      listPendingStoriesForFamily: [],
      getStoryForFamily: [],
      listApprovedStories: [],
      listPendingStories: [],
      isCallerSteward: [],
    };

    // Mutable return values so a test can seed data WITHOUT reassigning the
    // mock methods (a reassignment would drop the call recording for every
    // later test in the file).
    let approvedStories: Story[] = [];
    let story: Story | null = null;

    const mockActor = {
      async listApprovedStoriesForFamily(...args: unknown[]): Promise<Story[]> {
        calls.listApprovedStoriesForFamily.push(args);
        return approvedStories;
      },
      async listPendingStoriesForFamily(...args: unknown[]): Promise<Story[]> {
        calls.listPendingStoriesForFamily.push(args);
        return [];
      },
      async getStoryForFamily(...args: unknown[]): Promise<Story | null> {
        calls.getStoryForFamily.push(args);
        return story;
      },
      async listApprovedStories(...args: unknown[]): Promise<Story[]> {
        calls.listApprovedStories.push(args);
        return [];
      },
      async listPendingStories(...args: unknown[]): Promise<Story[]> {
        calls.listPendingStories.push(args);
        return [];
      },
      async isCallerSteward(...args: unknown[]): Promise<boolean> {
        calls.isCallerSteward.push(args);
        return false;
      },
    };

    return {
      mockActor,
      calls,
      setApprovedStories: (stories: Story[]) => {
        approvedStories = stories;
      },
      setStory: (next: Story | null) => {
        story = next;
      },
      resetCalls: () => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
          calls[key].length = 0;
        }
        approvedStories = [];
        story = null;
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

/** The production composition with a NON-default active family. */
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
    familyId: FAMILY_A,
    ...overrides,
  };
}

/** Every legacy no-familyId Story read endpoint must stay untouched. */
function expectNoLegacyStoryReadCalls() {
  expect(calls.listApprovedStories).toEqual([]);
  expect(calls.listPendingStories).toEqual([]);
}

describe("Story read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useApprovedStories calls listApprovedStoriesForFamily(familyId)", async () => {
    const { result } = renderHook(() => useApprovedStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedStoriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyStoryReadCalls();
  });

  it("usePendingStories calls listPendingStoriesForFamily(familyId)", async () => {
    const { result } = renderHook(() => usePendingStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingStoriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyStoryReadCalls();
  });

  it("useStory calls getStoryForFamily(familyId, storyId) with the familyId first", async () => {
    const story = makeStory({ id: 7n });
    setStory(story);

    const { result } = renderHook(() => useStory(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getStoryForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(result.current.data).toBe(story);
    expectNoLegacyStoryReadCalls();
  });

  it("useApprovedStories exposes the backend stories unchanged", async () => {
    const stories = [
      makeStory({ id: 1n, title: "The family farm" }),
      makeStory({ id: 2n, title: "Grandma's recipe" }),
    ];
    setApprovedStories(stories);

    const { result } = renderHook(() => useApprovedStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(stories);
  });
});

describe("Story read hooks: non-default family query keys include the familyId (cover)", () => {
  // The familyId must be part of every family-owned Story read cache key so
  // Family A and Family B caches never collide. The default-family legacy keys
  // are frozen separately; here we assert the family-scoped shape.
  function keyProbe() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  }

  it("registers family-scoped keys for the approved, pending, and detail reads", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const approved = renderHook(() => useApprovedStories(), {
      wrapper: scopedWrapper,
    });
    const pending = renderHook(() => usePendingStories(), {
      wrapper: scopedWrapper,
    });
    const detail = renderHook(() => useStory(7n), { wrapper: scopedWrapper });

    await waitFor(() => expect(approved.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "pending",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "detail",
      "7",
      FAMILY_A,
    ]);
  });

  it("keeps Family A and Family B caches distinct for the same story list and story id", async () => {
    const queryClient = keyProbe();
    const wrapperFor = (familyId: string) =>
      function FamilyWrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
          </QueryClientProvider>
        );
      };

    const approvedA = renderHook(() => useApprovedStories(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const approvedB = renderHook(() => useApprovedStories(), {
      wrapper: wrapperFor(FAMILY_B),
    });
    const detailA = renderHook(() => useStory(7n), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const detailB = renderHook(() => useStory(7n), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(approvedA.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(approvedB.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailA.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailB.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
      FAMILY_B,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "detail",
      "7",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "stories",
      "detail",
      "7",
      FAMILY_B,
    ]);
    expect(calls.getStoryForFamily).toEqual([
      [FAMILY_A, 7n],
      [FAMILY_B, 7n],
    ]);
  });
});

describe("Story read hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily read call receives the active familyId, never the default literal", async () => {
    const approved = renderHook(() => useApprovedStories(), { wrapper });
    const pending = renderHook(() => usePendingStories(), { wrapper });
    const detail = renderHook(() => useStory(7n), { wrapper });

    await waitFor(() => expect(approved.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));

    const familyIdArgs: unknown[] = [
      calls.listApprovedStoriesForFamily[0]?.[0],
      calls.listPendingStoriesForFamily[0]?.[0],
      calls.getStoryForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyStoryReadCalls();
  });
});

// ---------------------------------------------------------------------------
// Component journey: the StoriesPage browse list and detail view under a
// non-default family read through the family-scoped endpoints, and the
// browse/pending presentation is preserved.
// ---------------------------------------------------------------------------

describe("StoriesPage under a non-default family: browse and detail journey (cover)", () => {
  function renderStoriesPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>
          <StoriesPage onBack={() => {}} />
        </FamilyProvider>
      </QueryClientProvider>,
    );
  }

  it("lists the active family's approved stories and opens the family-scoped detail read", async () => {
    const story = makeStory({ id: 7n, title: "The family farm" });
    setApprovedStories([story]);
    setStory(story);

    const user = userEvent.setup();
    renderStoriesPage();

    // The approved list renders the family's story.
    expect(await screen.findByText("The family farm")).toBeInTheDocument();
    expect(calls.listApprovedStoriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyStoryReadCalls();

    // Opening the detail view reads the story through the family-scoped API.
    // (The page also probes useStory(0n) on mount, so assert the selected
    // story's call is present and that every detail call carries the active
    // family id — never the legacy unscoped endpoint.)
    await user.click(screen.getByRole("button", { name: "The family farm" }));
    expect(
      await screen.findByRole("heading", { name: "The family farm" }),
    ).toBeInTheDocument();
    expect(calls.getStoryForFamily).toContainEqual([FAMILY_A, 7n]);
    for (const [familyId] of calls.getStoryForFamily) {
      expect(familyId).toBe(FAMILY_A);
    }
    expectNoLegacyStoryReadCalls();
  });

  it("shows the empty state when the active family has no approved stories", async () => {
    renderStoriesPage();

    expect(
      await screen.findByRole("heading", { name: "No stories yet" }),
    ).toBeInTheDocument();
    expect(calls.listApprovedStoriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyStoryReadCalls();
  });
});
