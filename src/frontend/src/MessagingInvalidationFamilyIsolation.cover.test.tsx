import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MessageStatus, ReportStatus } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockedUsersInvalidation,
  conversationDetailInvalidation,
  conversationListsInvalidation,
  reportsInvalidation,
  useBlockUser,
  useMarkConversationRead,
  useReportMessage,
  useReviewReport,
  useSendMessage,
  useUnblockUser,
} from "./hooks/useMessaging";

// ---------------------------------------------------------------------------
// Cover for the family-exact Messaging cache-invalidation change in
// `hooks/useMessaging.ts`.
//
// The requested change replaces the eight bare cross-family Messaging
// invalidation prefixes (`["messaging","conversations"]`,
// `["messaging","conversation"]`, `["messaging","blocked"]`,
// `["messaging","reports"]`) with family-exact filters built from the active
// `familyScopedId`, so a Messaging mutation performed while one family is
// active invalidates ONLY that family's Messaging caches. Before the change a
// bare prefix also matched every other family's family-appended key and marked
// it stale.
//
// This file asserts the accepted behavior:
//
//   1. Helper contract: all four Messaging helpers are family-exact in both
//      branches. The default family targets only the exact default read key
//      shape (narrowed with a `queryKey.length` predicate where the bare prefix
//      would otherwise match a non-default key); a non-default family keeps the
//      bare prefix but narrows it with a predicate that admits only the active
//      family's keys (family id at the LAST index).
//
//   2. Non-default isolation, asserted behaviorally through the real mutation
//      hooks: with Family A active, each Messaging mutation path (send message,
//      mark read, block, unblock, report, review report) invalidates Family A's
//      Messaging caches and leaves Family B's and the default family's Messaging
//      caches untouched.
//
//   3. Default-family exactness: with the default family active, a mutation
//      invalidates the exact default read keys and leaves Family A's and
//      Family B's Messaging caches untouched.
//
//   4. Static source audit: no production Messaging invalidation in
//      `useMessaging.ts` passes a bare cross-family prefix to
//      `invalidateQueries`.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const BLOCKED = Principal.fromText("2vxsx-fae");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async sendMessage(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: makeMessage() };
    },
    async sendMessageForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: makeMessage() };
    },
    async markConversationRead(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async markConversationReadForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async blockUser(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async blockUserForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async unblockUser(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async unblockUserForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async reportMessage(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async reportMessageForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async reviewReport(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async reviewReportForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // The mock methods are stateless; the assertions are on React Query cache
      // state, so there is nothing to reset between tests.
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

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    status: MessageStatus.Sent,
    messageId: 1n,
    body: "See you at the reunion.",
    createdAt: 1_700_000_000_000_000_000n,
    conversationId: 1n,
    senderAccountId: OWNER,
    senderPersonId: "julia",
    familyId: FAMILY_A,
    ...overrides,
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient, familyId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

/**
 * Seeds the Messaging conversation-list, conversation-detail, blocked, reports
 * list, and reports-detail caches for the default family, Family A, and
 * Family B so an invalidation can be observed as a state transition on each
 * key.
 *
 * The default family's read key omits the family slot entirely; a non-default
 * family appends the family id at the LAST index.
 */
function seedMessagingCaches(queryClient: QueryClient) {
  for (const familySlot of [undefined, FAMILY_A, FAMILY_B]) {
    const suffix = familySlot === undefined ? [] : [familySlot];
    queryClient.setQueryData(["messaging", "conversations", ...suffix], []);
    queryClient.setQueryData(
      ["messaging", "conversation", "1", ...suffix],
      null,
    );
    queryClient.setQueryData(["messaging", "blocked", ...suffix], []);
    queryClient.setQueryData(["messaging", "reports", ...suffix], []);
    queryClient.setQueryData(["messaging", "reports", "1", ...suffix], null);
  }
}

/** Reads the invalidation state of every seeded Messaging key. */
function readMessagingState(queryClient: QueryClient) {
  const state: Record<string, boolean> = {};
  for (const [label, suffix] of [
    ["default", []],
    ["a", [FAMILY_A]],
    ["b", [FAMILY_B]],
  ] as const) {
    state[`${label}:conversations`] = isInvalidated(queryClient, [
      "messaging",
      "conversations",
      ...suffix,
    ]);
    state[`${label}:conversation`] = isInvalidated(queryClient, [
      "messaging",
      "conversation",
      "1",
      ...suffix,
    ]);
    state[`${label}:blocked`] = isInvalidated(queryClient, [
      "messaging",
      "blocked",
      ...suffix,
    ]);
    state[`${label}:reports`] = isInvalidated(queryClient, [
      "messaging",
      "reports",
      ...suffix,
    ]);
    state[`${label}:reportDetail`] = isInvalidated(queryClient, [
      "messaging",
      "reports",
      "1",
      ...suffix,
    ]);
  }
  return state;
}

const SEND_INPUT = {
  recipientPersonId: "hudson",
  body: "See you at the reunion.",
};

const REPORT_INPUT = {
  messageId: 1n,
  reason: "Inappropriate language.",
};

const REVIEW_INPUT = {
  reportId: 1n,
  status: ReportStatus.Reviewed,
};

// ---------------------------------------------------------------------------
// Helper contract: all four helpers are family-exact in both branches.
// ---------------------------------------------------------------------------

describe("Messaging invalidation helpers are family-exact in both branches (cover)", () => {
  it("conversationListsInvalidation default branch admits only the default list shape", () => {
    const filter = conversationListsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["messaging", "conversations"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["messaging", "conversations"] })).toBe(true);
    expect(
      predicate({ queryKey: ["messaging", "conversations", FAMILY_A] }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["messaging", "conversations", FAMILY_B] }),
    ).toBe(false);
  });

  it("conversationListsInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = conversationListsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["messaging", "conversations"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["messaging", "conversations", FAMILY_A] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["messaging", "conversations", FAMILY_B] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["messaging", "conversations"] })).toBe(false);
  });

  it("conversationDetailInvalidation default branch admits only the default detail shape", () => {
    const filter = conversationDetailInvalidation(undefined);
    expect(filter.queryKey).toEqual(["messaging", "conversation"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["messaging", "conversation", "1"] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["messaging", "conversation", "1", FAMILY_A] }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["messaging", "conversation", "1", FAMILY_B] }),
    ).toBe(false);
  });

  it("conversationDetailInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = conversationDetailInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["messaging", "conversation"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["messaging", "conversation", "1", FAMILY_A] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["messaging", "conversation", "1", FAMILY_B] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["messaging", "conversation", "1"] })).toBe(
      false,
    );
  });

  it("blockedUsersInvalidation default branch admits only the default blocked shape", () => {
    const filter = blockedUsersInvalidation(undefined);
    expect(filter.queryKey).toEqual(["messaging", "blocked"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["messaging", "blocked"] })).toBe(true);
    expect(predicate({ queryKey: ["messaging", "blocked", FAMILY_A] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["messaging", "blocked", FAMILY_B] })).toBe(
      false,
    );
  });

  it("blockedUsersInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = blockedUsersInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["messaging", "blocked"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["messaging", "blocked", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["messaging", "blocked", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["messaging", "blocked"] })).toBe(false);
  });

  it("reportsInvalidation default branch admits only the default list and detail shapes", () => {
    const filter = reportsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["messaging", "reports"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    // The list shape (length 2) and the detail shape (length 3, report-id
    // token at index 2) are both admitted for the default family.
    expect(predicate({ queryKey: ["messaging", "reports"] })).toBe(true);
    expect(predicate({ queryKey: ["messaging", "reports", "1"] })).toBe(true);
    expect(predicate({ queryKey: ["messaging", "reports", "all"] })).toBe(true);
    // A non-default family's list key is also length 3, but its index 2 is a
    // family slug, not a report-id token, so it is rejected.
    expect(predicate({ queryKey: ["messaging", "reports", FAMILY_A] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["messaging", "reports", "1", FAMILY_A] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["messaging", "reports", FAMILY_B] })).toBe(
      false,
    );
  });

  it("reportsInvalidation non-default branch admits only the active family (list index 2, detail index 3)", () => {
    const filter = reportsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["messaging", "reports"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["messaging", "reports", FAMILY_A] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["messaging", "reports", "1", FAMILY_A] }),
    ).toBe(true);
    expect(predicate({ queryKey: ["messaging", "reports", FAMILY_B] })).toBe(
      false,
    );
    expect(
      predicate({ queryKey: ["messaging", "reports", "1", FAMILY_B] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["messaging", "reports"] })).toBe(false);
    expect(predicate({ queryKey: ["messaging", "reports", "1"] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-default family isolation, through the real mutation hooks.
// ---------------------------------------------------------------------------

describe("a Family A Messaging mutation invalidates only Family A's Messaging caches (cover)", () => {
  async function runFamilyAMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedMessagingCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readMessagingState(queryClient);
  }

  it("useSendMessage invalidates only Family A's conversation list and detail", async () => {
    const state = await runFamilyAMutation(
      () => useSendMessage() as never,
      SEND_INPUT,
    );
    expect(state["a:conversations"]).toBe(true);
    expect(state["a:conversation"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:conversations"]).toBe(false);
    expect(state["b:conversation"]).toBe(false);
    expect(state["default:conversations"]).toBe(false);
    expect(state["default:conversation"]).toBe(false);
    // The blocked/reports caches are not part of this mutation.
    expect(state["a:blocked"]).toBe(false);
    expect(state["a:reports"]).toBe(false);
  });

  it("useMarkConversationRead invalidates only Family A's conversation list and detail", async () => {
    const state = await runFamilyAMutation(
      () => useMarkConversationRead() as never,
      1n,
    );
    expect(state["a:conversations"]).toBe(true);
    expect(state["a:conversation"]).toBe(true);
    expect(state["b:conversations"]).toBe(false);
    expect(state["b:conversation"]).toBe(false);
    expect(state["default:conversations"]).toBe(false);
    expect(state["default:conversation"]).toBe(false);
    expect(state["a:blocked"]).toBe(false);
    expect(state["a:reports"]).toBe(false);
  });

  it("useBlockUser invalidates only Family A's blocked cache", async () => {
    const state = await runFamilyAMutation(
      () => useBlockUser() as never,
      BLOCKED,
    );
    expect(state["a:blocked"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:blocked"]).toBe(false);
    expect(state["default:blocked"]).toBe(false);
    // The conversation/reports caches are not part of this mutation.
    expect(state["a:conversations"]).toBe(false);
    expect(state["a:conversation"]).toBe(false);
    expect(state["a:reports"]).toBe(false);
  });

  it("useUnblockUser invalidates only Family A's blocked cache", async () => {
    const state = await runFamilyAMutation(
      () => useUnblockUser() as never,
      BLOCKED,
    );
    expect(state["a:blocked"]).toBe(true);
    expect(state["b:blocked"]).toBe(false);
    expect(state["default:blocked"]).toBe(false);
    expect(state["a:conversations"]).toBe(false);
    expect(state["a:reports"]).toBe(false);
  });

  it("useReportMessage invalidates only Family A's reports list and detail", async () => {
    const state = await runFamilyAMutation(
      () => useReportMessage() as never,
      REPORT_INPUT,
    );
    expect(state["a:reports"]).toBe(true);
    expect(state["a:reportDetail"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:reports"]).toBe(false);
    expect(state["b:reportDetail"]).toBe(false);
    expect(state["default:reports"]).toBe(false);
    expect(state["default:reportDetail"]).toBe(false);
    // The conversation/blocked caches are not part of this mutation.
    expect(state["a:conversations"]).toBe(false);
    expect(state["a:blocked"]).toBe(false);
  });

  it("useReviewReport invalidates only Family A's reports list and detail", async () => {
    const state = await runFamilyAMutation(
      () => useReviewReport() as never,
      REVIEW_INPUT,
    );
    expect(state["a:reports"]).toBe(true);
    expect(state["a:reportDetail"]).toBe(true);
    expect(state["b:reports"]).toBe(false);
    expect(state["b:reportDetail"]).toBe(false);
    expect(state["default:reports"]).toBe(false);
    expect(state["default:reportDetail"]).toBe(false);
    expect(state["a:conversations"]).toBe(false);
    expect(state["a:blocked"]).toBe(false);
  });

  it("a Family B mutation invalidates Family B only, not Family A", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperFor(queryClient, FAMILY_B),
    });
    seedMessagingCaches(queryClient);

    await result.current.mutateAsync(SEND_INPUT as never);

    const state = readMessagingState(queryClient);
    expect(state["b:conversations"]).toBe(true);
    expect(state["b:conversation"]).toBe(true);
    expect(state["a:conversations"]).toBe(false);
    expect(state["a:conversation"]).toBe(false);
    expect(state["default:conversations"]).toBe(false);
    expect(state["default:conversation"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default-family exactness.
// ---------------------------------------------------------------------------

describe("a default-family Messaging mutation does not invalidate non-default Messaging caches (cover)", () => {
  async function runDefaultMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedMessagingCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readMessagingState(queryClient);
  }

  it("useSendMessage invalidates the exact default conversation keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useSendMessage() as never,
      SEND_INPUT,
    );
    expect(state["default:conversations"]).toBe(true);
    expect(state["default:conversation"]).toBe(true);
    expect(state["a:conversations"]).toBe(false);
    expect(state["a:conversation"]).toBe(false);
    expect(state["b:conversations"]).toBe(false);
    expect(state["b:conversation"]).toBe(false);
  });

  it("useBlockUser invalidates the exact default blocked key and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useBlockUser() as never,
      BLOCKED,
    );
    expect(state["default:blocked"]).toBe(true);
    expect(state["a:blocked"]).toBe(false);
    expect(state["b:blocked"]).toBe(false);
  });

  it("useReportMessage invalidates the exact default reports keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useReportMessage() as never,
      REPORT_INPUT,
    );
    expect(state["default:reports"]).toBe(true);
    expect(state["default:reportDetail"]).toBe(true);
    expect(state["a:reports"]).toBe(false);
    expect(state["a:reportDetail"]).toBe(false);
    expect(state["b:reports"]).toBe(false);
    expect(state["b:reportDetail"]).toBe(false);
  });

  it("useReviewReport invalidates the exact default reports keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useReviewReport() as never,
      REVIEW_INPUT,
    );
    expect(state["default:reports"]).toBe(true);
    expect(state["default:reportDetail"]).toBe(true);
    expect(state["a:reports"]).toBe(false);
    expect(state["a:reportDetail"]).toBe(false);
    expect(state["b:reports"]).toBe(false);
    expect(state["b:reportDetail"]).toBe(false);
  });

  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// Static source audit: no production Messaging invalidation uses a bare
// cross-family prefix.
// ---------------------------------------------------------------------------

describe("no production Messaging invalidation uses a bare cross-family prefix (cover)", () => {
  const HOOKS_DIR = join(process.cwd(), "src", "hooks");
  const MESSAGING_HOOK = "useMessaging.ts";

  function readMessagingHook(): string {
    return readFileSync(join(HOOKS_DIR, MESSAGING_HOOK), "utf8");
  }

  it("audits the production Messaging hook file", () => {
    expect(readMessagingHook().length).toBeGreaterThan(0);
  });

  it("no bare ['messaging', <domain>] queryKey is passed to invalidateQueries", () => {
    // A bare `["messaging","conversations"]` (etc.) prefix matches every
    // family-appended key, so it would mark another family's Messaging cache
    // stale. The helpers build the filter; the hooks must call the helper, not
    // inline the prefix.
    const source = readMessagingHook();
    const barePrefixes = [
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']messaging["']\s*,\s*["']conversations["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']messaging["']\s*,\s*["']conversation["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']messaging["']\s*,\s*["']blocked["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']messaging["']\s*,\s*["']reports["']\s*\]\s*\}/u,
    ];
    const offenders = barePrefixes.filter((pattern) => pattern.test(source));
    expect(offenders).toEqual([]);
  });

  it("the Messaging mutation hooks route through the family-aware helpers", () => {
    const source = readMessagingHook();
    for (const helper of [
      "conversationListsInvalidation",
      "conversationDetailInvalidation",
      "blockedUsersInvalidation",
      "reportsInvalidation",
    ]) {
      expect(source).toContain(helper);
    }
  });
});
