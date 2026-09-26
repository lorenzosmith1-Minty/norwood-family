import "@testing-library/jest-dom/vitest";
import {
  type Mystery,
  type MysteryContribution,
  MysteryStatus,
  type TimelineEvent,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { MysteriesPage } from "@/pages/MysteriesPage";
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
  useMysteries,
  useMystery,
  useMysteryContributions,
  usePendingMysteryContributions,
  useTimelineEvents,
} from "./hooks/useFamilyHistory";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Cover for the Family Mystery frontend family-wiring change: when a
// NON-default family is active, every Mystery READ hook must route to the
// canonical `*ForFamily` endpoint with the explicit familyId, and the familyId
// must be part of the React Query key so caches never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by FamilyHistoryMysteryReadsCharacterize.test.tsx; this file only
// asserts the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Mystery read path hard-codes the default family id:
// the non-default-family calls must never receive the literal default family id
// as their familyId argument, and the legacy no-familyId endpoints must stay
// untouched on the non-default branch.
//
// Mystery MUTATIONS are out of scope for this read-wiring change and are frozen
// by the default-family characterization file.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls, setMysteries, setMystery } = vi.hoisted(
  () => {
    const calls: {
      // Canonical family-scoped Mystery read endpoints.
      listMysteriesForFamily: unknown[][];
      getMysteryForFamily: unknown[][];
      listMysteryContributionsForFamily: unknown[][];
      listPendingMysteryContributionsForFamily: unknown[][];
      listTimelineEventsForFamily: unknown[][];
      // Legacy no-familyId Mystery read endpoints: recorded so the cover can
      // prove the non-default branch never falls back to them.
      listMysteries: unknown[][];
      listPendingMysteryContributions: unknown[][];
      listTimelineEvents: unknown[][];
      // Steward authority (used by the MysteriesPage journey).
      isCallerSteward: unknown[][];
    } = {
      listMysteriesForFamily: [],
      getMysteryForFamily: [],
      listMysteryContributionsForFamily: [],
      listPendingMysteryContributionsForFamily: [],
      listTimelineEventsForFamily: [],
      listMysteries: [],
      listPendingMysteryContributions: [],
      listTimelineEvents: [],
      isCallerSteward: [],
    };

    // Mutable return values so a test can seed data WITHOUT reassigning the mock
    // methods (a reassignment would drop the call recording for every later test
    // in the file).
    let mysteries: Mystery[] = [];
    let mystery: Mystery | null = null;
    const contributions: MysteryContribution[] = [];
    const pendingContributions: MysteryContribution[] = [];
    const timelineEvents: TimelineEvent[] = [];

    const mockActor = {
      async listMysteriesForFamily(...args: unknown[]): Promise<Mystery[]> {
        calls.listMysteriesForFamily.push(args);
        return mysteries;
      },
      async getMysteryForFamily(...args: unknown[]): Promise<Mystery | null> {
        calls.getMysteryForFamily.push(args);
        const requestedId = args[1];
        return mystery && mystery.id === requestedId ? mystery : null;
      },
      async listMysteryContributionsForFamily(
        ...args: unknown[]
      ): Promise<MysteryContribution[]> {
        calls.listMysteryContributionsForFamily.push(args);
        return contributions;
      },
      async listPendingMysteryContributionsForFamily(
        ...args: unknown[]
      ): Promise<MysteryContribution[]> {
        calls.listPendingMysteryContributionsForFamily.push(args);
        return pendingContributions;
      },
      async listTimelineEventsForFamily(
        ...args: unknown[]
      ): Promise<TimelineEvent[]> {
        calls.listTimelineEventsForFamily.push(args);
        return timelineEvents;
      },
      async listMysteries(...args: unknown[]): Promise<Mystery[]> {
        calls.listMysteries.push(args);
        return [];
      },
      async listPendingMysteryContributions(
        ...args: unknown[]
      ): Promise<MysteryContribution[]> {
        calls.listPendingMysteryContributions.push(args);
        return [];
      },
      async listTimelineEvents(...args: unknown[]): Promise<TimelineEvent[]> {
        calls.listTimelineEvents.push(args);
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
      setMysteries: (next: Mystery[]) => {
        mysteries = next;
      },
      setMystery: (next: Mystery | null) => {
        mystery = next;
      },
      resetCalls: () => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
          calls[key].length = 0;
        }
        mysteries = [];
        mystery = null;
      },
    };
  },
);

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
    familyId: FAMILY_A,
    ...overrides,
  };
}

/** Every legacy no-familyId Mystery read endpoint must stay untouched. */
function expectNoLegacyMysteryReadCalls() {
  expect(calls.listMysteries).toEqual([]);
  expect(calls.listPendingMysteryContributions).toEqual([]);
  expect(calls.listTimelineEvents).toEqual([]);
}

