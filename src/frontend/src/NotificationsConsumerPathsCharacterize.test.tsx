import "@testing-library/jest-dom/vitest";
import {
  NotificationType,
  PostStatus,
  PostType,
  PrivacyScope,
} from "@/backend";
import type { Notification, Post } from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BoardPostPage } from "./pages/BoardPostPage";
import { ConversationPage } from "./pages/ConversationPage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Characterization baseline for the notification family-scoping change.
//
// The requested change forks the Notification hooks in
// src/frontend/src/hooks/useNotifications.ts on the active family seam so a
// NON-default family calls the `*ForFamily` APIs with family-appended query
// keys, while the DEFAULT family keeps the exact legacy no-arg calls and the
// bare ["notifications"] query key.
//
// The sibling files NotificationsDefaultFamilyCharacterize.test.tsx,
// NotificationsTypeRenderingCharacterize.test.tsx,
// NotificationsDefaultFamilyEmptyStateCharacterize.test.tsx, and
// NotificationsReconcileCharacterize.test.tsx freeze the default-family
// behavior of the notification HOOKS and the Notifications page / header badge.
//
// This file freezes the remaining default-family notification CONSUMER paths
// the change must preserve: the two pages that read the notification list and
// auto-mark the related notification(s) read when the user opens the related
// content, plus the /notifications route itself.
//
//   1. ConversationPage, on open, marks each unread #NewMessage notification
//      read through the legacy `markNotificationRead(id)` — one call per unread
//      NewMessage, and never for a read one or a different type;
//   2. BoardPostPage, on open, marks each unread #BoardReply / #BoardMention
//      notification read through the legacy `markNotificationRead(id)`;
//   3. the /notifications route renders the Notifications page (not a blank
//      screen) and reads through the legacy no-argument `listNotifications()`.
//
// It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Notification — the change adds one,
//     so asserting its absence would freeze the very thing being changed;
//   * the exact Notification record shape — the change adds a field, so only
//     the fields the UI reads are asserted, never the full record;
//   * the legacy methods as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the non-default-family behavior — it does not exist yet.
//
// The frontend suite mocks the actor, so none of the backend family-boundary
// behavior is visible here; that lives in the PocketIC lane. This is
// component/integration coverage over a typed local actor mock (see
// coverageLimits).
// ---------------------------------------------------------------------------

const RECIPIENT = Principal.fromText("2vxsx-fae");
const MY_PERSON_ID = "julia";
const OTHER_PERSON_ID = "versie-smith";

function makeNotification(
  id: bigint,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    recipient: RECIPIENT,
    notificationType: NotificationType.ProfileClaimReviewed,
    message: `Notification ${id.toString()}`,
    createdAt: 1_700_000_000_000_000_000n,
    read: false,
    // The accepted change adds `familyId` to the Notification record. This
    // baseline is the default-family (Norwood) consumer contract, so the
    // fixture carries the default family id.
    familyId: "norwood",
    ...overrides,
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    postId: 1n,
    authorAccountId: RECIPIENT,
    authorPersonId: OTHER_PERSON_ID,
    postType: PostType.General,
    title: "A board post",
    body: "The body of the board post.",
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    tags: [],
    linkedMediaIds: [],
    privacyScope: PrivacyScope.FamilyOnly,
    status: PostStatus.Active,
    relatedPersonIds: [],
    familyId: "norwood",
    ...overrides,
  };
}

