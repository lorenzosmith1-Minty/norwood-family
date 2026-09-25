import "@testing-library/jest-dom/vitest";
import {
  type ConversationSummary,
  type ConversationView,
  type Message,
  MessageError,
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

import { useQueryClient } from "@tanstack/react-query";

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
// Characterization baseline for the family-scoped Private Messaging change:
// the DEFAULT-family path through the production FamilyProvider composition.
//
// The requested change makes every Messaging hook read the active family from
// the centralized family context and fork on `useFamilyScopedId()`:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook must keep making the legacy no-familyId call and keep the legacy
//     React Query key — the default-family behavior and UI must be unchanged;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// The real app mounts `<FamilyProvider>` (main.tsx) with the default family, so
// the default-family path *through the provider* is the production path. This
// file pins that path for all twelve Messaging hooks: the exact positional
// arguments each hook passes to the legacy endpoint, the exact React Query keys
// the read hooks register, and the cache keys the mutations invalidate.
//
// It deliberately does NOT freeze the non-default branch (that is the new
// behavior) and does NOT freeze the legacy call shape as the *only* shape — the
// change replaces the unconditional legacy call with a fork. What it protects
// is that, for the default family, every Messaging hook still reaches the
// legacy endpoint with the same positional arguments and registers the same
// query keys, so the default-family inbox, conversation thread, messageable
// members, block list, and steward report review keep working exactly as before.
//
// The page-level journeys (inbox unread badge, conversation reuse, block note,
// report + steward review) are covered by MessagingFeatureCover.test.tsx, and
// the Person Profile message gate by ProfileMessageButtonCharacterize.test.tsx.
// This file covers the hook-level call shapes and query keys the family-scoping
// change touches, mirroring BoardDefaultFamilyProviderCharacterize.test.tsx for
// the Board family.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const OTHER_ACCOUNT = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
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
    async sendMessage(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: Message } | { __kind__: "err"; err: MessageError }
    > {
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

/**
 * The production composition: a QueryClientProvider wrapping a FamilyProvider
 * with the DEFAULT family (the same default main.tsx mounts).
 */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    familyId: DEFAULT_FAMILY_ID,
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
    familyId: DEFAULT_FAMILY_ID,
    reportId: 5n,
    reportedMessageId: 7n,
    reportingAccountId: OWNER,
    reason: "Harassment",
    createdAt: 1_700_000_000_000_000_000n,
    status: ReportStatus.Pending,
    ...overrides,
  };
}

