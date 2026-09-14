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
  type RelationshipType,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileEditPage } from "./pages/ProfileEditPage";

// Cover for the profile-edit draft-hydration change. The editor now ALWAYS
// builds the canonical hydrated ProfileDraft first from
// resolveCanonicalPersonProfile(...) via fromPersonProfile, then merges any
// saved local draft over it (mergeDraftOverCanonical): non-empty saved values
// override canonical, blank saved values keep the canonical value. This fixes
// the regression where a stale browser draft carrying only a suffix would blank
// out the complete canonical Person data on reload.
//
// The accepted behavior covered here:
//
//  1. A saved draft containing only suffix 'II' no longer blanks Lula Mae's
//     Preferred Name, current location, longer story, or timeline — the blank
//     saved values keep the non-empty canonical values.
//  2. Non-empty saved draft values still override canonical values on restore
//     (the user's typed work is not lost by a refresh).
//  3. The restored-draft notice is shown when a saved draft is merged in.
//  4. Patch-only backend saving is unchanged: after merging a suffix-only
//     draft, saving submits only the suffix edit, leaving the canonical fields
//     untouched.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It applies edits
// to the canonical record IN PLACE and records the last submitted ProfileEdits
// so the patch-only-save contract can be asserted directly.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  getProfile,
  getLastEdits,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let lastEdits: ProfileEdits | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
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
      if (profile.claimedByUserId?.toString() !== currentPrincipal)
        return { __kind__: "err", err: "NotOwner" };
      if (profile.livingStatus === LivingStatus.Deceased)
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
          id: 1n,
          requestingPersonId: fromPersonId,
          relatedPersonId: toPersonId,
          proposedRelationship: relationshipType,
          status: "Pending",
          submittedDate: 1_700_000_000_000_000_000n,
        },
      };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      lastEdits = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
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

// Lula Mae's backend record carries only `name` (all owner-editable fields
// null), exactly like the seeded profiles. The static canonical record for
// 'lula-mae' supplies the display name 'Lula Mae Norwood', the Location fact
// 'New York / New Jersey', a longer story, and a timeline entry.
function seedLulaMaeBackendProfile(): PersonProfile {
  const profile: PersonProfile = {
    personId: "lula-mae",
    name: "Lula Mae Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
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

describe("A saved draft containing only a suffix does not blank canonical data", () => {
  it("keeps Lula Mae's Preferred Name, location, story, and timeline when a suffix-only draft is restored", async () => {
    // A stale browser draft carries ONLY a suffix 'II'; every other field is
    // blank. On reload the editor must build the canonical hydrated draft
    // first and merge the saved draft over it, so the blank saved values keep
    // the non-empty canonical values instead of erasing them.
    localStorage.setItem(
      "norwood.profile-edit.draft.lula-mae",
      JSON.stringify({
        preferredName: "",
        firstName: "",
        middleName: "",
        lastName: "",
        suffix: "II",
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
        privacySettings: "FamilyOnly",
      }),
    );

    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The restored-draft notice is shown because a saved draft was merged in.
    expect(
      screen.getByTestId("profile_edit.restored_draft_notice"),
    ).toBeInTheDocument();

    // The suffix-only saved value wins: the suffix is 'II'.
    expect(
      (screen.getByTestId("profile_edit.suffix_select") as HTMLSelectElement)
        .value,
    ).toBe("II");

    // The blank saved values did NOT erase the non-empty canonical values.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Lula Mae Norwood");
    expect(
      (
        screen.getByTestId(
          "profile_edit.current_location_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("New York / New Jersey");
    expect(
      (
        screen.getByTestId(
          "profile_edit.longer_story_input",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Lula Mae Norwood was the daughter of Clayton Norwood");
    expect(
      screen.getByTestId("profile_edit.timeline_item.1"),
    ).toBeInTheDocument();
  });

  it("submits only the suffix edit when saving a merged suffix-only draft (patch-only save unchanged)", async () => {
    // The same suffix-only draft is restored. Saving must submit ONLY the
    // suffix change — the canonical fields (preferredName, currentLocation,
    // longerStory, timeline) are recognized as unchanged and omitted from the
    // patch, so the backend keeps its current values.
    localStorage.setItem(
      "norwood.profile-edit.draft.lula-mae",
      JSON.stringify({
        preferredName: "",
        firstName: "",
        middleName: "",
        lastName: "",
        suffix: "II",
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
        privacySettings: "FamilyOnly",
      }),
    );

    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The submitted patch contains ONLY the suffix change.
    const edits = getLastEdits();
    expect(edits).not.toBeNull();
    expect(edits?.suffix).toBe("II");
    expect(edits?.preferredName).toBeUndefined();
    expect(edits?.currentLocation).toBeUndefined();
    expect(edits?.longerStory).toBeUndefined();
    expect(edits?.timeline).toBeUndefined();

    // The canonical record's suffix is updated; the other canonical values are
    // preserved (not overwritten with blanks).
    const canonical = getProfile("lula-mae");
    expect(canonical?.suffix).toBe("II");
    expect(canonical?.preferredName).toBeUndefined();
  });
});

describe("Non-empty saved draft values still override canonical on restore", () => {
  it("restores a saved draft's non-empty preferred name over the canonical name", async () => {
    // The user previously typed a NEW preferred name into the form and that
    // draft was autosaved. On reload the non-empty saved value must win over
    // the canonical 'Lula Mae Norwood' — the user's typed work is not lost.
    localStorage.setItem(
      "norwood.profile-edit.draft.lula-mae",
      JSON.stringify({
        preferredName: "Lula Mae",
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
        privacySettings: "FamilyOnly",
      }),
    );

    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The non-empty saved preferred name wins over the canonical name.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Lula Mae");
  });
});
