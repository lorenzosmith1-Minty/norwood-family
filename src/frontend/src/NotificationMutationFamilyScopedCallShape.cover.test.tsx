import "@testing-library/jest-dom/vitest";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useApproveArchiveItem } from "./hooks/useArchiveStorage";
import { useCreateBoardPost } from "./hooks/useBoard";
import { useApproveStory } from "./hooks/useFamilyHistory";
import { useSendMessage } from "./hooks/useMessaging";
import { useApproveProfileClaim } from "./hooks/useProfileClaims";
import { useApproveRecipe } from "./hooks/useRecipes";
import { useApproveRelationshipRequest } from "./hooks/useRelationshipRequests";
import { useApproveSource } from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the repaired Notification family-wiring across EVERY mutation hook
// that invalidates the Notification cache.
//
// The production change routes every mutation hook that previously invalidated
// the bare ['notifications'] prefix through the canonical
// `notificationInvalidation(familyScopedId)` helper exported from
// src/frontend/src/hooks/useNotifications.ts. That includes the hooks whose
// invalidation was previously a weaker duplicate or a bare prefix:
//
//   * useProfileClaims.ts  (previously its own weaker duplicate predicate)
//   * useBoard.ts
//   * useMessaging.ts
//   * useArchiveStorage.ts
//   * useRecipes.ts
//   * useResearchIntake.ts
//   * useRelationshipRequests.ts
//   * useFamilyHistory.ts
//
// React Query matches `invalidateQueries` by key PREFIX, so a bare
// ['notifications'] filter also matches ['notifications', <otherFamily>] and
// ['notifications', 'unreadCount', <otherFamily>] and would mark another
// family's Notification cache stale. The repaired helper keeps the bare prefix
// (so the recorded filter is unchanged) but narrows it with a predicate that
// admits only the active family's keys:
//
//   query.queryKey[1] === familyScopedId ||
//   (query.queryKey[1] === "unreadCount" && query.queryKey[2] === familyScopedId)
//
// This file proves, for a representative mutation from each repaired hook, that
// a non-default family's mutation invalidates ONLY that family's Notification
// list AND unread-count keys and never another family's — and that the default
// family still invalidates the bare ['notifications'] prefix unchanged.
//
// The sibling NotificationsFamilyScopedCallShape.cover.test.tsx covers the
// Notification hooks themselves and the profile-claim hooks; this file extends
// the same contract to the remaining repaired call sites.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which invalidation filter each hook applies —
// and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    // Canonical family-scoped mutation endpoints.
    async createBoardPostForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async sendMessageForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: { conversationId: 1n, messageId: 1n } };
    },
    async approveArchiveItemForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveRecipeForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveSourceForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveRelationshipRequestForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
    async approveStoryForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveProfileClaimForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    // Legacy no-familyId endpoints, reached only on the default-family branch.
    async createBoardPost(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async sendMessage(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: { conversationId: 1n, messageId: 1n } };
    },
    async approveArchiveItem(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveRecipe(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveSource(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveRelationshipRequest(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveStory(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveProfileClaim(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async reconcileClaimNotifications(..._args: unknown[]): Promise<unknown> {
      return 0n;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // No call recording needed: this file asserts invalidation filters, not
      // actor call shapes (those are covered by the per-hook *CallShape files).
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

afterEach(cleanup);
beforeEach(resetCalls);

/**
 * Renders a mutation hook under a NON-default active family and returns a spy
 * over the QueryClient's `invalidateQueries` plus the seeded Notification cache
 * keys for Family A and Family B.
 */
function renderWithFamilyA<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const rendered = renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
      </QueryClientProvider>
    ),
  });

  // Seed both families' Notification list and unread-count keys so the
  // invalidation has something to match against.
  queryClient.setQueryData(["notifications", FAMILY_A], []);
  queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
  queryClient.setQueryData(["notifications", FAMILY_B], []);
  queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);

  const invalidatedKeys = () =>
    invalidateSpy.mock.calls.map(
      ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
    );

  return { ...rendered, queryClient, invalidatedKeys };
}

/** Asserts the active family's Notification keys are stale and Family B's are not. */
function expectOnlyFamilyANotificationsInvalidated(queryClient: QueryClient) {
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
}

describe("Repaired Notification invalidation: non-default family is family-separated (cover)", () => {
  it("useCreateBoardPost (useBoard) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useCreateBoardPost(),
    );

    await result.current.mutateAsync({
      postType: "General" as never,
      title: null,
      body: "A new post.",
      relatedPersonIds: [],
      linkedMediaIds: [],
      tags: [],
    });

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useSendMessage (useMessaging) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useSendMessage(),
    );

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hello.",
    });

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useApproveArchiveItem (useArchiveStorage) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useApproveArchiveItem(),
    );

    await result.current.mutateAsync(5n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useApproveRecipe (useRecipes) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useApproveRecipe(),
    );

    await result.current.mutateAsync(6n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useApproveSource (useResearchIntake) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useApproveSource(),
    );

    await result.current.mutateAsync(7n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useApproveRelationshipRequest (useRelationshipRequests) invalidates only Family A's Notification list and unread count", async () => {
    // useApproveRelationshipRequest takes the familyId as an argument (not from
    // context), so the active family is passed explicitly here.
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useApproveRelationshipRequest(FAMILY_A),
    );

    await result.current.mutateAsync(8n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useApproveStory (useFamilyHistory) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useApproveStory(),
    );

    await result.current.mutateAsync(9n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });

  it("useApproveProfileClaim (useProfileClaims) invalidates only Family A's Notification list and unread count", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithFamilyA(() =>
      useApproveProfileClaim(FAMILY_A),
    );

    await result.current.mutateAsync(42n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expectOnlyFamilyANotificationsInvalidated(queryClient);
  });
});