describe("Messaging read hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useListConversations calls listConversations() with no arguments", async () => {
    const { result } = renderHook(() => useListConversations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listConversations).toEqual([[]]);
  });

  it("useGetConversation calls getConversation(id) with the id and no familyId", async () => {
    const view: ConversationView = {
      conversationId: 7n,
      participantPersonIds: ["julia", "versie-smith"],
      participantDisplayNames: ["Julia Norwood", "Versie Smith"],
      messages: [],
    };
    mockActor.getConversation = vi.fn(async (...args: unknown[]) => {
      calls.getConversation.push(args);
      return view;
    });

    const { result } = renderHook(() => useGetConversation(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getConversation).toEqual([[7n]]);
    expect(result.current.data).toBe(view);
  });

  it("useListMessageableMembers calls listMessageableMembers() with no arguments", async () => {
    const { result } = renderHook(() => useListMessageableMembers(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listMessageableMembers).toEqual([[]]);
  });

  it("useCanMessagePerson calls canMessagePerson(personId) with the personId and no familyId", async () => {
    const { result } = renderHook(() => useCanMessagePerson("versie-smith"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.canMessagePerson).toEqual([["versie-smith"]]);
  });

  it("useListBlockedUsers calls listBlockedUsers() with no arguments", async () => {
    const { result } = renderHook(() => useListBlockedUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBlockedUsers).toEqual([[]]);
  });

  it("useListReports calls listReports() with no arguments", async () => {
    const { result } = renderHook(() => useListReports(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listReports).toEqual([[]]);
  });

  it("useGetReportedMessage calls getReportedMessage(reportId) with the id and no familyId", async () => {
    const view: ReportedMessageView = {
      report: makeReport(),
      message: makeMessage({ messageId: 7n }),
    };
    mockActor.getReportedMessage = vi.fn(async (...args: unknown[]) => {
      calls.getReportedMessage.push(args);
      return view;
    });

    const { result } = renderHook(() => useGetReportedMessage(5n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReportedMessage).toEqual([[5n]]);
    expect(result.current.data).toBe(view);
  });
});

describe("Messaging mutation hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useSendMessage calls sendMessage(recipientPersonId, body) with no familyId", async () => {
    const { result } = renderHook(() => useSendMessage(), { wrapper });

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "See you at the reunion",
    });

    expect(calls.sendMessage).toEqual([
      ["versie-smith", "See you at the reunion"],
    ]);
  });

  it("useMarkConversationRead calls markConversationRead(conversationId) with no familyId", async () => {
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper });

    await result.current.mutateAsync(3n);

    expect(calls.markConversationRead).toEqual([[3n]]);
  });

  it("useBlockUser calls blockUser(accountId) with no familyId", async () => {
    const { result } = renderHook(() => useBlockUser(), { wrapper });

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(calls.blockUser).toEqual([[OTHER_ACCOUNT]]);
  });

  it("useUnblockUser calls unblockUser(accountId) with no familyId", async () => {
    const { result } = renderHook(() => useUnblockUser(), { wrapper });

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(calls.unblockUser).toEqual([[OTHER_ACCOUNT]]);
  });

  it("useReportMessage calls reportMessage(messageId, reason) with no familyId", async () => {
    const { result } = renderHook(() => useReportMessage(), { wrapper });

    await result.current.mutateAsync({ messageId: 7n, reason: "Harassment" });

    expect(calls.reportMessage).toEqual([[7n, "Harassment"]]);
  });

  it("useReviewReport calls reviewReport(reportId, status) with no familyId", async () => {
    const { result } = renderHook(() => useReviewReport(), { wrapper });

    await result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    expect(calls.reviewReport).toEqual([[5n, ReportStatus.Reviewed]]);
  });
});

