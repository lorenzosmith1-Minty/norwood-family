import "@testing-library/jest-dom/vitest";
import { NotificationType } from "@/backend";
import type { Notification } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useListNotifications,
  useMarkNotificationRead,
  useReconcileClaimNotifications,
  useUnreadNotificationCount,
} from "./hooks/useNotifications";
import {
  useApproveProfileClaim,
  useRejectProfileClaim,
} from "./hooks/useProfileClaims";

// ---------------------------------------------------------------------------
// Cover for the Notification frontend family-wiring change: when a NON-default
// family is active, every Notification hook must route to the canonical
// `*ForFamily` endpoint with the explicit familyId as the FIRST positional
// argument, and the familyId must be part of the React Query key so caches
// never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by NotificationsDefaultFamilyCharacterize.test.tsx,
// NotificationsDefaultFamilyEmptyStateCharacterize.test.tsx,
// NotificationsTypeRenderingCharacterize.test.tsx,
// NotificationsReconcileCharacterize.test.tsx, and
// NotificationsConsumerPathsCharacterize.test.tsx; this file only asserts the
// non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Notification frontend path hard-codes the default
// family id: the non-default-family calls must never receive the literal
// default family id as their familyId argument, and the legacy no-familyId
// endpoints must stay untouched on the non-default branch.
//
// Finally it asserts that Notification mutation cache invalidation is
// family-separated: React Query matches `invalidateQueries` by key PREFIX, so a
// bare ['notifications'] filter would also match ['notifications', <otherFamily>]
// and mark another family's cache stale. The non-default branch keeps the same
// bare prefix but narrows it with a predicate that admits only the active
// family's keys — both the list key ['notifications', familyId] and the
// unread-count key ['notifications', 'unreadCount', familyId] — so a mutation in
// Family A never invalidates Family B's Notification caches while still
// refreshing Family A's unread count / nav badge.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Canonical family-scoped Notification endpoints.
    listNotificationsForFamily: unknown[][];
    unreadNotificationCountForFamily: unknown[][];
    markNotificationReadForFamily: unknown[][];
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
    listNotifications: unknown[][];
    markNotificationRead: unknown[][];
    // Reconcile has no family-scoped variant; it is recorded so the cover can
    // prove it is still called with the claim id alone.
    reconcileClaimNotifications: unknown[][];
    // Profile-claim mutations whose success invalidates the Notification cache.
    approveProfileClaimForFamily: unknown[][];
    rejectProfileClaimForFamily: unknown[][];
  } = {
    listNotificationsForFamily: [],
    unreadNotificationCountForFamily: [],
    markNotificationReadForFamily: [],
    listNotifications: [],
    markNotificationRead: [],
    reconcileClaimNotifications: [],
    approveProfileClaimForFamily: [],
    rejectProfileClaimForFamily: [],
  };

  const mockActor = {
    async listNotificationsForFamily(
      ...args: unknown[]
    ): Promise<Notification[]> {
      calls.listNotificationsForFamily.push(args);
      return [];
    },
    async unreadNotificationCountForFamily(
      ...args: unknown[]
    ): Promise<bigint> {
      calls.unreadNotificationCountForFamily.push(args);
      return 0n;
    },
    async markNotificationReadForFamily(
      ...args: unknown[]
    ): Promise<Notification | null> {
      calls.markNotificationReadForFamily.push(args);
      return null;
    },
    async listNotifications(...args: unknown[]): Promise<Notification[]> {
      calls.listNotifications.push(args);
      return [];
    },
    async markNotificationRead(
      ...args: unknown[]
    ): Promise<Notification | null> {
      calls.markNotificationRead.push(args);
      return null;
    },
    async reconcileClaimNotifications(...args: unknown[]): Promise<bigint> {
      calls.reconcileClaimNotifications.push(args);
      return 1n;
    },
    async approveProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      calls.approveProfileClaimForFamily.push(args);
      return null;
    },
    async rejectProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      calls.rejectProfileClaimForFamily.push(args);
      return null;
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

function makeNotification(
  id: bigint,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    recipient: OWNER,
    notificationType: NotificationType.ProfileClaimReviewed,
    message: `Notification ${id.toString()}`,
    createdAt: 1_700_000_000_000_000_000n,
    read: false,
    familyId: FAMILY_A,
    ...overrides,
  };
}

