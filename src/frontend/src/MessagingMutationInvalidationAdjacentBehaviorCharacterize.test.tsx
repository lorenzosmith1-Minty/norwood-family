import "@testing-library/jest-dom/vitest";
import {
  type ConversationSummary,
  type ConversationView,
  type Message,
  MessageStatus,
  type Report,
  ReportStatus,
  type ReportedMessageView,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useBlockUser,
  useCanMessagePerson,
  useGetConversation,
  useGetReportedMessage,
  useListBlockedUsers,
  useListConversations,
  useListMessageableMembers,
  useListReports,
  useMarkConversationRead,
  useReportMessage,
  useReviewReport,
  useSendMessage,
  useUnblockUser,
} from "./hooks/useMessaging";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-exact Messaging cache-invalidation
// change in `hooks/useMessaging.ts`.
//
// The requested change replaces the eight bare cross-family Messaging
// invalidation prefixes (`["messaging","conversations"]`,
// `["messaging","conversation"]`, `["messaging","blocked"]`,
// `["messaging","reports"]`) with family-exact filters built from the active
// `familyScopedId`, so a Messaging mutation performed while one family is
// active invalidates ONLY that family's Messaging caches.
//
// This file deliberately does NOT freeze the bare-prefix Messaging
// invalidations: those are the defect being fixed, and pinning them would make
// the accepted change fail. It freezes the surrounding behavior that the change
// must leave untouched:
//
//   1. Mutation call shapes: the default family keeps the legacy no-familyId
//      endpoint call, and a non-default family keeps the `*ForFamily` call with
//      the familyId as the first positional argument. The invalidation change
//      must not alter which endpoint a mutation calls or with which arguments.
//
//   2. Read query-key shapes: the default family keeps the legacy keys and a
//      non-default family keeps the family-appended keys. The invalidation
//      change must not alter the keys the read hooks register.
//
//   3. Family-scoped Notification invalidation: `useSendMessage`,
//      `useReportMessage`, and `useReviewReport` already route their
//      Notification invalidation through `notificationInvalidation(familyScopedId)`.
//      That family-scoped behavior must remain: a Family A mutation refreshes
//      Family A's Notification list and unread-count caches and leaves Family
//      B's untouched.
//
//   4. The mutation still invalidates its own Messaging cache: a mutation must
//      still mark the active family's Messaging cache stale (asserted
//      behaviorally, without pinning the exact filter shape, so the family-exact
//      fix is free to change the filter).
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const OTHER_ACCOUNT = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Legacy no-familyId endpoints.
    listConversations: unknown[][];
    getConversation: unknown[][];
    listMessageableMembers: unknown[][];
    canMessagePerson: unknown[][];
    sendMessage: unknown[][];
    markConversationRead: unknown[][];
    blockUser: unknown[][];
    unblockUser: unknown[][];
    listBlockedUsers: unknown[][];
    reportMessage: unknown[][];
    listReports: unknown[][];
    getReportedMessage: unknown[][];
    reviewReport: unknown[][];
    // Canonical family-scoped endpoints.
    listConversationsForFamily: unknown[][];
    getConversationForFamily: unknown[][];
    listMessageableMembersForFamily: unknown[][];
    canMessagePersonForFamily: unknown[][];
    sendMessageForFamily: unknown[][];
    markConversationReadForFamily: unknown[][];
    blockUserForFamily: unknown[][];
    unblockUserForFamily: unknown[][];
    listBlockedUsersForFamily: unknown[][];
    reportMessageForFamily: unknown[][];
    listReportsForFamily: unknown[][];
    getReportedMessageForFamily: unknown[][];
    reviewReportForFamily: unknown[][];
  } = {
    listConversations: [],
    getConversation: [],
    listMessageableMembers: [],
    canMessagePerson: [],
    sendMessage: [],
    markConversationRead: [],
    blockUser: [],
    unblockUser: [],
    listBlockedUsers: [],
    reportMessage: [],
    listReports: [],
    getReportedMessage: [],
    reviewReport: [],
    listConversationsForFamily: [],
    getConversationForFamily: [],
    listMessageableMembersForFamily: [],
    canMessagePersonForFamily: [],
    sendMessageForFamily: [],
    markConversationReadForFamily: [],
    blockUserForFamily: [],
    unblockUserForFamily: [],
    listBlockedUsersForFamily: [],
    reportMessageForFamily: [],
    listReportsForFamily: [],
    getReportedMessageForFamily: [],
    reviewReportForFamily: [],
  };

  const mockActor = {
    async listConversations(
      ...args: unknown[]
    ): Promise<ConversationSummary[]> {
      calls.listConversations.push(args);
      return [];
    },
    async getConversation(
      ...args: unknown[]
    ): Promise<ConversationView | null> {
      calls.getConversation.push(args);
      return null;
    },
    async listMessageableMembers(...args: unknown[]): Promise<string[]> {
      calls.listMessageableMembers.push(args);
      return [];
    },
    async canMessagePerson(...args: unknown[]): Promise<boolean> {
      calls.canMessagePerson.push(args);
      return false;
    },
    async sendMessage(...args: unknown[]): Promise<unknown> {
      calls.sendMessage.push(args);
      return { __kind__: "ok", ok: makeMessage() };
    },
    async markConversationRead(...args: unknown[]): Promise<void> {
      calls.markConversationRead.push(args);
    },
    async blockUser(...args: unknown[]): Promise<void> {
      calls.blockUser.push(args);
    },
    async unblockUser(...args: unknown[]): Promise<void> {
      calls.unblockUser.push(args);
    },
    async listBlockedUsers(...args: unknown[]): Promise<Principal[]> {
      calls.listBlockedUsers.push(args);
      return [];
    },
    async reportMessage(...args: unknown[]): Promise<Report> {
      calls.reportMessage.push(args);
      return makeReport();
    },
    async listReports(...args: unknown[]): Promise<Report[]> {
      calls.listReports.push(args);
      return [];
    },
    async getReportedMessage(
      ...args: unknown[]
    ): Promise<ReportedMessageView | null> {
      calls.getReportedMessage.push(args);
      return null;
    },
    async reviewReport(...args: unknown[]): Promise<Report | null> {
      calls.reviewReport.push(args);
      return null;
    },
    async listConversationsForFamily(
      ...args: unknown[]
    ): Promise<ConversationSummary[]> {
      calls.listConversationsForFamily.push(args);
      return [];
    },
    async getConversationForFamily(
      ...args: unknown[]
    ): Promise<ConversationView | null> {
      calls.getConversationForFamily.push(args);
      return null;
    },
    async listMessageableMembersForFamily(
      ...args: unknown[]
    ): Promise<string[]> {
      calls.listMessageableMembersForFamily.push(args);
      return [];
    },
    async canMessagePersonForFamily(...args: unknown[]): Promise<boolean> {
      calls.canMessagePersonForFamily.push(args);
      return false;
    },
    async sendMessageForFamily(...args: unknown[]): Promise<unknown> {
      calls.sendMessageForFamily.push(args);
      return { __kind__: "ok", ok: makeMessage() };
    },
    async markConversationReadForFamily(...args: unknown[]): Promise<void> {
      calls.markConversationReadForFamily.push(args);
    },
    async blockUserForFamily(...args: unknown[]): Promise<void> {
      calls.blockUserForFamily.push(args);
    },
    async unblockUserForFamily(...args: unknown[]): Promise<void> {
      calls.unblockUserForFamily.push(args);
    },
    async listBlockedUsersForFamily(...args: unknown[]): Promise<Principal[]> {
      calls.listBlockedUsersForFamily.push(args);
      return [];
    },
    async reportMessageForFamily(...args: unknown[]): Promise<Report> {
      calls.reportMessageForFamily.push(args);
      return makeReport();
    },
    async listReportsForFamily(...args: unknown[]): Promise<Report[]> {
      calls.listReportsForFamily.push(args);
      return [];
    },
    async getReportedMessageForFamily(
      ...args: unknown[]
    ): Promise<ReportedMessageView | null> {
      calls.getReportedMessageForFamily.push(args);
      return null;
    },
    async reviewReportForFamily(...args: unknown[]): Promise<Report | null> {
      calls.reviewReportForFamily.push(args);
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

afterEach(cleanup);
beforeEach(resetCalls);

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    familyId: FAMILY_A,
    messageId: 1n,
    conversationId: 1n,
    senderAccountId: OWNER,
    senderPersonId: "julia",
    body: "Hello",
    createdAt: 1_700_000_000_000_000_000n,
    status: MessageStatus.Sent,
    ...overrides,
  };
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    familyId: FAMILY_A,
    reportId: 5n,
    reportedMessageId: 7n,
    reportingAccountId: OWNER,
    reason: "Harassment",
    createdAt: 1_700_000_000_000_000_000n,
    status: ReportStatus.Pending,
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

// ---------------------------------------------------------------------------
// 1. Mutation call shapes are unchanged by the invalidation change.
// ---------------------------------------------------------------------------

describe("Messaging mutation call shapes stay unchanged (characterization)", () => {
  it("the default family keeps the legacy no-familyId mutation calls", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const send = renderHook(() => useSendMessage(), { wrapper });
    await send.result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "See you at the reunion",
    });

    const markRead = renderHook(() => useMarkConversationRead(), { wrapper });
    await markRead.result.current.mutateAsync(3n);

    const block = renderHook(() => useBlockUser(), { wrapper });
    await block.result.current.mutateAsync(OTHER_ACCOUNT);

    const unblock = renderHook(() => useUnblockUser(), { wrapper });
    await unblock.result.current.mutateAsync(OTHER_ACCOUNT);

    const report = renderHook(() => useReportMessage(), { wrapper });
    await report.result.current.mutateAsync({ messageId: 7n, reason: "Spam" });

    const review = renderHook(() => useReviewReport(), { wrapper });
    await review.result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    expect(calls.sendMessage).toEqual([
      ["versie-smith", "See you at the reunion"],
    ]);
    expect(calls.markConversationRead).toEqual([[3n]]);
    expect(calls.blockUser).toEqual([[OTHER_ACCOUNT]]);
    expect(calls.unblockUser).toEqual([[OTHER_ACCOUNT]]);
    expect(calls.reportMessage).toEqual([[7n, "Spam"]]);
    expect(calls.reviewReport).toEqual([[5n, ReportStatus.Reviewed]]);
    // The default branch never routes to a *ForFamily endpoint.
    expect(calls.sendMessageForFamily).toEqual([]);
    expect(calls.markConversationReadForFamily).toEqual([]);
    expect(calls.blockUserForFamily).toEqual([]);
    expect(calls.unblockUserForFamily).toEqual([]);
    expect(calls.reportMessageForFamily).toEqual([]);
    expect(calls.reviewReportForFamily).toEqual([]);
  });

  it("a non-default family keeps the *ForFamily mutation calls with the familyId first", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const send = renderHook(() => useSendMessage(), { wrapper });
    await send.result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "See you at the reunion",
    });

    const markRead = renderHook(() => useMarkConversationRead(), { wrapper });
    await markRead.result.current.mutateAsync(3n);

    const block = renderHook(() => useBlockUser(), { wrapper });
    await block.result.current.mutateAsync(OTHER_ACCOUNT);

    const unblock = renderHook(() => useUnblockUser(), { wrapper });
    await unblock.result.current.mutateAsync(OTHER_ACCOUNT);

    const report = renderHook(() => useReportMessage(), { wrapper });
    await report.result.current.mutateAsync({ messageId: 7n, reason: "Spam" });

    const review = renderHook(() => useReviewReport(), { wrapper });
    await review.result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    expect(calls.sendMessageForFamily).toEqual([
      [FAMILY_A, "versie-smith", "See you at the reunion"],
    ]);
    expect(calls.markConversationReadForFamily).toEqual([[FAMILY_A, 3n]]);
    expect(calls.blockUserForFamily).toEqual([[FAMILY_A, OTHER_ACCOUNT]]);
    expect(calls.unblockUserForFamily).toEqual([[FAMILY_A, OTHER_ACCOUNT]]);
    expect(calls.reportMessageForFamily).toEqual([[FAMILY_A, 7n, "Spam"]]);
    expect(calls.reviewReportForFamily).toEqual([
      [FAMILY_A, 5n, ReportStatus.Reviewed],
    ]);
    // The non-default branch never falls back to the legacy endpoints.
    expect(calls.sendMessage).toEqual([]);
    expect(calls.markConversationRead).toEqual([]);
    expect(calls.blockUser).toEqual([]);
    expect(calls.unblockUser).toEqual([]);
    expect(calls.reportMessage).toEqual([]);
    expect(calls.reviewReport).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Read query-key shapes are unchanged by the invalidation change.
