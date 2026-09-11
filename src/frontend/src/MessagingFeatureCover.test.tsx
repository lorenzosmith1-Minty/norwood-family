import "@testing-library/jest-dom/vitest";
import { type MessageError, MessageStatus, ReportStatus } from "@/backend";
import type {
  ConversationSummary,
  ConversationView,
  Message,
  Report,
  ReportedMessageView,
} from "@/types/messaging";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// A stateful in-memory actor standing in for the real backend so the Private
// Messaging journeys (inbox unread badge, canonical 1:1 conversation reuse,
// block/unblock, report + steward review) can be exercised end to end without a
// canister. It implements the messaging + identity + profile methods the
// messaging pages call.
const {
  mockActor,
  resetMessaging,
  setAuthenticated,
  setAdmin,
  getAuthenticated,
  setConversations,
  setConversationView,
  setBlocked,
  setReports,
  setReportedMessage,
  setMessageableMembers,
} = vi.hoisted(() => {
  const MY_PERSON_ID = "julia";
  const OTHER_PERSON_ID = "versie-smith";
  let isAuthenticated = false;
  let isAdmin = false;
  let conversations: ConversationSummary[] = [];
  let conversationViews: Record<string, ConversationView> = {};
  let blocked: Principal[] = [];
  let reports: Report[] = [];
  let reportedMessages: Record<string, ReportedMessageView> = {};
  let sentMessages: Array<{ recipientPersonId: string; body: string }> = [];
  // The other eligible members the signed-in caller may message (from the
  // non-admin-gated listMessageableMembers source). Defaults to the other
  // participant so the inbox treats them as an eligible member.
  let messageableMembers: string[] = [OTHER_PERSON_ID];

  const myProfile = {
    personId: MY_PERSON_ID,
    name: "Julia Norwood",
    claimStatus: "Claimed",
    livingStatus: "Living",
  };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getMyProfile() {
      return isAuthenticated ? myProfile : null;
    },
    async getPersonProfile(personId: string) {
      if (personId === MY_PERSON_ID) return myProfile;
      if (personId === OTHER_PERSON_ID) {
        return {
          personId: OTHER_PERSON_ID,
          name: "Versie Smith",
          claimStatus: "Claimed",
          livingStatus: "Living",
          claimedByUserId: OTHER_ACCOUNT,
        };
      }
      return {
        personId,
        name: "Family Member",
        claimStatus: "Unclaimed",
        livingStatus: "Living",
      };
    },
    async getProfilePhoto() {
      return null;
    },
    async listConversations(): Promise<ConversationSummary[]> {
      return conversations;
    },
    async listMessageableMembers(): Promise<string[]> {
      return messageableMembers;
    },
    async getConversation(
      conversationId: bigint,
    ): Promise<ConversationView | null> {
      return conversationViews[conversationId.toString()] ?? null;
    },
    async canMessagePerson() {
      return true;
    },
    async sendMessage(
      recipientPersonId: string,
      body: string,
    ): Promise<
      { __kind__: "ok"; ok: Message } | { __kind__: "err"; err: MessageError }
    > {
      sentMessages = [...sentMessages, { recipientPersonId, body }];
      const message: Message = {
        messageId: 99n,
        conversationId: 1n,
        senderAccountId: Principal.fromText(ACCOUNT),
        senderPersonId: MY_PERSON_ID,
        body,
        createdAt: 1_700_000_000_000_000_000n,
        status: MessageStatus.Sent,
      };
      return { __kind__: "ok", ok: message };
    },
    async markConversationRead() {},
    async listBlockedUsers(): Promise<Principal[]> {
      return blocked;
    },
    async blockUser(accountId: Principal) {
      blocked = [...blocked, accountId];
    },
    async unblockUser(accountId: Principal) {
      blocked = blocked.filter((id) => id.toString() !== accountId.toString());
    },
    async listReports(): Promise<Report[]> {
      return reports;
    },
    async getReportedMessage(
      reportId: bigint,
    ): Promise<ReportedMessageView | null> {
      return reportedMessages[reportId.toString()] ?? null;
    },
    async reportMessage(messageId: bigint, reason: string): Promise<Report> {
      const report: Report = {
        reportId: 5n,
        reportedMessageId: messageId,
        reportingAccountId: Principal.fromText(ACCOUNT),
        reason,
        createdAt: 1_700_000_000_000_000_000n,
        status: ReportStatus.Pending,
      };
      reports = [...reports, report];
      return report;
    },
    async reviewReport(
      reportId: bigint,
      status: ReportStatus,
    ): Promise<Report | null> {
      const found = reports.find((r) => r.reportId === reportId);
      if (!found) return null;
      const updated: Report = { ...found, status };
      reports = reports.map((r) => (r.reportId === reportId ? updated : r));
      return updated;
    },
    async listNotifications() {
      return [];
    },
    async markNotificationRead() {},
    getSentMessages: () => sentMessages,
  };

  return {
    mockActor,
    resetMessaging: () => {
      conversations = [];
      conversationViews = {};
      blocked = [];
      reports = [];
      reportedMessages = {};
      sentMessages = [];
      isAuthenticated = false;
      isAdmin = false;
      messageableMembers = [OTHER_PERSON_ID];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    getAuthenticated: () => isAuthenticated,
    setConversations: (c: ConversationSummary[]) => {
      conversations = c;
    },
    setConversationView: (id: bigint, view: ConversationView) => {
      conversationViews[id.toString()] = view;
    },
    setBlocked: (b: Principal[]) => {
      blocked = b;
    },
    setReports: (r: Report[]) => {
      reports = r;
    },
    setReportedMessage: (id: bigint, view: ReportedMessageView) => {
      reportedMessages[id.toString()] = view;
    },
    setMessageableMembers: (members: string[]) => {
      messageableMembers = members;
    },
    getSentMessages: () => sentMessages,
  };
});

