import { createActor } from "@/backend";
import type {
  PersonMatch,
  PersonProfile,
  ProfileClaim,
  ProfileEdits,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * React Query hooks for the profile-claim and owner-editing workflows,
 * following the existing useActor(createActor) + useQuery/useMutation pattern
 * used by usePhotoStorage and useArchiveStorage. Every operation goes through
 * the real backend actor; no local persistence is used.
 */

/**
 * Fetches the backend profile record for a person (living/claim status, owner).
 * An optional `enabled` flag lets callers defer the query until a person id is
 * known (e.g. the navbar identity hook, which only queries once it has resolved
 * the caller's own profile id).
 */
export function usePersonProfile(
  personId: string,
  options?: { enabled?: boolean },
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["personProfile", personId],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getPersonProfile(personId);
    },
    enabled: (options?.enabled ?? true) && !!actor && !isFetching,
  });
}

/**
 * Fetches the current signed-in caller's own claim on a specific profile (or
 * null). Unlike useListProfileClaims, this endpoint is NOT admin-gated, so it
 * is safe to call from non-admin UI (ClaimButton, PersonProfilePage) to detect
 * a pending claim by the current user without trapping for regular users.
 */
export function useMyProfileClaim(personId: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myProfileClaim", personId],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getMyProfileClaim(personId);
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
export function useMyProfile() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myProfile"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getMyProfile();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Lists every profile claim record (used by the Family Steward review area). */
export function useListProfileClaims() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["profileClaims"],
    queryFn: async () => {
      if (!actor) return [] as ProfileClaim[];
      return actor.listProfileClaims();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Submits a pending profile claim for a person. Requires sign-in; the claim
 * does not grant ownership until approved by a Family Steward.
 */
export function useRequestProfileClaim() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.requestProfileClaim(personId);
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
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // A pending claim is a steward-review action, so the Pending
      // Contributions badge and the steward aggregate badge must refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Approves a pending profile claim, granting the user ownership. */
export function useApproveProfileClaim() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveProfileClaim(claimId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileClaims"] });
      void queryClient.invalidateQueries({ queryKey: ["personProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfileClaim"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // Approving/rejecting a claim removes it from the steward-review queue,
      // so the Pending Contributions badge and steward aggregate badge refresh.
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Rejects a pending profile claim, recording the reviewer and reviewed date. */
export function useRejectProfileClaim() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectProfileClaim(claimId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileClaims"] });
      void queryClient.invalidateQueries({ queryKey: ["personProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfileClaim"] });
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
export function useSearchPossibleMatches() {
  const { actor } = useActor(createActor);
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.searchPossibleMatches(name);
    },
  });
}

/**
 * Creates a minimal person profile for the current user when no existing
 * match exists. The new profile is not inserted into the shared graph until a
 * proposed connection is confirmed.
 */
export function useCreateMyself() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createMyself(name);
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
export function useUpdateOwnProfile() {
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
      return actor.updateOwnProfile(personId, edits);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["personProfile", variables.personId],
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
      void queryClient.invalidateQueries({
        queryKey: ["photos", variables.personId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["profilePhoto", variables.personId],
      });
    },
  });
}

export type { PersonMatch, PersonProfile, ProfileClaim };
