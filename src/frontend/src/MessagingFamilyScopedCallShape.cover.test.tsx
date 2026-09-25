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
// Cover for the Tenancy 1C-C3 frontend half of the family-scoped Private
// Messaging change: when a NON-default family is active, every Messaging hook
// must route to the canonical `*ForFamily` endpoint with the explicit familyId
// as the first positional argument, and the familyId must be part of the React
// Query key so caches never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes, query keys, and cache
// invalidation are frozen separately by
// MessagingDefaultFamilyProviderCharacterize.test.tsx; this file only asserts
// the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Messaging frontend path hard-codes the default family
// id: the non-default-family calls must never receive the literal default
// family id as their familyId argument.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const OTHER_ACCOUNT = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
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
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
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

/** Every legacy no-familyId messaging endpoint must stay untouched. */
function expectNoLegacyMessagingCalls() {
  expect(calls.listConversations).toEqual([]);
  expect(calls.getConversation).toEqual([]);
  expect(calls.listMessageableMembers).toEqual([]);
  expect(calls.canMessagePerson).toEqual([]);
  expect(calls.sendMessage).toEqual([]);
  expect(calls.markConversationRead).toEqual([]);
  expect(calls.blockUser).toEqual([]);
  expect(calls.unblockUser).toEqual([]);
  expect(calls.listBlockedUsers).toEqual([]);
  expect(calls.reportMessage).toEqual([]);
  expect(calls.listReports).toEqual([]);
  expect(calls.getReportedMessage).toEqual([]);
  expect(calls.reviewReport).toEqual([]);
}

describe("Messaging read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useListConversations calls listConversationsForFamily(familyId)", async () => {
    const { result } = renderHook(() => useListConversations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listConversationsForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMessagingCalls();
  });

  it("useGetConversation calls getConversationForFamily(familyId, conversationId)", async () => {
    const view: ConversationView = {
      conversationId: 7n,
      participantPersonIds: ["julia", "versie-smith"],
      participantDisplayNames: ["Julia Norwood", "Versie Smith"],
      messages: [],
    };
    mockActor.getConversationForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getConversationForFamily.push(args);
      return view;
    });

    const { result } = renderHook(() => useGetConversation(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getConversationForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(result.current.data).toBe(view);
    expectNoLegacyMessagingCalls();
  });

  it("useListMessageableMembers calls listMessageableMembersForFamily(familyId)", async () => {
    const { result } = renderHook(() => useListMessageableMembers(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listMessageableMembersForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMessagingCalls();
  });

  it("useCanMessagePerson calls canMessagePersonForFamily(familyId, personId)", async () => {
    const { result } = renderHook(() => useCanMessagePerson("versie-smith"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.canMessagePersonForFamily).toEqual([
      [FAMILY_A, "versie-smith"],
    ]);
    expectNoLegacyMessagingCalls();
  });

  it("useListBlockedUsers calls listBlockedUsersForFamily(familyId)", async () => {
    const { result } = renderHook(() => useListBlockedUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBlockedUsersForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMessagingCalls();
  });

  it("useListReports calls listReportsForFamily(familyId)", async () => {
    const { result } = renderHook(() => useListReports(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listReportsForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyMessagingCalls();
  });

  it("useGetReportedMessage calls getReportedMessageForFamily(familyId, reportId)", async () => {
    const view: ReportedMessageView = {
      report: makeReport(),
      message: makeMessage({ messageId: 7n }),
    };
    mockActor.getReportedMessageForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.getReportedMessageForFamily.push(args);
        return view;
      },
    );

    const { result } = renderHook(() => useGetReportedMessage(5n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReportedMessageForFamily).toEqual([[FAMILY_A, 5n]]);
    expect(result.current.data).toBe(view);
    expectNoLegacyMessagingCalls();
  });
});

describe("Messaging mutation hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useSendMessage calls sendMessageForFamily(familyId, recipientPersonId, body)", async () => {
    const { result } = renderHook(() => useSendMessage(), { wrapper });

    await result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "See you at the reunion",
    });

    expect(calls.sendMessageForFamily).toEqual([
      [FAMILY_A, "versie-smith", "See you at the reunion"],
    ]);
    expectNoLegacyMessagingCalls();
  });

  it("useMarkConversationRead calls markConversationReadForFamily(familyId, conversationId)", async () => {
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper });

    await result.current.mutateAsync(3n);

    expect(calls.markConversationReadForFamily).toEqual([[FAMILY_A, 3n]]);
    expectNoLegacyMessagingCalls();
  });

  it("useBlockUser calls blockUserForFamily(familyId, accountId)", async () => {
    const { result } = renderHook(() => useBlockUser(), { wrapper });

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(calls.blockUserForFamily).toEqual([[FAMILY_A, OTHER_ACCOUNT]]);
    expectNoLegacyMessagingCalls();
  });

  it("useUnblockUser calls unblockUserForFamily(familyId, accountId)", async () => {
    const { result } = renderHook(() => useUnblockUser(), { wrapper });

    await result.current.mutateAsync(OTHER_ACCOUNT);

    expect(calls.unblockUserForFamily).toEqual([[FAMILY_A, OTHER_ACCOUNT]]);
    expectNoLegacyMessagingCalls();
  });

  it("useReportMessage calls reportMessageForFamily(familyId, messageId, reason)", async () => {
    const { result } = renderHook(() => useReportMessage(), { wrapper });

    await result.current.mutateAsync({ messageId: 7n, reason: "Harassment" });

    expect(calls.reportMessageForFamily).toEqual([
      [FAMILY_A, 7n, "Harassment"],
    ]);
    expectNoLegacyMessagingCalls();
  });

  it("useReviewReport calls reviewReportForFamily(familyId, reportId, status)", async () => {
    const { result } = renderHook(() => useReviewReport(), { wrapper });

    await result.current.mutateAsync({
      reportId: 5n,
      status: ReportStatus.Reviewed,
    });

    expect(calls.reviewReportForFamily).toEqual([
      [FAMILY_A, 5n, ReportStatus.Reviewed],
    ]);
    expectNoLegacyMessagingCalls();
  });
});

