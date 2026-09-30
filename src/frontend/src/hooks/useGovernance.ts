import { createActor } from "@/backend";
import type {
  AuditEntry,
  DuplicatePair,
  MergeConflict,
  MergeResult,
  ProfileRemovalRequest,
  Relationship,
  RelationshipType,
  Result_4,
  Result_8,
  Result_10,
  Result_11,
  Result_14,
  Result_15,
  Result_16,
  Result_18,
  Result_27,
  Result_30,
  Result_41,
  StewardIdentity,
  StewardRecord,
  SuccessorDesignation,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import type { Principal } from "@icp-sdk/core/principal";
import type { InvalidateQueryFilters } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFamilyScopedId } from "../context/FamilyContext";
import type { StewardAuditEntry } from "../types/governance";
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
 *
 * Steward/Successor reads and writes are family-scoped. React Query matches
 * `invalidateQueries` by key PREFIX, so a bare `["governance", "successors"]`
 * filter would also match `["governance", "successors", <otherFamily>]` and mark
 * another family's cache stale. The Steward/Successor invalidation helpers below
 * follow the exact precedent of `pendingArchiveItemsInvalidation` in
 * `useArchiveStorage.ts`: both branches are family-exact.
 *
 * The family-appended Steward/Successor query keys carry the family id at
 * index 2: `["governance", "successors", familyScopedId]` and
 * `["governance", "stewardIdentities", familyScopedId]`. The steward roster and
 * audit history have no family-appended read yet, so their only registered
 * shape is the bare two-element key.
 *
 * - The default family (`familyScopedId` undefined) keeps the exact legacy bare
 *   keys (`["governance", "successors"]`, `["governance", "stewardIdentities"]`,
 *   `["governance", "stewards"]`, `["governance", "auditHistory"]`,
 *   `["isSteward"]`, `["hasActiveSteward"]`) unchanged.
 * - A non-default family keeps the bare prefix (so the recorded filter shape is
 *   unchanged) but narrows it with a predicate that admits only the active
 *   family's keys, never a bare cross-family prefix. The family-appended keys
 *   narrow on `queryKey[2] === familyScopedId`; the keys with no family-appended
 *   variant narrow on the exact two-element bare shape (`queryKey.length === 2`),
 *   the same family-exact pattern `archivePhotoInvalidation` uses.
 *
 * The active family id is always the centralized `useFamilyScopedId()` value;
 * no family id is hard-coded here.
 */

/**
 * Invalidation filter for the successor designations cache of the active
 * family. The default family keeps the exact legacy bare key; a non-default
 * family narrows the bare prefix to the active family's keys.
 */
export function successorsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "successors"] };
  }
  return {
    queryKey: ["governance", "successors"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for the steward identities cache of the active family.
 * The default family keeps the exact legacy bare key; a non-default family
 * narrows the bare prefix to the active family's keys.
 */
export function stewardIdentitiesInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "stewardIdentities"] };
  }
  return {
    queryKey: ["governance", "stewardIdentities"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for the steward roster cache of the active family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "stewards"]` (default) and
 * `["governance", "stewards", familyScopedId]` (non-default). React Query
 * matches `invalidateQueries` by key PREFIX, so a bare
 * `["governance", "stewards"]` filter would also match another family's keys.
 * The default family keeps the exact legacy bare key but narrows it to the
 * exact two-element shape (`queryKey.length === 2`), the same family-exact
 * pattern `governanceAuditHistoryInvalidation` uses, so a default-family
 * invalidation never reaches a non-default family's roster cache. A non-default
 * family targets its own family-appended key exactly, so Family A's
 * invalidation leaves Family B's roster cache untouched.
 */
export function stewardsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["governance", "stewards"],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return { queryKey: ["governance", "stewards", familyScopedId] };
}

/**
 * Invalidation filter for the governance audit history cache of the active
 * family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "auditHistory"]` (default) and
 * `["governance", "auditHistory", familyScopedId]` (non-default). React Query
 * matches `invalidateQueries` by key PREFIX, so a bare
 * `["governance", "auditHistory"]` filter would also match another family's
 * keys. The default family keeps the exact legacy bare key but narrows it to
 * the exact two-element shape (`queryKey.length === 2`), the same family-exact
 * pattern `stewardsInvalidation` uses, so a default-family invalidation never
 * reaches a non-default family's audit cache. A non-default family targets its
 * own family-appended key exactly, so Family A's invalidation leaves Family B's
 * audit cache untouched.
 */
export function governanceAuditHistoryInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["governance", "auditHistory"],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return { queryKey: ["governance", "auditHistory", familyScopedId] };
}

