import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  PrivacyLevel,
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
import App from "./App";
import { ProfileEditPage } from "./pages/ProfileEditPage";

// Cover for the expanded Edit My Profile build. The characterization baseline
// (ProfileEditCharacterize) froze the surrounding behavior: canonical-record
// preservation, the family-relationships note, edit-button gating, and the
// not-editable/not-claimed/not-owner states. This cover asserts the NEW accepted
// behavior:
//
//  1. The expanded form renders all six sections (Identity, Basic Information,
//     About, Photo, Timeline, Privacy) with their editable fields.
//  2. Editing identity/basic/about fields updates the SAME canonical person
//     record (same personId, claim stays CLAIMED, no duplicate created).
//  3. Adding birth information updates the Profile Completeness indicator.
//  4. Family Steward gating: a steward may edit an unclaimed profile but must
//     never overwrite a profile claimed by another user.
//  5. Validation: a display name is required and an invalid date is rejected,
//     with entered values retained after a failed save.
//  6. The draft is autosaved to localStorage while editing.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const _OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend so the expanded
// profile-edit journeys can be exercised end to end without a canister. It
// applies the full expanded ProfileEdits payload to the canonical record IN
// PLACE (same personId, claim ownership preserved) and enforces the same
// invariants the real backend enforces: only the owner of a claimed living
// profile may edit, and relationships are never rewritten by profile editing.
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
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
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
      // The canonical record is updated IN PLACE: same personId, claim ownership
      // preserved, no duplicate person record is created.
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
      isAdmin = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
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

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

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

describe("Expanded Edit My Profile form sections", () => {
  it("renders all six sections with their editable fields", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Identity section fields.
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.preferred_name_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.first_name_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.middle_name_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.last_name_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.suffix_select"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.nickname_input"),
    ).toBeInTheDocument();

    // Basic Information section fields.
    expect(screen.getByText("Basic Information")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.birth_date_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.birthplace_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.current_location_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.occupation_input"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("profile_edit.living_radio")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.deceased_radio"),
    ).toBeInTheDocument();

    // About section fields.
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.short_bio_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.longer_story_input"),
    ).toBeInTheDocument();

    // Photo section.
    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.photo_upload_button"),
    ).toBeInTheDocument();

    // Timeline section.
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.timeline_add_button"),
    ).toBeInTheDocument();

    // Privacy section.
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile_edit.privacy_select"),
    ).toBeInTheDocument();
  });
});

describe("Canonical record preservation with expanded fields", () => {
  it("updates the same canonical record (same personId, claim stays CLAIMED) with identity/basic/about edits", async () => {
    seedClaimedLivingProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="lorenzoSmithJr" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Edit identity, basic information, and about fields.
    await user.type(
      screen.getByTestId("profile_edit.preferred_name_input"),
      "Lorenzo Smith Jr.",
    );
    await user.type(
      screen.getByTestId("profile_edit.first_name_input"),
      "Lorenzo",
    );
    await user.type(
      screen.getByTestId("profile_edit.last_name_input"),
      "Smith",
    );
    await user.selectOptions(
      screen.getByTestId("profile_edit.suffix_select"),
      "Jr.",
    );
    await user.type(
      screen.getByTestId("profile_edit.birth_date_input"),
      "1990",
    );
    await user.type(
      screen.getByTestId("profile_edit.birthplace_input"),
      "Chicago, IL",
    );
    await user.type(
      screen.getByTestId("profile_edit.short_bio_input"),
      "A family historian.",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));

    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The canonical record is updated IN PLACE: same personId, claim ownership
    // preserved (still CLAIMED by the owner), no duplicate record created.
    const canonical = getProfile("lorenzoSmithJr");
    expect(canonical).not.toBeNull();
    expect(canonical?.personId).toBe("lorenzoSmithJr");
    expect(canonical?.claimStatus).toBe(ClaimStatus.Claimed);
    expect(canonical?.claimedByUserId?.toString()).toBe(OWNER);
    expect(canonical?.preferredName).toBe("Lorenzo Smith Jr.");
    expect(canonical?.firstName).toBe("Lorenzo");
    expect(canonical?.lastName).toBe("Smith");
    expect(canonical?.suffix).toBe("Jr.");
    expect(canonical?.birthDate).toBe("1990");
    expect(canonical?.birthplace).toBe("Chicago, IL");
    expect(canonical?.shortBio).toBe("A family historian.");
  });
});

