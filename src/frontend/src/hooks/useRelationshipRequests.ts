import { createActor } from "@/backend";
import type { Relationship, RelationshipRequest } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * React Query hooks for the relationship-verification workflow, following the
 * existing useActor(createActor) + useQuery/useMutation pattern. Relationship
 * requests start Pending and are never treated as confirmed until a Family
 * Steward approves them, which updates the shared family graph.
 */

/**
 * Fetches the current signed-in caller's own relationship requests. Unlike
 * useListRelationshipRequests, this endpoint is NOT admin-gated, so it is safe
 * to call from non-admin UI (PersonProfilePage) to detect a pending connection
 * for the caller's own profile without trapping for regular users.
 */
export function useMyRelationshipRequests() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myRelationshipRequests"],
    queryFn: async () => {
      if (!actor) return [] as RelationshipRequest[];
      return actor.getMyRelationshipRequests();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Lists every relationship request (used by the Family Steward review area). */
export function useListRelationshipRequests() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["relationshipRequests"],
    queryFn: async () => {
      if (!actor) return [] as RelationshipRequest[];
      return actor.listRelationshipRequests();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a single relationship request by id. */
export function useGetRelationshipRequest(requestId: bigint) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["relationshipRequests", requestId.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getRelationshipRequest(requestId);
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Proposes a new or changed relationship between two people. The request
 * starts Pending and is never treated as confirmed until approved.
 */
export function useProposeRelationship() {
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
      return actor.proposeRelationship(
        fromPersonId,
        toPersonId,
        relationshipType,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // The caller's own request list must reflect the new pending request.
      void queryClient.invalidateQueries({
        queryKey: ["myRelationshipRequests"],
      });
    },
  });
}

/** Approves a relationship request, confirming it in the shared family graph. */
export function useApproveRelationshipRequest() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveRelationshipRequest(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["confirmedRelationships"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
export function useRejectRelationshipRequest() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectRelationshipRequest(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
export function useSetRelationshipRequestPending() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setRelationshipRequestPending(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["relationshipRequests"],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
export function useListConfirmedRelationships() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["confirmedRelationships"],
    queryFn: async () => {
      if (!actor) return [] as Relationship[];
      return actor.listConfirmedRelationships();
    },
    enabled: !!actor && !isFetching,
  });
}

export type { Relationship, RelationshipRequest };
