import { PrivacyLevel } from "@/backend";
import type {
  PersonProfile as BackendPersonProfile,
  ProfileEdits,
} from "@/backend";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RelationshipRequestForm } from "../components/RelationshipRequestForm";
import { StatusBadge } from "../components/StatusBadge";
import { useFamilyScopedId } from "../context/FamilyContext";
import { resolveCanonicalPersonProfile } from "../hooks/useCanonicalPerson";
import {
  useAddPhoto,
  usePhotos,
  useProfilePhoto,
  useProvidersPresent,
  useRemovePhoto,
  useSetProfilePhoto,
} from "../hooks/usePhotoStorage";
import {
  usePersonProfile,
  useUpdateOwnProfile,
} from "../hooks/useProfileClaims";
import { useIsSteward } from "../hooks/useStewardAuthority";
import { sanitizeFilename, validateFile } from "../lib/fileValidation";
import {
  ClaimStatus,
  EditError,
  LivingStatus,
  PRIVACY_OPTIONS,
  type ProfileDraft,
  type TimelineDraft,
} from "../types/ownership";
import { type PersonProfile, profiles } from "./PersonProfilePage";

/**
 * Owner editing of a claimed living profile. The signed-in user whose principal
 * matches the profile's claimedByUserId can edit their own allowed fields and
 * save via updateOwnProfile. The form is a mobile-first, sectioned layout:
 * Identity, Basic Information, About, Photo, Timeline, and Privacy.
 *
 * The draft is owned in local state and autosaved to localStorage so an
 * accidental navigation or refresh does not lose work. Saving maps the draft to
 * a backend ProfileEdits and updates the shared canonical Person record — it
 * never creates a new person or rewrites family relationships. Relationship
 * changes go through the shared Relationship Request flow.
 */

const EDIT_ERROR_LABELS: Record<EditError, string> = {
  [EditError.ProfileNotFound]: "This profile could not be found.",
  [EditError.NotSignedIn]: "You need to sign in to edit your profile.",
  [EditError.NotOwner]: "Only the approved owner of this profile can edit it.",
  [EditError.DeceasedProfile]:
    "This profile is for a deceased person and cannot be edited.",
};

const SUFFIX_OPTIONS = ["", "Jr.", "Sr.", "II", "III", "IV"];

const EMPTY_DRAFT: ProfileDraft = {
  preferredName: "",
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  nickname: "",
  birthDate: "",
  birthYearOnly: false,
  birthplace: "",
  currentLocation: "",
  occupation: "",
  livingStatus: LivingStatus.Living,
  shortBio: "",
  longerStory: "",
  timeline: [],
  privacySettings: PrivacyLevel.FamilyOnly,
};

const draftKey = (personId: string) => `norwood.profile-edit.draft.${personId}`;

/** Serialize a structured timeline entry to a single free-text backend line. */
function serializeTimelineEntry(entry: TimelineDraft): string {
  const parts: string[] = [];
  if (entry.date.trim()) parts.push(entry.date.trim());
  if (entry.title.trim()) parts.push(entry.title.trim());
  const detail =
    entry.detail.trim() +
    (entry.location.trim() ? ` (${entry.location.trim()})` : "");
  if (detail) parts.push(detail);
  return parts.join(" — ");
}

/** Parse a free-text backend timeline line back into a structured entry. */
function parseTimelineLine(line: string): TimelineDraft {
  const parts = line.split(" — ");
  if (parts.length >= 2) {
    return {
      id: 0,
      date: parts[0],
      title: parts[1],
      detail: parts.slice(2).join(" — "),
      location: "",
    };
  }
  return { id: 0, date: "", title: "", detail: line, location: "" };
}

/** Look up a fact value by label from the resolved canonical profile record. */
function factValue(canonical: PersonProfile, label: string): string {
  return canonical.facts.find((fact) => fact.label === label)?.value ?? "";
}

/**
 * True when a canonical fact value represents real data rather than a
 * placeholder ("Not recorded", "Unknown", etc.). Placeholder values must never
 * be hydrated into editable fields as if they were real facts.
 */
function isMeaningfulValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return !/^(not recorded|unknown|uncertain|unresolved|none|n\/a)$/.test(v);
}

/**
 * Build the editable draft from the SAME resolved canonical Person record that
 * the profile page displays. The canonical PersonProfile is resolved through
 * the shared `resolveCanonicalPersonProfile` adapter (backend record merged
 * with the static canonical `profiles` record), so the editor initializes from
 * the exact values already shown on the profile page rather than a separate,
 * incomplete copy of the data.
 *
 * The backend record is the source of truth and always wins; the resolved
 * canonical record fills in the gaps for seeded profiles whose backend record
 * carries only `name` (all owner-editable fields null). Only the Preferred /
 * Display Name is populated from the canonical display name, and only when a
 * static canonical record exists (`hasCanonical`): for a profile with no static
 * canonical record (e.g. a createMyself profile keyed by the caller's
 * principal), the preferred name stays blank rather than being invented from
 * the backend's full `name`. The first/middle/last/suffix component fields are
 * NEVER invented from the display name: for records like Lula Mae where the
 * data model stores only a full `name`, those component fields stay blank so
 * the user can fill them in rather than guessing at name boundaries. A
 * backend-carried component value still wins.
 */