/**
 * Invalidation filter for the profile-removal requests cache of the active
 * family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "profileRemovalRequests"]` (default) and
 * `["governance", "profileRemovalRequests", familyScopedId]` (non-default).
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["governance", "profileRemovalRequests"]` filter would also match another
 * family's keys. The default family keeps the exact legacy bare key (its keys
 * carry no family slot, so no non-default key can match it). A non-default
 * family keeps the bare prefix (so the recorded filter shape is unchanged) but
 * narrows it with a predicate that admits only the active family's keys
 * (`queryKey[2] === familyScopedId`), never a bare cross-family prefix.
 */
export function profileRemovalRequestsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "profileRemovalRequests"] };
  }
  return {
    queryKey: ["governance", "profileRemovalRequests"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for the archived-profile list cache of the active family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "archivedProfiles"]` (default) and
 * `["governance", "archivedProfiles", familyScopedId]` (non-default). The
 * default family keeps the exact legacy bare key; a non-default family keeps
 * the bare prefix but narrows it with a predicate that admits only the active
 * family's keys, never a bare cross-family prefix.
 */
export function archivedProfilesInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "archivedProfiles"] };
  }
  return {
    queryKey: ["governance", "archivedProfiles"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for the archived-profile-id list cache of the active
 * family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "archivedProfileIds"]` (default) and
 * `["governance", "archivedProfileIds", familyScopedId]` (non-default). The
 * default family keeps the exact legacy bare key; a non-default family keeps
 * the bare prefix but narrows it with a predicate that admits only the active
 * family's keys, never a bare cross-family prefix.
 */
export function archivedProfileIdsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "archivedProfileIds"] };
  }
  return {
    queryKey: ["governance", "archivedProfileIds"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for the duplicate-candidate list cache of the active
 * family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "duplicateCandidates"]` (default) and
 * `["governance", "duplicateCandidates", familyScopedId]` (non-default). The
 * default family keeps the exact legacy bare key; a non-default family keeps
 * the bare prefix but narrows it with a predicate that admits only the active
 * family's keys, never a bare cross-family prefix.
 */
export function duplicateCandidatesInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "duplicateCandidates"] };
  }
  return {
    queryKey: ["governance", "duplicateCandidates"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Lists the current Family Stewards.
 *
 * The default family keeps the exact legacy `listStewards()` call and bare
 * query key; a non-default family routes to the canonical
 * `listStewardsForFamily(familyScopedId)` endpoint with the family id appended
 * to the key so caches are family-separated.
 */
export function useListStewards() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "stewards"]
        : ["governance", "stewards", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as StewardRecord[];
      return familyScopedId === undefined
        ? actor.listStewards()
        : actor.listStewardsForFamily(familyScopedId);
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
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "stewardIdentities"]
        : ["governance", "stewardIdentities", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as StewardIdentity[];
      return familyScopedId === undefined
        ? actor.listStewardIdentities()
        : actor.listStewardIdentitiesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Invalidation filter for the eligible-steward-candidates cache of the active
 * family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "eligibleStewardCandidates"]` (default) and
 * `["governance", "eligibleStewardCandidates", familyScopedId]` (non-default).
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["governance", "eligibleStewardCandidates"]` filter would also match another
 * family's keys. The default family keeps the exact legacy bare key but narrows
 * it to the exact two-element shape (`queryKey.length === 2`), the same
 * family-exact pattern `stewardsInvalidation` uses, so a default-family
 * invalidation never reaches a non-default family's candidate cache. A
 * non-default family targets its own family-appended key exactly, so Family A's
 * invalidation leaves Family B's candidate cache untouched.
 */
export function eligibleStewardCandidatesInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["governance", "eligibleStewardCandidates"],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return {
    queryKey: ["governance", "eligibleStewardCandidates", familyScopedId],
  };
}

/**
 * Lists the members eligible to be promoted to steward or designated as a
 * successor: living, with an approved/claimed profile, linked to a valid
 * account, not already an active steward, and not archived.
 *
 * The default family keeps the exact legacy `listEligibleStewardCandidates()`
 * call and bare query key; a non-default family routes to the canonical
 * `listEligibleStewardCandidatesForFamily(familyScopedId)` endpoint with the
 * family id appended to the key so caches are family-separated.
 */
export function useListEligibleStewardCandidates() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "eligibleStewardCandidates"]
        : ["governance", "eligibleStewardCandidates", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as StewardIdentity[];
      return familyScopedId === undefined
        ? actor.listEligibleStewardCandidates()
        : actor.listEligibleStewardCandidatesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Promotes a person to Family Steward. */
export function usePromoteToSteward() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_14> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.promoteToSteward(personId)
        : actor.promoteToStewardForFamily(familyScopedId, personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(stewardsInvalidation(familyScopedId));
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
      // Promotion changes the caller's steward permission when they are the
      // promoted person, so the Family Steward nav pill must appear immediately.
      void queryClient.invalidateQueries({ queryKey: ["isSteward"] });
      void queryClient.invalidateQueries({ queryKey: ["hasActiveSteward"] });
    },
  });
}

/**
 * Removes a Family Steward by their account id.
 *
 * The default family keeps the exact legacy `removeSteward(stewardAccountId)`
 * call; a non-default family routes to the canonical
 * `removeStewardForFamily(familyScopedId, stewardAccountId)` endpoint. The cache
 * invalidation reuses the family-safe `stewardsInvalidation` helper and the
 * family-aware `governanceAuditHistoryInvalidation` helper, so a non-default
 * family's removal never invalidates another family's roster or audit caches.
 */
export function useRemoveSteward() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (stewardAccountId: Principal): Promise<Result_10> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.removeSteward(stewardAccountId)
        : actor.removeStewardForFamily(familyScopedId, stewardAccountId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(stewardsInvalidation(familyScopedId));
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
      // Removal changes the caller's steward permission when they are the
      // removed steward, so the Family Steward nav pill must disappear
      // immediately.
      void queryClient.invalidateQueries({ queryKey: ["isSteward"] });
      void queryClient.invalidateQueries({ queryKey: ["hasActiveSteward"] });
    },
  });
}

/** Designates a person as a successor steward with a priority order. */
export function useDesignateSuccessor() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      priority,
    }: {
      personId: string;
      priority: bigint;
    }): Promise<Result_30> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.designateSuccessor(personId, priority)
        : actor.designateSuccessorForFamily(familyScopedId, personId, priority);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        successorsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/** Activates a designated successor as an active steward. */
export function useActivateSuccessor() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_14> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.activateSuccessor(personId)
        : actor.activateSuccessorForFamily(familyScopedId, personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        successorsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(stewardsInvalidation(familyScopedId));
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
      // Activating a successor grants them active steward permission, so the
      // Family Steward nav pill must appear immediately for that caller.
      void queryClient.invalidateQueries({ queryKey: ["isSteward"] });
      void queryClient.invalidateQueries({ queryKey: ["hasActiveSteward"] });
    },
  });
}

/** Lists the current successor steward designations. */
export function useListSuccessors() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "successors"]
        : ["governance", "successors", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as SuccessorDesignation[];
      return familyScopedId === undefined
        ? actor.listSuccessors()
        : actor.listSuccessorsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Invalidation filter for the single-Steward continuity warning cache of the
 * active family.
 *
 * The read key carries the family id at index 2 for a non-default family:
 * `["governance", "singleStewardWarning"]` (default) and
 * `["governance", "singleStewardWarning", familyScopedId]` (non-default).
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["governance", "singleStewardWarning"]` filter would also match another
 * family's keys. The default family keeps the exact legacy bare key but narrows
 * it to the exact two-element shape (`queryKey.length === 2`), the same
 * family-exact pattern `stewardsInvalidation` uses, so a default-family
 * invalidation never reaches a non-default family's warning cache. A
 * non-default family targets its own family-appended key exactly.
 */
export function singleStewardWarningInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["governance", "singleStewardWarning"],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return { queryKey: ["governance", "singleStewardWarning", familyScopedId] };
}

