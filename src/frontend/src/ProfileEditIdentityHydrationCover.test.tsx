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

// Cover for the profile-edit identity-hydration build. The production change
// made fromCanonical hydrate the identity component fields (first/middle/last/
// suffix) ONLY from the backend record, never inventing them from the display
// name. The accepted behavior:
//
//  1. Opening Edit My Profile for Lula Mae Norwood populates Preferred/Display
//     Name from the canonical source that renders 'Lula Mae Norwood' on the
//     profile display, while the first/middle/last component fields stay BLANK
//     — the data model stores only a full canonical name for Lula Mae, so the
//     component fields are never invented from it.
//  2. A suffix carried by the backend record (e.g. 'II') remains populated in
//     the edit form — the backend value wins, so a previously-saved suffix is
//     never lost.
//  3. Patch-only save is preserved: changing only one field submits only that
//     field, leaving the hydrated canonical identity fields untouched.
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
// 'lula-mae' has the display name 'Lula Mae Norwood' and no suffix.
function seedLulaMaeBackendProfile(): PersonProfile {
  const profile: PersonProfile = {
    familyId: "norwood",
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

describe("Edit My Profile identity fields hydrate from the canonical record", () => {
  it("populates Preferred/Display Name from the canonical name but leaves component fields blank when only a full name is stored", async () => {
    // The backend record carries only `name`; the static canonical record for
    // 'lula-mae' supplies the display name 'Lula Mae Norwood'. The data model
    // stores only a full canonical name (no first/middle/last components), so
    // the Preferred/Display Name field populates from it while the component
    // fields stay blank — they are never invented from the display name.
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The display name itself pre-fills from the canonical name.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Lula Mae Norwood");

    // The component fields are NOT invented from the display name: they stay
    // blank because the backend record stores no first/middle/last components.
    expect(
      (screen.getByTestId("profile_edit.first_name_input") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (screen.getByTestId("profile_edit.middle_name_input") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (screen.getByTestId("profile_edit.last_name_input") as HTMLInputElement)
        .value,
    ).toBe("");
  });
});

describe("A backend-carried suffix remains populated in the edit form", () => {
  it("keeps the backend suffix 'II' populated in the edit form", async () => {
    // The backend record carries a real suffix 'II' (e.g. from a prior save).
    // The backend value wins, so the suffix stays populated in the edit form
    // rather than being blanked.
    seedProfile({
      familyId: "norwood",
      personId: "lula-mae",
      name: "Lula Mae Norwood",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: Principal.fromText(OWNER),
      preferredName: undefined,
      firstName: undefined,
      middleName: undefined,
      lastName: undefined,
      suffix: "II",
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
    });
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The backend-carried suffix 'II' remains populated in the edit form.
    expect(
      (screen.getByTestId("profile_edit.suffix_select") as HTMLSelectElement)
        .value,
    ).toBe("II");
  });
});

describe("Patch-only save preserves hydrated identity fields", () => {
  it("changing only the preferred name submits only that edit, leaving the identity fields untouched", async () => {
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Change only the preferred name; leave the hydrated identity fields as-is.
    await user.clear(screen.getByTestId("profile_edit.preferred_name_input"));
    await user.type(
      screen.getByTestId("profile_edit.preferred_name_input"),
      "Lula Mae",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The submitted patch contains ONLY the preferred-name change — the
    // hydrated identity fields (firstName, middleName, lastName) are omitted so
    // the backend keeps its current values and no data is erased.
    const edits = getLastEdits();
    expect(edits).not.toBeNull();
    expect(edits?.preferredName).toBe("Lula Mae");
    expect(edits?.firstName).toBeUndefined();
    expect(edits?.middleName).toBeUndefined();
    expect(edits?.lastName).toBeUndefined();
    expect(edits?.suffix).toBeUndefined();
  });
});
