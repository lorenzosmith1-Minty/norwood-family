import { ClaimStatus, createActor } from "@/backend";
import type {
  PersonMatch,
  PersonProfile,
  ProfileClaim,
  ProfileEdits,
} from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  notificationInvalidation,
  useReconcileClaimNotifications,
} from "./useNotifications";

/**
 * React Query hooks for the profile-claim and owner-editing workflows,
 * following the existing useActor(createActor) + useQuery/useMutation pattern
 * used by usePhotoStorage and useArchiveStorage. Every operation goes through
 * the real backend actor; no local persistence is used.
 *
 * Tenancy 1C-A: each hook accepts an optional `familyId`. When supplied it
 * routes to the family-scoped backend endpoint (`*ForFamily`); when omitted it
 * calls the legacy default-family endpoint unchanged, so existing default-family
 * behavior is preserved exactly. Callers pass the active family from
 * `useActiveFamilyId()`.
 */

/**
 * Fetches the backend profile record for a person (living/claim status, owner).
 * An optional `enabled` flag lets callers defer the query until a person id is
 * known (e.g. the navbar identity hook, which only queries once it has resolved
 * the caller's own profile id).
 */
export function usePersonProfile(
  personId: string,
  options?: { enabled?: boolean; familyId?: string },
) {
  const { actor, isFetching } = useActor(createActor);
  const familyId = options?.familyId;
  return useQuery({
    queryKey: ["personProfile", familyId ?? null, personId],
    queryFn: async () => {
      if (!actor) return null;
      return familyId
        ? actor.getPersonProfileForFamily(familyId, personId)
        : actor.getPersonProfile(personId);
    },
    enabled: (options?.enabled ?? true) && !!actor && !isFetching,
  });
}

/**
 * Read-only view of a person profile's global claim state (whether the profile
 * already has an approved owner), derived from the existing public
 * getPersonProfile query. It exposes only the generic claimed/unclaimed signal
 * — never the owner principal — so non-admin UI (the Add Myself match cards)
 * can show an "Already claimed" state without leaking account identity.
 *
 * Reuses the same ["personProfile", familyId, personId] query key as
 * usePersonProfile, so it shares the cache and adds no extra backend endpoint.
 */
export function usePersonClaimStatus(personId: string, familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["personProfile", familyId ?? null, personId],
    queryFn: async () => {
      if (!actor) return null;
      return familyId
        ? actor.getPersonProfileForFamily(familyId, personId)
        : actor.getPersonProfile(personId);
    },
    enabled: !!actor && !isFetching,
    select: (profile) => ({
      isClaimed: profile?.claimStatus === ClaimStatus.Claimed,
    }),
  });
}

/**
 * Fetches the current signed-in caller's own claim on a specific profile (or
 * null). Unlike useListProfileClaims, this endpoint is NOT admin-gated, so it
 * is safe to call from non-admin UI (ClaimButton, PersonProfilePage) to detect
 * a pending claim by the current user without trapping for regular users.
 */
