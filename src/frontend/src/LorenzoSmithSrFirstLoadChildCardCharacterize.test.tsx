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
import { cleanup, configure, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PersonProfilePage,
  lorenzoSmithSrProfile,
} from "./pages/PersonProfilePage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Characterization baseline for the relationship (child) card on a Person
// Profile page resolving the canonical profile photo on FIRST LOAD. The
// upcoming build makes relationship cards resolve the canonical Person Profile
// and canonical profile photo without relying on previously visited profile
// state, route history, preloaded Explore Family data, stale relationship
// snapshots, or cached card copies.
//
// The acceptance criterion: opening Lorenzo Smith Sr.'s profile directly from
// Home or a fresh navigation state shows Waxx Minty's child card with the
// correct profile photo immediately, without opening Waxx's profile first.
//
// These tests render PersonProfilePage directly with the static
// lorenzoSmithSrProfile — a fresh navigation with no Explore Family preload and
// no prior profile visit — and seed the canonical backend profile + profile
// photo for the child (lorenzoSmithJr / Waxx Minty). They assert the child card
// in the Family section resolves the canonical photo on first render:
//
//  1. When the canonical child profile has a selected profile photo, the child
//     card renders that photo image (alt "…'s portrait"), not the initials
//     placeholder.
//  2. When the canonical child profile has no selected photo, the child card
//     renders the initials placeholder instead of an image.
//
// The FamilyMember row resolves via useCanonicalPerson -> usePersonProfile +
// useProfilePhoto, the same seam every card surface uses, so a first-load
// regression in that resolution is caught here independent of navigation.
const ACCOUNT = "2vxsx-fae";

const { mockActor, resetState, seedProfile, seedProfilePhoto } = vi.hoisted(
  () => {
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
        return null;
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
        profiles = {};
        profilePhotos = {};
      },
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
            uploadedBy: Principal.fromText(ACCOUNT),
          },
        };
      },
    };
  },
);

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    clear: () => {},
    identity: null,
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

function renderLorenzoSmithSrProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={lorenzoSmithSrProfile}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

function seedWaxxMintyProfile(): PersonProfile {
  const profile: PersonProfile = {
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
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

describe("Lorenzo Smith Sr. profile child card resolves the canonical photo on first load", () => {
  it("shows Waxx Minty's profile photo on the child card immediately, without opening Waxx's profile first", async () => {
    // The canonical child profile (lorenzoSmithJr / Waxx Minty) exists in the
    // backend with a selected profile photo. Opening Lorenzo Smith Sr.'s
    // profile directly (fresh navigation, no Explore Family preload, no prior
    // profile visit) must show that photo on the child card immediately.
    seedWaxxMintyProfile();
    seedProfilePhoto("lorenzoSmithJr");
    renderLorenzoSmithSrProfile();

    // The child card resolves the canonical photo on first load: the image
    // renders with the canonical display name and the durable photo URL.
    const img = await screen.findByRole("img", {
      name: "Waxx Minty's portrait",
    });
    expect(img).toHaveAttribute("src", "blob:mock-0");
    // No initials placeholder is shown for the child.
    expect(screen.queryByText("WM")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton (not initials) on the child card while the canonical child's photo is bootstrapped", async () => {
    // The canonical child profile exists but has no selected profile photo yet.
    // The first-load fix drives the loading state from the profile-photo lookup
    // (hasCanonicalProfile && !profilePhotoUrl), so the child card must show a
    // loading skeleton rather than a premature initials placeholder while the
    // canonical photo is bootstrapped.
    seedWaxxMintyProfile();
    renderLorenzoSmithSrProfile();

    // The child card shows the loading skeleton, not the initials placeholder.
    expect(
      await screen.findByTestId("profile.family_member.loading_state"),
    ).toBeInTheDocument();
    expect(screen.queryByText("WM")).not.toBeInTheDocument();
  });
});
