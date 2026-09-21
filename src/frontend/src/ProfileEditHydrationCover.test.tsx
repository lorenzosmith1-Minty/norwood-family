import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type ProfileClaim,
  type ProfileEdits,
  type Relationship,
  type RelationshipRequest,
  RelationshipRequestStatus,
  type RelationshipType,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileEditPage } from "./pages/ProfileEditPage";

// Cover for the profile-edit hydration + patch-only save build. The accepted
// behavior:
//
//  1. Opening Edit My Profile for an existing Person pre-fills every editable
//     field from the canonical record (display/preferred name, birth date,
//     birthplace, location, occupation, story, timeline) instead of opening
//     blank — even when the backend record carries only `name` (seeded
//     profiles whose owner-editable fields are null).
//  2. Saving submits ONLY the fields the user intentionally changed; unchanged
//     canonical fields are omitted from the patch so blank values never erase
//     existing data. Changing only the suffix to 'II' updates the suffix alone.
//  3. A Family Steward editing an unclaimed/historical profile sees the same
//     pre-filled canonical values — treated as editing an existing profile,
//     never as creating a new one.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It applies edits
// to the canonical record IN PLACE and records the last submitted ProfileEdits
// so the patch-only-save contract can be asserted directly.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setAdmin,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  getProfile,
  getLastEdits,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let lastEdits: ProfileEdits | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    // Family Steward authority is the canonical gate; the platform admin role
    // is a separate concern. This mock drives both from the same flag.
    async isCallerSteward(): Promise<boolean> {
      return isAdmin;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      return owned ?? null;
    },
    async getMyProfileClaim(): Promise<ProfileClaim | null> {
      return null;
    },
    async listConfirmedRelationships(): Promise<Relationship[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
    },
    async updateOwnProfile(
      personId: string,
      edits: ProfileEdits,
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      lastEdits = edits;
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      if (profile.claimedByUserId?.toString() !== currentPrincipal && !isAdmin)
        return { __kind__: "err", err: "NotOwner" };
      if (
        profile.livingStatus === LivingStatus.Deceased &&
        profile.claimedByUserId?.toString() !== currentPrincipal &&
        !isAdmin
      )
        return { __kind__: "err", err: "DeceasedProfile" };
      const updated: PersonProfile = {
        ...profile,
        preferredName: edits.preferredName ?? profile.preferredName,
        firstName: edits.firstName ?? profile.firstName,
        middleName: edits.middleName ?? profile.middleName,
        lastName: edits.lastName ?? profile.lastName,
        suffix: edits.suffix ?? profile.suffix,
        nickname: edits.nickname ?? profile.nickname,
        birthDate: edits.birthDate ?? profile.birthDate,
        birthplace: edits.birthplace ?? profile.birthplace,
        currentLocation: edits.currentLocation ?? profile.currentLocation,
        occupation: edits.occupation ?? profile.occupation,
        livingStatus: edits.livingStatus ?? profile.livingStatus,
        shortBio: edits.shortBio ?? profile.shortBio,
        longerStory: edits.longerStory ?? profile.longerStory,
        timeline: edits.timeline ?? profile.timeline,
        privacySettings: edits.privacySettings ?? profile.privacySettings,
      };
      profiles = { ...profiles, [personId]: updated };
      return { __kind__: "ok", ok: updated };
    },
    async proposeRelationship(
      fromPersonId: string,
      toPersonId: string,
      relationshipType: RelationshipType,
    ): Promise<
      | { __kind__: "ok"; ok: RelationshipRequest }
      | { __kind__: "err"; err: string }
    > {
      return {
        __kind__: "ok",
        ok: {
          familyId: "norwood",
          id: 1n,
          requestingPersonId: fromPersonId,
          relatedPersonId: toPersonId,
          proposedRelationship: relationshipType,
          status: RelationshipRequestStatus.Pending,
          submittedDate: 1_700_000_000_000_000_000n,
        },
      };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      lastEdits = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    getProfile: (personId: string): PersonProfile | null =>
      profiles[personId] ?? null,
    getLastEdits: (): ProfileEdits | null => lastEdits,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
  localStorage.clear();
});

