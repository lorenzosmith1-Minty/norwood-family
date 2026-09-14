import type { PersonProfile as BackendPersonProfile } from "@/backend";
import type { PersonProfile } from "../types/family";
import { resolveBackendDisplayName } from "../types/family";
import { ClaimStatus } from "../types/ownership";
import { useProfilePhoto } from "./usePhotoStorage";
import { usePersonProfile } from "./useProfileClaims";

/**
 * The single canonical Person read adapter used by BOTH the profile display and
 * the profile editor. Given the backend PersonProfile record (the source of
 * truth for owner-editable fields) and the static canonical PersonProfile (the
 * display record), it resolves the canonical frontend PersonProfile that the
 * profile page renders and that the editor initializes from — so the editor
 * never maintains a separate, incomplete copy of profile data.
 *
 * Field priority (requirement): new editable value -> canonical/legacy Person
 * value -> empty only if truly unknown. The backend record wins for every field
 * it owns; the static canonical record fills the gaps for seeded profiles whose
 * backend record carries only `name`. No facts are inferred or invented.
 */
export function resolveCanonicalPersonProfile(
  backend: BackendPersonProfile,
  canonical?: PersonProfile,
): PersonProfile {
  if (!canonical) {
    // No static canonical record (a genuinely new account-owned profile or a
    // graph-only node): build the display record from the backend alone.
    const name = backend.preferredName || backend.name;
    const isClaimed = backend.claimStatus === ClaimStatus.Claimed;
    const facts: PersonProfile["facts"] = [];
    if (backend.birthDate)
      facts.push({ label: "Born", value: backend.birthDate });
    if (backend.birthplace)
      facts.push({ label: "Birthplace", value: backend.birthplace });
    if (backend.currentLocation)
      facts.push({ label: "Location", value: backend.currentLocation });
    if (backend.occupation)
      facts.push({ label: "Occupation", value: backend.occupation });
    const story =
      backend.shortBio || backend.longerStory || backend.story || "";
    return {
      id: backend.personId,
      name,
      role: isClaimed ? "Family member" : "Pending profile",
      portrait: { src: "", alt: `Profile for ${name}` },
      facts,
      story,
      family: { spouseName: "", spouseRole: "", childrenText: "" },
      timeline: (backend.timeline ?? []).map((text, index) => ({
        date: "",
        title: `Timeline entry ${index + 1}`,
        detail: text,
      })),
      sources: [],
    };
  }

  // Merge the backend editable fields into the canonical display record. The
  // backend record is the source of truth and wins; the canonical record fills
  // the gaps for seeded profiles whose backend record carries only `name`.
  const facts = [...canonical.facts];
  const upsertFact = (label: string, value: string) => {
    const idx = facts.findIndex((fact) => fact.label === label);
    if (idx >= 0) facts[idx] = { label, value };
    else facts.push({ label, value });
  };
  if (backend.birthDate) upsertFact("Born", backend.birthDate);
  if (backend.birthplace) upsertFact("Birthplace", backend.birthplace);
  if (backend.currentLocation) upsertFact("Location", backend.currentLocation);
  if (backend.occupation) upsertFact("Occupation", backend.occupation);
  const story = backend.shortBio || backend.longerStory || canonical.story;
  const timeline = backend.timeline?.length
    ? backend.timeline.map((text, index) => ({
        date: "",
        title: `Timeline entry ${index + 1}`,
        detail: text,
      }))
    : canonical.timeline;
  return {
    ...canonical,
    name: backend.preferredName || canonical.name,
    facts,
    story,
    timeline,
  };
}

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
