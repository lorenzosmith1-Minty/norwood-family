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

// Characterization baseline for the profile-edit hydration of Lula Mae Norwood.
// The upcoming build reworks how Edit My Profile pre-populates editable
// identity/basic fields from canonical Person data. This file protects the
// CURRENT hydration contract that the change must not regress:
//
//  1. Lula Mae's edit form hydrates the fields that have real canonical data:
//     display name ('Lula Mae Norwood'), current location ('New York / New
//     Jersey'), the longer personal story, and the timeline entry.
//  2. Fields whose canonical facts are placeholders or absent stay BLANK — the
//     'Born: Not recorded' fact and the missing Birthplace/Occupation facts are
//     never surfaced as if they were real values. This is the "no missing facts
//     are inferred or invented" behavior.
//  3. The backend PersonProfile is the source of truth: when the backend record
//     carries a value, it wins over the static canonical record.
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
// 'lula-mae' has a 'Born: Not recorded' fact, a 'Location: New York / New
// Jersey' fact, a story, and a timeline — but no Birthplace or Occupation fact.
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

describe("Edit My Profile hydrates Lula Mae Norwood's canonical data", () => {
  it("pre-fills display name, location, story, and timeline from canonical data", async () => {
    // The backend record carries only `name`; the static canonical record for
    // 'lula-mae' supplies the display name, location, story, and timeline.
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Display name hydrates from the canonical name.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Lula Mae Norwood");

    // Current location hydrates from the canonical 'Location' fact.
    expect(
      (
        screen.getByTestId(
          "profile_edit.current_location_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("New York / New Jersey");

    // The longer personal story hydrates from the canonical story.
    expect(
      (
        screen.getByTestId(
          "profile_edit.longer_story_input",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Lula Mae Norwood was the daughter of Clayton Norwood");

    // The timeline hydrates from the canonical timeline entry.
    expect(
      screen.getByTestId("profile_edit.timeline_item.1"),
    ).toBeInTheDocument();
  });

  it("leaves birth date, birthplace, and occupation blank when canonical facts are placeholders or absent", async () => {
    // Lula Mae's canonical 'Born' fact is 'Not recorded' and she has no
    // Birthplace or Occupation fact. The current hydration must NOT surface
    // these as if they were real values — no missing facts are inferred or
    // invented.
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    expect(
      (screen.getByTestId("profile_edit.birth_date_input") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (screen.getByTestId("profile_edit.birthplace_input") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (screen.getByTestId("profile_edit.occupation_input") as HTMLInputElement)
        .value,
    ).toBe("");
  });
});

describe("Backend PersonProfile is the source of truth for hydration", () => {
  it("lets a backend value win over the static canonical record", async () => {
    // The backend record carries a real currentLocation that differs from the
    // static canonical 'New York / New Jersey'. The backend value must win.
    seedProfile({
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
      currentLocation: "Brooklyn, NY",
      occupation: undefined,
      shortBio: undefined,
      longerStory: undefined,
      story: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The backend record's currentLocation wins over the static canonical
    // 'New York / New Jersey'.
    expect(
      (
        screen.getByTestId(
          "profile_edit.current_location_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Brooklyn, NY");
  });
});

describe("Patch-only save for Lula Mae Norwood", () => {
  it("changing only the suffix submits only the suffix edit, leaving canonical data intact", async () => {
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

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

    // The submitted patch contains ONLY the suffix change — the hydrated
    // canonical fields (preferredName, currentLocation, longerStory, timeline)
    // are omitted so the backend keeps its current values.
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
