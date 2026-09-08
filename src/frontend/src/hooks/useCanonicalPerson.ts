import { resolveBackendDisplayName } from "../types/family";
import { useProfilePhoto } from "./usePhotoStorage";
import { usePersonProfile } from "./useProfileClaims";

/**
 * The canonical, single-source-of-truth person data that every PersonCard
 * variant resolves from. Given a personId, this resolves the display name and
 * profile photo directly from the shared backend Person Profile record (keyed
 * by personId) and the object-storage profile photo, so an edit to the claimed
 * profile (e.g. a preferred-name change or a new profile photo) propagates to
 * every card that shows that person without any manual card edits.
 */
export interface CanonicalPerson {
  /**
   * The canonical display name for the person. When a backend canonical
   * profile record exists, this is the preferredName-first name resolved via
   * resolveBackendDisplayName. When no backend record exists, it falls back to
   * the caller-supplied inline name (which the pages already resolve from the
   * static `profiles` record / canonical display-name map).
   */
  displayName: string;
  /**
   * The canonical profile photo URL from the durable object-storage store, or
   * null when no real profile photo exists (so the initials placeholder shows).
   * Reactive to setProfilePhoto/removePhoto via React Query invalidation.
   */
  profilePhotoUrl: string | null;
  /**
   * True when a backend canonical Person Profile record exists for this
   * person. When true, the card must trust the canonical photo (real photo or
   * initials placeholder) rather than falling back to inline/static portrait
   * data. When false, the card falls back to the inline person data.
   */
  hasCanonicalProfile: boolean;
  /** True while the backend profile/photo are still resolving. */
  isLoading: boolean;
}

/**
 * Resolve the canonical person data for a personId. Fetches the backend
 * profile via usePersonProfile and the profile photo via useProfilePhoto, and
 * merges with the caller's inline fallback name for people who have no backend
 * canonical record. Both queries are React Query-backed, so they are reactive
 * to updateOwnProfile / setProfilePhoto / removePhoto invalidation.
 *
 * When no personId is supplied, there is no backend to resolve from, so the
 * inline fallback is returned unchanged (the profile query is disabled and the
 * photo query resolves to null for the empty id).
 */
export function useCanonicalPerson(
  personId: string | undefined,
  fallbackName: string,
): CanonicalPerson {
  const { data: backendProfile } = usePersonProfile(personId ?? "", {
    enabled: Boolean(personId),
  });
  const { data: profilePhoto, isLoading: photoLoading } = useProfilePhoto(
    personId ?? "",
  );

  const hasCanonicalProfile = Boolean(backendProfile);
  const displayName = backendProfile
    ? resolveBackendDisplayName(personId ?? "", backendProfile)
    : fallbackName;
  const profilePhotoUrl = profilePhoto
    ? profilePhoto.blob.getDirectURL()
    : null;

  // The loading state is driven ONLY by the pending profile-photo query. Once
  // the photo query resolves (even to null), isLoading becomes false and the
  // component falls back to initials when there is genuinely no photo. This
  // keeps the loading skeleton while async photo data is being fetched (for
  // profiles that DO have a photo) while allowing photo-less profiles to
  // resolve to initials instead of a permanent skeleton.
  const photoPending = photoLoading;

  return {
    displayName,
    profilePhotoUrl,
    hasCanonicalProfile,
    isLoading: Boolean(personId) && photoPending,
  };
}
