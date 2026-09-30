import { createActor } from "@/backend";
import type { Relationship, RelationshipRequest } from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";
import { pendingContributionsCountInvalidation } from "./usePendingCount";

/**
 * React Query hooks for the relationship-verification workflow, following the
 * existing useActor(createActor) + useQuery/useMutation pattern. Relationship
 * requests start Pending and are never treated as confirmed until a Family
 * Steward approves them, which updates the shared family graph.
 *
 * Tenancy 1C-A: each hook accepts an optional `familyId`. When supplied it
 * routes to the family-scoped backend endpoint (`*ForFamily`); when omitted it
 * calls the legacy default-family endpoint unchanged, so existing default-family
 * behavior is preserved exactly. Callers pass the active family from
 * `useActiveFamilyId()`.
 */

/**
 * Family-aware React Query invalidation filters for the Relationship Request
 * caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["relationshipRequests"]` filter would also match
 * `["relationshipRequests", <otherFamily>]` and mark another family's request
 * cache stale. These helpers follow the exact precedent of
 * `pendingContributionsCountInvalidation` in `usePendingCount.ts`,
 * `notificationInvalidation` in `useNotifications.ts`, and the Board / Messaging
 * / Research / Archive helpers: both branches are family-exact.
 *
 * The Relationship Request read keys carry the family id at index 1 (the
 * default family uses `familyId ?? null`, NOT an omitted slot):
 * `["relationshipRequests", familyId ?? null]`,
 * `["relationshipRequests", familyId ?? null, requestId]`,
 * `["confirmedRelationships", familyId ?? null]`, and
 * `["myRelationshipRequests", familyId ?? null]`.
 *
 * Because the default family's key keeps the family slot (as `null`), a bare
 * exact-key filter would still match a non-default family's key for the same
 * cache. The default branch therefore keeps the exact key but narrows it with a
 * predicate that admits only the default shape (`queryKey[1] === null` plus a
 * `queryKey.length` check), which also excludes the sibling request-detail keys
 * that share the `["relationshipRequests"]` prefix.
 *
 * - The default family (`familyScopedId` undefined) targets only the exact
 *   default read key, so no non-default family's key can match.
 * - A non-default family keeps the bare prefix (so the recorded filter shape is
 *   unchanged) but narrows it with a predicate that admits only the active
 *   family's keys (`queryKey[1] === familyScopedId`).
 *
 * The active family id is always the centralized `useFamilyScopedId()` value;
 * no family id is hard-coded here.
 */

/**
 * Invalidation filter for the relationship-request list caches of the active
 * family.
 *
 * The `["relationshipRequests"]` prefix also matches the single request-detail
 * keys (`["relationshipRequests", familyId, requestId]`), so the predicate
 * admits both the list shape (length 2 for the default family) and the detail
 * shape (length 3 for the default family) for the active family.
 */
export function relationshipRequestsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["relationshipRequests"],
      predicate: (query) =>
        query.queryKey[1] === null &&
        (query.queryKey.length === 2 || query.queryKey.length === 3),
    };
  }
  return {
    queryKey: ["relationshipRequests"],
    predicate: (query) => query.queryKey[1] === familyScopedId,
  };
}

/** Invalidation filter for the confirmed-relationship graph caches of the active family. */
export function confirmedRelationshipsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["confirmedRelationships"],
      predicate: (query) =>
        query.queryKey.length === 2 && query.queryKey[1] === null,
    };
  }
  return {
    queryKey: ["confirmedRelationships"],
    predicate: (query) => query.queryKey[1] === familyScopedId,
  };
}

/** Invalidation filter for the caller's own relationship-request caches of the active family. */
export function myRelationshipRequestsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["myRelationshipRequests"],
      predicate: (query) =>
        query.queryKey.length === 2 && query.queryKey[1] === null,
    };
  }
  return {
    queryKey: ["myRelationshipRequests"],
    predicate: (query) => query.queryKey[1] === familyScopedId,
  };
}

/**
 * Fetches the current signed-in caller's own relationship requests. Unlike
 * useListRelationshipRequests, this endpoint is NOT admin-gated, so it is safe
 * to call from non-admin UI (PersonProfilePage) to detect a pending connection
 * for the caller's own profile without trapping for regular users.
 */
export function useMyRelationshipRequests(familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myRelationshipRequests", familyId ?? null],
    queryFn: async () => {
      if (!actor) return [] as RelationshipRequest[];
      return familyId
        ? actor.getMyRelationshipRequestsForFamily(familyId)
        : actor.getMyRelationshipRequests();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Lists every relationship request (used by the Family Steward review area). */
export function useListRelationshipRequests(familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["relationshipRequests", familyId ?? null],
    queryFn: async () => {
      if (!actor) return [] as RelationshipRequest[];
      return familyId
        ? actor.listRelationshipRequestsForFamily(familyId)
        : actor.listRelationshipRequests();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a single relationship request by id. */
export function useGetRelationshipRequest(
  requestId: bigint,
  familyId?: string,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["relationshipRequests", familyId ?? null, requestId.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return familyId
        ? actor.getRelationshipRequestForFamily(familyId, requestId)
        : actor.getRelationshipRequest(requestId);
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Proposes a new or changed relationship between two people. The request
 * starts Pending and is never treated as confirmed until approved.
 */
export function useProposeRelationship(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromPersonId,
      toPersonId,
      relationshipType,
    }: {
      fromPersonId: string;
      toPersonId: string;
      relationshipType: import("@/backend").RelationshipType;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.proposeRelationshipForFamily(
            familyId,
            fromPersonId,
            toPersonId,
            relationshipType,
          )
        : actor.proposeRelationship(fromPersonId, toPersonId, relationshipType);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        relationshipRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // The caller's own request list must reflect the new pending request.
      void queryClient.invalidateQueries(
        myRelationshipRequestsInvalidation(familyScopedId),
      );
    },
  });
}

/** Approves a relationship request, confirming it in the shared family graph. */
export function useApproveRelationshipRequest(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.approveRelationshipRequestForFamily(familyId, requestId)
        : actor.approveRelationshipRequest(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        relationshipRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        confirmedRelationshipsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Approving removes the request from the steward-review queue, so the
      // Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        myRelationshipRequestsInvalidation(familyScopedId),
      );
    },
  });
}

/** Rejects a relationship request, recording the reviewer and reviewed date. */
export function useRejectRelationshipRequest(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.rejectRelationshipRequestForFamily(familyId, requestId)
        : actor.rejectRelationshipRequest(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        relationshipRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Rejecting removes the request from the steward-review queue, so the
      // Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        myRelationshipRequestsInvalidation(familyScopedId),
      );
    },
  });
}

/** Returns a relationship request to the Pending state (e.g. after a dispute). */
export function useSetRelationshipRequestPending(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.setRelationshipRequestPendingForFamily(familyId, requestId)
        : actor.setRelationshipRequestPending(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        relationshipRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Returning to Pending re-adds the request to the steward-review queue,
      // so the Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        myRelationshipRequestsInvalidation(familyScopedId),
      );
    },
  });
}

/** Lists confirmed relationships in the shared family graph. */
export function useListConfirmedRelationships(familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["confirmedRelationships", familyId ?? null],
    queryFn: async () => {
      if (!actor) return [] as Relationship[];
      return familyId
        ? actor.listConfirmedRelationshipsForFamily(familyId)
        : actor.listConfirmedRelationships();
    },
    enabled: !!actor && !isFetching,
  });
}

export type { Relationship, RelationshipRequest };
