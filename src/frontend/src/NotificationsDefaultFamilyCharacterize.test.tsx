import "@testing-library/jest-dom/vitest";
import { NotificationType } from "@/backend";
import type { Notification } from "@/backend";
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
import { NotificationBadge } from "./components/NotificationBadge";
import {
  useListNotifications,
  useMarkNotificationRead,
  useUnreadNotificationCount,
} from "./hooks/useNotifications";
import { NotificationsPage } from "./pages/NotificationsPage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Characterization baseline for the notification family-scoping change.
//
// The requested change gives the backend Notification record a `familyId`
// field, adds canonical family-scoped notification methods
// (listNotificationsForFamily, unreadNotificationCountForFamily, a
// family-scoped markNotificationRead), and keeps the existing no-familyId
// notification APIs as thin TEMPORARY wrappers delegating to the canonical
// methods with DEFAULT_FAMILY_ID ("norwood").
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy notification APIs as the app's frontend consumes them today, which the
// change must preserve through those wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Notification — the change adds one,
//     so asserting its absence would freeze the very thing being changed;
//   * the exact Notification record shape — the change adds a field, so only
//     the fields the UI reads are asserted, never the full record;
//   * the legacy methods as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor;
//   * the exact backend method names the hooks call beyond the legacy
//     no-argument `listNotifications()` / `markNotificationRead(id)` contract
//     the wrappers must keep serving.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. useListNotifications calls the legacy `listNotifications()` with NO
//      arguments and surfaces the returned records;
//   2. useUnreadNotificationCount reads the backend unread count through
//      `unreadNotificationCountForFamily(activeFamilyId)` — there is no legacy
//      unread-count endpoint, so the default family passes its id explicitly —
//      and is 0 for an empty list;
//   3. useMarkNotificationRead calls the legacy `markNotificationRead(id)` with
//      the target id and invalidates the ["notifications"] query key;
//   4. the Notifications page renders the caller's notifications with their
//      message and type label, shows the unread count, and marks one read
//      through the legacy method;
//   5. the header NotificationBadge renders the unread count and hides at zero.
//
// The unread-count contract intentionally changed: the hook no longer derives
// the count from the legacy list (which could not be family-scoped), it reads
// the canonical family-scoped count. The default-family id it passes is the
// active family id, not a hard-coded literal.
//
// The frontend suite mocks the actor, so none of the backend family-boundary
// behavior is visible here; that lives in the PocketIC lane. This is
// component/integration coverage over a typed local actor mock (see
// coverageLimits).
// ---------------------------------------------------------------------------

const RECIPIENT = Principal.fromText("2vxsx-fae");

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
    // fixture carries the default family id; the change must not alter the
    // observable behavior asserted here.
    familyId: "norwood",
    ...overrides,
  };
}

const { mockActor, calls, resetCalls, setNotifications, setUnreadCount } =
  vi.hoisted(() => {
    const calls = {
      listNotifications: 0,
      markNotificationRead: [] as bigint[],
      unreadNotificationCountForFamily: [] as string[],
    };
    let notifications: unknown[] = [];
    let unreadCount = 0n;

    const mockActor = {
      async listNotifications(): Promise<unknown[]> {
        calls.listNotifications += 1;
        return notifications;
      },
      async markNotificationRead(id: bigint): Promise<unknown> {
        calls.markNotificationRead.push(id);
        return null;
      },
      // The canonical family-scoped unread count. The default family passes its
      // active family id explicitly because there is no legacy count endpoint.
      async unreadNotificationCountForFamily(
        familyId: string,
      ): Promise<bigint> {
        calls.unreadNotificationCountForFamily.push(familyId);
        return unreadCount;
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        calls.listNotifications = 0;
        calls.markNotificationRead = [];
        calls.unreadNotificationCountForFamily = [];
      },
      setNotifications: (next: unknown[]) => {
        notifications = next;
      },
      setUnreadCount: (next: bigint) => {
        unreadCount = next;
      },
    };
  });

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(() => {
  resetCalls();
  setNotifications([]);
  setUnreadCount(0n);
});

