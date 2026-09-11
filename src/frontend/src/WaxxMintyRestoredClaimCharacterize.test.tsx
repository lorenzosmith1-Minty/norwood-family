import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type Photo,
  type ProfileClaim,
  type RelationshipRequest,
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

// Characterization baseline for the restored Waxx Minty (canonical
// lorenzoSmithJr) profile. The upcoming build restores the existing approved
// claim linking the signed-in Norwood account to the canonical Lorenzo Smith
// Jr. / Waxx Minty Person record, and restores the user-uploaded photos and the
// selected profilePhotoId so the profile returns to CLAIMED without requiring
// the user to claim again.
//
// These tests freeze the working behavior that must NOT change once the profile
// is restored:
//
//  1. A signed-in owner whose canonical profile is already CLAIMED (with a
//     pre-existing selected profile photo) sees the real photo on the full
//     profile hero on first load — not the initials placeholder and not a
//     generic seeded image.
//  2. The same owner's claim section shows "Claimed" with the owner edit entry,
//     and does NOT offer the "This is Me" claim action or show "Pending claim" —
//     the user is not asked to claim again.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It holds the
// canonical Person Profile records and the durable selected profile photo, so
// the restored claimed state (claim ownership + selected photo) can be observed
// end to end without a canister. getMyProfile resolves the profile owned by the
// signed-in caller, exactly as the real backend does for the restored claim.
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
    async listPhotos(personId: string): Promise<Photo[]> {
      return profilePhotos[personId] ? [profilePhotos[personId]!] : [];
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
    async getMyRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
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

// Seed the canonical Lorenzo Smith Jr. / Waxx Minty profile in its restored
// state: already CLAIMED by the signed-in owner, with a selected profile photo.
function seedRestoredClaimedProfile(): PersonProfile {
  const profile: PersonProfile = {
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
    preferredName: "Waxx Minty",
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

describe("Restored Waxx Minty claimed profile with real photo", () => {
  it("shows CLAIMED and the real profile photo on the hero on first load, without asking the user to claim again", async () => {
    // The canonical profile is already restored: CLAIMED by the signed-in owner
    // with a pre-existing selected profile photo. Opening the owner's profile
    // (My Profile) on a fresh render must show the real photo and the CLAIMED
    // status immediately — no re-claim, no initials placeholder, no generic
    // seeded image.
    seedRestoredClaimedProfile();
    seedProfilePhoto("lorenzoSmithJr");
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderApp();

    // Open the owner's own profile via the navbar profile button (labeled with
    // the canonical display name, Waxx Minty, once hydration resolves).
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Waxx Minty" }));

    // The hero resolves the selected profile photo on first load.
    const heroImg = await screen.findByRole("img", {
      name: "Waxx Minty's profile photo",
    });
    expect(heroImg).toHaveAttribute("src", "blob:mock-0");
    // No initials placeholder is shown.
    expect(
      screen.queryByTestId("profile.header.initials"),
    ).not.toBeInTheDocument();

    // The claim section shows CLAIMED with the owner edit entry.
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Claimed"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    ).toBeInTheDocument();

    // The user is NOT asked to claim again: no "This is Me" action and no
    // "Pending claim" badge.
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByText("Pending claim"),
    ).not.toBeInTheDocument();
  });
});
