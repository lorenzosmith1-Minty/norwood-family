import { PrivacyLevel } from "@/backend";
import type { ProfileEdits } from "@/backend";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import {
  ArrowLeft,
  Check,
  Link2,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RelationshipRequestForm } from "../components/RelationshipRequestForm";
import { StatusBadge } from "../components/StatusBadge";
import {
  usePersonProfile,
  useUpdateOwnProfile,
} from "../hooks/useProfileClaims";
import { ClaimStatus, EditError, LivingStatus } from "../types/ownership";
import { profiles } from "./PersonProfilePage";

/**
 * Owner editing of a claimed living profile. The signed-in user whose principal
 * matches the profile's claimedByUserId can edit their own allowed fields
 * (preferred/display name, story, occupation, birth information, personal
 * timeline, and privacy settings) and save via updateOwnProfile.
 *
 * Ordinary profile editing never rewrites family relationships directly — any
 * relationship addition or change must go through a Relationship Request, so
 * this page surfaces a clear note and the shared RelationshipRequestForm.
 * Only the approved owner of a living profile can edit.
 */

const EDIT_ERROR_LABELS: Record<EditError, string> = {
  [EditError.ProfileNotFound]: "This profile could not be found.",
  [EditError.NotSignedIn]: "You need to sign in to edit your profile.",
  [EditError.NotOwner]: "Only the approved owner of this profile can edit it.",
  [EditError.DeceasedProfile]:
    "This profile is for a deceased person and cannot be edited.",
};

const PRIVACY_OPTIONS: { value: string; label: string }[] = [
  { value: PrivacyLevel.Public, label: "Public" },
  { value: PrivacyLevel.FamilyOnly, label: "Family only" },
  { value: PrivacyLevel.Private, label: "Private" },
];