/**
 * Returns a warning string when only a single steward remains, else null.
 *
 * The default family keeps the exact legacy `getSingleStewardWarning()` call
 * and bare query key; a non-default family routes to the canonical
 * `getSingleStewardWarningForFamily(familyScopedId)` endpoint with the family id
 * appended to the key so caches are family-separated.
 */
export function useSingleStewardWarning() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "singleStewardWarning"]
        : ["governance", "singleStewardWarning", familyScopedId],
    queryFn: async () => {
      if (!actor) return null;
      return familyScopedId === undefined
        ? actor.getSingleStewardWarning()
        : actor.getSingleStewardWarningForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Submits a request to remove a profile from the family tree.
 *
 * The default family keeps the exact legacy `requestProfileRemoval(personId,
 * reason)` call; a non-default family routes to the canonical
 * `requestProfileRemovalForFamily(familyScopedId, personId, reason)` endpoint.
 * The cache invalidation is family-exact for a non-default family, so a
 * non-default family's mutation never invalidates another family's caches.
 */
export function useRequestProfileRemoval() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      reason,
    }: {
      personId: string;
      reason: string;
    }): Promise<Result_8> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.requestProfileRemoval(personId, reason)
        : actor.requestProfileRemovalForFamily(
            familyScopedId,
            personId,
            reason,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        profileRemovalRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Lists the pending profile-removal requests awaiting steward review.
 *
 * The default family keeps the exact legacy `listProfileRemovalRequests()` call
 * and bare query key; a non-default family routes to the canonical
 * `listProfileRemovalRequestsForFamily(familyScopedId)` endpoint with the family
 * id appended to the key so caches are family-separated.
 */
export function useListProfileRemovalRequests() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "profileRemovalRequests"]
        : ["governance", "profileRemovalRequests", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as ProfileRemovalRequest[];
      return familyScopedId === undefined
        ? actor.listProfileRemovalRequests()
        : actor.listProfileRemovalRequestsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Approves a profile-removal request.
 *
 * The default family keeps the exact legacy `approveProfileRemoval(requestId)`
 * call; a non-default family routes to the canonical
 * `approveProfileRemovalForFamily(familyScopedId, requestId)` endpoint. The
 * cache invalidation is family-exact for a non-default family.
 */
export function useApproveProfileRemoval() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      requestId: bigint,
    ): Promise<ProfileRemovalRequest | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveProfileRemoval(requestId)
        : actor.approveProfileRemovalForFamily(familyScopedId, requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        profileRemovalRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Rejects a profile-removal request.
 *
 * The default family keeps the exact legacy `rejectProfileRemoval(requestId)`
 * call; a non-default family routes to the canonical
 * `rejectProfileRemovalForFamily(familyScopedId, requestId)` endpoint. The cache
 * invalidation is family-exact for a non-default family.
 */
export function useRejectProfileRemoval() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      requestId: bigint,
    ): Promise<ProfileRemovalRequest | null> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectProfileRemoval(requestId)
        : actor.rejectProfileRemovalForFamily(familyScopedId, requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        profileRemovalRequestsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Archives a profile, removing it from the active family tree.
 *
 * The default family keeps the exact legacy `archiveProfile(personId)` call; a
 * non-default family routes to the canonical
 * `archiveProfileForFamily(familyScopedId, personId)` endpoint. The cache
 * invalidation is family-exact for a non-default family.
 */
export function useArchiveProfile() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_4> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.archiveProfile(personId)
        : actor.archiveProfileForFamily(familyScopedId, personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        archivedProfilesInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        archivedProfileIdsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Restores an archived profile back into the active family tree.
 *
 * The default family keeps the exact legacy `restoreProfile(personId)` call; a
 * non-default family routes to the canonical
 * `restoreProfileForFamily(familyScopedId, personId)` endpoint. The cache
 * invalidation is family-exact for a non-default family.
 */
export function useRestoreProfile() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<Result_4> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.restoreProfile(personId)
        : actor.restoreProfileForFamily(familyScopedId, personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        archivedProfilesInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        archivedProfileIdsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Lists the person ids currently in the archive (non-steward-gated). Used by
 * the normal family browsing pages to hide archived profiles.
 *
 * The default family keeps the exact legacy `listArchivedProfileIds()` call and
 * bare query key; a non-default family routes to the canonical
 * `listArchivedProfileIdsForFamily(familyScopedId)` endpoint with the family id
 * appended to the key so caches are family-separated.
 */
export function useListArchivedProfileIds() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "archivedProfileIds"]
        : ["governance", "archivedProfileIds", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as string[];
      return familyScopedId === undefined
        ? actor.listArchivedProfileIds()
        : actor.listArchivedProfileIdsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Lists the profiles currently in the archive.
 *
 * The default family keeps the exact legacy `listArchivedProfiles()` call and
 * bare query key; a non-default family routes to the canonical
 * `listArchivedProfilesForFamily(familyScopedId)` endpoint with the family id
 * appended to the key so caches are family-separated.
 */
export function useListArchivedProfiles() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "archivedProfiles"]
        : ["governance", "archivedProfiles", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listArchivedProfiles()
        : actor.listArchivedProfilesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Permanently deletes a profile (requires explicit confirmation).
 *
 * The default family keeps the exact legacy
 * `permanentlyDeleteProfile(personId, confirmation)` call; a non-default family
 * routes to the canonical
 * `permanentlyDeleteProfileForFamily(familyScopedId, personId, confirmation)`
 * endpoint. The cache invalidation is family-exact for a non-default family.
 */
export function usePermanentlyDeleteProfile() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      confirmation,
    }: {
      personId: string;
      confirmation: boolean;
    }): Promise<Result_15> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.permanentlyDeleteProfile(personId, confirmation)
        : actor.permanentlyDeleteProfileForFamily(
            familyScopedId,
            personId,
            confirmation,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        archivedProfilesInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        archivedProfileIdsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Lists the candidate duplicate profile pairs for steward review.
 *
 * The default family keeps the exact legacy `listDuplicateCandidates()` call
 * and bare query key; a non-default family routes to the canonical
 * `listDuplicateCandidatesForFamily(familyScopedId)` endpoint with the family id
 * appended to the key so caches are family-separated.
 */
export function useListDuplicateCandidates() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "duplicateCandidates"]
        : ["governance", "duplicateCandidates", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as DuplicatePair[];
      return familyScopedId === undefined
        ? actor.listDuplicateCandidates()
        : actor.listDuplicateCandidatesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Marks two profiles as NOT duplicates, dismissing the candidate pair.
 *
 * The default family keeps the exact legacy `notDuplicate(personIdA, personIdB)`
 * call; a non-default family routes to the canonical
 * `notDuplicateForFamily(familyScopedId, personIdA, personIdB)` endpoint. The
 * cache invalidation is family-exact for a non-default family.
 */
export function useNotDuplicate() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personIdA,
      personIdB,
    }: {
      personIdA: string;
      personIdB: string;
    }): Promise<Result_16> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.notDuplicate(personIdA, personIdB)
        : actor.notDuplicateForFamily(familyScopedId, personIdA, personIdB);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        duplicateCandidatesInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Merges two duplicate profiles into a single canonical profile.
 *
 * The default family keeps the exact legacy
 * `mergeProfiles(canonicalPersonId, mergedAwayPersonId)` call; a non-default
 * family routes to the canonical
 * `mergeProfilesForFamily(familyScopedId, canonicalPersonId,
 * mergedAwayPersonId)` endpoint. The cache invalidation is family-exact for a
 * non-default family.
 */
