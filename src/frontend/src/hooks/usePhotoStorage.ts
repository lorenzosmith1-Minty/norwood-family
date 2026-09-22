import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import type { ExternalBlob } from "@caffeineai/object-storage";
import {
  QueryClientContext,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useContext } from "react";

/**
 * True when the app runs inside the provider tree (production). Bare test
 * renders have no QueryClient, so the photo features degrade to safe defaults
 * instead of throwing. Components that call the backend-backed hooks below
 * must be gated on this so they only mount when the providers are present.
 */
export function useProvidersPresent(): boolean {
  return useContext(QueryClientContext) !== undefined;
}

/**
 * Tenancy 1C-A: each photo hook accepts an optional `familyId`. When supplied
 * it routes to the family-scoped backend endpoint (`*ForFamily`); when omitted
 * it calls the legacy default-family endpoint unchanged, so existing
 * default-family behavior is preserved exactly. Callers pass the active family
 * from `useActiveFamilyId()`.
 */

/**
 * Builds the exact React Query key for a person's photo data. For the default
 * family (`familyId` undefined) this is the legacy two-element key
 * `["photos", personId]`; for a non-default family it is the family-scoped
 * three-element key `["photos", familyId, personId]`. Mutations invalidate the
 * same key the read hooks register, so the default-family invalidation contract
 * is preserved byte-for-byte.
 */
function photoQueryKey(
  prefix: "photos" | "profilePhoto",
  familyId: string | undefined,
  personId: string,
): unknown[] {
  return familyId ? [prefix, familyId, personId] : [prefix, personId];
}

/** Lists every uploaded photo for a person's gallery. */
export function usePhotos(personId: string, familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: photoQueryKey("photos", familyId, personId),
    queryFn: async () => {
      if (!actor) return [];
      return familyId
        ? actor.listPhotosForFamily(familyId, personId)
        : actor.listPhotos(personId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Returns the currently selected profile photo for a person, if any. */
export function useProfilePhoto(personId: string, familyId?: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: photoQueryKey("profilePhoto", familyId, personId),
    queryFn: async () => {
      if (!actor) return null;
      return familyId
        ? actor.getProfilePhotoForFamily(familyId, personId)
        : actor.getProfilePhoto(personId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Uploads a new photo to a person's gallery with progress feedback. */
export function useAddPhoto(familyId?: string) {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      blob,
      filename,
      mimeType,
    }: {
      personId: string;
      blob: ExternalBlob;
      filename: string;
      mimeType: string;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.addPhotoForFamily(familyId, personId, filename, mimeType, blob)
        : actor.addPhoto(personId, filename, mimeType, blob);
    },
    onSuccess: (_data, variables) => {
      // Invalidate the exact scoped keys the gallery and profile-photo queries
      // read, so the mutation refreshes precisely the affected person's data
      // without over-invalidating every family/person entry.
      void queryClient.invalidateQueries({
        queryKey: photoQueryKey("photos", familyId, variables.personId),
      });
      // A newly added photo may have been auto-selected as the profile photo,
      // so refresh the profile-photo state immediately.
      void queryClient.invalidateQueries({
        queryKey: photoQueryKey("profilePhoto", familyId, variables.personId),
      });
    },
  });
}

/** Removes a photo from a person's gallery. */
export function useRemovePhoto(familyId?: string) {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      photoId,
    }: {
      personId: string;
      photoId: bigint;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.removePhotoForFamily(familyId, personId, photoId)
        : actor.removePhoto(personId, photoId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: photoQueryKey("photos", familyId, variables.personId),
      });
      // Removing the current profile photo restores the initials placeholder,
      // so refresh the profile-photo state immediately.
      void queryClient.invalidateQueries({
        queryKey: photoQueryKey("profilePhoto", familyId, variables.personId),
      });
    },
  });
}

/** Selects one of a person's uploaded photos as their profile photo. */
export function useSetProfilePhoto(familyId?: string) {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      photoId,
    }: {
      personId: string;
      photoId: bigint;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyId
        ? actor.setProfilePhotoForFamily(familyId, personId, photoId)
        : actor.setProfilePhoto(personId, photoId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: photoQueryKey("photos", familyId, variables.personId),
      });
      void queryClient.invalidateQueries({
        queryKey: photoQueryKey("profilePhoto", familyId, variables.personId),
      });
    },
  });
}