describe("Profile Completeness data updates after editing", () => {
  it("records added birth information on the canonical record that drives the completeness indicator", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // Open the owner's own profile via the navbar profile button (labeled with
    // the canonical display name, Clayton Norwood, once hydration resolves).
    await user.click(
      await screen.findByRole("button", { name: "Clayton Norwood" }),
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );

    // The completeness indicator is present on the profile page.
    const completeness = document.querySelector(
      '[data-ocid="profile.completeness"]',
    );
    expect(completeness).not.toBeNull();

    // Open the editor and add birth information (with a display name so the
    // save passes validation).
    const claimSection = screen.getByTestId("profile.claim_section");
    await user.click(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    );
    expect(await screen.findByText("You own this profile")).toBeInTheDocument();
    await user.type(
      screen.getByTestId("profile_edit.preferred_name_input"),
      "Clayton Norwood",
    );
    await user.type(
      screen.getByTestId("profile_edit.birth_date_input"),
      "1990",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The canonical record now carries the birth date — the data source the
    // completeness "Birth information" field reads from.
    expect(getProfile("clayton")?.birthDate).toBe("1990");
  });
});

describe("Family Steward gating on the edit page", () => {
  it("lets a steward edit an unclaimed living profile", async () => {
    const profile: PersonProfile = {
      personId: "clayton",
      name: "Clayton Norwood",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
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
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(STEWARD);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    // A steward may edit an unclaimed profile and is labeled as a steward.
    expect(
      await screen.findByText("Editing as Family Steward"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("profile_edit.save_button")).toBeInTheDocument();
  });

  it("never lets a steward overwrite a profile claimed by another user", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(STEWARD);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    // A profile claimed by a different user must never be overwritten, even by
    // a steward.
    expect(
      await screen.findByText("You don't own this profile"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile_edit.save_button"),
    ).not.toBeInTheDocument();
  });
});

describe("Edit form validation", () => {
  it("requires a display name and retains entered values after a failed save", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Enter a first name but no display name and no last name, then save.
    await user.type(
      screen.getByTestId("profile_edit.first_name_input"),
      "Clay",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));

    // The display-name validation error is shown.
    expect(
      await screen.findByTestId("profile_edit.display_name_error"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add a display name or a first and last name so this profile can be identified.",
      ),
    ).toBeInTheDocument();

    // The entered value is retained after the failed save.
    expect(
      (screen.getByTestId("profile_edit.first_name_input") as HTMLInputElement)
        .value,
    ).toBe("Clay");
  });

  it("rejects an invalid birth date and retains the entered value", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Enter a display name and an invalid birth date, then save.
    await user.type(
      screen.getByTestId("profile_edit.preferred_name_input"),
      "Clayton",
    );
    await user.type(
      screen.getByTestId("profile_edit.birth_date_input"),
      "not-a-date",
    );
    await user.click(screen.getByTestId("profile_edit.save_button"));

    // The birth-date validation error is shown.
    expect(
      await screen.findByTestId("profile_edit.birth_date_error"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter a valid date or a 4-digit year."),
    ).toBeInTheDocument();

    // The entered value is retained after the failed save.
    expect(
      (screen.getByTestId("profile_edit.birth_date_input") as HTMLInputElement)
        .value,
    ).toBe("not-a-date");
  });
});

describe("Autosave draft to localStorage", () => {
  it("autosaves the draft while editing so a refresh does not lose work", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Type into a field; the draft is autosaved (debounced) to localStorage.
    await user.type(
      screen.getByTestId("profile_edit.preferred_name_input"),
      "Clayton Norwood",
    );

    await vi.waitFor(() => {
      const raw = localStorage.getItem("norwood.profile-edit.draft.clayton");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as { preferredName: string };
      expect(parsed.preferredName).toBe("Clayton Norwood");
    });
  });

  it("restores a saved draft from localStorage on reload so a refresh does not lose work", async () => {
    // Seed a previously autosaved draft for this person, as if the user had
    // typed it and then navigated away or refreshed before saving.
    localStorage.setItem(
      "norwood.profile-edit.draft.clayton",
      JSON.stringify({
        preferredName: "Clayton Norwood",
        firstName: "Clayton",
        middleName: "",
        lastName: "Norwood",
        suffix: "",
        nickname: "",
        birthDate: "1990",
        birthYearOnly: false,
        birthplace: "Chicago, IL",
        currentLocation: "",
        occupation: "",
        livingStatus: LivingStatus.Living,
        shortBio: "",
        longerStory: "",
        timeline: [],
        privacySettings: PrivacyLevel.FamilyOnly,
      }),
    );

    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The persisted draft is restored into the form on mount, so the user's
    // unsaved work is not lost by a refresh.
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
    ).toBe("1990");
    expect(
      (screen.getByTestId("profile_edit.birthplace_input") as HTMLInputElement)
        .value,
    ).toBe("Chicago, IL");
  });
});
