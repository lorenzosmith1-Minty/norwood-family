import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReconcileClaimNotifications } from "./hooks/useNotifications";
import {
  useApproveProfileClaim,
  useRejectProfileClaim,
} from "./hooks/useProfileClaims";

// ---------------------------------------------------------------------------
// Characterization baseline for the notification family-scoping change.
//
// The requested change gives the backend Notification record a `familyId`
// field, adds canonical family-scoped notification methods, and keeps the
// existing no-familyId notification APIs as thin TEMPORARY wrappers delegating
// to the canonical methods with DEFAULT_FAMILY_ID ("norwood").
//
// The sibling file NotificationsDefaultFamilyCharacterize.test.tsx freezes the
// list / unread-count / mark-read / page / badge default-family behavior. This
// file freezes the remaining legacy notification consumer contract that the
// change must preserve: the claim-notification RECONCILE path.
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
//   * the exact backend method names beyond the legacy no-familyId
//     `reconcileClaimNotifications(claimId)` / `approveProfileClaim(claimId)` /
//     `rejectProfileClaim(claimId)` contract the wrappers must keep serving.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing:
//
//   1. useReconcileClaimNotifications calls the legacy
//      `reconcileClaimNotifications(claimId)` with the target id and
//      invalidates the ["notifications"] query key;
//   2. useApproveProfileClaim() with no familyId calls the legacy
//      `approveProfileClaim(claimId)` and, on success, reconciles the SAME
//      claim's notifications (the stale pending ProfileClaimRequested
//      notification is resolved once the claim is approved);
//   3. a reconcile failure is best-effort: it never rolls back the approval,
//      which still resolves successfully;
//   4. useRejectProfileClaim() with no familyId calls the legacy
//      `rejectProfileClaim(claimId)` and invalidates ["notifications"].
//
// The frontend suite mocks the actor, so none of the backend family-boundary
// behavior is visible here; that lives in the PocketIC lane. This is
// component/integration coverage over a typed local actor mock (see
// coverageLimits).
// ---------------------------------------------------------------------------

const { mockActor, calls, resetCalls, setReconcileError } = vi.hoisted(() => {
  const calls = {
    reconcileClaimNotifications: [] as bigint[],
    approveProfileClaim: [] as bigint[],
    rejectProfileClaim: [] as bigint[],
  };
  let reconcileError: Error | null = null;

  const mockActor = {
    async reconcileClaimNotifications(claimId: bigint): Promise<bigint> {
      calls.reconcileClaimNotifications.push(claimId);
      if (reconcileError !== null) throw reconcileError;
      return 1n;
    },
    async approveProfileClaim(claimId: bigint): Promise<unknown> {
      calls.approveProfileClaim.push(claimId);
      return null;
    },
    async rejectProfileClaim(claimId: bigint): Promise<unknown> {
      calls.rejectProfileClaim.push(claimId);
      return null;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.reconcileClaimNotifications = [];
      calls.approveProfileClaim = [];
      calls.rejectProfileClaim = [];
      reconcileError = null;
    },
    setReconcileError: (error: Error | null) => {
      reconcileError = error;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
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
});

describe("Claim-notification reconcile legacy consumer contract (default-family baseline)", () => {
  it("useReconcileClaimNotifications calls the legacy reconcileClaimNotifications(claimId) and invalidates the notifications key", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    const { result } = renderHook(() => useReconcileClaimNotifications(), {
      wrapper,
    });
    await result.current.mutateAsync(11n);

    // The hook calls the public legacy method with the target claim id — the
    // default-family call the legacy wrapper must keep serving.
    expect(calls.reconcileClaimNotifications).toEqual([11n]);
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["notifications"]);

    invalidateSpy.mockRestore();
  });

  it("useApproveProfileClaim() with no familyId calls the legacy approveProfileClaim(claimId) and reconciles the same claim", async () => {
    const { result } = renderHook(() => useApproveProfileClaim(), { wrapper });
    await result.current.mutateAsync(42n);

    // The legacy no-familyId branch is taken: the default-family endpoint the
    // wrapper must keep serving.
    expect(calls.approveProfileClaim).toEqual([42n]);
    // The approval reconciles the SAME claim's stale pending notification.
    await waitFor(() =>
      expect(calls.reconcileClaimNotifications).toEqual([42n]),
    );
  });

  it("keeps the approval successful when the reconcile call fails (best-effort)", async () => {
    setReconcileError(new Error("reconcile unavailable"));

    const { result } = renderHook(() => useApproveProfileClaim(), { wrapper });
    // The approval itself must resolve; a reconcile failure never rolls it back.
    await expect(result.current.mutateAsync(7n)).resolves.toBeNull();

    expect(calls.approveProfileClaim).toEqual([7n]);
    await waitFor(() =>
      expect(calls.reconcileClaimNotifications).toEqual([7n]),
    );
  });

  it("useRejectProfileClaim() with no familyId calls the legacy rejectProfileClaim(claimId) and invalidates the notifications key", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    const { result } = renderHook(() => useRejectProfileClaim(), { wrapper });
    await result.current.mutateAsync(5n);

    expect(calls.rejectProfileClaim).toEqual([5n]);
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["notifications"]);

    invalidateSpy.mockRestore();
  });
});
