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
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type PersonProfile as PagePersonProfile,
  PersonProfilePage,
  lulaMaeProfile,
} from "./pages/PersonProfilePage";
import { ProfileEditPage } from "./pages/ProfileEditPage";

// Characterization baseline for the profile-edit hydration + patch-only save
// build. The request intentionally changes how the Edit My Profile form behaves:
// it will hydrate existing Person data from the canonical record (pre-filling
// fields instead of opening blank) and save patch-only (only intentionally
// changed fields, never overwriting canonical data with blank values).
//
// This file deliberately does NOT freeze the current blank-hydration or
// full-replace-save behavior. Instead it protects the adjacent working behavior
// the change must not disturb:
//
//  1. The profile page renders Lula Mae Norwood's known canonical data (her
//     display name and recorded facts) — the premise of the acceptance criterion
//     "Opening Lula Mae Norwood's profile shows her known canonical data".
//  2. The edit form's suffix select offers the standard suffix set including
//     'II' — the exact value the acceptance criterion changes the suffix to, so
//     the select must keep offering it as a selectable option.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend so the edit page
// can be exercised without a canister. It applies edits to the canonical record
// IN PLACE and enforces owner-only editing of a claimed living profile.
// ---------------------------------------------------------------------------
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
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
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
      _fromPersonId: string,
      _toPersonId: string,
      _relationshipType: RelationshipType,
    ): Promise<
      | { __kind__: "ok"; ok: RelationshipRequest }
      | { __kind__: "err"; err: string }
    > {
      return {
        __kind__: "ok",
        ok: {
          id: 1n,
          requestingPersonId: _fromPersonId,
          relatedPersonId: _toPersonId,
          proposedRelationship: _relationshipType,
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

describe("Profile page renders Lula Mae Norwood's canonical data", () => {
  it("shows her display name and recorded facts on the profile page", async () => {
    // Lula Mae Norwood's canonical profile data is the premise of the
    // acceptance criterion "Opening Lula Mae Norwood's profile shows her known
    // canonical data". The edit build must not disturb this rendering.
    renderPage(
      <PersonProfilePage
        person={lulaMaeProfile as PagePersonProfile}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
      />,
    );

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );

    // Her recorded facts render on the profile page. "Versie Smith" appears in
    // both the facts list and the Family section, so assert it is present at
    // least once.
    expect(
      screen.getByText("Clayton Norwood and Erma T. Williams"),
    ).toBeInTheDocument();
    expect(screen.getByText("New York / New Jersey")).toBeInTheDocument();
    expect(screen.getAllByText("Versie Smith").length).toBeGreaterThan(0);
  });
});

describe("Edit form suffix select options", () => {
  it("offers the standard suffix set including 'II'", async () => {
    // The acceptance criterion changes only the suffix to 'II' and saves. The
    // suffix select must keep offering 'II' (and the standard suffix set) as a
    // selectable option, so the change cannot silently drop it.
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    const suffixSelect = screen.getByTestId(
      "profile_edit.suffix_select",
    ) as HTMLSelectElement;
    const options = Array.from(suffixSelect.options).map((o) => o.value);
    expect(options).toEqual(["", "Jr.", "Sr.", "II", "III", "IV"]);

    // Selecting 'II' updates the draft's suffix value.
    await user.selectOptions(suffixSelect, "II");
    expect(suffixSelect.value).toBe("II");
  });
});