describe("Repaired Notification invalidation: non-default family never hard-codes the default family id (cover)", () => {
  // If any repaired hook hard-coded the default family id in its Notification
  // invalidation, a non-default family's mutation would mark the default
  // family's Notification keys stale. Seed the default family's keys alongside
  // Family A's and assert they stay untouched.
  it("a Family A mutation leaves the default family's Notification keys untouched", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useApproveStory(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", DEFAULT_FAMILY_ID], []);
    queryClient.setQueryData(
      ["notifications", "unreadCount", DEFAULT_FAMILY_ID],
      0,
    );

    await result.current.mutateAsync(9n);

    // The recorded filter keeps the bare prefix but the predicate admits only
    // the active family's keys.
    const filters = invalidateSpy.mock.calls.map(
      ([f]) =>
        f as { queryKey: unknown[]; predicate?: (q: unknown) => boolean },
    );
    const notificationFilter = filters.find(
      (f) => f.queryKey[0] === "notifications",
    );
    expect(notificationFilter).toBeDefined();
    expect(notificationFilter?.predicate).toBeTypeOf("function");

    expect(
      queryClient.getQueryState(["notifications", FAMILY_A])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["notifications", DEFAULT_FAMILY_ID])
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState([
        "notifications",
        "unreadCount",
        DEFAULT_FAMILY_ID,
      ])?.isInvalidated,
    ).toBe(false);
  });
});

describe("Repaired Notification invalidation: default family keeps the bare prefix (cover)", () => {
  // The default family (no FamilyProvider, or FamilyProvider with the default
  // id) must keep the exact legacy bare ['notifications'] invalidation, which
  // matches every Notification key. This is the unchanged Norwood behavior.
  function renderDefault<T>(hook: () => T) {
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
          <FamilyProvider>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    queryClient.setQueryData(["notifications"], []);
    queryClient.setQueryData(
      ["notifications", "unreadCount", DEFAULT_FAMILY_ID],
      0,
    );

    const invalidatedKeys = () =>
      invalidateSpy.mock.calls.map(
        ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
      );

    return { ...rendered, queryClient, invalidatedKeys };
  }

  it("useCreateBoardPost invalidates the bare ['notifications'] prefix for the default family", async () => {
    const { result, queryClient, invalidatedKeys } = renderDefault(() =>
      useCreateBoardPost(),
    );

    await result.current.mutateAsync({
      postType: "General" as never,
      title: null,
      body: "A new post.",
      relatedPersonIds: [],
      linkedMediaIds: [],
      tags: [],
    });

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(queryClient.getQueryState(["notifications"])?.isInvalidated).toBe(
      true,
    );
    expect(
      queryClient.getQueryState([
        "notifications",
        "unreadCount",
        DEFAULT_FAMILY_ID,
      ])?.isInvalidated,
    ).toBe(true);
  });

  it("useApproveStory invalidates the bare ['notifications'] prefix for the default family", async () => {
    const { result, queryClient, invalidatedKeys } = renderDefault(() =>
      useApproveStory(),
    );

    await result.current.mutateAsync(9n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(queryClient.getQueryState(["notifications"])?.isInvalidated).toBe(
      true,
    );
  });

  it("useApproveProfileClaim invalidates the bare ['notifications'] prefix for the default family", async () => {
    const { result, queryClient, invalidatedKeys } = renderDefault(() =>
      useApproveProfileClaim(),
    );

    await result.current.mutateAsync(42n);

    expect(invalidatedKeys()).toContainEqual(["notifications"]);
    expect(queryClient.getQueryState(["notifications"])?.isInvalidated).toBe(
      true,
    );
  });
});