// ---------------------------------------------------------------------------

describe("Messaging read query-key shapes stay unchanged (characterization)", () => {
  it("the default family registers the legacy keys", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const list = renderHook(() => useListConversations(), { wrapper });
    const detail = renderHook(() => useGetConversation(7n), { wrapper });
    const members = renderHook(() => useListMessageableMembers(), { wrapper });
    const can = renderHook(() => useCanMessagePerson("versie-smith"), {
      wrapper,
    });
    const blocked = renderHook(() => useListBlockedUsers(), { wrapper });
    const reports = renderHook(() => useListReports(), { wrapper });
    const reported = renderHook(() => useGetReportedMessage(5n), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(members.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(can.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(blocked.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(reports.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(reported.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "conversations"]);
    expect(keys).toContainEqual(["messaging", "conversation", "7"]);
    expect(keys).toContainEqual(["messaging", "messageableMembers"]);
    expect(keys).toContainEqual(["messaging", "canMessage", "versie-smith"]);
    expect(keys).toContainEqual(["messaging", "blocked"]);
    expect(keys).toContainEqual(["messaging", "reports"]);
    expect(keys).toContainEqual(["messaging", "reports", "5"]);
  });

  it("a non-default family registers the family-appended keys", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const list = renderHook(() => useListConversations(), { wrapper });
    const detail = renderHook(() => useGetConversation(7n), { wrapper });
    const members = renderHook(() => useListMessageableMembers(), { wrapper });
    const can = renderHook(() => useCanMessagePerson("versie-smith"), {
      wrapper,
    });
    const blocked = renderHook(() => useListBlockedUsers(), { wrapper });
    const reports = renderHook(() => useListReports(), { wrapper });
    const reported = renderHook(() => useGetReportedMessage(5n), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(members.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(can.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(blocked.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(reports.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(reported.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "conversations", FAMILY_A]);
    expect(keys).toContainEqual(["messaging", "conversation", "7", FAMILY_A]);
    expect(keys).toContainEqual(["messaging", "messageableMembers", FAMILY_A]);
    expect(keys).toContainEqual([
      "messaging",
      "canMessage",
      "versie-smith",
      FAMILY_A,
    ]);
    expect(keys).toContainEqual(["messaging", "blocked", FAMILY_A]);
    expect(keys).toContainEqual(["messaging", "reports", FAMILY_A]);
    expect(keys).toContainEqual(["messaging", "reports", "5", FAMILY_A]);
  });
});

// ---------------------------------------------------------------------------
// 3. Family-scoped Notification invalidation is unchanged.
// ---------------------------------------------------------------------------

describe("Messaging mutations keep family-scoped Notification invalidation (characterization)", () => {
  // useSendMessage, useReportMessage, and useReviewReport already invalidate the
  // Notification cache through notificationInvalidation(familyScopedId). The
  // Messaging family-exact change must not weaken that: a Family A mutation must
  // still refresh Family A's Notification list and unread-count caches and leave
  // Family B's untouched.
  function renderWithFamilyA<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    return { ...rendered, queryClient };
  }

  function seedNotificationCaches(queryClient: QueryClient) {
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);
  }

  function expectFamilyANotificationsInvalidated(queryClient: QueryClient) {
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

  it("useSendMessage refreshes only Family A's Notification caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useSendMessage());
    seedNotificationCaches(queryClient);

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });

    expectFamilyANotificationsInvalidated(queryClient);
  });

  it("useReportMessage refreshes only Family A's Notification caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useReportMessage());
    seedNotificationCaches(queryClient);

    await result.current.mutateAsync({ messageId: 7n, reason: "Spam" });

    expectFamilyANotificationsInvalidated(queryClient);
  });

  it("useReviewReport refreshes only Family A's Notification caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useReviewReport());
    seedNotificationCaches(queryClient);

    await result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    expectFamilyANotificationsInvalidated(queryClient);
  });

  it("the default family keeps the bare ['notifications'] invalidation", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    queryClient.setQueryData(["notifications"], []);

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });

    expect(queryClient.getQueryState(["notifications"])?.isInvalidated).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. A mutation still invalidates its own Messaging cache.
// ---------------------------------------------------------------------------

describe("Messaging mutations still invalidate their own Messaging cache (characterization)", () => {
  // The family-exact change alters the *filter* a mutation applies, not whether
  // it invalidates. These assertions seed the active family's read caches and
  // assert they go stale after the mutation, without pinning the exact filter
  // shape — so the family-exact fix is free to change the filter while a
  // regression that drops the invalidation entirely still fails.
  function renderWithFamilyA<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    return { ...rendered, queryClient };
  }

  it("useSendMessage invalidates Family A's conversation list and detail caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useSendMessage());
    queryClient.setQueryData(["messaging", "conversations", FAMILY_A], []);
    queryClient.setQueryData(
      ["messaging", "conversation", "1", FAMILY_A],
      null,
    );

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });

    expect(
      queryClient.getQueryState(["messaging", "conversations", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["messaging", "conversation", "1", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useMarkConversationRead invalidates Family A's conversation list and detail caches", async () => {
    const { result, queryClient } = renderWithFamilyA(() =>
      useMarkConversationRead(),
    );
    queryClient.setQueryData(["messaging", "conversations", FAMILY_A], []);
    queryClient.setQueryData(
      ["messaging", "conversation", "1", FAMILY_A],
      null,
    );

    await result.current.mutateAsync(1n);

    expect(
      queryClient.getQueryState(["messaging", "conversations", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["messaging", "conversation", "1", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useBlockUser invalidates Family A's blocked cache", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useBlockUser());
    queryClient.setQueryData(["messaging", "blocked", FAMILY_A], []);

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(
      queryClient.getQueryState(["messaging", "blocked", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useUnblockUser invalidates Family A's blocked cache", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useUnblockUser());
    queryClient.setQueryData(["messaging", "blocked", FAMILY_A], []);

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(
      queryClient.getQueryState(["messaging", "blocked", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useReportMessage invalidates Family A's reports list cache", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useReportMessage());
    queryClient.setQueryData(["messaging", "reports", FAMILY_A], []);

    await result.current.mutateAsync({ messageId: 7n, reason: "Spam" });

    expect(
      queryClient.getQueryState(["messaging", "reports", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useReviewReport invalidates Family A's reports list cache", async () => {
    const { result, queryClient } = renderWithFamilyA(() => useReviewReport());
    queryClient.setQueryData(["messaging", "reports", FAMILY_A], []);

    await result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    expect(
      queryClient.getQueryState(["messaging", "reports", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("the default family mutation invalidates the legacy Messaging cache", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    queryClient.setQueryData(["messaging", "conversations"], []);

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });

    expect(
      queryClient.getQueryState(["messaging", "conversations"])?.isInvalidated,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. The default family id is still Norwood.
// ---------------------------------------------------------------------------

describe("Messaging family context default (characterization)", () => {
  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});