function renderPage(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

function seedProfileWithBlankEditableFields(
  personId: string,
  name: string,
  owner: string | undefined,
  livingStatus: LivingStatus,
  claimStatus: ClaimStatus,
): PersonProfile {
  const profile: PersonProfile = {
    familyId: "norwood",
    personId,
    name,
    livingStatus,
    claimStatus,
    claimedByUserId: owner ? Principal.fromText(owner) : undefined,
    preferredName: undefined,
    firstName: undefined,
    middleName: undefined,
    lastName: undefined,
    suffix: undefined,
    nickname: undefined,
    birthDate: undefined,
    birthplace: undefined,
    currentLocation: undefined,
    occupation: undefined,
    shortBio: undefined,
    longerStory: undefined,
    story: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  return profile;
}

describe("Edit My Profile hydrates existing canonical values", () => {
  it("pre-fills the editable fields from the canonical record for a seeded profile", async () => {
    // The backend record for 'clayton' carries only `name` (all owner-editable
    // fields null), exactly like the seeded profiles. The form must hydrate
    // from the canonical Person record instead of opening blank.
    seedProfileWithBlankEditableFields(
      "clayton",
      "Clayton Norwood",
      OWNER,
      LivingStatus.Living,
      ClaimStatus.Claimed,
    );
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Display/preferred name is pre-filled from the canonical name.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Clayton Norwood");

    // Birth date is pre-filled from the canonical "Born" fact.
    expect(
      (screen.getByTestId("profile_edit.birth_date_input") as HTMLInputElement)
        .value,
    ).toBe("approx. 1883");

    // The longer personal story is pre-filled from the canonical story.
    expect(
      (
        screen.getByTestId(
          "profile_edit.longer_story_input",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Clayton Norwood was the son of Julia");

    // The timeline is pre-filled from the canonical timeline entries.
    expect(
      screen.getByTestId("profile_edit.timeline_item.1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.timeline_item.2"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.timeline_item.3"),
    ).toBeInTheDocument();
  });
});

describe("Patch-only save submits only intentionally changed fields", () => {
  it("changing only the suffix to 'II' submits only the suffix edit", async () => {
    seedProfileWithBlankEditableFields(
      "clayton",
      "Clayton Norwood",
      OWNER,
      LivingStatus.Living,
      ClaimStatus.Claimed,
    );
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Change only the suffix to 'II'; leave every other pre-filled field as-is.
    await user.selectOptions(
      screen.getByTestId("profile_edit.suffix_select"),
      "II",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The submitted patch contains ONLY the suffix change — the unchanged
    // canonical fields (preferredName, birthDate, longerStory, timeline, etc.)
    // are omitted so the backend keeps its current values.
    const edits = getLastEdits();
    expect(edits).not.toBeNull();
    expect(edits?.suffix).toBe("II");
    expect(edits?.preferredName).toBeUndefined();
    expect(edits?.firstName).toBeUndefined();
    expect(edits?.lastName).toBeUndefined();
    expect(edits?.birthDate).toBeUndefined();
    expect(edits?.birthplace).toBeUndefined();
    expect(edits?.currentLocation).toBeUndefined();
    expect(edits?.occupation).toBeUndefined();
    expect(edits?.longerStory).toBeUndefined();
    expect(edits?.timeline).toBeUndefined();

    // The canonical record's suffix is updated; the other canonical values are
    // preserved (not overwritten with blanks).
    const canonical = getProfile("clayton");
    expect(canonical?.suffix).toBe("II");
    expect(canonical?.preferredName).toBeUndefined();
  });
});

describe("Family Steward editing an unclaimed profile sees pre-filled values", () => {
  it("pre-fills canonical values for a steward editing an unclaimed profile", async () => {
    seedProfileWithBlankEditableFields(
      "clayton",
      "Clayton Norwood",
      undefined,
      LivingStatus.Living,
      ClaimStatus.Unclaimed,
    );
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(STEWARD);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    // A steward may edit an unclaimed profile and is labeled as a steward.
    expect(
      await screen.findByText("Editing as Family Steward"),
    ).toBeInTheDocument();

    // The steward sees the same pre-filled canonical values — treated as
    // editing an existing profile, never as a blank new-profile form.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Clayton Norwood");
    expect(
      (screen.getByTestId("profile_edit.birth_date_input") as HTMLInputElement)
        .value,
    ).toBe("approx. 1883");
  });
});
