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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBadge } from "./components/NotificationBadge";
import {
  useListNotifications,
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
// The sibling files NotificationsDefaultFamilyCharacterize.test.tsx,
// NotificationsReconcileCharacterize.test.tsx, and
// NotificationsTypeRenderingCharacterize.test.tsx freeze the populated
// default-family list / unread-count / mark-read / page / badge / reconcile /
// type-rendering behavior. This file freezes the remaining default-family
// seam they do not cover: the NOT-READY / EMPTY path.
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
//   * the exact backend method names beyond the legacy no-argument
//     `listNotifications()` contract the wrappers must keep serving.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. useUnreadNotificationCount is 0 and makes NO backend call while the
//      actor is not ready — the header badge must not flash or error before
//      sign-in resolves;
//   2. NotificationBadge renders nothing while the actor is not ready;
//   3. the Notifications page renders its empty state (not an error) while the
//      actor is not ready;
//   4. once the actor is ready, the same hooks resume reading: the list through
//      the legacy no-argument `listNotifications()`, and the unread count
//      through the canonical `unreadNotificationCountForFamily(activeFamilyId)`
//      (there is no legacy count endpoint, so the default family passes its id
//      explicitly).
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
    // fixture carries the default family id.
    familyId: "norwood",
    ...overrides,
  };
}

const mockState = vi.hoisted(() => {
  const calls = {
    listNotifications: 0,
    unreadNotificationCountForFamily: [] as string[],
  };
  let notifications: unknown[] = [];
  let unreadCount = 0n;
  let actorReady = true;

  const mockActor = {
    async listNotifications(): Promise<unknown[]> {
      calls.listNotifications += 1;
      return notifications;
    },
    async unreadNotificationCountForFamily(familyId: string): Promise<bigint> {
      calls.unreadNotificationCountForFamily.push(familyId);
      return unreadCount;
    },
  };

  return {
    mockActor,
    calls,
    setNotifications: (next: unknown[]) => {
      notifications = next;
    },
    setUnreadCount: (next: bigint) => {
      unreadCount = next;
    },
    setActorReady: (ready: boolean) => {
      actorReady = ready;
    },
    isActorReady: () => actorReady,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({
    actor: mockState.isActorReady() ? mockState.mockActor : null,
    isFetching: false,
  }),
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
  mockState.calls.listNotifications = 0;
  mockState.calls.unreadNotificationCountForFamily = [];
  mockState.setActorReady(true);
  mockState.setNotifications([]);
  mockState.setUnreadCount(0n);
});

describe("Notification unread count not-ready path (default-family baseline)", () => {
  it("is 0 and makes no backend call while the actor is not ready", async () => {
    mockState.setActorReady(false);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    // The query is disabled without an actor, so the hook never calls the
    // backend and the count is 0.
    await waitFor(() => expect(result.current).toBe(0));
    expect(mockState.calls.unreadNotificationCountForFamily).toEqual([]);
  });

  it("resumes reading the family-scoped count once the actor is ready", async () => {
    mockState.setActorReady(false);

    const { result, rerender } = renderHook(
      () => useUnreadNotificationCount(),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toBe(0));
    expect(mockState.calls.unreadNotificationCountForFamily).toEqual([]);

    // The actor becomes available; the same hook now reads the canonical
    // family-scoped count for the active (default) family.
    mockState.setActorReady(true);
    mockState.setUnreadCount(1n);
    rerender();

    await waitFor(() => expect(result.current).toBe(1));
    expect(mockState.calls.unreadNotificationCountForFamily).toEqual([
      "norwood",
    ]);
  });
});

describe("NotificationBadge not-ready path (default-family baseline)", () => {
  it("renders nothing while the actor is not ready", async () => {
    mockState.setActorReady(false);

    render(<NotificationBadge />, { wrapper });

    // No backend call and no badge: the header must not flash a count before
    // sign-in resolves.
    await waitFor(() =>
      expect(
        screen.queryByTestId("notification_badge"),
      ).not.toBeInTheDocument(),
    );
    expect(mockState.calls.listNotifications).toBe(0);
  });
});

describe("Notifications page not-ready path (default-family baseline)", () => {
  it("renders the empty state, not an error, while the actor is not ready", async () => {
    mockState.setActorReady(false);

    render(<NotificationsPage />, { wrapper });

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
    expect(mockState.calls.listNotifications).toBe(0);
  });

  it("renders the caller's notifications once the actor is ready", async () => {
    mockState.setNotifications([
      makeNotification(1n, {
        message: "Your profile claim was approved.",
        read: false,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    expect(
      await screen.findByText("Your profile claim was approved."),
    ).toBeInTheDocument();
    expect(mockState.calls.listNotifications).toBe(1);
  });
});

describe("useListNotifications not-ready path (default-family baseline)", () => {
  it("makes no backend call while the actor is not ready", async () => {
    mockState.setActorReady(false);

    const { result } = renderHook(() => useListNotifications(), { wrapper });

    // The query is disabled without an actor, so it never calls the backend.
    // The hook itself exposes no data until it runs; the page applies its own
    // `= []` default, which is what renders the empty state (asserted above).
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
    expect(mockState.calls.listNotifications).toBe(0);
  });
});