function fromPersonProfile(
  personProfile: PersonProfile,
  backend: BackendPersonProfile,
  hasCanonical: boolean,
): ProfileDraft {
  const born = factValue(personProfile, "Born");
  const birthplace = factValue(personProfile, "Birthplace");
  const location = factValue(personProfile, "Location");
  const occupation = factValue(personProfile, "Occupation");

  return {
    preferredName:
      backend.preferredName || (hasCanonical ? personProfile.name : ""),
    firstName: backend.firstName ?? "",
    middleName: backend.middleName ?? "",
    lastName: backend.lastName ?? "",
    suffix: backend.suffix ?? "",
    nickname: backend.nickname ?? "",
    birthDate: backend.birthDate || (isMeaningfulValue(born) ? born : ""),
    birthYearOnly: false,
    birthplace:
      backend.birthplace || (isMeaningfulValue(birthplace) ? birthplace : ""),
    currentLocation:
      backend.currentLocation || (isMeaningfulValue(location) ? location : ""),
    occupation:
      backend.occupation || (isMeaningfulValue(occupation) ? occupation : ""),
    livingStatus: backend.livingStatus ?? LivingStatus.Living,
    shortBio: backend.shortBio ?? "",
    longerStory: backend.longerStory || personProfile.story,
    timeline: backend.timeline?.length
      ? backend.timeline.map((line, index) => ({
          ...parseTimelineLine(line),
          id: index,
        }))
      : personProfile.timeline.map((entry, index) => ({
          id: index,
          date: entry.date,
          title: entry.title,
          detail: entry.detail,
          location: "",
        })),
    privacySettings: backend.privacySettings ?? PrivacyLevel.FamilyOnly,
  };
}

/**
 * Merge a saved local draft over the canonical hydrated draft. Non-empty saved
 * values override the canonical value; blank saved values leave the canonical
 * value intact, so a partial stale browser draft (e.g. only a suffix) never
 * blanks out the complete canonical Person data. livingStatus and
 * privacySettings always carry a value in a saved draft, so they always
 * override. The timeline is replaced only when the saved draft carries entries.
 */
function mergeDraftOverCanonical(
  canonical: ProfileDraft,
  saved: ProfileDraft,
): ProfileDraft {
  const mergeString = (savedValue: string, canonicalValue: string) =>
    savedValue.trim() !== "" ? savedValue : canonicalValue;

  return {
    preferredName: mergeString(saved.preferredName, canonical.preferredName),
    firstName: mergeString(saved.firstName, canonical.firstName),
    middleName: mergeString(saved.middleName, canonical.middleName),
    lastName: mergeString(saved.lastName, canonical.lastName),
    suffix: mergeString(saved.suffix, canonical.suffix),
    nickname: mergeString(saved.nickname, canonical.nickname),
    birthDate: mergeString(saved.birthDate, canonical.birthDate),
    birthYearOnly: saved.birthYearOnly || canonical.birthYearOnly,
    birthplace: mergeString(saved.birthplace, canonical.birthplace),
    currentLocation: mergeString(
      saved.currentLocation,
      canonical.currentLocation,
    ),
    occupation: mergeString(saved.occupation, canonical.occupation),
    livingStatus: saved.livingStatus,
    shortBio: mergeString(saved.shortBio, canonical.shortBio),
    longerStory: mergeString(saved.longerStory, canonical.longerStory),
    timeline: saved.timeline.length > 0 ? saved.timeline : canonical.timeline,
    privacySettings: saved.privacySettings,
  };
}

/**
 * True when two drafts carry identical content. Used to detect whether the
 * current draft differs from the saved Profile (the canonical hydrated draft):
 * when they match, the editor reflects the saved Profile; when they differ, a
 * local draft is pending and must be labeled as such.
 */
function draftsEqual(a: ProfileDraft, b: ProfileDraft): boolean {
  return (
    a.preferredName === b.preferredName &&
    a.firstName === b.firstName &&
    a.middleName === b.middleName &&
    a.lastName === b.lastName &&
    a.suffix === b.suffix &&
    a.nickname === b.nickname &&
    a.birthDate === b.birthDate &&
    a.birthYearOnly === b.birthYearOnly &&
    a.birthplace === b.birthplace &&
    a.currentLocation === b.currentLocation &&
    a.occupation === b.occupation &&
    a.livingStatus === b.livingStatus &&
    a.shortBio === b.shortBio &&
    a.longerStory === b.longerStory &&
    a.privacySettings === b.privacySettings &&
    JSON.stringify(a.timeline) === JSON.stringify(b.timeline)
  );
}

/**
 * True when a draft carries any actual user content. Used to distinguish a
 * genuine in-progress draft (restored from localStorage so a refresh does not
 * lose work) from a stale/empty draft that must not block hydration from the
 * canonical backend record. livingStatus and privacySettings always carry
 * defaults, so they are intentionally excluded from the content check.
 */
function hasDraftContent(draft: ProfileDraft): boolean {
  return (
    draft.preferredName.trim() !== "" ||
    draft.firstName.trim() !== "" ||
    draft.middleName.trim() !== "" ||
    draft.lastName.trim() !== "" ||
    draft.suffix.trim() !== "" ||
    draft.nickname.trim() !== "" ||
    draft.birthDate.trim() !== "" ||
    draft.birthplace.trim() !== "" ||
    draft.currentLocation.trim() !== "" ||
    draft.occupation.trim() !== "" ||
    draft.shortBio.trim() !== "" ||
    draft.longerStory.trim() !== "" ||
    draft.timeline.length > 0
  );
}