describe("Messaging hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily call receives the active familyId, never the default literal", async () => {
    const list = renderHook(() => useListConversations(), { wrapper });
    const detail = renderHook(() => useGetConversation(1n), { wrapper });
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

    const send = renderHook(() => useSendMessage(), { wrapper });
    await send.result.current.mutateAsync({
      recipientPersonId: "versie-smith",
      body: "Hi.",
    });

    const markRead = renderHook(() => useMarkConversationRead(), { wrapper });
    await markRead.result.current.mutateAsync(1n);

    const block = renderHook(() => useBlockUser(), { wrapper });
    await block.result.current.mutateAsync(OTHER_ACCOUNT);

    const unblock = renderHook(() => useUnblockUser(), { wrapper });
    await unblock.result.current.mutateAsync(OTHER_ACCOUNT);

    const report = renderHook(() => useReportMessage(), { wrapper });
    await report.result.current.mutateAsync({ messageId: 1n, reason: "Spam" });

    const review = renderHook(() => useReviewReport(), { wrapper });
    await review.result.current.mutateAsync({
      reportId: 1n,
      status: ReportStatus.Reviewed,
    });

    const familyIdArgs: unknown[] = [
      calls.listConversationsForFamily[0]?.[0],
      calls.getConversationForFamily[0]?.[0],
      calls.listMessageableMembersForFamily[0]?.[0],
      calls.canMessagePersonForFamily[0]?.[0],
      calls.listBlockedUsersForFamily[0]?.[0],
      calls.listReportsForFamily[0]?.[0],
      calls.getReportedMessageForFamily[0]?.[0],
      calls.sendMessageForFamily[0]?.[0],
      calls.markConversationReadForFamily[0]?.[0],
      calls.blockUserForFamily[0]?.[0],
      calls.unblockUserForFamily[0]?.[0],
      calls.reportMessageForFamily[0]?.[0],
      calls.reviewReportForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyMessagingCalls();
  });
});

