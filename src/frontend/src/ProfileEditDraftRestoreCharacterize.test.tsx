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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileEditPage } from "./pages/ProfileEditPage";

// Characterization baseline for the profile-edit draft hydration. The upcoming
// build changes how a saved localStorage draft is merged: instead of restoring
// the saved draft verbatim (bypassing canonical hydration), the editor will
// always build the canonical hydrated ProfileDraft first from
// resolveCanonicalPersonProfile(...) and then merge the saved draft over it
// (non-empty saved wins, blank saved never erases non-empty canonical).
//
// This file deliberately does NOT freeze the old verbatim-restore bypass. It
// protects the adjacent working behavior the merge must not disturb:
//
//  1. A saved draft's NON-EMPTY values are still restored on reload — the
//     user's typed work is not lost by a refresh, even when the canonical
//     record carries a different value for the same field. The "new value wins
//     over canonical on draft restore" priority is the whole point of the
//     draft, and the merge must keep it.
//  2. A saved draft with content is still recognized and restored at all (not
//     discarded as stale), so an in-progress edit survives navigation away and
//     back.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// A stateful in-memory actor standing in for the real backend, mirroring the
// ProfileEditCover mock: it applies edits to the canonical record IN PLACE and
// enforces owner-only editing of a claimed living profile.
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};

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

function seedClaimedLivingProfile(
  personId: string,
  name: string,
  owner: string,
): PersonProfile {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(owner),
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

describe("Saved draft restore preserves the user's typed values over canonical", () => {
  it("restores a saved draft's non-empty preferred name and birth date even when they differ from canonical", async () => {
    // The canonical clayton record hydrates preferredName 'Clayton Norwood' and
    // birthDate 'approx. 1883'. The user previously typed a NEW preferred name
    // and a NEW birth date into the form, and that draft was autosaved. On
    // reload the saved draft's non-empty values must win over the canonical
    // values — the user's in-progress work is not lost by a refresh.
    localStorage.setItem(
      "norwood.profile-edit.draft.clayton",
      JSON.stringify({
        preferredName: "Clay Norwood",
        firstName: "",
        middleName: "",
        lastName: "",
        suffix: "",
        nickname: "",
        birthDate: "1990",
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

    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The saved draft's non-empty values are restored — the user's typed
    // preferred name and birth date win over the canonical 'Clayton Norwood'
    // and 'approx. 1883'.
    expect(
      (
        screen.getByTestId(
          "profile_edit.preferred_name_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Clay Norwood");
    expect(
      (screen.getByTestId("profile_edit.birth_date_input") as HTMLInputElement)
        .value,
    ).toBe("1990");
  });

  it("recognizes and restores a saved draft that carries content in a single field", async () => {
    // A draft that carries content in just one field (a typed nickname) is a
    // genuine in-progress draft and must be restored, not discarded as stale.
    // The merge must keep restoring it so a single-field edit survives a
    // refresh.
    localStorage.setItem(
      "norwood.profile-edit.draft.clayton",
      JSON.stringify({
        preferredName: "",
        firstName: "",
        middleName: "",
        lastName: "",
        suffix: "",
        nickname: "Tip",
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

    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The typed nickname is restored.
    expect(
      (screen.getByTestId("profile_edit.nickname_input") as HTMLInputElement)
        .value,
    ).toBe("Tip");
  });
});
