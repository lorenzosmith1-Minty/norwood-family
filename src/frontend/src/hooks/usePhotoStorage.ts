import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  QueryClientContext,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useContext, useEffect, useRef } from "react";

/**
 * The graph-only person who has no seeded profile photo. On first load the
 * frontend uploads a bundled portrait asset for this person and sets it as the
 * profile photo so the canonical photo resolver (useCanonicalPerson ->
 * useProfilePhoto) finds it and every card surface renders the real photo.
 */
const LORENZO_SMITH_JR_ID = "lorenzoSmithJr";

/** Bundled portrait asset uploaded for lorenzoSmithJr on first load. */
const LORENZO_SMITH_JR_PORTRAIT_SRC =
  "/assets/generated/lorenzo-smith-jr-portrait.dim_800x900.png";

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

/**
 * Idempotently ensures lorenzoSmithJr has a real profile photo uploaded to
 * object storage and set as the profile photo. On first load, when the
 * canonical profile-photo resolver finds no photo for lorenzoSmithJr, this
 * uploads the bundled portrait asset and sets it as the profile photo so the
 * canonical resolver (useCanonicalPerson -> useProfilePhoto) finds it and every
 * card surface (e.g. the child card on Lorenzo Smith Sr.'s profile) renders the
 * real photo immediately.
 *
 * The upload is idempotent: it only uploads/sets when lorenzoSmithJr does not
 * already have a profile photo, and it never overwrites a photo the user has
 * since chosen. It is best-effort — if the upload fails, the canonical resolver
 * falls back to the initials placeholder with no user-facing error.
 *
 * Must be mounted only when the provider tree is present (production), since it
 * depends on the React Query-backed photo hooks.
 */
export function useEnsureLorenzoProfilePhoto(): void {
  const providersPresent = useProvidersPresent();
  const { data: profilePhoto, isLoading } =
    useProfilePhoto(LORENZO_SMITH_JR_ID);
  const addPhoto = useAddPhoto();
  const setProfilePhoto = useSetProfilePhoto();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!providersPresent || isLoading || attemptedRef.current) return;
    // A profile photo already exists — nothing to upload or set.
    if (profilePhoto) {
      attemptedRef.current = true;
      return;
    }
    attemptedRef.current = true;
    void (async () => {
      try {
        const response = await fetch(LORENZO_SMITH_JR_PORTRAIT_SRC);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const blob = ExternalBlob.fromBytes(
          bytes,
          "image/png",
          "lorenzo-smith-jr.png",
        );
        const photo = await addPhoto.mutateAsync({
          personId: LORENZO_SMITH_JR_ID,
          blob,
          filename: "lorenzo-smith-jr.png",
          mimeType: "image/png",
        });
        await setProfilePhoto.mutateAsync({
          personId: LORENZO_SMITH_JR_ID,
          photoId: photo.id,
        });
      } catch {
        // Best-effort bootstrap: on failure the canonical resolver keeps the
        // initials placeholder. No user-facing error is surfaced.
      }
    })();
  }, [providersPresent, isLoading, profilePhoto, addPhoto, setProfilePhoto]);
}