describe("Messaging query keys are family-separated (cover)", () => {
  // The family-scoping change appends the active familyId to every Messaging
  // query key for a NON-default family, so Family A and Family B never share
  // cached conversations, message lists, or individual conversation data. This
  // renders the same hooks under two different non-default families and asserts
  // the registered keys differ by family.
  function renderWithFamily<T>(familyId: string, hook: () => T) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const rendered = renderHook(
      () => ({ value: hook(), client: queryClient }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
          </QueryClientProvider>
        ),
      },
    );
    const keys = () =>
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey);
    return { ...rendered, keys };
  }

  it("useListConversations registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () => useListConversations());
    const b = renderWithFamily(FAMILY_B, () => useListConversations());

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual(["messaging", "conversations", FAMILY_A]);
    expect(b.keys()).toContainEqual(["messaging", "conversations", FAMILY_B]);
    // The two families do not share a conversation-list cache entry.
    expect(a.keys()).not.toContainEqual([
      "messaging",
      "conversations",
      FAMILY_B,
    ]);
    expect(b.keys()).not.toContainEqual([
      "messaging",
      "conversations",
      FAMILY_A,
    ]);
  });

  it("useGetConversation registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () => useGetConversation(7n));
    const b = renderWithFamily(FAMILY_B, () => useGetConversation(7n));

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual([
      "messaging",
      "conversation",
      "7",
      FAMILY_A,
    ]);
    expect(b.keys()).toContainEqual([
      "messaging",
      "conversation",
      "7",
      FAMILY_B,
    ]);
    // The same conversationId under two families is two distinct cache entries.
    expect(a.keys()).not.toContainEqual([
      "messaging",
      "conversation",
      "7",
      FAMILY_B,
    ]);
  });

  it("useListMessageableMembers registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () => useListMessageableMembers());
    const b = renderWithFamily(FAMILY_B, () => useListMessageableMembers());

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual([
      "messaging",
      "messageableMembers",
      FAMILY_A,
    ]);
    expect(b.keys()).toContainEqual([
      "messaging",
      "messageableMembers",
      FAMILY_B,
    ]);
  });

  it("useCanMessagePerson registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () =>
      useCanMessagePerson("versie-smith"),
    );
    const b = renderWithFamily(FAMILY_B, () =>
      useCanMessagePerson("versie-smith"),
    );

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual([
      "messaging",
      "canMessage",
      "versie-smith",
      FAMILY_A,
    ]);
    expect(b.keys()).toContainEqual([
      "messaging",
      "canMessage",
      "versie-smith",
      FAMILY_B,
    ]);
  });

  it("useListBlockedUsers registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () => useListBlockedUsers());
    const b = renderWithFamily(FAMILY_B, () => useListBlockedUsers());

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual(["messaging", "blocked", FAMILY_A]);
    expect(b.keys()).toContainEqual(["messaging", "blocked", FAMILY_B]);
  });

  it("useListReports registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () => useListReports());
    const b = renderWithFamily(FAMILY_B, () => useListReports());

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual(["messaging", "reports", FAMILY_A]);
    expect(b.keys()).toContainEqual(["messaging", "reports", FAMILY_B]);
  });

  it("useGetReportedMessage registers a family-scoped key per family", async () => {
    const a = renderWithFamily(FAMILY_A, () => useGetReportedMessage(5n));
    const b = renderWithFamily(FAMILY_B, () => useGetReportedMessage(5n));

    await waitFor(() => expect(a.result.current.value.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.value.isSuccess).toBe(true));

    expect(a.keys()).toContainEqual(["messaging", "reports", "5", FAMILY_A]);
    expect(b.keys()).toContainEqual(["messaging", "reports", "5", FAMILY_B]);
  });
});