/**
 * Map the editable draft to a backend ProfileEdits payload, submitting ONLY the
 * fields the user intentionally changed. A field whose current value matches
 * the canonical record is omitted (left undefined) so the backend keeps its
 * current value — a patch-only save that never overwrites canonical data with
 * blank values. Changing only the suffix to 'II' therefore updates the suffix
 * alone and does not re-submit the other existing canonical fields.
 *
 * The comparison baseline is the SAME resolved canonical record used for
 * hydration (fromPersonProfile(resolveCanonicalPersonProfile(original,
 * canonical), original)), not the raw backend record. Seeded profiles' backend
 * record carries only `name`, so comparing against the raw backend record would
 * treat every hydrated canonical field (preferredName, currentLocation,
 * longerStory, timeline, etc.) as changed and re-submit them even when the user
 * only edits the suffix. Comparing against the resolved canonical record
 * recognizes those hydrated fields as unchanged and omits them from the patch.
 */
function toEdits(
  draft: ProfileDraft,
  original: BackendPersonProfile,
  canonical?: PersonProfile,
): ProfileEdits {
  const edits: ProfileEdits = {};
  const orig = fromPersonProfile(
    resolveCanonicalPersonProfile(original, canonical),
    original,
    Boolean(canonical),
  );

  if (draft.preferredName.trim() !== orig.preferredName) {
    edits.preferredName = draft.preferredName.trim();
  }
  if (draft.firstName.trim() !== orig.firstName) {
    edits.firstName = draft.firstName.trim();
  }
  if (draft.middleName.trim() !== orig.middleName) {
    edits.middleName = draft.middleName.trim();
  }
  if (draft.lastName.trim() !== orig.lastName) {
    edits.lastName = draft.lastName.trim();
  }
  if (draft.suffix.trim() !== orig.suffix) {
    edits.suffix = draft.suffix.trim();
  }
  if (draft.nickname.trim() !== orig.nickname) {
    edits.nickname = draft.nickname.trim();
  }
  if (draft.birthDate.trim() !== orig.birthDate) {
    edits.birthDate = draft.birthDate.trim();
  }
  if (draft.birthplace.trim() !== orig.birthplace) {
    edits.birthplace = draft.birthplace.trim();
  }
  if (draft.currentLocation.trim() !== orig.currentLocation) {
    edits.currentLocation = draft.currentLocation.trim();
  }
  if (draft.occupation.trim() !== orig.occupation) {
    edits.occupation = draft.occupation.trim();
  }
  if (draft.livingStatus !== orig.livingStatus) {
    edits.livingStatus = draft.livingStatus;
  }
  if (draft.shortBio.trim() !== orig.shortBio) {
    edits.shortBio = draft.shortBio.trim();
  }
  if (draft.longerStory.trim() !== orig.longerStory) {
    edits.longerStory = draft.longerStory.trim();
  }

  const draftTimeline = draft.timeline
    .map(serializeTimelineEntry)
    .filter((line) => line.trim() !== "");
  const origTimeline = orig.timeline
    .map(serializeTimelineEntry)
    .filter((line) => line.trim() !== "");
  if (JSON.stringify(draftTimeline) !== JSON.stringify(origTimeline)) {
    edits.timeline = draftTimeline;
  }

  if (draft.privacySettings.trim() !== orig.privacySettings) {
    edits.privacySettings = draft.privacySettings.trim();
  }

  return edits;
}

/** True when a value is a 4-digit year or a parseable calendar date. */
function isValidDateOrYear(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^\d{4}$/.test(trimmed)) return true;
  const date = new Date(trimmed);
  return !Number.isNaN(date.getTime());
}

