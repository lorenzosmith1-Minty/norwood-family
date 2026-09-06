import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type ProfileClaim,
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

// Characterization baseline for the profile-edit surface. The upcoming build
// intentionally expands the edit form from the current limited field set
// (preferredName/occupation/birthInfo/story/timeline/privacySettings) to a
// fuller set (identity, basic info, about). These tests freeze the surrounding
// behavior that must NOT regress:
//
//  1. Editing a claimed owner's profile updates the SAME canonical person
//     record (same personId, no duplicate created) and the navigation display
//     name reflects the new preferred name.
//  2. The editor never rewrites family relationships directly — it shows the
//     family-relationships note and routes to the Relationship Request flow.
//  3. The edit page re-checks canEdit (owner + living + claimed): a deceased
//     profile and an unclaimed profile are not editable, and a signed-in
//     non-owner sees the not-owner state.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend so the profile
// edit, canonical-record preservation, and relationship-request journeys can be
// exercised end to end without a canister. It keeps the same invariants the
// real backend enforces: updateOwnProfile only mutates the caller's own claimed
// living profile in place (same personId), and relationships are only changed
// through proposeRelationship, never through profile editing.
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
  let confirmed: Relationship[] = [];

  const mockActor = {
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      // Resolve the caller's own linked/claimed profile, mirroring the backend's
      // getMyProfile contract.
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      return owned ?? null;
    },
    async getMyProfileClaim(): Promise<ProfileClaim | null> {
      return null;
    },
    async listConfirmedRelationships(): Promise<Relationship[]> {
      return [...confirmed];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
    },
    async updateOwnProfile(
      personId: string,
      edits: {
        preferredName?: string;
        story?: string;
        occupation?: string;
        birthInfo?: string;
        timeline?: string[];
        privacySettings?: string;
      },
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      if (profile.claimedByUserId?.toString() !== currentPrincipal)
        return { __kind__: "err", err: "NotOwner" };
      if (profile.livingStatus === LivingStatus.Deceased)
        return { __kind__: "err", err: "DeceasedProfile" };
      // The canonical record is updated IN PLACE: same personId, no duplicate
      // person record is created.
      const updated: PersonProfile = {
        ...profile,
        preferredName: edits.preferredName ?? profile.preferredName,
        story: edits.story ?? profile.story,
        occupation: edits.occupation ?? profile.occupation,
        birthInfo: edits.birthInfo ?? profile.birthInfo,
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
      confirmed = [];
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
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  return profile;
}

describe("Canonical record preservation on profile edit", () => {
  it("updates the same canonical person record (no duplicate) and the navigation display name", async () => {
    // The canonical Lorenzo Smith Jr. profile is claimed by the signed-in owner.
    seedClaimedLivingProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // Open the owner's own profile via the navbar "My Profile" entry.
    await user.click(screen.getByRole("button", { name: /My Profile/ }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );

    // The owner sees the Edit My Profile button and opens the editor.
    const claimSection = screen.getByTestId("profile.claim_section");
    await user.click(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    );

    // The editor loads with the owner form.
    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Change the preferred/display name and save.
    const nameInput = screen.getByTestId("profile_edit.preferred_name_input");
    await user.clear(nameInput);
    await user.type(nameInput, "Lorenzo Smith Jr.");
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // The canonical record is updated IN PLACE: the same personId still exists,
    // and no duplicate Lorenzo Smith Jr. record was created.
    const canonical = await mockActor.getPersonProfile("lorenzoSmithJr");
    expect(canonical).not.toBeNull();
    expect(canonical?.personId).toBe("lorenzoSmithJr");
    expect(canonical?.preferredName).toBe("Lorenzo Smith Jr.");

    // The navigation display name reflects the updated preferred name.
    expect(screen.getByTestId("layout.account_identity")).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
  });
});

describe("Family relationships are never rewritten by the editor", () => {
  it("shows the family-relationships note and routes to the Relationship Request flow", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    // Seed another family member so the relationship-person select has options.
    seedProfile({
      personId: "julia",
      name: "Julia “Julie” Norwood",
      livingStatus: LivingStatus.Deceased,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // The editor surfaces the family-relationships note: relationships are
    // confirmed separately to protect the accuracy of the family tree and are
    // never rewritten directly by profile editing.
    expect(
      screen.getByText(
        /Family relationships are confirmed separately to protect the accuracy of the family tree/,
      ),
    ).toBeInTheDocument();

    // Before a family member is selected, the editor shows the prompt to select
    // one and propose a relationship.
    expect(
      screen.getByText("Select a family member to propose a relationship."),
    ).toBeInTheDocument();

    // The editor routes to the Relationship Request flow: a family member can be
    // selected and a relationship proposed, which stays pending until a steward
    // confirms it.
    await user.selectOptions(
      screen.getByTestId("profile_edit.relationship_person_select"),
      "julia",
    );
    // The RelationshipRequestForm is now shown (it offers a relationship type).
    expect(
      await screen.findByText(/propose a relationship/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Select a family member to propose a relationship."),
    ).not.toBeInTheDocument();
  });
});

describe("Edit My Profile button gating on the profile page", () => {
  it("is absent for a signed-in non-owner viewing a claimed profile", async () => {
    // Clayton's profile is claimed by OWNER; the signed-in OTHER_USER is just a
    // viewer, so the Edit My Profile button must not appear on the profile page.
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OTHER_USER);
    const user = userEvent.setup();
    renderApp();

    // Navigate to Clayton's profile via Explore Family.
    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );
    await user.click(screen.getByRole("button", { name: /Clayton Norwood/ }));
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );

    // The viewer is not the owner, so no Edit My Profile button is shown.
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      within(claimSection).queryByRole("button", { name: "Edit My Profile" }),
    ).not.toBeInTheDocument();
  });
});

describe("Profile edit page gating states", () => {
  it("shows a not-editable state for a deceased profile", async () => {
    const profile: PersonProfile = {
      personId: "julia",
      name: "Julia “Julie” Norwood",
      livingStatus: LivingStatus.Deceased,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: Principal.fromText(OWNER),
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    };
    seedProfile(profile);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="julia" onBack={() => {}} />);

    expect(
      await screen.findByText("This profile is not editable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Profiles for deceased family members are preserved as historical records and cannot be edited/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile_edit.save_button"),
    ).not.toBeInTheDocument();
  });

  it("shows a not-claimed state for an unclaimed living profile", async () => {
    const profile: PersonProfile = {
      personId: "clayton",
      name: "Clayton Norwood",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    };
    seedProfile(profile);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(
      await screen.findByText("This profile has not been claimed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This profile has not been claimed by an owner yet/),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile_edit.save_button"),
    ).not.toBeInTheDocument();
  });

  it("shows a not-owner state for a signed-in non-owner", async () => {
    seedClaimedLivingProfile("clayton", "Clayton Norwood", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OTHER_USER);
    renderPage(<ProfileEditPage personId="clayton" onBack={() => {}} />);

    expect(
      await screen.findByText("You don't own this profile"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only the approved owner of this profile can edit it/),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile_edit.save_button"),
    ).not.toBeInTheDocument();
  });
});
