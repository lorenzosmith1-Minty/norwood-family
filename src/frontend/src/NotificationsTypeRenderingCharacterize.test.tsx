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
import { useListNotifications } from "./hooks/useNotifications";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NOTIFICATION_TYPE_LABELS } from "./types/ownership";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// ---------------------------------------------------------------------------
// Characterization baseline for the notification family-scoping change.
//
// The requested change gives the backend Notification record a `familyId`
// field, adds canonical family-scoped notification methods, and keeps the
// existing no-familyId notification APIs as thin TEMPORARY wrappers delegating
// to the canonical methods with DEFAULT_FAMILY_ID ("norwood").
//
// The sibling files NotificationsDefaultFamilyCharacterize.test.tsx and
// NotificationsReconcileCharacterize.test.tsx freeze the list / unread-count /
// mark-read / page / badge / reconcile default-family behavior. This file
// freezes the remaining default-family rendering contract that the change must
// preserve:
//
//   1. every NotificationType renders its friendly label from the shared
//      NOTIFICATION_TYPE_LABELS map on the Notifications page — the change adds
//      a field to the record, it must not alter how a type is presented;
//   2. a READ claim notification renders as "Resolved" (its final state) while
//      an UNREAD one does not — the change must not disturb the resolved-claim
//      presentation;
//   3. the header NotificationBadge honours an explicit `count` override and
//      caps the displayed value at "99+";
//   4. useListNotifications surfaces an empty list (not an error) when the
//      actor is not ready, which is the empty-state path the page renders.
//
// It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on Notification — the change adds one,
//     so asserting its absence would freeze the very thing being changed;
//   * the exact Notification record shape — the change adds a field, so only
//     the fields the UI reads are asserted, never the full record;
//   * the legacy methods as the only implementation — the change makes them
//     thin wrappers over canonical family-scoped methods, and this file must
//     keep passing across that refactor.
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
  const calls = { listNotifications: 0 };
  let notifications: unknown[] = [];

  const mockActor = {
    async listNotifications(): Promise<unknown[]> {
      calls.listNotifications += 1;
      return notifications;
    },
  };

  return {
    mockActor,
    calls,
    actorReady: true,
    setNotifications: (next: unknown[]) => {
      notifications = next;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({
    actor: mockState.actorReady ? mockState.mockActor : null,
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
  mockState.actorReady = true;
  mockState.setNotifications([]);
});

describe("Notifications page renders every notification type label (default-family baseline)", () => {
  it("renders the friendly label for each of the twelve notification types", async () => {
    const types = Object.values(NotificationType);
    mockState.setNotifications(
      types.map((type, index) =>
        makeNotification(BigInt(index + 1), {
          notificationType: type,
          message: `Message for ${type}`,
          read: true,
        }),
      ),
    );

    render(<NotificationsPage />, { wrapper });

    // Every type's message renders, and every friendly label from the shared
    // map renders exactly once.
    for (const type of types) {
      expect(
        await screen.findByText(`Message for ${type}`),
      ).toBeInTheDocument();
    }
    for (const type of types) {
      expect(
        screen.getByText(NOTIFICATION_TYPE_LABELS[type]),
      ).toBeInTheDocument();
    }
  });

  it("falls back to a generic label for an unknown notification type", async () => {
    mockState.setNotifications([
      makeNotification(1n, {
        notificationType: "SomethingUnknown" as NotificationType,
        message: "An unrecognized notification.",
        read: true,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    expect(
      await screen.findByText("An unrecognized notification."),
    ).toBeInTheDocument();
    expect(screen.getByText("Notification")).toBeInTheDocument();
  });
});

describe("Resolved claim notification presentation (default-family baseline)", () => {
  it("renders a READ claim notification as Resolved", async () => {
    mockState.setNotifications([
      makeNotification(1n, {
        notificationType: NotificationType.ProfileClaimRequested,
        message: "Your claim is pending review.",
        read: true,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    expect(
      await screen.findByText("Your claim is pending review."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Resolved/)).toBeInTheDocument();
  });

  it("does not render an UNREAD claim notification as Resolved", async () => {
    mockState.setNotifications([
      makeNotification(1n, {
        notificationType: NotificationType.ProfileClaimRequested,
        message: "Your claim is pending review.",
        read: false,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    expect(
      await screen.findByText("Your claim is pending review."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Resolved/)).not.toBeInTheDocument();
  });

  it("does not render a read non-claim notification as Resolved", async () => {
    mockState.setNotifications([
      makeNotification(1n, {
        notificationType: NotificationType.NewMessage,
        message: "You have a new message.",
        read: true,
      }),
    ]);

    render(<NotificationsPage />, { wrapper });

    expect(
      await screen.findByText("You have a new message."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Resolved/)).not.toBeInTheDocument();
  });
});

describe("NotificationBadge count override and cap (default-family baseline)", () => {
  it("honours an explicit count override", () => {
    render(<NotificationBadge count={3} />, { wrapper });

    const badge = screen.getByTestId("notification_badge");
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAttribute("aria-label", "3 unread notifications");
  });

  it("renders nothing for an explicit zero count", () => {
    render(<NotificationBadge count={0} />, { wrapper });

    expect(screen.queryByTestId("notification_badge")).not.toBeInTheDocument();
  });

  it("caps the displayed count at 99+", () => {
    render(<NotificationBadge count={150} />, { wrapper });

    const badge = screen.getByTestId("notification_badge");
    expect(badge).toHaveTextContent("99+");
    expect(badge).toHaveAttribute("aria-label", "150 unread notifications");
  });

  it("uses the singular aria-label for a single unread notification", () => {
    render(<NotificationBadge count={1} />, { wrapper });

    expect(screen.getByTestId("notification_badge")).toHaveAttribute(
      "aria-label",
      "1 unread notification",
    );
  });
});

describe("useListNotifications empty-state path (default-family baseline)", () => {
  it("makes no backend call when the actor is not ready", async () => {
    // The hook's query is disabled without an actor, so it never calls the
    // backend; the page's `data = []` default then renders the empty state.
    mockState.actorReady = false;

    const { result } = renderHook(() => useListNotifications(), { wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockState.calls.listNotifications).toBe(0);
  });

  it("renders the page empty state when the actor is not ready", async () => {
    mockState.actorReady = false;

    render(<NotificationsPage />, { wrapper });

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });
});