/** Validate the draft; returns a map of field -> error message. */
function validate(draft: ProfileDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const hasDisplayName =
    draft.preferredName.trim() !== "" ||
    (draft.firstName.trim() !== "" && draft.lastName.trim() !== "");
  if (!hasDisplayName) {
    errors.displayName =
      "Add a display name or a first and last name so this profile can be identified.";
  }
  if (!isValidDateOrYear(draft.birthDate)) {
    errors.birthDate = "Enter a valid date or a 4-digit year.";
  }
  return errors;
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Photo section: upload, select as profile photo, and remove. */
function EditPhotoSection({
  personId,
  displayName,
  familyId,
}: {
  personId: string;
  displayName: string;
  familyId?: string;
}) {
  const { data: photos = [], isLoading } = usePhotos(personId, familyId);
  const { data: profilePhoto } = useProfilePhoto(personId, familyId);
  const addPhoto = useAddPhoto(familyId);
  const setProfilePhoto = useSetProfilePhoto(familyId);
  const removePhoto = useRemovePhoto(familyId);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profilePhotoUrl = profilePhoto?.blob.getDirectURL();

  const handleFile = async (file: File) => {
    if (!file) return;
    // Pre-read validation: inspect only size and MIME type before touching the
    // bytes. Rejected files never reach file.arrayBuffer().
    const validation = validateFile(file, "profileImage");
    if (!validation.valid) {
      setFileError(validation.error);
      setProgress(null);
      return;
    }
    const safeName = sanitizeFilename(file.name);
    if (!safeName) {
      setFileError(
        "That file name could not be used. Rename the file and try again.",
      );
      setProgress(null);
      return;
    }
    setFileError(null);
    setProgress(0);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = ExternalBlob.fromBytes(
      bytes,
      file.type,
      safeName,
    ).withUploadProgress(setProgress);
    addPhoto.mutate(
      { personId, blob, filename: safeName, mimeType: file.type },
      { onSuccess: () => setProgress(null), onError: () => setProgress(null) },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {profilePhotoUrl ? (
          <img
            src={profilePhotoUrl}
            alt="Your current profile"
            className="h-20 w-20 rounded-full object-cover photo-ring"
          />
        ) : (
          <div
            data-ocid="profile_edit.photo_placeholder"
            className="flex h-20 w-20 items-center justify-center rounded-full font-display text-2xl font-semibold photo-ring"
            style={{
              backgroundColor: "oklch(var(--muted))",
              color: "oklch(var(--muted-foreground))",
            }}
          >
            {getInitials(displayName) || "?"}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-foreground">
            {profilePhotoUrl ? "Profile photo set" : "No profile photo yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {profilePhotoUrl
              ? "Your initials placeholder is replaced by this photo."
              : "Your initials are shown until you add a photo."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          data-ocid="profile_edit.photo_input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          data-ocid="profile_edit.photo_upload_button"
          onClick={() => fileInputRef.current?.click()}
          disabled={addPhoto.isPending}
          className="add-photo-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          {addPhoto.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          {addPhoto.isPending ? "Uploading…" : "Upload photo"}
        </button>
        {profilePhotoUrl ? (
          <button
            type="button"
            data-ocid="profile_edit.photo_remove_button"
            onClick={() => {
              if (profilePhoto) {
                removePhoto.mutate({ personId, photoId: profilePhoto.id });
              }
            }}
            disabled={removePhoto.isPending}
            className="remove-photo-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove photo
          </button>
        ) : null}
      </div>

      {fileError ? (
        <p
          data-ocid="profile_edit.photo_error"
          role="alert"
          className="text-sm text-destructive"
        >
          {fileError}
        </p>
      ) : null}

      {progress !== null ? (
        <div data-ocid="profile_edit.photo_progress">
          <div
            className="progress-track"
            role="progressbar"
            tabIndex={0}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploading… {progress}%
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={`photo-skeleton-${i}`}
              className="aspect-square animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div
          data-ocid="profile_edit.photo_empty_state"
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center"
        >
          <Camera
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            No photos in your gallery yet. Upload one to set it as your profile
            photo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, index) => {
            const url = photo.blob.getDirectURL();
            const isProfile = url === profilePhotoUrl;
            return (
              <div
                key={photo.id.toString()}
                className="gallery-thumb group"
                data-ocid={`profile_edit.photo_item.${index + 1}`}
              >
                <img
                  src={url}
                  alt={photo.filename}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                {isProfile ? (
                  <span
                    data-ocid={`profile_edit.photo_item.${index + 1}.profile_badge`}
                    className="photo-badge absolute left-2 top-2"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Profile
                  </span>
                ) : null}
                <div className="photo-hover-overlay">
                  <button
                    type="button"
                    data-ocid={`profile_edit.photo_item.${index + 1}.set_profile`}
                    onClick={() =>
                      setProfilePhoto.mutate({ personId, photoId: photo.id })
                    }
                    disabled={isProfile || setProfilePhoto.isPending}
                    className="set-profile-photo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                  >
                    {isProfile ? "Profile Photo" : "Set as Profile Photo"}
                  </button>
                  <button
                    type="button"
                    data-ocid={`profile_edit.photo_item.${index + 1}.remove`}
                    onClick={() =>
                      removePhoto.mutate({ personId, photoId: photo.id })
                    }
                    disabled={removePhoto.isPending}
                    aria-label={`Remove ${photo.filename}`}
                    className="remove-photo-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProfileEditPage({
  personId,
  onBack,
}: {
  personId: string;
  onBack: () => void;
}) {
  const familyId = useFamilyScopedId();
  const { data: backendProfile, isLoading } = usePersonProfile(personId, {
    familyId,
  });
  const { isAuthenticated, login, identity } = useInternetIdentity();
  const update = useUpdateOwnProfile(familyId);
  const providersPresent = useProvidersPresent();

  const currentPrincipal = identity?.getPrincipal().toString();
  const isOwner = Boolean(
    backendProfile?.claimedByUserId &&
      currentPrincipal &&
      backendProfile.claimedByUserId.toString() === currentPrincipal,
  );
  const isLiving = backendProfile?.livingStatus === LivingStatus.Living;
  const isClaimed = backendProfile?.claimStatus === ClaimStatus.Claimed;
  const { data: isSteward = false } = useIsSteward();
  // A profile claimed by a different user must never be overwritten, even by a
  // steward. A steward may edit unclaimed/deceased/historical profiles (those
  // not claimed by another user) per existing steward permissions.
  const isClaimedByAnother = Boolean(
    backendProfile?.claimedByUserId &&
      currentPrincipal &&
      backendProfile.claimedByUserId.toString() !== currentPrincipal,
  );
  const canEdit =
    (isOwner && isLiving && isClaimed) || (isSteward && !isClaimedByAnother);

  // Draft state. The canonical hydrated ProfileDraft is ALWAYS built first from
  // the resolved canonical Person record (backend profile merged with the
  // static canonical data), then any saved local draft is MERGED over it:
  // non-empty saved values override canonical, blank saved values leave the
  // canonical value intact. This prevents a partial stale browser draft (e.g.
  // only a suffix) from replacing the complete canonical Person data. The saved
  // draft is read once on mount into a ref so it can be merged once the backend
  // profile loads.
  const restoredFromStorage = useRef(false);
  const savedDraftRef = useRef<ProfileDraft | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(personId));
      if (raw) {
        const parsed = JSON.parse(raw) as ProfileDraft;
        if (
          parsed &&
          typeof parsed === "object" &&
          "preferredName" in parsed &&
          hasDraftContent(parsed)
        ) {
          savedDraftRef.current = parsed;
          restoredFromStorage.current = true;
        }
      }
    } catch {
      // ignore malformed draft
    }
  }, [personId]);

  const initialized = useRef(false);
  useEffect(() => {
    if (backendProfile && !initialized.current) {
      initialized.current = true;
      // Always build the canonical hydrated draft first...
      const canonical = fromPersonProfile(
        resolveCanonicalPersonProfile(backendProfile, profiles[personId]),
        backendProfile,
        Boolean(profiles[personId]),
      );
      // ...then merge any saved local draft over it so non-empty saved values
      // win while blank saved values keep the canonical value.
      setDraft(
        savedDraftRef.current
          ? mergeDraftOverCanonical(canonical, savedDraftRef.current)
          : canonical,
      );
    }
  }, [backendProfile, personId]);

  // The canonical hydrated draft of the SAVED Profile (backend record merged
  // with the static canonical data). Comparing the current draft against this
  // tells us whether the editor reflects the saved Profile or carries a pending
  // local draft that differs from it.
  const canonicalDraft = useMemo(() => {
    if (!backendProfile) return null;
    return fromPersonProfile(
      resolveCanonicalPersonProfile(backendProfile, profiles[personId]),
      backendProfile,
      Boolean(profiles[personId]),
    );
  }, [backendProfile, personId]);

  // True when the current draft differs from the saved Profile — i.e. a local
  // draft is pending and has not yet been saved to the backend. When false, the
  // editor reflects the saved Profile and shows the 'Profile saved' label.
  const draftDiffersFromSaved = Boolean(
    canonicalDraft && !draftsEqual(draft, canonicalDraft),
  );

  const [draftStatus, setDraftStatus] = useState<"saved" | "unsaved">("saved");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toPersonId, setToPersonId] = useState("");

  // Autosave the draft to localStorage (debounced) once the profile is loaded.
  useEffect(() => {
    if (!backendProfile) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(personId), JSON.stringify(draft));
        setDraftStatus("saved");
      } catch {
        // ignore storage failures
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, personId, backendProfile]);

  const setField = <K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDraftStatus("unsaved");
  };

  const updateTimelineEntry = (id: number, patch: Partial<TimelineDraft>) => {
    setDraft((current) => ({
      ...current,
      timeline: current.timeline.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
    setDraftStatus("unsaved");
  };

  const removeTimelineEntry = (id: number) => {
    setDraft((current) => ({
      ...current,
      timeline: current.timeline.filter((entry) => entry.id !== id),
    }));
    setDraftStatus("unsaved");
  };

  const addTimelineEntry = () => {
    setDraft((current) => ({
      ...current,
      timeline: [
        ...current.timeline,
        { id: Date.now(), date: "", title: "", detail: "", location: "" },
      ],
    }));
    setDraftStatus("unsaved");
  };

  const displayName =
    draft.preferredName.trim() ||
    [draft.firstName, draft.lastName].filter(Boolean).join(" ") ||
    backendProfile?.name ||
    "";

  const handleSave = () => {
    const validationErrors = validate(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setSaveState("error");
      setSaveError("Please fix the highlighted fields before saving.");
      return;
    }
    if (!backendProfile) {
      setSaveState("error");
      setSaveError("This profile could not be found.");
      return;
    }
    // Patch-only save: only the fields the user intentionally changed are
    // submitted; unchanged canonical fields are omitted so the backend keeps
    // its current value and blank values never erase existing data.
    const edits = toEdits(draft, backendProfile, profiles[personId]);
    setSaveState("saving");
    update.mutate(
      { personId, edits },
      {
        onSuccess: (data) => {
          if (data.__kind__ === "ok") {
            setSaveState("saved");
            try {
              localStorage.removeItem(draftKey(personId));
            } catch {
              // ignore storage failures
            }
            // Re-hydrate from the same canonical merged record used for
            // hydration so seeded profiles (whose backend record carries only
            // `name` plus any newly-set fields) keep showing their canonical
            // values (preferredName, currentLocation, longerStory, timeline)
            // immediately after saving instead of blanking out.
            setDraft(
              fromPersonProfile(
                resolveCanonicalPersonProfile(data.ok, profiles[personId]),
                data.ok,
                Boolean(profiles[personId]),
              ),
            );
            setDraftStatus("saved");
          } else {
            setSaveState("error");
            setSaveError(
              EDIT_ERROR_LABELS[data.err] ??
                "Could not save your changes. Please try again.",
            );
          }
        },
        onError: () => {
          setSaveState("error");
          setSaveError("Could not save your changes. Please try again.");
        },
      },
    );
  };

  const people = Object.values(profiles).filter((p) => p.id !== personId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <button
        type="button"
        data-ocid="profile_edit.back_button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to profile
      </button>

      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Edit My Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          {backendProfile?.name ?? "Your profile"} — manage the personal details
          shown on your family profile.
        </p>
      </header>

      {isLoading ? (
        <div
          data-ocid="profile_edit.loading_state"
          className="flex flex-col gap-4"
        >
          <div className="h-10 w-48 animate-pulse rounded-full bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : !backendProfile ? (
        <div
          data-ocid="profile_edit.error_state"
          className="flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-card p-6"
        >
          <p className="font-display text-lg font-semibold text-foreground">
            Profile not found
          </p>
          <p className="text-sm text-muted-foreground">
            We could not find this profile in the family records.
          </p>
        </div>
      ) : !isAuthenticated ? (
        <div
          data-ocid="profile_edit.sign_in_state"
          className="flex flex-col items-start gap-4 rounded-xl border border-border/60 bg-card p-6"
        >
          <p className="font-display text-lg font-semibold text-foreground">
            Sign in to edit your profile
          </p>
          <p className="text-sm text-muted-foreground">
            Only the approved owner of a living profile can edit their personal
            details. Sign in to continue.
          </p>
          <button
            type="button"
            data-ocid="profile_edit.sign_in_button"
            onClick={() => login()}
            className="this-is-me-action"
          >
            Sign in
          </button>
        </div>
      ) : !canEdit ? (
        <div
          data-ocid="profile_edit.not_owner_state"
          className="flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-card p-6"
        >
          <p className="font-display text-lg font-semibold text-foreground">
            {!isLiving
              ? "This profile is not editable"
              : !isClaimed
                ? "This profile has not been claimed"
                : "You don't own this profile"}
          </p>
          <p className="text-sm text-muted-foreground">
            {!isLiving
              ? "Profiles for deceased family members are preserved as historical records and cannot be edited."
              : !isClaimed
                ? "This profile has not been claimed by an owner yet. Claim it from the profile page to manage your details."
                : "Only the approved owner of this profile can edit it. If this is you, claim the profile first."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {isClaimed ? (
              <StatusBadge kind="claim" status="Claimed" />
            ) : (
              <StatusBadge kind="claim" status="Unclaimed" />
            )}
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              {isOwner ? "You own this profile" : "Editing as Family Steward"}
            </span>
            <span
              data-ocid="profile_edit.draft_status"
              className={`draft-status ${
                !draftDiffersFromSaved
                  ? "draft-saved"
                  : draftStatus === "saved"
                    ? "draft-stale"
                    : "draft-unsaved"
              }`}
            >
              {!draftDiffersFromSaved
                ? "Profile saved"
                : draftStatus === "saved"
                  ? "Draft saved locally"
                  : "Unsaved changes"}
            </span>
          </div>
          {restoredFromStorage.current ? (
            <p
              data-ocid="profile_edit.restored_draft_notice"
              className="text-sm text-muted-foreground"
            >
              Restored your in-progress draft from this browser. Your changes
              are saved to your profile only when you press Save changes.
            </p>
          ) : null}

          <form
            className="owner-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
          >
            {/* Identity */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">Identity</h2>
              </div>
              <p className="edit-section-hint">
                How you are known across the family tree and profile.
              </p>
              <div className="owner-field-group">
                <label htmlFor="preferred-name" className="field-label">
                  Preferred / display name
                </label>
                <input
                  id="preferred-name"
                  data-ocid="profile_edit.preferred_name_input"
                  type="text"
                  value={draft.preferredName}
                  onChange={(event) =>
                    setField("preferredName", event.target.value)
                  }
                  className="form-input"
                  placeholder="How you'd like to be known"
                />
                {errors.displayName ? (
                  <p
                    data-ocid="profile_edit.display_name_error"
                    className="text-sm text-destructive"
                  >
                    {errors.displayName}
                  </p>
                ) : null}
              </div>
              <div className="edit-field-grid">
                <div className="owner-field-group">
                  <label htmlFor="first-name" className="field-label">
                    First name
                  </label>
                  <input
                    id="first-name"
                    data-ocid="profile_edit.first_name_input"
                    type="text"
                    value={draft.firstName}
                    onChange={(event) =>
                      setField("firstName", event.target.value)
                    }
                    className="form-input"
                  />
                </div>
                <div className="owner-field-group">
                  <label htmlFor="middle-name" className="field-label">
                    Middle name or initial
                  </label>
                  <input
                    id="middle-name"
                    data-ocid="profile_edit.middle_name_input"
                    type="text"
                    value={draft.middleName}
                    onChange={(event) =>
                      setField("middleName", event.target.value)
                    }
                    className="form-input"
                  />
                </div>
                <div className="owner-field-group">
                  <label htmlFor="last-name" className="field-label">
                    Last name
                  </label>
                  <input
                    id="last-name"
                    data-ocid="profile_edit.last_name_input"
                    type="text"
                    value={draft.lastName}
                    onChange={(event) =>
                      setField("lastName", event.target.value)
                    }
                    className="form-input"
                  />
                </div>
                <div className="owner-field-group">
                  <label htmlFor="suffix" className="field-label">
                    Suffix
                  </label>
                  <select
                    id="suffix"
                    data-ocid="profile_edit.suffix_select"
                    value={draft.suffix}
                    onChange={(event) => setField("suffix", event.target.value)}
                    className="form-select"
                  >
                    {SUFFIX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option || "None"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="owner-field-group">
                <label htmlFor="nickname" className="field-label">
                  Nickname / known as
                </label>
                <input
                  id="nickname"
                  data-ocid="profile_edit.nickname_input"
                  type="text"
                  value={draft.nickname}
                  onChange={(event) => setField("nickname", event.target.value)}
                  className="form-input"
                  placeholder="e.g. Julie, Tip"
                />
              </div>
            </section>

            {/* Basic Information */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">Basic Information</h2>
              </div>
              <div className="edit-field-grid">
                <div className="owner-field-group">
                  <label htmlFor="birth-date" className="field-label">
                    Birth date
                  </label>
                  <input
                    id="birth-date"
                    data-ocid="profile_edit.birth_date_input"
                    type="text"
                    value={draft.birthDate}
                    onChange={(event) =>
                      setField("birthDate", event.target.value)
                    }
                    className="form-input"
                    placeholder="e.g. June 12, 1990 or 1990"
                  />
                  {errors.birthDate ? (
                    <p
                      data-ocid="profile_edit.birth_date_error"
                      className="text-sm text-destructive"
                    >
                      {errors.birthDate}
                    </p>
                  ) : null}
                </div>
                <div className="owner-field-group">
                  <label htmlFor="birthplace" className="field-label">
                    Birthplace
                  </label>
                  <input
                    id="birthplace"
                    data-ocid="profile_edit.birthplace_input"
                    type="text"
                    value={draft.birthplace}
                    onChange={(event) =>
                      setField("birthplace", event.target.value)
                    }
                    className="form-input"
                    placeholder="City, state or country"
                  />
                </div>
                <div className="owner-field-group">
                  <label htmlFor="current-location" className="field-label">
                    Current city / state or location
                  </label>
                  <input
                    id="current-location"
                    data-ocid="profile_edit.current_location_input"
                    type="text"
                    value={draft.currentLocation}
                    onChange={(event) =>
                      setField("currentLocation", event.target.value)
                    }
                    className="form-input"
                    placeholder="Where you live now"
                  />
                </div>
                <div className="owner-field-group">
                  <label htmlFor="occupation" className="field-label">
                    Occupation / profession
                  </label>
                  <input
                    id="occupation"
                    data-ocid="profile_edit.occupation_input"
                    type="text"
                    value={draft.occupation}
                    onChange={(event) =>
                      setField("occupation", event.target.value)
                    }
                    className="form-input"
                    placeholder="Your work or calling"
                  />
                </div>
              </div>
              <div className="edit-inline-field">
                <span className="text-sm font-semibold text-foreground">
                  Living status
                </span>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <input
                      type="radio"
                      name="living-status"
                      value={LivingStatus.Living}
                      checked={draft.livingStatus === LivingStatus.Living}
                      onChange={() =>
                        setField("livingStatus", LivingStatus.Living)
                      }
                      data-ocid="profile_edit.living_radio"
                      className="accent-primary"
                    />
                    Living
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <input
                      type="radio"
                      name="living-status"
                      value={LivingStatus.Deceased}
                      checked={draft.livingStatus === LivingStatus.Deceased}
                      onChange={() =>
                        setField("livingStatus", LivingStatus.Deceased)
                      }
                      data-ocid="profile_edit.deceased_radio"
                      className="accent-primary"
                    />
                    Deceased
                  </label>
                </div>
              </div>
              <p className="edit-section-hint">
                {isOwner
                  ? "Only living profiles can be edited. Deceased profiles are preserved as historical records."
                  : "As a Family Steward you may update the living status of unclaimed or historical profiles."}
              </p>
            </section>

            {/* About */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">About</h2>
              </div>
              <div className="owner-field-group">
                <label htmlFor="short-bio" className="field-label">
                  Short biography / About me
                </label>
                <textarea
                  id="short-bio"
                  data-ocid="profile_edit.short_bio_input"
                  value={draft.shortBio}
                  onChange={(event) => setField("shortBio", event.target.value)}
                  className="form-textarea"
                  placeholder="A few sentences about yourself"
                />
              </div>
              <div className="owner-field-group">
                <label htmlFor="longer-story" className="field-label">
                  Longer personal story
                </label>
                <textarea
                  id="longer-story"
                  data-ocid="profile_edit.longer_story_input"
                  value={draft.longerStory}
                  onChange={(event) =>
                    setField("longerStory", event.target.value)
                  }
                  className="form-textarea"
                  placeholder="Tell your story in your own words"
                />
              </div>
            </section>

            {/* Photo */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">Photo</h2>
              </div>
              <p className="edit-section-hint">
                Upload a profile photo, choose one from your gallery, or remove
                it to return to your initials placeholder.
              </p>
              {providersPresent ? (
                <EditPhotoSection
                  personId={personId}
                  displayName={displayName}
                  familyId={familyId}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Photo management is unavailable right now.
                </p>
              )}
            </section>

            {/* Timeline */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">Timeline</h2>
              </div>
              <p className="edit-section-hint">
                Add milestones from your life. Each entry has a date or year, a
                title, a description, and an optional location.
              </p>
              <div className="flex flex-col gap-3">
                {draft.timeline.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="timeline-entry-card"
                    data-ocid={`profile_edit.timeline_item.${index + 1}`}
                  >
                    <div className="edit-field-grid">
                      <div className="owner-field-group">
                        <label
                          htmlFor={`timeline-date-${entry.id}`}
                          className="field-label"
                        >
                          Date or year
                        </label>
                        <input
                          id={`timeline-date-${entry.id}`}
                          data-ocid={`profile_edit.timeline_item.${index + 1}.date`}
                          type="text"
                          value={entry.date}
                          onChange={(event) =>
                            updateTimelineEntry(entry.id, {
                              date: event.target.value,
                            })
                          }
                          className="form-input"
                          placeholder="e.g. 1998"
                        />
                      </div>
                      <div className="owner-field-group">
                        <label
                          htmlFor={`timeline-title-${entry.id}`}
                          className="field-label"
                        >
                          Title
                        </label>
                        <input
                          id={`timeline-title-${entry.id}`}
                          data-ocid={`profile_edit.timeline_item.${index + 1}.title`}
                          type="text"
                          value={entry.title}
                          onChange={(event) =>
                            updateTimelineEntry(entry.id, {
                              title: event.target.value,
                            })
                          }
                          className="form-input"
                          placeholder="e.g. Graduated high school"
                        />
                      </div>
                    </div>
                    <div className="owner-field-group">
                      <label
                        htmlFor={`timeline-detail-${entry.id}`}
                        className="field-label"
                      >
                        Description
                      </label>
                      <textarea
                        id={`timeline-detail-${entry.id}`}
                        data-ocid={`profile_edit.timeline_item.${index + 1}.detail`}
                        value={entry.detail}
                        onChange={(event) =>
                          updateTimelineEntry(entry.id, {
                            detail: event.target.value,
                          })
                        }
                        className="form-textarea"
                        placeholder="What happened"
                      />
                    </div>
                    <div className="owner-field-group">
                      <label
                        htmlFor={`timeline-location-${entry.id}`}
                        className="field-label"
                      >
                        Location (optional)
                      </label>
                      <input
                        id={`timeline-location-${entry.id}`}
                        data-ocid={`profile_edit.timeline_item.${index + 1}.location`}
                        type="text"
                        value={entry.location}
                        onChange={(event) =>
                          updateTimelineEntry(entry.id, {
                            location: event.target.value,
                          })
                        }
                        className="form-input"
                        placeholder="Where it happened"
                      />
                    </div>
                    <div className="timeline-entry-actions">
                      <button
                        type="button"
                        data-ocid={`profile_edit.timeline_item.${index + 1}.remove`}
                        onClick={() => removeTimelineEntry(entry.id)}
                        className="timeline-entry-action timeline-entry-remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                data-ocid="profile_edit.timeline_add_button"
                onClick={addTimelineEntry}
                className="timeline-add"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add timeline entry
              </button>
            </section>

            {/* Privacy */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">Privacy</h2>
              </div>
              <p className="edit-section-hint">
                Choose who can see your editable personal fields.
              </p>
              <div className="owner-field-group">
                <label htmlFor="privacy" className="field-label">
                  Visibility
                </label>
                <select
                  id="privacy"
                  data-ocid="profile_edit.privacy_select"
                  value={draft.privacySettings}
                  onChange={(event) =>
                    setField("privacySettings", event.target.value)
                  }
                  className="form-select"
                >
                  {PRIVACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* Family relationships note + request flow */}
            <section className="edit-section-card">
              <div className="edit-section-head">
                <h2 className="edit-section-title">Family relationships</h2>
              </div>
              <p className="owner-relationship-note">
                Family relationships are confirmed separately to protect the
                accuracy of the family tree. To add or change a relationship,
                propose a Relationship Request below — it stays pending until a
                Family Steward confirms it.
              </p>
              <div className="owner-field-group">
                <label htmlFor="rel-person" className="field-label">
                  Connect to a family member
                </label>
                <select
                  id="rel-person"
                  data-ocid="profile_edit.relationship_person_select"
                  value={toPersonId}
                  onChange={(event) => setToPersonId(event.target.value)}
                  className="form-select"
                >
                  <option value="">Choose a family member…</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              {toPersonId ? (
                <RelationshipRequestForm
                  fromPersonId={personId}
                  toPersonId={toPersonId}
                  onSuccess={() => setToPersonId("")}
                />
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  Select a family member to propose a relationship.
                </p>
              )}
            </section>

            {saveState === "saved" ? (
              <div
                data-ocid="profile_edit.success_state"
                className="flex items-center gap-2 rounded-lg border border-success/35 bg-success/10 px-4 py-3 text-sm font-semibold text-success"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Your changes have been saved.
              </div>
            ) : null}

            {saveState === "error" ? (
              <p
                data-ocid="profile_edit.error_state"
                className="text-sm text-destructive"
              >
                {saveError}
              </p>
            ) : null}

            <div className="edit-action-bar">
              <button
                type="submit"
                data-ocid="profile_edit.save_button"
                disabled={update.isPending}
                className="owner-save disabled:cursor-not-allowed disabled:opacity-60"
              >
                {update.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {update.isPending ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                data-ocid="profile_edit.cancel_button"
                onClick={onBack}
                className="edit-cancel"
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