describe("Mystery read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useMysteries calls listMysteriesForFamily(familyId)", async () => {
    const { result } = renderHook(() => useMysteries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listMysteriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMysteryReadCalls();
  });

  it("useMystery calls getMysteryForFamily(familyId, mysteryId) with the familyId first", async () => {
    const mystery = makeMystery({ id: 7n });
    setMystery(mystery);

    const { result } = renderHook(() => useMystery(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getMysteryForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(result.current.data).toBe(mystery);
    expectNoLegacyMysteryReadCalls();
  });

  it("useMysteryContributions calls listMysteryContributionsForFamily(familyId, mysteryId)", async () => {
    const { result } = renderHook(() => useMysteryContributions(4n), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listMysteryContributionsForFamily).toEqual([[FAMILY_A, 4n]]);
    expectNoLegacyMysteryReadCalls();
  });

  it("usePendingMysteryContributions calls listPendingMysteryContributionsForFamily(familyId)", async () => {
    const { result } = renderHook(() => usePendingMysteryContributions(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingMysteryContributionsForFamily).toEqual([
      [FAMILY_A],
    ]);
    expectNoLegacyMysteryReadCalls();
  });

  it("useTimelineEvents calls listTimelineEventsForFamily(familyId)", async () => {
    const { result } = renderHook(() => useTimelineEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listTimelineEventsForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMysteryReadCalls();
  });

  it("useMysteries exposes the backend mysteries unchanged", async () => {
    const mysteries = [
      makeMystery({ id: 1n, title: "Who was the first Norwood?" }),
      makeMystery({ id: 2n, title: "Where is the missing photograph?" }),
    ];
    setMysteries(mysteries);

    const { result } = renderHook(() => useMysteries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mysteries);
  });
});

describe("Mystery read hooks: non-default family query keys include the familyId (cover)", () => {
  // The familyId must be part of every family-owned Mystery read cache key so
  // Family A and Family B caches never collide. The default-family legacy keys
  // are frozen separately; here we assert the family-scoped shape.
  function keyProbe() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  }

  it("registers family-scoped keys for the list, detail, contributions, pending, and timeline reads", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const list = renderHook(() => useMysteries(), { wrapper: scopedWrapper });
    const detail = renderHook(() => useMystery(7n), { wrapper: scopedWrapper });
    const contributions = renderHook(() => useMysteryContributions(4n), {
      wrapper: scopedWrapper,
    });
    const pending = renderHook(() => usePendingMysteryContributions(), {
      wrapper: scopedWrapper,
    });
    const timeline = renderHook(() => useTimelineEvents(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(contributions.result.current.isSuccess).toBe(true),
    );
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(timeline.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["familyHistory", "mysteries", FAMILY_A]);
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "detail",
      "7",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "4",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "pending",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual(["familyHistory", "timeline", FAMILY_A]);
  });

  it("keeps Family A and Family B caches distinct for the same mystery list and mystery id", async () => {
    const queryClient = keyProbe();
    const wrapperFor = (familyId: string) =>
      function FamilyWrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
          </QueryClientProvider>
        );
      };

    const listA = renderHook(() => useMysteries(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const listB = renderHook(() => useMysteries(), {
      wrapper: wrapperFor(FAMILY_B),
    });
    const detailA = renderHook(() => useMystery(7n), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const detailB = renderHook(() => useMystery(7n), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(listA.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(listB.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailA.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailB.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["familyHistory", "mysteries", FAMILY_A]);
    expect(keys).toContainEqual(["familyHistory", "mysteries", FAMILY_B]);
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "detail",
      "7",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "detail",
      "7",
      FAMILY_B,
    ]);
    expect(calls.getMysteryForFamily).toEqual([
      [FAMILY_A, 7n],
      [FAMILY_B, 7n],
    ]);
  });
});

describe("Mystery read hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily read call receives the active familyId, never the default literal", async () => {
    const list = renderHook(() => useMysteries(), { wrapper });
    const detail = renderHook(() => useMystery(7n), { wrapper });
    const contributions = renderHook(() => useMysteryContributions(4n), {
      wrapper,
    });
    const pending = renderHook(() => usePendingMysteryContributions(), {
      wrapper,
    });
    const timeline = renderHook(() => useTimelineEvents(), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(contributions.result.current.isSuccess).toBe(true),
    );
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(timeline.result.current.isSuccess).toBe(true));

    const familyIdArgs: unknown[] = [
      calls.listMysteriesForFamily[0]?.[0],
      calls.getMysteryForFamily[0]?.[0],
      calls.listMysteryContributionsForFamily[0]?.[0],
      calls.listPendingMysteryContributionsForFamily[0]?.[0],
      calls.listTimelineEventsForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyMysteryReadCalls();
  });
});

// ---------------------------------------------------------------------------
// Component journey: the MysteriesPage list and detail view under a
// non-default family read through the family-scoped endpoints, and the
// browse/filter presentation is preserved.
// ---------------------------------------------------------------------------

describe("MysteriesPage under a non-default family: browse and detail journey (cover)", () => {
  function renderMysteriesPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>
          <MysteriesPage onBack={() => {}} />
        </FamilyProvider>
      </QueryClientProvider>,
    );
  }

  it("lists the active family's mysteries and opens the family-scoped detail read", async () => {
    const mystery = makeMystery({
      id: 7n,
      title: "Where is the missing photograph?",
    });
    setMysteries([mystery]);
    setMystery(mystery);

    const user = userEvent.setup();
    renderMysteriesPage();

    // The list renders the family's mystery.
    expect(
      await screen.findByText("Where is the missing photograph?"),
    ).toBeInTheDocument();
    expect(calls.listMysteriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMysteryReadCalls();

    // Opening the detail view reads the mystery through the family-scoped API.
    // (The page also probes useMystery(0n) on mount, so assert the selected
    // mystery's call is present and that every detail call carries the active
    // family id — never the legacy unscoped endpoint.)
    await user.click(
      screen.getByRole("button", { name: "Where is the missing photograph?" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Where is the missing photograph?",
      }),
    ).toBeInTheDocument();
    expect(calls.getMysteryForFamily).toContainEqual([FAMILY_A, 7n]);
    for (const [familyId] of calls.getMysteryForFamily) {
      expect(familyId).toBe(FAMILY_A);
    }
    expectNoLegacyMysteryReadCalls();
  });

  it("shows the empty state when the active family has no mysteries", async () => {
    renderMysteriesPage();

    expect(
      await screen.findByRole("heading", { name: "No mysteries yet" }),
    ).toBeInTheDocument();
    expect(calls.listMysteriesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMysteryReadCalls();
  });
});