describe("Notification legacy API consumer contract (default-family baseline)", () => {
  it("useListNotifications calls the legacy listNotifications() with no arguments", async () => {
    setNotifications([makeNotification(1n), makeNotification(2n)]);

    const { result } = renderHook(() => useListNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    // The hook calls the public method with no arguments — the default-family
    // call the legacy wrapper must keep serving.
    expect(calls.listNotifications).toBe(1);
  });

  it("useUnreadNotificationCount reads the family-scoped backend count for the default family", async () => {
    // The count comes from the canonical family-scoped endpoint, not from the
    // legacy list. The default family passes its active family id explicitly.
    setUnreadCount(2n);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBe(2));
    expect(calls.unreadNotificationCountForFamily).toEqual(["norwood"]);
  });

  it("useUnreadNotificationCount is 0 when the backend count is 0", async () => {
    setUnreadCount(0n);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() =>
      expect(calls.unreadNotificationCountForFamily).toEqual(["norwood"]),
    );
    expect(result.current).toBe(0);
  });

  it("useMarkNotificationRead calls the legacy markNotificationRead(id) and invalidates the notifications key", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    await result.current.mutateAsync(7n);

    expect(calls.markNotificationRead).toEqual([7n]);
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["notifications"]);

    invalidateSpy.mockRestore();
  });
});

describe("Notifications page default-family journey", () => {
  it("renders the caller's notifications with message, type label, and unread count", async () => {
    setNotifications([
      makeNotification(1n, {
        message: "Your profile claim was approved.",
        notificationType: NotificationType.ProfileClaimReviewed,
        read: false,
      }),
      makeNotification(2n, {
        message: "Your research submission is awaiting review.",
        notificationType: NotificationType.ResearchSubmission,
        read: true,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    expect(
      await screen.findByText("Your profile claim was approved."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your research submission is awaiting review."),
    ).toBeInTheDocument();
    // The type labels come from the shared NOTIFICATION_TYPE_LABELS map.
    expect(screen.getByText("Profile claim reviewed")).toBeInTheDocument();
    expect(screen.getByText("Research submitted")).toBeInTheDocument();
    // One unread of two.
    expect(screen.getByText("1 unread")).toBeInTheDocument();
  });

  it("shows the caught-up state when every notification is read", async () => {
    setNotifications([makeNotification(1n, { read: true })]);

    render(<NotificationsPage />, { wrapper });

    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it("shows the empty state when the caller has no notifications", async () => {
    setNotifications([]);

    render(<NotificationsPage />, { wrapper });

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });

  it("marks an unread notification read through the legacy method", async () => {
    const user = userEvent.setup();
    setNotifications([
      makeNotification(42n, {
        message: "Your profile claim was approved.",
        read: false,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    const markRead = await screen.findByRole("button", {
      name: "Mark as read",
    });
    await user.click(markRead);

    await waitFor(() => expect(calls.markNotificationRead).toEqual([42n]));
  });
});

describe("NotificationBadge default-family behavior", () => {
  it("renders the unread count from the family-scoped backend count", async () => {
    setUnreadCount(2n);

    render(<NotificationBadge />, { wrapper });

    const badge = await screen.findByTestId("notification_badge");
    expect(badge).toHaveTextContent("2");
    expect(badge).toHaveAttribute("aria-label", "2 unread notifications");
    expect(calls.unreadNotificationCountForFamily).toEqual(["norwood"]);
  });

  it("renders nothing when there are no unread notifications", async () => {
    setUnreadCount(0n);

    render(<NotificationBadge />, { wrapper });

    await waitFor(() =>
      expect(calls.unreadNotificationCountForFamily).toEqual(["norwood"]),
    );
    expect(screen.queryByTestId("notification_badge")).not.toBeInTheDocument();
  });
});