describe("Messaging hooks under the default-family provider: legacy query keys (characterization)", () => {
  // The family-scoping change appends the active familyId to the Messaging query
  // keys for a NON-default family so caches never collide across families. The
  // DEFAULT family must keep the legacy keys byte-for-byte, because the mutation
  // hooks invalidate exactly these keys — a changed default-family key would
  // silently stop the inbox, conversation thread, block list, and steward report
  // review from refreshing after a send, read, block, report, or review.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListConversations registers the legacy ['messaging','conversations'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListConversations(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "conversations"]);
  });

  it("useGetConversation registers the legacy ['messaging','conversation',id] key", async () => {
    const { result } = renderHook(
      () => ({ view: useGetConversation(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.view.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "conversation", "7"]);
  });

  it("useListMessageableMembers registers the legacy ['messaging','messageableMembers'] key", async () => {
    const { result } = renderHook(
      () => ({ members: useListMessageableMembers(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.members.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "messageableMembers"]);
  });

  it("useCanMessagePerson registers the legacy ['messaging','canMessage',personId] key", async () => {
    const { result } = renderHook(
      () => ({ can: useCanMessagePerson("versie-smith"), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.can.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "canMessage", "versie-smith"]);
  });

  it("useListBlockedUsers registers the legacy ['messaging','blocked'] key", async () => {
    const { result } = renderHook(
      () => ({ blocked: useListBlockedUsers(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.blocked.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "blocked"]);
  });

  it("useListReports registers the legacy ['messaging','reports'] key", async () => {
    const { result } = renderHook(
      () => ({ reports: useListReports(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.reports.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "reports"]);
  });

  it("useGetReportedMessage registers the legacy ['messaging','reports',id] key", async () => {
    const { result } = renderHook(
      () => ({ view: useGetReportedMessage(5n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.view.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["messaging", "reports", "5"]);
  });
});

describe("Messaging mutations under the default-family provider: cache invalidation (characterization)", () => {
  // The mutation hooks invalidate the legacy query-key prefix, which matches
  // both the default-family legacy key and the non-default family-scoped key.
  // A changed invalidation key would silently stop the affected list from
  // refreshing after a mutation. `invalidateQueries` only marks *existing*
  // matching queries stale, so the probe spies on the call itself rather than
  // reading the (empty) query cache.
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
          <FamilyProvider>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    const invalidatedKeys = () =>
      invalidateSpy.mock.calls.map(
        ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
      );
    return { ...rendered, invalidatedKeys };
  }

  it("useSendMessage invalidates the conversations, conversation, and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useSendMessage());

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["messaging", "conversations"]);
    expect(keys).toContainEqual(["messaging", "conversation"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("useMarkConversationRead invalidates the conversations and conversation keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useMarkConversationRead(),
    );

    await result.current.mutateAsync(3n);

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["messaging", "conversations"]);
    expect(keys).toContainEqual(["messaging", "conversation"]);
  });

  it("useBlockUser invalidates the blocked key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useBlockUser());

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(invalidatedKeys()).toContainEqual(["messaging", "blocked"]);
  });

  it("useUnblockUser invalidates the blocked key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useUnblockUser());

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(invalidatedKeys()).toContainEqual(["messaging", "blocked"]);
  });

  it("useReportMessage invalidates the reports and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useReportMessage());

    await result.current.mutateAsync({ messageId: 7n, reason: "Spam" });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["messaging", "reports"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("useReviewReport invalidates the reports and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useReviewReport());

    await result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["messaging", "reports"]);
    expect(keys).toContainEqual(["notifications"]);
  });
});

describe("Messaging hooks under the default-family provider: return shapes (characterization)", () => {
  // The pages consume these hook return shapes directly. The family-scoping
  // change only changes which endpoint is called, never the shape the hook
  // exposes, so the data passthrough must be unchanged.
  it("useListConversations exposes the backend conversation summaries unchanged", async () => {
    const summaries: ConversationSummary[] = [
      {
        conversationId: 1n,
        otherPersonId: "versie-smith",
        otherDisplayName: "Versie Smith",
        unreadCount: 2n,
        latestMessagePreview: "Are you coming?",
        latestMessageAt: 1_700_000_000_000_000_000n,
      },
    ];
    mockActor.listConversations = vi.fn(async () => summaries);

    const { result } = renderHook(() => useListConversations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summaries);
  });

  it("useListMessageableMembers exposes the backend person ids unchanged", async () => {
    mockActor.listMessageableMembers = vi.fn(async () => [
      "versie-smith",
      "hudson",
    ]);

    const { result } = renderHook(() => useListMessageableMembers(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["versie-smith", "hudson"]);
  });

  it("useCanMessagePerson exposes the backend boolean unchanged", async () => {
    mockActor.canMessagePerson = vi.fn(async () => true);

    const { result } = renderHook(() => useCanMessagePerson("versie-smith"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it("useListBlockedUsers exposes the backend principals unchanged", async () => {
    mockActor.listBlockedUsers = vi.fn(async () => [OTHER_ACCOUNT]);

    const { result } = renderHook(() => useListBlockedUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([OTHER_ACCOUNT]);
  });

  it("useListReports exposes the backend reports unchanged", async () => {
    const reports = [makeReport()];
    mockActor.listReports = vi.fn(async () => reports);

    const { result } = renderHook(() => useListReports(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(reports);
  });

  it("useSendMessage resolves the backend ok result unchanged", async () => {
    const message = makeMessage({ messageId: 99n, body: "Hi" });
    mockActor.sendMessage = vi.fn(async () => ({
      __kind__: "ok" as const,
      ok: message,
    }));

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    const sent = await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });
    expect(sent).toEqual({ __kind__: "ok", ok: message });
  });

  it("useSendMessage resolves the backend err result unchanged", async () => {
    mockActor.sendMessage = vi.fn(async () => ({
      __kind__: "err" as const,
      err: MessageError.BlockedByRecipient,
    }));

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    const sent = await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi",
    });
    expect(sent).toEqual({
      __kind__: "err",
      err: MessageError.BlockedByRecipient,
    });
  });

  it("useReviewReport resolves the backend report unchanged", async () => {
    const reviewed = makeReport({ status: ReportStatus.Reviewed });
    mockActor.reviewReport = vi.fn(async () => reviewed);

    const { result } = renderHook(() => useReviewReport(), { wrapper });

    const report = await result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });
    expect(report).toEqual(reviewed);
  });
});
