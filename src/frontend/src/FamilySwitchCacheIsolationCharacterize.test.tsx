import "@testing-library/jest-dom/vitest";
import {
  type Family,
  FamilyStatus,
  type Notification,
  NotificationType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveFamilyRecord } from "./hooks/useActiveFamilyRecord";
import { useListNotifications } from "./hooks/useNotifications";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 3 multi-family isolation audit:
// switching the active family must not leave the previous family's data
// visible.
//
// The audit's accepted criteria include:
//
//   * "No Family A data appears or mutates while Family B is the active family
//     on any audited surface."
//   * "Switching the active family clears or refreshes family-scoped cached
//     state so no prior family's data remains visible."
//
// The existing `*FamilyScopedCallShape.cover` files pin the call shape and the
// query-key shape for a family that is fixed for the life of the render. None
// of them re-renders the SAME mounted hook with a DIFFERENT active family,
// which is the transition the audit is about. This file freezes the transition
// invariant for two representative family-scoped surfaces:
//
//   * `useListNotifications` — a family-scoped list whose data differs per
//     family (Family A's notification must not be served to Family B);
//   * `useActiveFamilyRecord` — a family-scoped record read (`getFamily`).
//
// The invariant is that the family id is part of every family-scoped query key,
// so when the active family changes React Query resolves a DIFFERENT cache
// entry and re-reads the backend for the new family. A regression that dropped
// the family id from a key (or reused one family's cache entry for another)
// would surface Family A's data while Family B is active, and this file fails.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the frontend consumer/cache contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls, setNotifications, setFamilies } =
  vi.hoisted(() => {
    const calls: {
      listNotifications: unknown[][];
      listNotificationsForFamily: unknown[][];
      getFamily: unknown[][];
    } = {
      listNotifications: [],
      listNotificationsForFamily: [],
      getFamily: [],
    };

    let notificationsByFamily: Record<string, Notification[]> = {};
    let familiesById: Record<string, Family> = {};

    const mockActor = {
      async listNotifications(...args: unknown[]): Promise<Notification[]> {
        calls.listNotifications.push(args);
        return notificationsByFamily[DEFAULT_FAMILY_ID] ?? [];
      },
      async listNotificationsForFamily(
        ...args: unknown[]
      ): Promise<Notification[]> {
        calls.listNotificationsForFamily.push(args);
        const familyId = args[0] as string;
        return notificationsByFamily[familyId] ?? [];
      },
      async getFamily(...args: unknown[]): Promise<Family | null> {
        calls.getFamily.push(args);
        const familyId = args[0] as string;
        return familiesById[familyId] ?? null;
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
          calls[key].length = 0;
        }
        notificationsByFamily = {};
        familiesById = {};
      },
      setNotifications: (value: Record<string, Notification[]>) => {
        notificationsByFamily = value;
      },
      setFamilies: (value: Record<string, Family>) => {
        familiesById = value;
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

function makeNotification(
  id: bigint,
  message: string,
  familyId: string,
): Notification {
  return {
    id,
    recipient: OWNER,
    notificationType: NotificationType.ProfileClaimReviewed,
    message,
    createdAt: 1_700_000_000_000_000_000n,
    read: false,
    familyId,
  };
}

function makeFamily(id: string, displayName: string): Family {
  return {
    id,
    status: FamilyStatus.active,
    displayName,
    createdAt: 1_700_000_000_000_000_000n,
    createdBy: OWNER,
  };
}

/**
 * A wrapper whose active family can be changed at runtime while the QueryClient
 * (and therefore the cache) stays the same. This mirrors a runtime family
 * switch: the provider's `familyId` prop changes, the tree does not remount,
 * and the cache is shared. `switchTo` is captured so a test can drive the
 * transition on the SAME mounted hook.
 */
function makeSwitchableWrapper(queryClient: QueryClient) {
  let switchTo: ((familyId: string) => void) | undefined;

  function SwitchableWrapper({ children }: { children: ReactNode }) {
    const [familyId, setFamilyId] = useState(FAMILY_A);
    switchTo = setFamilyId;
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  }

  return {
    Wrapper: SwitchableWrapper,
    switchTo: (familyId: string) => {
      if (switchTo === undefined) {
        throw new Error("wrapper not mounted yet");
      }
      switchTo(familyId);
    },
  };
}

describe("family switch: family-scoped list does not leak the previous family's data (characterization)", () => {
  it("re-reads the backend for the new family and never serves Family A's notifications to Family B", async () => {
    setNotifications({
      [FAMILY_A]: [makeNotification(1n, "Family A notice", FAMILY_A)],
      [FAMILY_B]: [makeNotification(2n, "Family B notice", FAMILY_B)],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { Wrapper, switchTo } = makeSwitchableWrapper(queryClient);

    const { result } = renderHook(() => useListNotifications(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      makeNotification(1n, "Family A notice", FAMILY_A),
    ]);
    expect(calls.listNotificationsForFamily).toEqual([[FAMILY_A]]);

    // Switch the active family on the SAME mounted hook, sharing the cache.
    act(() => switchTo(FAMILY_B));

    await waitFor(() =>
      expect(calls.listNotificationsForFamily).toContainEqual([FAMILY_B]),
    );
    await waitFor(() =>
      expect(result.current.data).toEqual([
        makeNotification(2n, "Family B notice", FAMILY_B),
      ]),
    );

    // Family A's notification is never served while Family B is active.
    expect(result.current.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "Family A notice" }),
      ]),
    );

    // The two families occupy distinct cache entries; neither overwrote the
    // other.
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["notifications", FAMILY_A]);
    expect(keys).toContainEqual(["notifications", FAMILY_B]);
  });

  it("keeps the default family on its legacy key and a non-default family on its own key", async () => {
    setNotifications({
      [DEFAULT_FAMILY_ID]: [
        makeNotification(1n, "Default notice", DEFAULT_FAMILY_ID),
      ],
      [FAMILY_A]: [makeNotification(2n, "Family A notice", FAMILY_A)],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { Wrapper, switchTo } = makeSwitchableWrapper(queryClient);

    const { result } = renderHook(() => useListNotifications(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The wrapper starts on Family A (non-default): family-scoped endpoint.
    expect(calls.listNotificationsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listNotifications).toEqual([]);

    // Switch to the default family: the legacy no-argument call and bare key.
    act(() => switchTo(DEFAULT_FAMILY_ID));

    await waitFor(() => expect(calls.listNotifications).toEqual([[]]));
    await waitFor(() =>
      expect(result.current.data).toEqual([
        makeNotification(1n, "Default notice", DEFAULT_FAMILY_ID),
      ]),
    );

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["notifications"]);
    expect(keys).toContainEqual(["notifications", FAMILY_A]);
  });
});

describe("family switch: family-scoped record read does not leak the previous family's record (characterization)", () => {
  it("re-reads getFamily for the new family and surfaces the new family's displayName", async () => {
    setFamilies({
      [FAMILY_A]: makeFamily(FAMILY_A, "Rivera"),
      [FAMILY_B]: makeFamily(FAMILY_B, "Okafor"),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { Wrapper, switchTo } = makeSwitchableWrapper(queryClient);

    const { result } = renderHook(() => useActiveFamilyRecord(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.displayName).toBe("Rivera"));
    expect(calls.getFamily).toEqual([[FAMILY_A]]);

    act(() => switchTo(FAMILY_B));

    await waitFor(() => expect(result.current.displayName).toBe("Okafor"));
    // The new family's record is read for Family B; Family A's display name is
    // never surfaced while Family B is active.
    expect(calls.getFamily).toContainEqual([FAMILY_B]);
    expect(result.current.displayName).not.toBe("Rivera");

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["family", FAMILY_A]);
    expect(keys).toContainEqual(["family", FAMILY_B]);
  });
});
