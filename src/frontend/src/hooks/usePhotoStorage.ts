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

/** Lists every uploaded photo for a person's gallery. */
export function usePhotos(personId: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["photos", personId],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPhotos(personId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Returns the currently selected profile photo for a person, if any. */
export function useProfilePhoto(personId: string) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["profilePhoto", personId],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getProfilePhoto(personId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Uploads a new photo to a person's gallery with progress feedback. */
export function useAddPhoto() {
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
      return actor.addPhoto(personId, filename, mimeType, blob);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["photos", variables.personId],
      });
      // A newly added photo may have been auto-selected as the profile photo,
      // so refresh the profile-photo state immediately.
      void queryClient.invalidateQueries({
        queryKey: ["profilePhoto", variables.personId],
      });
    },
  });
}

/** Removes a photo from a person's gallery. */
export function useRemovePhoto() {
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
      return actor.removePhoto(personId, photoId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["photos", variables.personId],
      });
      // Removing the current profile photo restores the initials placeholder,
      // so refresh the profile-photo state immediately.
      void queryClient.invalidateQueries({
        queryKey: ["profilePhoto", variables.personId],
      });
    },
  });
}

/** Selects one of a person's uploaded photos as their profile photo. */
export function useSetProfilePhoto() {
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
      return actor.setProfilePhoto(personId, photoId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["photos", variables.personId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["profilePhoto", variables.personId],
      });
    },
  });
}