/** Every legacy no-familyId Notification endpoint must stay untouched. */
function expectNoLegacyNotificationCalls() {
  expect(calls.listNotifications).toEqual([]);
  expect(calls.markNotificationRead).toEqual([]);
}

describe("Notification hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useListNotifications calls listNotificationsForFamily(familyId) with the familyId first", async () => {
    const { result } = renderHook(() => useListNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listNotificationsForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyNotificationCalls();
  });

  it("useUnreadNotificationCount calls unreadNotificationCountForFamily(familyId) with the familyId first", async () => {
    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() =>
      expect(calls.unreadNotificationCountForFamily).toEqual([[FAMILY_A]]),
    );
    expect(result.current).toBe(0);
    expectNoLegacyNotificationCalls();
  });

  it("useMarkNotificationRead calls markNotificationReadForFamily(familyId, id) with the familyId first", async () => {
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

    await result.current.mutateAsync(7n);

    expect(calls.markNotificationReadForFamily).toEqual([[FAMILY_A, 7n]]);
    // The non-default branch never sends a notification id alone.
    expect(calls.markNotificationRead).toEqual([]);
    expect(calls.listNotifications).toEqual([]);
  });

  it("useReconcileClaimNotifications keeps the claim-id-only call shape", async () => {
    const { result } = renderHook(() => useReconcileClaimNotifications(), {
      wrapper,
    });

    await result.current.mutateAsync(11n);

    // Reconcile has no family-scoped variant: it is still called with the claim
    // id alone, and the family separation lives in the invalidation filter.
    expect(calls.reconcileClaimNotifications).toEqual([[11n]]);
    expectNoLegacyNotificationCalls();
  });
});

describe("Notification hooks: non-default family query keys include the familyId (cover)", () => {
  // The familyId must be part of every family-owned Notification cache key so
  // Family A and Family B caches never collide. The default-family legacy keys
  // are frozen separately; here we assert the family-scoped shape.
  function keyProbe() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  }

  it("registers family-scoped keys for the list and unread count", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const list = renderHook(() => useListNotifications(), {
      wrapper: scopedWrapper,
    });
    // Rendered (not bound) so the unread-count query registers its cache key;
    // the assertion below reads the query cache, not the hook result.
    renderHook(() => useUnreadNotificationCount(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(calls.unreadNotificationCountForFamily).toEqual([[FAMILY_A]]),
    );

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["notifications", FAMILY_A]);
    expect(keys).toContainEqual(["notifications", "unreadCount", FAMILY_A]);
    // The default-family bare key is not registered on the non-default branch.
    expect(keys).not.toContainEqual(["notifications"]);
  });

  it("keeps Family A and Family B caches distinct for the list and unread count", async () => {
    const queryClient = keyProbe();
    const wrapperFor = (familyId: string) =>
      function FamilyWrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
          </QueryClientProvider>
        );
      };

    const listA = renderHook(() => useListNotifications(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const listB = renderHook(() => useListNotifications(), {
      wrapper: wrapperFor(FAMILY_B),
    });
    const countA = renderHook(() => useUnreadNotificationCount(), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const countB = renderHook(() => useUnreadNotificationCount(), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(listA.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(listB.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(calls.unreadNotificationCountForFamily).toEqual([
        [FAMILY_A],
        [FAMILY_B],
      ]),
    );
    expect(countA.result.current).toBe(0);
    expect(countB.result.current).toBe(0);

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["notifications", FAMILY_A]);
    expect(keys).toContainEqual(["notifications", FAMILY_B]);
    expect(keys).toContainEqual(["notifications", "unreadCount", FAMILY_A]);
    expect(keys).toContainEqual(["notifications", "unreadCount", FAMILY_B]);
    // Family A and Family B never share a Notification cache entry.
    expect(keys.filter((k) => k[0] === "notifications")).toHaveLength(4);
  });
});

describe("Notification hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily call receives the active familyId, never the default literal", async () => {
    const list = renderHook(() => useListNotifications(), { wrapper });
    // Rendered (not bound) so the unread-count query issues its call; the
    // assertion below reads the recorded actor calls, not the hook result.
    renderHook(() => useUnreadNotificationCount(), { wrapper });
    const markRead = renderHook(() => useMarkNotificationRead(), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(calls.unreadNotificationCountForFamily).toEqual([[FAMILY_A]]),
    );
    await markRead.result.current.mutateAsync(7n);

    const familyIdArgs: unknown[] = [
      calls.listNotificationsForFamily[0]?.[0],
      calls.unreadNotificationCountForFamily[0]?.[0],
      calls.markNotificationReadForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyNotificationCalls();
  });
});

