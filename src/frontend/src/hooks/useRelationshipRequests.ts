import { createActor } from "@/backend";
import type { Relationship, RelationshipRequest } from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";

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
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // The caller's own request list must reflect the new pending request.
      void queryClient.invalidateQueries({
        queryKey: ["myRelationshipRequests"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["confirmedRelationships"],
      });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Approving removes the request from the steward-review queue, so the
      // Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["myRelationshipRequests"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Rejecting removes the request from the steward-review queue, so the
      // Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["myRelationshipRequests"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Returning to Pending re-adds the request to the steward-review queue,
      // so the Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["myRelationshipRequests"],
      });
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