const { mockActor, calls, resetCalls, setNotifications, setPost } = vi.hoisted(
  () => {
    const calls = {
      listNotifications: 0,
      markNotificationRead: [] as bigint[],
    };
    let notifications: unknown[] = [];
    let post: unknown = null;

    const mockActor = {
      async listNotifications(): Promise<unknown[]> {
        calls.listNotifications += 1;
        return notifications;
      },
      async markNotificationRead(id: bigint): Promise<unknown> {
        calls.markNotificationRead.push(id);
        return null;
      },
      async getMyProfile(): Promise<unknown> {
        return null;
      },
      async getPersonProfile(personId: string): Promise<unknown> {
        return {
          personId,
          name: personId === MY_PERSON_ID ? "Julia Norwood" : "Versie Smith",
          claimStatus: "Claimed",
          livingStatus: "Living",
          familyId: "norwood",
        };
      },
      async getProfilePhoto(): Promise<unknown> {
        return null;
      },
      async isCallerSteward(): Promise<boolean> {
        return false;
      },
      async hasActiveSteward(): Promise<boolean> {
        return true;
      },
      async listConversations(): Promise<unknown[]> {
        return [];
      },
      async getConversation(): Promise<unknown> {
        return null;
      },
      async listBlockedUsers(): Promise<unknown[]> {
        return [];
      },
      async markConversationRead(): Promise<unknown> {
        return null;
      },
      async getBoardPost(): Promise<unknown> {
        return post;
      },
      async listBoardReplies(): Promise<unknown[]> {
        return [];
      },
      async listApprovedArchiveItems(): Promise<unknown[]> {
        return [];
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        calls.listNotifications = 0;
        calls.markNotificationRead = [];
      },
      setNotifications: (next: unknown[]) => {
        notifications = next;
      },
      setPost: (next: unknown) => {
        post = next;
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
    identity: { getPrincipal: () => RECIPIENT },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(() => {
  resetCalls();
  setNotifications([]);
  setPost(null);
});

describe("ConversationPage notification auto-mark-read (default-family baseline)", () => {
  it("marks each unread NewMessage notification read through the legacy method", async () => {
    setNotifications([
      makeNotification(11n, {
        notificationType: NotificationType.NewMessage,
        read: false,
      }),
      makeNotification(12n, {
        notificationType: NotificationType.NewMessage,
        read: false,
      }),
    ]);

    render(
      <ConversationPage
        conversationId={1n}
        personId={OTHER_PERSON_ID}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
      { wrapper },
    );

    // The page reads the notification list through the legacy no-argument
    // endpoint, then marks each unread NewMessage read by id.
    await waitFor(() => expect(calls.markNotificationRead).toEqual([11n, 12n]));
  });

  it("does not mark a read NewMessage or a different notification type read", async () => {
    setNotifications([
      makeNotification(21n, {
        notificationType: NotificationType.NewMessage,
        read: true,
      }),
      makeNotification(22n, {
        notificationType: NotificationType.BoardReply,
        read: false,
      }),
    ]);

    render(
      <ConversationPage
        conversationId={1n}
        personId={OTHER_PERSON_ID}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
      { wrapper },
    );

    // Give the effect a chance to run, then assert nothing was marked read.
    await waitFor(() => expect(calls.listNotifications).toBeGreaterThan(0));
    expect(calls.markNotificationRead).toEqual([]);
  });
});

describe("BoardPostPage notification auto-mark-read (default-family baseline)", () => {
  it("marks each unread BoardReply / BoardMention notification read through the legacy method", async () => {
    setPost(makePost({ postId: 1n }));
    setNotifications([
      makeNotification(31n, {
        notificationType: NotificationType.BoardReply,
        read: false,
      }),
      makeNotification(32n, {
        notificationType: NotificationType.BoardMention,
        read: false,
      }),
    ]);

    render(
      <BoardPostPage
        postId={1n}
        onBack={() => {}}
        onOpenProfile={() => {}}
        onEdit={() => {}}
      />,
      { wrapper },
    );

    await waitFor(() => expect(calls.markNotificationRead).toEqual([31n, 32n]));
  });

  it("does not mark a read BoardReply or an unrelated notification type read", async () => {
    setPost(makePost({ postId: 1n }));
    setNotifications([
      makeNotification(41n, {
        notificationType: NotificationType.BoardReply,
        read: true,
      }),
      makeNotification(42n, {
        notificationType: NotificationType.NewMessage,
        read: false,
      }),
    ]);

    render(
      <BoardPostPage
        postId={1n}
        onBack={() => {}}
        onOpenProfile={() => {}}
        onEdit={() => {}}
      />,
      { wrapper },
    );

    await waitFor(() => expect(calls.listNotifications).toBeGreaterThan(0));
    expect(calls.markNotificationRead).toEqual([]);
  });
});

describe("Notifications route (default-family baseline)", () => {
  it("renders the Notifications page from the /notifications route without a blank screen", async () => {
    setNotifications([
      makeNotification(51n, {
        message: "Your profile claim was approved.",
        read: false,
      }),
    ]);

    render(<App />, { wrapper });

    // Navigate to the notifications view through the header bell control.
    const bell = await screen.findByRole("button", {
      name: /notifications/i,
    });
    bell.click();

    expect(
      await screen.findByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Your profile claim was approved."),
    ).toBeInTheDocument();
    // The route reads through the legacy no-argument listNotifications().
    expect(calls.listNotifications).toBeGreaterThan(0);
  });
});