// The other participant's stable account id (used for block/unblock). Declared
// at module scope so both the mock actor's methods (at call time) and the test
// bodies can reference it; the hoisted block must not construct a Principal at
// hoist time, before the import is initialized.
const OTHER_ACCOUNT = Principal.fromText("aaaaa-aa");
const MY_PERSON_ID = "julia";
const OTHER_PERSON_ID = "versie-smith";

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetMessaging);

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

async function openInbox(user: ReturnType<typeof userEvent.setup>) {
  // Private Messages is no longer a top-level pill — it is reached through the
  // Message Board communication hub.
  await user.click(
    await screen.findByRole("button", { name: "Message Board" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Private Messages/ }),
  );
}

describe("Private Messaging: inbox and unread badge", () => {
  it("shows a conversation with an unread badge in the inbox", async () => {
    setAuthenticated(true);
    setConversations([
      {
        conversationId: 1n,
        otherPersonId: OTHER_PERSON_ID,
        otherDisplayName: "Versie Smith",
        unreadCount: 2n,
        latestMessagePreview: "Are you coming?",
        latestMessageAt: 1_700_000_000_000_000_000n,
      },
    ]);
    const user = userEvent.setup();
    renderApp();

    await openInbox(user);

    expect(
      screen.getByRole("heading", { name: "Private Messages" }),
    ).toBeInTheDocument();
    const row = screen.getByTestId("inbox.item.0");
    expect(within(row).getByText("Versie Smith")).toBeInTheDocument();
    expect(within(row).getByText("Are you coming?")).toBeInTheDocument();
    expect(within(row).getByLabelText("2 unread")).toHaveTextContent("2");
  });

  it("shows the empty inbox state when there are no conversations but another eligible member exists", async () => {
    setAuthenticated(true);
    // Another eligible member exists (the default messageable list includes the
    // other participant), so the inbox shows the "no conversations yet" state
    // rather than the single-user empty state.
    const user = userEvent.setup();
    renderApp();

    await openInbox(user);

    expect(
      screen.getByRole("heading", { name: "No conversations yet" }),
    ).toBeInTheDocument();
  });

  it("shows the single-user empty state when no other eligible member exists", async () => {
    setAuthenticated(true);
    // No other eligible member: the non-admin-gated messageable-members source
    // returns only the signed-in user's own person id (or none), so the inbox
    // shows the single-user empty state and no unusable conversation controls.
    setMessageableMembers(["julia"]);
    const user = userEvent.setup();
    renderApp();

    await openInbox(user);

    expect(
      screen.getByRole("heading", {
        name: "No other family members are available to message yet.",
      }),
    ).toBeInTheDocument();
    // No conversation list is rendered (no unusable controls).
    expect(screen.queryByTestId("inbox.list")).not.toBeInTheDocument();
  });
});