export function useMyProfileClaim(personId: string, familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myProfileClaim", familyId ?? null, personId],
    queryFn: async () => {
      if (!actor) return null;
      return familyId
        ? actor.getMyProfileClaimForFamily(familyId, personId)
        : actor.getMyProfileClaim(personId);
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Fetches the current signed-in caller's own linked/claimed profile, or their
 * createMyself-keyed / pending-claim profile, or null when none exists. Unlike
 * useListProfileClaims, this endpoint is NOT admin-gated, so it is safe to call
 * from non-admin UI (the navbar identity hook) to resolve the caller's own
 * display name without trapping for regular users.
 */
export function useMyProfile(familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myProfile", familyId ?? null],
    queryFn: async () => {
      if (!actor) return null;
      return familyId
        ? actor.getMyProfileForFamily(familyId)
        : actor.getMyProfile();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Lists every profile claim record (used by the Family Steward review area). */
export function useListProfileClaims(familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["profileClaims", familyId ?? null],
    queryFn: async () => {
      if (!actor) return [] as ProfileClaim[];
      return familyId
        ? actor.listProfileClaimsForFamily(familyId)
        : actor.listProfileClaims();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Submits a pending profile claim for a person. Requires sign-in; the claim
 * does not grant ownership until approved by a Family Steward.
 */
export function useRequestProfileClaim(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.requestProfileClaimForFamily(familyId, personId)
        : actor.requestProfileClaim(personId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileClaims"] });
      void queryClient.invalidateQueries({ queryKey: ["personProfile"] });
      // The caller's own claim and identity change the moment a claim is
      // submitted: the ClaimButton must immediately surface the pending state
      // (hiding 'This is Me' to prevent a duplicate submission) and the navbar
      // identity must resolve the newly pending profile.
      void queryClient.invalidateQueries({ queryKey: ["myProfileClaim"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // A pending claim is a steward-review action, so the Pending
      // Contributions badge and the steward aggregate badge must refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Approves a pending profile claim, granting the user ownership. */
export function useApproveProfileClaim(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  const reconcile = useReconcileClaimNotifications();
  return useMutation({
    mutationFn: async (claimId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.approveProfileClaimForFamily(familyId, claimId)
        : actor.approveProfileClaim(claimId);
    },
    onSuccess: (_data, claimId) => {
      // Reconcile stale claim notifications so the pending ProfileClaimRequested
      // notification for the claimant is marked resolved/read now that the claim
      // is approved. Best-effort: a reconcile failure must never roll back the
      // approval itself.
      void reconcile.mutateAsync(claimId).catch(() => {
        // ignore reconcile failure
      });
      void queryClient.invalidateQueries({ queryKey: ["profileClaims"] });
      void queryClient.invalidateQueries({ queryKey: ["personProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfileClaim"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Approving/rejecting a claim removes it from the steward-review queue,
      // so the Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Rejects a pending profile claim, recording the reviewer and reviewed date. */
export function useRejectProfileClaim(familyId?: string) {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.rejectProfileClaimForFamily(familyId, claimId)
        : actor.rejectProfileClaim(claimId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileClaims"] });
      void queryClient.invalidateQueries({ queryKey: ["personProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfileClaim"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
      // Approving/rejecting a claim removes it from the steward-review queue,
      // so the Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/**
 * Searches existing family data for possible matches to a name, returning
 * each match's name, id, and parents when known. Used by the Add Myself flow.
 */
export function useSearchPossibleMatches(familyId?: string) {
  const { actor } = useActor(createActor);
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.searchPossibleMatchesForFamily(familyId, name)
        : actor.searchPossibleMatches(name);
    },
  });
}

/**
 * Creates a minimal person profile for the current user when no existing
 * match exists. The new profile is not inserted into the shared graph until a
 * proposed connection is confirmed.
 */
export function useCreateMyself(familyId?: string) {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.createMyselfForFamily(familyId, name)
        : actor.createMyself(name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["personProfile"] });
    },
  });
}

/**
 * Updates the current user's own approved personal-profile fields (photo,
 * preferred name, story, occupation, birth info, timeline, privacy settings).
 * Only the owner of a claimed living profile may edit.
 *
 * On success it invalidates every query key that consumes shared profile data
 * so a saved edit propagates immediately to the navbar identity (myProfile),
 * the profile page (personProfile), the family exploration views
 * (confirmedRelationships / myRelationshipRequests), and the photo gallery
 * (photos / profilePhoto).
 */
export function useUpdateOwnProfile(familyId?: string) {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      edits,
    }: {
      personId: string;
      edits: ProfileEdits;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.updateOwnProfileForFamily(familyId, personId, edits)
        : actor.updateOwnProfile(personId, edits);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["personProfile"],
      });
      // The navbar identity resolves from myProfile (preferredName || name),
      // so a display-name edit must refresh it immediately.
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfileClaim"] });
      void queryClient.invalidateQueries({ queryKey: ["profileClaims"] });
      // Shared family data and photo state are consumed across the profile,
      // Explore Family, Family Tree, and Heritage views.
      void queryClient.invalidateQueries({
        queryKey: ["confirmedRelationships"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["myRelationshipRequests"],
      });
      // Invalidate the exact scoped photo keys for the edited person so the
      // gallery and profile-photo surfaces refresh without over-invalidating
      // every family/person entry. The default family keeps the legacy
      // two-element key shape.
      void queryClient.invalidateQueries({
        queryKey: familyId
          ? ["photos", familyId, variables.personId]
          : ["photos", variables.personId],
      });
      void queryClient.invalidateQueries({
        queryKey: familyId
          ? ["profilePhoto", familyId, variables.personId]
          : ["profilePhoto", variables.personId],
      });
    },
  });
}

export type { PersonMatch, PersonProfile, ProfileClaim };
