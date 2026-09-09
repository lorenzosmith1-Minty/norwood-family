import { createActor } from "@/backend";
import type {
  AuditEntry,
  DuplicatePair,
  MergeConflict,
  MergeResult,
  ProfileRemovalRequest,
  Relationship,
  RelationshipType,
  Result_1,
  Result_2,
  Result_4,
  Result_5,
  Result_8,
  Result_9,
  Result_10,
  Result_11,
  Result_14,
  Result_16,
  StewardIdentity,
  StewardRecord,
  SuccessorDesignation,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import type { Principal } from "@icp-sdk/core/principal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

/**
 * React Query hooks for the Family Governance & Safety Controls area, following
 * the existing useActor(createActor) + useQuery/useMutation pattern used by
 * useProfileClaims and useArchiveStorage. Every operation goes through the real
 * backend actor; no local persistence is used.
 *
 * Query keys are namespaced under "governance" so a mutation in one tab can
 * invalidate the shared lists (stewards, successors, removal requests, archived
 * profiles, duplicates, audit history) that the other tabs read.
 */

/** Lists the current Family Stewards. */
export function useListStewards() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "stewards"],
    queryFn: async () => {
      if (!actor) return [] as StewardRecord[];
      return actor.listStewards();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Lists each steward/successor enriched with the linked Person identity
 * (displayName, canonicalName, personId) while keeping accountId for
 * authorization and audit. The displayName is the preferred/display name when
 * set, otherwise the canonical name.
 */
export function useListStewardIdentities() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "stewardIdentities"],
    queryFn: async () => {
      if (!actor) return [] as StewardIdentity[];
      return actor.listStewardIdentities();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Lists the members eligible to be promoted to steward or designated as a
 * successor: living, with an approved/claimed profile, linked to a valid
 * account, not already an active steward, and not archived.
 */
export function useListEligibleStewardCandidates() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "eligibleStewardCandidates"],
    queryFn: async () => {
      if (!actor) return [] as StewardIdentity[];
      return actor.listEligibleStewardCandidates();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Promotes a person to Family Steward. */
export function usePromoteToSteward() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_8> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.promoteToSteward(personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "stewards"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Removes a Family Steward by their account id. */
export function useRemoveSteward() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (stewardAccountId: Principal): Promise<Result_4> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.removeSteward(stewardAccountId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "stewards"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Designates a person as a successor steward with a priority order. */
export function useDesignateSuccessor() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      priority,
    }: {
      personId: string;
      priority: bigint;
    }): Promise<Result_14> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.designateSuccessor(personId, priority);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "successors"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Activates a designated successor as an active steward. */
export function useActivateSuccessor() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_8> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.activateSuccessor(personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "successors"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "stewards"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Lists the current successor steward designations. */
export function useListSuccessors() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "successors"],
    queryFn: async () => {
      if (!actor) return [] as SuccessorDesignation[];
      return actor.listSuccessors();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Returns a warning string when only a single steward remains, else null. */
export function useSingleStewardWarning() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "singleStewardWarning"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getSingleStewardWarning();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Submits a request to remove a profile from the family tree. */
export function useRequestProfileRemoval() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      reason,
    }: {
      personId: string;
      reason: string;
    }): Promise<Result_2> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.requestProfileRemoval(personId, reason);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "profileRemovalRequests"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Lists the pending profile-removal requests awaiting steward review. */
