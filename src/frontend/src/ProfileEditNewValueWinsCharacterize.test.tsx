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

// Characterization baseline for the profile-edit hydration priority. The
// accepted field priority is "new editable value -> canonical/legacy Person
// value -> empty only if truly unknown". This file protects the FIRST link of
// that priority, which the hydration build must not regress:
//
//  1. A field the user edits and saves to a NEW value must WIN over the static
//     canonical value on the re-hydration that happens right after saving. The
//     form re-hydrates from the updated backend record (source of truth), so a
//     newly-saved current location must show the new value, not revert to the
//     canonical 'New York / New Jersey' fact.
//  2. The canonical value still fills the gap when the backend record carries
//     no value (the seeded-profile case), so the priority is preserved end to
//     end: new value wins, canonical fills the gap, blank only when unknown.
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
// 'lula-mae' supplies the display name 'Lula Mae Norwood' and the Location fact
// 'New York / New Jersey'.
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

describe("A newly-saved editable value wins over the canonical value on re-hydration", () => {
  it("shows the new current location after saving, not the canonical 'New York / New Jersey'", async () => {
    // The backend record carries only `name`; the canonical record supplies the
    // display name and the Location fact 'New York / New Jersey'. The user edits
    // the current location to a NEW value and saves. The form re-hydrates from
    // the updated backend record (source of truth), so the new value must win
    // over the static canonical fact — the first link of the accepted priority
    // "new editable value -> canonical/legacy Person value".
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The canonical Location fact hydrates the field before any edit.
    const locationInput = screen.getByTestId(
      "profile_edit.current_location_input",
    ) as HTMLInputElement;
    expect(locationInput.value).toBe("New York / New Jersey");

    // Edit the current location to a new value and save.
    await user.clear(locationInput);
    await user.type(locationInput, "Brooklyn, NY");
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The submitted patch carries the new location.
    const edits = getLastEdits();
    expect(edits).not.toBeNull();
    expect(edits?.currentLocation).toBe("Brooklyn, NY");

    // The backend record now carries the new value.
    expect(getProfile("lula-mae")?.currentLocation).toBe("Brooklyn, NY");

    // The form re-hydrates from the updated backend record: the NEW value wins
    // over the canonical 'New York / New Jersey' fact.
    expect(
      (
        screen.getByTestId(
          "profile_edit.current_location_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("Brooklyn, NY");
  });

  it("keeps the canonical value when the user saves without changing it", async () => {
    // The canonical Location fact 'New York / New Jersey' hydrates the field.
    // Saving without touching it must NOT erase it: the canonical value is
    // recognized as unchanged and omitted from the patch, so the backend keeps
    // its current (canonical-derived) value.
    seedLulaMaeBackendProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="lula-mae" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Change only the suffix; leave the hydrated location as-is.
    await user.selectOptions(
      screen.getByTestId("profile_edit.suffix_select"),
      "II",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The patch contains only the suffix change — the hydrated canonical
    // location is omitted so it is never overwritten with a blank.
    const edits = getLastEdits();
    expect(edits).not.toBeNull();
    expect(edits?.suffix).toBe("II");
    expect(edits?.currentLocation).toBeUndefined();

    // The form still shows the canonical location after re-hydration.
    expect(
      (
        screen.getByTestId(
          "profile_edit.current_location_input",
        ) as HTMLInputElement
      ).value,
    ).toBe("New York / New Jersey");
  });
});