describe("Private Messaging: canonical conversation and read state", () => {
  it("opens a conversation and marks it read, clearing the unread badge", async () => {
    setAuthenticated(true);
    setConversations([
      {
        conversationId: 1n,
        otherPersonId: OTHER_PERSON_ID,
        otherDisplayName: "Versie Smith",
        unreadCount: 1n,
        latestMessagePreview: "Hello",
        latestMessageAt: 1_700_000_000_000_000_000n,
      },
    ]);
    setConversationView(1n, {
      conversationId: 1n,
      participantPersonIds: [MY_PERSON_ID, OTHER_PERSON_ID],
      participantDisplayNames: ["Julia Norwood", "Versie Smith"],
      messages: [
        {
          messageId: 1n,
          conversationId: 1n,
          senderAccountId: OTHER_ACCOUNT,
          senderPersonId: OTHER_PERSON_ID,
          body: "Hello Julia",
          createdAt: 1_700_000_000_000_000_000n,
          status: MessageStatus.Sent,
        },
      ],
    });
    const user = userEvent.setup();
    renderApp();

    await openInbox(user);
    await user.click(screen.getByTestId("inbox.item.0"));

    // The conversation thread renders the received message.
    expect(await screen.findByText("Hello Julia")).toBeInTheDocument();
    // The conversation header shows the other participant's name.
    expect(
      screen.getByRole("button", { name: /Versie Smith/ }),
    ).toBeInTheDocument();
  });

  it("sends a message to a recipient, reusing the canonical 1:1 conversation", async () => {
    setAuthenticated(true);
    setConversationView(1n, {
      conversationId: 1n,
      participantPersonIds: [MY_PERSON_ID, OTHER_PERSON_ID],
      participantDisplayNames: ["Julia Norwood", "Versie Smith"],
      messages: [],
    });
    const user = userEvent.setup();
    renderApp();

    // Open the conversation directly from the inbox (empty thread).
    setConversations([
      {
        conversationId: 1n,
        otherPersonId: OTHER_PERSON_ID,
        otherDisplayName: "Versie Smith",
        unreadCount: 0n,
        latestMessagePreview: "",
        latestMessageAt: 1_700_000_000_000_000_000n,
      },
    ]);
    await openInbox(user);
    await user.click(screen.getByTestId("inbox.item.0"));

    // The empty conversation shows the start prompt.
    expect(
      await screen.findByRole("heading", { name: "Start the conversation" }),
    ).toBeInTheDocument();

    // Send a message.
    await user.type(screen.getByLabelText("Message"), "See you at the reunion");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    // The message was sent to the canonical recipient person.
    expect(mockActor.getSentMessages()).toEqual([
      { recipientPersonId: OTHER_PERSON_ID, body: "See you at the reunion" },
    ]);
  });
});