export function ProfileEditPage({
  personId,
  onBack,
}: {
  personId: string;
  onBack: () => void;
}) {
  const { data: backendProfile, isLoading } = usePersonProfile(personId);
  const { isAuthenticated, login, identity } = useInternetIdentity();
  const update = useUpdateOwnProfile();

  const currentPrincipal = identity?.getPrincipal().toString();
  const isOwner = Boolean(
    backendProfile?.claimedByUserId &&
      currentPrincipal &&
      backendProfile.claimedByUserId.toString() === currentPrincipal,
  );
  const isLiving = backendProfile?.livingStatus === LivingStatus.Living;
  const isClaimed = backendProfile?.claimStatus === ClaimStatus.Claimed;
  const canEdit = isOwner && isLiving && isClaimed;

  // Editable field drafts. Owned in local state; initialized once from the
  // loaded profile and never overwritten by a refetch.
  const [preferredName, setPreferredName] = useState("");
  const [story, setStory] = useState("");
  const [occupation, setOccupation] = useState("");
  const [birthInfo, setBirthInfo] = useState("");
  const [timeline, setTimeline] = useState<{ id: number; text: string }[]>([]);
  const [privacySettings, setPrivacySettings] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const [toPersonId, setToPersonId] = useState("");

  const initialized = useRef(false);
  useEffect(() => {
    if (backendProfile && !initialized.current) {
      initialized.current = true;
      setPreferredName(backendProfile.preferredName ?? "");
      setStory(backendProfile.story ?? "");
      setOccupation(backendProfile.occupation ?? "");
      setBirthInfo(backendProfile.birthInfo ?? "");
      setTimeline(
        (backendProfile.timeline ?? []).map((text, index) => ({
          id: index,
          text,
        })),
      );
      setPrivacySettings(backendProfile.privacySettings ?? "");
    }
  }, [backendProfile]);

  const people = Object.values(profiles).filter((p) => p.id !== personId);

  const handleSave = () => {
    const edits: ProfileEdits = {
      preferredName: preferredName.trim(),
      story: story.trim(),
      occupation: occupation.trim(),
      birthInfo: birthInfo.trim(),
      timeline: timeline
        .map((entry) => entry.text)
        .filter((text) => text.trim() !== ""),
      privacySettings: privacySettings.trim(),
    };
    setSaveState("saving");
    update.mutate(
      { personId, edits },
      {
        onSuccess: (data) => {
          if (data.__kind__ === "ok") {
            setSaveState("saved");
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

  const updateTimelineEntry = (id: number, value: string) => {
    setTimeline((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, text: value } : entry,
      ),
    );
  };

  const removeTimelineEntry = (id: number) => {
    setTimeline((current) => current.filter((entry) => entry.id !== id));
  };

  const addTimelineEntry = () => {
    setTimeline((current) => [...current, { id: Date.now(), text: "" }]);
  };

  const privacyOptions = PRIVACY_OPTIONS.some(
    (option) => option.value === privacySettings,
  )
    ? PRIVACY_OPTIONS
    : [
        ...PRIVACY_OPTIONS,
        { value: privacySettings, label: privacySettings || "Not set" },
      ];

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
            <StatusBadge kind="claim" status="Claimed" />
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              You own this profile
            </span>
          </div>

          <form
            className="owner-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
          >
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Personal details
              </h2>

              <div className="owner-field-group">
                <label htmlFor="preferred-name" className="field-label">
                  Preferred / display name
                </label>
                <input
                  id="preferred-name"
                  data-ocid="profile_edit.preferred_name_input"
                  type="text"
                  value={preferredName}
                  onChange={(event) => setPreferredName(event.target.value)}
                  className="form-input"
                  placeholder="How you'd like to be known"
                />
                <p className="owner-editable-hint">
                  Shown on your profile card and in the family tree.
                </p>
              </div>

              <div className="owner-field-group">
                <label htmlFor="occupation" className="field-label">
                  Occupation
                </label>
                <input
                  id="occupation"
                  data-ocid="profile_edit.occupation_input"
                  type="text"
                  value={occupation}
                  onChange={(event) => setOccupation(event.target.value)}
                  className="form-input"
                  placeholder="Your work or calling"
                />
              </div>

              <div className="owner-field-group">
                <label htmlFor="birth-info" className="field-label">
                  Birth information
                </label>
                <input
                  id="birth-info"
                  data-ocid="profile_edit.birth_info_input"
                  type="text"
                  value={birthInfo}
                  onChange={(event) => setBirthInfo(event.target.value)}
                  className="form-input"
                  placeholder="Date and place of birth"
                />
              </div>

              <div className="owner-field-group">
                <label htmlFor="story" className="field-label">
                  Story / biography
                </label>
                <textarea
                  id="story"
                  data-ocid="profile_edit.story_input"
                  value={story}
                  onChange={(event) => setStory(event.target.value)}
                  className="form-textarea"
                  placeholder="Tell your story in your own words"
                />
              </div>
            </section>

            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Personal timeline
              </h2>
              <p className="owner-editable-hint">
                Add milestones from your life. Each entry is a short line, e.g.
                "Graduated high school, 1998".
              </p>
              <div className="flex flex-col gap-2">
                {timeline.map((entry, index) => (
                  <div key={entry.id} className="flex items-center gap-2">
                    <input
                      data-ocid={`profile_edit.timeline_input.${index + 1}`}
                      type="text"
                      value={entry.text}
                      onChange={(event) =>
                        updateTimelineEntry(entry.id, event.target.value)
                      }
                      className="form-input"
                      placeholder="Timeline entry"
                    />
                    <button
                      type="button"
                      data-ocid={`profile_edit.timeline_remove.${index + 1}`}
                      onClick={() => removeTimelineEntry(entry.id)}
                      aria-label="Remove timeline entry"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                data-ocid="profile_edit.timeline_add_button"
                onClick={addTimelineEntry}
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add timeline entry
              </button>
            </section>

            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Privacy settings
              </h2>
              <div className="owner-field-group">
                <label htmlFor="privacy" className="field-label">
                  Who can see your profile
                </label>
                <select
                  id="privacy"
                  data-ocid="profile_edit.privacy_select"
                  value={privacySettings}
                  onChange={(event) => setPrivacySettings(event.target.value)}
                  className="form-select"
                >
                  {privacyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="owner-editable-hint">
                  Choose how much of your profile is visible to others.
                </p>
              </div>
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

            <div className="flex items-center gap-3">
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
            </div>
          </form>

          <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Family relationships
            </h2>
            <p className="owner-relationship-note">
              Family relationships are part of the shared family graph and are
              never rewritten directly by profile editing. To add or change a
              relationship, propose a Relationship Request below — it stays
              pending until a Family Steward confirms it.
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
        </>
      )}
    </div>
  );
}