export function useMergeProfiles() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      canonicalPersonId,
      mergedAwayPersonId,
    }: {
      canonicalPersonId: string;
      mergedAwayPersonId: string;
    }): Promise<Result_18> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.mergeProfiles(canonicalPersonId, mergedAwayPersonId)
        : actor.mergeProfilesForFamily(
            familyScopedId,
            canonicalPersonId,
            mergedAwayPersonId,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        duplicateCandidatesInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Resolves a merge conflict by choosing the canonical value for a field.
 *
 * The default family keeps the exact legacy
 * `resolveMergeConflict(conflictId, canonicalValue)` call; a non-default family
 * routes to the canonical
 * `resolveMergeConflictForFamily(familyScopedId, conflictId, canonicalValue)`
 * endpoint. The cache invalidation is family-exact for a non-default family.
 */
export function useResolveMergeConflict() {
  const familyScopedId = useFamilyScopedId();
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
      return familyScopedId === undefined
        ? actor.resolveMergeConflict(conflictId, canonicalValue)
        : actor.resolveMergeConflictForFamily(
            familyScopedId,
            conflictId,
            canonicalValue,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        duplicateCandidatesInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Invalidation filter for the direct relationship-management list caches of the
 * active family.
 *
 * The relationship read key carries the person id at index 2 and, for a
 * non-default family, the family id at index 3:
 * `["governance", "relationships", personId]` (default) and
 * `["governance", "relationships", personId, familyScopedId]` (non-default).
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["governance", "relationships"]` filter would also match another family's
 * keys. The default family keeps the exact legacy bare prefix (its keys carry
 * no family slot, so no non-default key can match it). A non-default family
 * keeps the bare prefix (so the recorded filter shape is unchanged) but narrows
 * it with a predicate that admits only the active family's keys
 * (`queryKey[3] === familyScopedId`), never a bare cross-family prefix.
 *
 * The active family id is always the centralized `useFamilyScopedId()` value;
 * no family id is hard-coded here.
 */
export function relationshipListInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["governance", "relationships"] };
  }
  return {
    queryKey: ["governance", "relationships"],
    predicate: (query) => query.queryKey[3] === familyScopedId,
  };
}

/**
 * Invalidation filter for a single person's relationship list cache of the
 * active family. The default family keeps the exact legacy
 * `["governance", "relationships", personId]` key; a non-default family targets
 * the family-appended `["governance", "relationships", personId, familyScopedId]`
 * key so another family's cache for the same person is never touched.
 */
export function relationshipPersonInvalidation(
  familyScopedId: string | undefined,
  personId: string,
): InvalidateQueryFilters {
  return familyScopedId === undefined
    ? { queryKey: ["governance", "relationships", personId] }
    : {
        queryKey: ["governance", "relationships", personId, familyScopedId],
      };
}

/**
 * Lists the confirmed relationships for a person.
 *
 * The default family keeps the exact legacy `listPersonRelationships(personId)`
 * call; a non-default family routes to the canonical
 * `listPersonRelationshipsForFamily(familyScopedId, personId)` endpoint. The
 * family id is included in the query key for a non-default family so the caches
 * are family-separated and a mutation in one family never invalidates another
 * family's read.
 */
export function useListPersonRelationships(personId: string) {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "relationships", personId]
        : ["governance", "relationships", personId, familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Relationship[];
      return familyScopedId === undefined
        ? actor.listPersonRelationships(personId)
        : actor.listPersonRelationshipsForFamily(familyScopedId, personId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Adds a relationship between two people.
 *
 * The default family keeps the exact legacy `addRelationship(...)` call; a
 * non-default family routes to the canonical
 * `addRelationshipForFamily(familyScopedId, ...)` endpoint. The payload shape
 * and the invalidation surface are preserved, with the relationship-list
 * invalidation made family-exact for a non-default family.
 */
export function useAddRelationship() {
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
      relationshipType: RelationshipType;
    }): Promise<Result_41> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.addRelationship(fromPersonId, toPersonId, relationshipType)
        : actor.addRelationshipForFamily(
            familyScopedId,
            fromPersonId,
            toPersonId,
            relationshipType,
          );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries(
        relationshipPersonInvalidation(familyScopedId, variables.fromPersonId),
      );
      void queryClient.invalidateQueries(
        relationshipPersonInvalidation(familyScopedId, variables.toPersonId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Removes a relationship by its id.
 *
 * The default family keeps the exact legacy `removeRelationship(relationshipId)`
 * call; a non-default family routes to the canonical
 * `removeRelationshipForFamily(familyScopedId, relationshipId)` endpoint. The
 * cache invalidation is family-exact for a non-default family, so a non-default
 * family's mutation never invalidates another family's caches.
 */
export function useRemoveRelationship() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (relationshipId: bigint): Promise<Result_11> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.removeRelationship(relationshipId)
        : actor.removeRelationshipForFamily(familyScopedId, relationshipId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        relationshipListInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Corrects the type of an existing relationship.
 *
 * The default family keeps the exact legacy
 * `correctRelationshipType(relationshipId, relationshipType)` call; a
 * non-default family routes to the canonical
 * `correctRelationshipTypeForFamily(familyScopedId, relationshipId,
 * relationshipType)` endpoint. The cache invalidation is family-exact for a
 * non-default family, so a non-default family's mutation never invalidates
 * another family's caches.
 */
export function useCorrectRelationshipType() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      relationshipId,
      relationshipType,
    }: {
      relationshipId: bigint;
      relationshipType: RelationshipType;
    }): Promise<Result_41> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.correctRelationshipType(relationshipId, relationshipType)
        : actor.correctRelationshipTypeForFamily(
            familyScopedId,
            relationshipId,
            relationshipType,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        relationshipListInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        governanceAuditHistoryInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Lists the steward-only audit history.
 *
 * The default family keeps the exact legacy `listAuditHistory()` call and bare
 * query key; a non-default family routes to the canonical
 * `listAuditHistoryForFamily(familyScopedId)` endpoint with the family id
 * appended to the key so caches are family-separated.
 */
export function useListAuditHistory() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "auditHistory"]
        : ["governance", "auditHistory", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as AuditEntry[];
      return familyScopedId === undefined
        ? actor.listAuditHistory()
        : actor.listAuditHistoryForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Returns the merged Family Steward Audit History: governance audit entries
 * plus research conflict-resolution actions, merged chronologically as
 * StewardAuditEntry[]. Conflict-resolution actions (Keep Existing, Replace
 * Existing, Preserve Both/Unresolved, Needs Research) appear once alongside
 * the existing governance entries without duplication.
 *
 * Follows the same family fork as the research audit log: the default family
 * keeps the exact legacy no-argument call shape and React Query key, while a
 * non-default family routes to the canonical `getStewardAuditHistoryForFamily`
 * endpoint with the familyId included in the key so caches never collide
 * across families.
 */
export function useGetStewardAuditHistory() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["governance", "stewardAuditHistory"]
        : ["governance", "stewardAuditHistory", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as StewardAuditEntry[];
      return familyScopedId === undefined
        ? actor.getStewardAuditHistory()
        : actor.getStewardAuditHistoryForFamily(familyScopedId);
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
  StewardAuditEntry,
  StewardIdentity,
  StewardRecord,
  SuccessorDesignation,
};