export function useListProfileRemovalRequests() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "profileRemovalRequests"],
    queryFn: async () => {
      if (!actor) return [] as ProfileRemovalRequest[];
      return actor.listProfileRemovalRequests();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Approves a profile-removal request. */
export function useApproveProfileRemoval() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      requestId: bigint,
    ): Promise<ProfileRemovalRequest | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveProfileRemoval(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "profileRemovalRequests"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Rejects a profile-removal request. */
export function useRejectProfileRemoval() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      requestId: bigint,
    ): Promise<ProfileRemovalRequest | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectProfileRemoval(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "profileRemovalRequests"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Archives a profile, removing it from the active family tree. */
export function useArchiveProfile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_1> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.archiveProfile(personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "archivedProfiles"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Restores an archived profile back into the active family tree. */
export function useRestoreProfile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_1> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.restoreProfile(personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "archivedProfiles"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Lists the person ids currently in the archive (non-steward-gated). Used by
 *  the normal family browsing pages to hide archived profiles. */
export function useListArchivedProfileIds() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "archivedProfileIds"],
    queryFn: async () => {
      if (!actor) return [] as string[];
      return actor.listArchivedProfileIds();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists the profiles currently in the archive. */
export function useListArchivedProfiles() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "archivedProfiles"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listArchivedProfiles();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Permanently deletes a profile (requires explicit confirmation). */
export function usePermanentlyDeleteProfile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      confirmation,
    }: {
      personId: string;
      confirmation: boolean;
    }): Promise<Result_9> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.permanentlyDeleteProfile(personId, confirmation);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "archivedProfiles"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Lists the candidate duplicate profile pairs for steward review. */
export function useListDuplicateCandidates() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "duplicateCandidates"],
    queryFn: async () => {
      if (!actor) return [] as DuplicatePair[];
      return actor.listDuplicateCandidates();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Marks two profiles as NOT duplicates, dismissing the candidate pair. */
export function useNotDuplicate() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personIdA,
      personIdB,
    }: {
      personIdA: string;
      personIdB: string;
    }): Promise<Result_10> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.notDuplicate(personIdA, personIdB);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "duplicateCandidates"],
      });
    },
  });
}

/** Merges two duplicate profiles into a single canonical profile. */
export function useMergeProfiles() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      canonicalPersonId,
      mergedAwayPersonId,
    }: {
      canonicalPersonId: string;
      mergedAwayPersonId: string;
    }): Promise<Result_11> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.mergeProfiles(canonicalPersonId, mergedAwayPersonId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "duplicateCandidates"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Resolves a merge conflict by choosing the canonical value for a field. */
export function useResolveMergeConflict() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conflictId,
      canonicalValue,
    }: {
      conflictId: bigint;
      canonicalValue: string;
    }): Promise<MergeConflict | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.resolveMergeConflict(conflictId, canonicalValue);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "duplicateCandidates"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Lists the confirmed relationships for a person. */
export function useListPersonRelationships(personId: string) {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "relationships", personId],
    queryFn: async () => {
      if (!actor) return [] as Relationship[];
      return actor.listPersonRelationships(personId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Adds a relationship between two people. */
export function useAddRelationship() {
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
      relationshipType: RelationshipType;
    }): Promise<Result_16> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.addRelationship(fromPersonId, toPersonId, relationshipType);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "relationships", variables.fromPersonId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "relationships", variables.toPersonId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Removes a relationship by its id. */
export function useRemoveRelationship() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (relationshipId: bigint): Promise<Result_5> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.removeRelationship(relationshipId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "relationships"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Corrects the type of an existing relationship. */
export function useCorrectRelationshipType() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      relationshipId,
      relationshipType,
    }: {
      relationshipId: bigint;
      relationshipType: RelationshipType;
    }): Promise<Result_16> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.correctRelationshipType(relationshipId, relationshipType);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance", "relationships"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["governance", "auditHistory"],
      });
    },
  });
}

/** Lists the steward-only audit history. */
export function useListAuditHistory() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["governance", "auditHistory"],
    queryFn: async () => {
      if (!actor) return [] as AuditEntry[];
      return actor.listAuditHistory();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export type {
  AuditEntry,
  DuplicatePair,
  MergeConflict,
  MergeResult,
  ProfileRemovalRequest,
  Relationship,
  StewardIdentity,
  StewardRecord,
  SuccessorDesignation,
};
