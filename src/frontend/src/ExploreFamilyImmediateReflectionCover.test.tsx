import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type Photo,
  type ProfileClaim,
  type ProfileEdits,
  type Relationship,
  type RelationshipRequest,
  type RelationshipType,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";

// Cover for the immediate-reflection build. useExploreFamily now resolves the
// focus profile from the shared canonical backend store (usePersonProfile)
// merged over the static record, so a saved profile edit reflects immediately
// in the Explore Family focus card and the father's child card — without
// opening My Profile again, refreshing the browser, or a navigation cycle.
//
// These tests exercise the save-then-navigate journey end to end:
//
//  1. After changing the display name and saving, navigating DIRECTLY to
//     Explore Family shows the updated name immediately on the father's child
//     card and on the focus card after recentering.
//  2. After a saved profile photo exists, navigating directly to Explore
//     Family shows the photo immediately on the father's child card.
//  3. No duplicate Person record is created: the canonical profile still
//     resolves by the same personId after the edit.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It holds the
// canonical Person Profile records and the durable profile photos, and
// updateOwnProfile mutates the canonical record IN PLACE (same personId, no
// duplicate created) — mirroring the real backend's contract. This lets the
// immediate-reflection mechanism (useUpdateOwnProfile invalidating the
// personProfile query that useExploreFamily reads) be exercised end to end.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  seedProfilePhoto,
  getProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let profilePhotos: Record<string, Photo | null> = {};

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getProfilePhoto(personId: string): Promise<Photo | null> {
      return profilePhotos[personId] ?? null;
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
      // The canonical record is updated IN PLACE: same personId, claim
      // ownership preserved, no duplicate person record is created.
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
      profilePhotos = {};
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
    seedProfilePhoto: (personId: string) => {
      profilePhotos = {
        ...profilePhotos,
        [personId]: {
          id: 1n,
          blob: ExternalBlob.fromBytes(
            new Uint8Array([1, 2, 3]),
            "image/png",
            "waxx.png",
          ),
          mimeType: "image/png",
          filename: "waxx.png",
          uploadedAt: 1_700_000_000_000_000_000n,
          uploadedBy: Principal.fromText(OWNER),
        },
      };
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

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in so the
  // profile-photo URL resolves.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  // The navbar button is "Explore Family"; the Home page button is "Explore the
  // Family". Match either.
  await user.click(screen.getByRole("button", { name: /Explore Family/ }));
}

async function navigateToLorenzoSmithSr(
  user: ReturnType<typeof userEvent.setup>,
) {
  // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lorenzo Smith Sr\. Child/ }),
  );
}

describe("Immediate reflection of saved profile edits in Explore Family", () => {
  it("shows the saved display name immediately on the father's child card after navigating directly to Explore Family", async () => {
    // The canonical Lorenzo Smith Jr. profile is claimed by the signed-in owner
    // and has no preferred name yet.
    seedClaimedLivingProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", OWNER);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // Open the owner's own profile via the navbar profile button (labeled with
    // the canonical display name, Lorenzo Smith Jr., once hydration resolves),
    // then the editor.
    await user.click(
      await screen.findByRole("button", { name: "Lorenzo Smith Jr." }),
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    await user.click(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    );
    expect(await screen.findByText("You own this profile")).toBeInTheDocument();

    // Change the display name and save.
    const nameInput = screen.getByTestId("profile_edit.preferred_name_input");
    await user.type(nameInput, "Waxx");
    await user.click(screen.getByTestId("profile_edit.save_button"));
    expect(
      await screen.findByText("Your changes have been saved."),
    ).toBeInTheDocument();

    // Navigate DIRECTLY to Explore Family (no re-opening My Profile, no
    // refresh) and center on the father, Lorenzo Smith Sr.
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    // The father's child card reflects the saved display name immediately.
    const childrenZone = screen.getByTestId("explore.zone.children");
    const childCard = within(childrenZone).getByRole("button", {
      name: /Waxx Child/,
    });
    expect(childCard).toBeInTheDocument();
    expect(screen.queryByText("lorenzoSmithJr")).not.toBeInTheDocument();

    // Recenter on Waxx: the focus card (resolved from the canonical store by
    // useExploreFamily) shows the same saved name immediately.
    await user.click(childCard);
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(within(focusCard).getByText("Waxx")).toBeInTheDocument();

    // No duplicate Person record is created: the canonical profile still
    // resolves by the same personId.
    expect(getProfile("lorenzoSmithJr")?.personId).toBe("lorenzoSmithJr");
    expect(getProfile("lorenzoSmithJr")?.preferredName).toBe("Waxx");
  });

  it("shows a saved profile photo immediately on the father's child card after navigating directly to Explore Family", async () => {
    // The canonical Lorenzo Smith Jr. profile is claimed by the signed-in owner
    // and has a saved profile photo.
    seedClaimedLivingProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", OWNER);
    seedProfilePhoto("lorenzoSmithJr");
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // Navigate DIRECTLY to Explore Family and center on the father.
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    // The father's child card shows the saved profile photo immediately.
    const childrenZone = screen.getByTestId("explore.zone.children");
    const childCard = within(childrenZone).getByRole("button", {
      name: /Lorenzo Smith Jr\. Child/,
    });
    const childImg = childCard.querySelector("img");
    expect(childImg).not.toBeNull();
    expect(childImg?.getAttribute("alt")).toBe(
      "Lorenzo Smith Jr.'s profile photo",
    );
  });
});