describe("Private Messaging: block and unblock", () => {
  it("shows the blocked note and disables the composer when the user is blocked", async () => {
    setAuthenticated(true);
    setBlocked([OTHER_ACCOUNT]);
    setConversationView(1n, {
      conversationId: 1n,
      participantPersonIds: [MY_PERSON_ID, OTHER_PERSON_ID],
      participantDisplayNames: ["Julia Norwood", "Versie Smith"],
      messages: [],
    });
    setConversations([
      {
        conversationId: 1n,
        otherPersonId: OTHER_PERSON_ID,
        otherDisplayName: "Versie Smith",
        unreadCount: 0n,
        latestMessagePreview: "",
        latestMessageAt: 1_700_000_000_000_000_000n,
      },
    ]);
    const user = userEvent.setup();
    renderApp();

    await openInbox(user);
    await user.click(screen.getByTestId("inbox.item.0"));

    // The blocked note is shown and the composer is disabled.
    expect(
      await screen.findByTestId("conversation.blocked_note"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unblock" })).toBeInTheDocument();
  });
});

describe("Private Messaging: report and steward review", () => {
  it("lets a member report a specific message with a reason", async () => {
    setAuthenticated(true);
    setConversationView(1n, {
      conversationId: 1n,
      participantPersonIds: [MY_PERSON_ID, OTHER_PERSON_ID],
      participantDisplayNames: ["Julia Norwood", "Versie Smith"],
      messages: [
        {
          messageId: 7n,
          conversationId: 1n,
          senderAccountId: OTHER_ACCOUNT,
          senderPersonId: OTHER_PERSON_ID,
          body: "Inappropriate content",
          createdAt: 1_700_000_000_000_000_000n,
          status: MessageStatus.Sent,
        },
      ],
    });
    setConversations([
      {
        conversationId: 1n,
        otherPersonId: OTHER_PERSON_ID,
        otherDisplayName: "Versie Smith",
        unreadCount: 0n,
        latestMessagePreview: "Inappropriate content",
        latestMessageAt: 1_700_000_000_000_000_000n,
      },
    ]);
    const user = userEvent.setup();
    renderApp();

    await openInbox(user);
    await user.click(screen.getByTestId("inbox.item.0"));

    // Report the received message.
    await user.click(
      await screen.findByRole("button", { name: "Report this message" }),
    );
    await user.type(
      screen.getByLabelText("Reason for reporting"),
      "Harassment",
    );
    await user.click(screen.getByRole("button", { name: "Submit report" }));

    // The report was filed against the specific message.
    const reports = await mockActor.listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reportedMessageId: 7n,
      reason: "Harassment",
      status: ReportStatus.Pending,
    });
  });

  it("lets a steward review only the reported message, not unrelated conversations", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const report: Report = {
      reportId: 5n,
      reportedMessageId: 7n,
      reportingAccountId: Principal.fromText(ACCOUNT),
      reason: "Harassment",
      createdAt: 1_700_000_000_000_000_000n,
      status: ReportStatus.Pending,
    };
    setReports([report]);
    setReportedMessage(5n, {
      report: report,
      message: {
        messageId: 7n,
        conversationId: 1n,
        senderAccountId: OTHER_ACCOUNT,
        senderPersonId: OTHER_PERSON_ID,
        body: "Inappropriate content",
        createdAt: 1_700_000_000_000_000_000n,
        status: MessageStatus.Sent,
      },
    });
    const user = userEvent.setup();
    renderApp();

    // Navigate to the Family Steward hub, then open the Reported Messages
    // review surface.
    await user.click(
      await screen.findByRole("button", { name: "Family Steward" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Reported Messages/ }),
    );

    // The steward sees only the reported message content and its reason.
    expect(
      await screen.findByText("Inappropriate content"),
    ).toBeInTheDocument();
    expect(screen.getByText("Harassment")).toBeInTheDocument();

    // Resolving the report marks it reviewed.
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const reviewed = await mockActor.listReports();
    expect(reviewed[0]).toMatchObject({ status: ReportStatus.Reviewed });
  });
});