describe("Notification hooks: non-default family invalidation stays family-separated (cover)", () => {
  // The accepted requirement is that Notification mutation cache invalidation is
  // family-separated and does not invalidate another family's Notification
  // cache. React Query's `invalidateQueries` matches by key prefix, so a bare
  // ['notifications'] invalidation would also match the family-appended key of
  // another family and mark its cache stale. This probe seeds a Family A and a
  // Family B read query, runs a Family A mutation, and asserts only the Family A
  // query is invalidated.
  function renderWithSpy<T>(hook: () => T) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const rendered = renderHook(hook, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    const invalidatedKeys = () =>
      invalidateSpy.mock.calls.map(
        ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
      );
    return { ...rendered, queryClient, invalidatedKeys };
  }

  it("useMarkNotificationRead invalidates the notifications prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useMarkNotificationRead(),
    );

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);

    await result.current.mutateAsync(7n);

    // The recorded filter keeps the bare prefix (unchanged from the legacy
    // shape) and narrows it with the active-family predicate.
    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
  });

  it("useMarkNotificationRead invalidates the active family's list AND unread-count keys, never another family's", async () => {
    // The fixed predicate must admit BOTH shapes of the active family's keys:
    // the list key ['notifications', familyId] (familyId at index 1) and the
    // unread-count key ['notifications', 'unreadCount', familyId] (familyId at
    // index 2). A mark-read in Family A must therefore refresh Family A's nav
    // badge, while leaving Family B's list and unread-count caches untouched.
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useMarkNotificationRead(),
    );

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);

    await result.current.mutateAsync(7n);

    // The recorded filter keeps the bare prefix (unchanged from the legacy
    // shape) and narrows it with the active-family predicate.
    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("the non-default predicate matches the active family's list and unread-count keys and rejects another family's", async () => {
    // Mirrors the production predicate exactly: index 1 is the familyId for the
    // list key, and index 2 is the familyId for the unread-count key. Both
    // active-family shapes match; neither Family B shape does.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);

    await queryClient.invalidateQueries({
      queryKey: ["notifications"],
      predicate: (query) =>
        query.queryKey[1] === FAMILY_A ||
        (query.queryKey[1] === "unreadCount" && query.queryKey[2] === FAMILY_A),
    });

    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["notifications", "unreadCount", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useReconcileClaimNotifications invalidates the notifications prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useReconcileClaimNotifications(),
    );

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);

    await result.current.mutateAsync(11n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
  });

  it("useApproveProfileClaim invalidates the notifications prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useApproveProfileClaim(FAMILY_A),
    );

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);

    await result.current.mutateAsync(42n);

    expect(calls.approveProfileClaimForFamily).toEqual([[FAMILY_A, 42n]]);
    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
  });

  it("useRejectProfileClaim invalidates the notifications prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useRejectProfileClaim(FAMILY_A),
    );

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);

    await result.current.mutateAsync(5n);

    expect(calls.rejectProfileClaimForFamily).toEqual([[FAMILY_A, 5n]]);
    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", FAMILY_B])?.isInvalidated,
    ).toBe(false);
  });
});

describe("Notification hooks: non-default family return shapes (cover)", () => {
  // The pages consume these hook return shapes directly. The family-wiring
  // change only changes which endpoint is called, never the shape the hook
  // exposes, so the data passthrough must be unchanged on the non-default
  // branch too.
  it("useListNotifications surfaces the backend records unchanged", async () => {
    const records = [
      makeNotification(1n, { message: "First" }),
      makeNotification(2n, { message: "Second", read: true }),
    ];
    mockActor.listNotificationsForFamily = vi.fn(async () => records);

    const { result } = renderHook(() => useListNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(records);
  });

  it("useUnreadNotificationCount surfaces the backend count as a number", async () => {
    mockActor.unreadNotificationCountForFamily = vi.fn(async () => 3n);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBe(3));
  });

  it("useMarkNotificationRead resolves the backend notification unchanged", async () => {
    const marked = makeNotification(7n, { read: true });
    mockActor.markNotificationReadForFamily = vi.fn(async () => marked);

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

    const notification = await result.current.mutateAsync(7n);
    expect(notification).toEqual(marked);
  });
});
