import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type Photo,
  type ProfileClaim,
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
  type PersonProfile as PagePersonProfile,
  PersonProfilePage,
} from "./pages/PersonProfilePage";

// Cover for the frontend photo-bootstrap branch the production change removed.
// The previous build injected a bundled demo portrait into the real profile on
// first load (useEnsureLorenzoProfilePhoto). That bootstrap was removed per the
// doNotBuild exclusions: no seed/demo media may be injected into the real
// profile, and photo-less profiles must resolve to initials once the photo query
// resolves.
//
// The accepted behavior covered here:
//
//  1. When the canonical profile has no selected profile photo, the app does NOT
//     upload any seed/demo media (addPhoto is never called) and the hero resolves
//     to the initials placeholder once the photo query resolves.
//  2. When the canonical profile already has a selected profile photo, the app
//     does NOT re-upload or overwrite it (addPhoto is never called); the real
//     photo is shown.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

const { mockActor, resetState, seedProfile, seedProfilePhoto, addPhotoCalls } =
  vi.hoisted(() => {
    let profiles: Record<string, PersonProfile> = {};
    let profilePhotos: Record<string, Photo | null> = {};
    let addPhotoCalls = 0;

    const mockActor = {
      async listPhotos(): Promise<unknown[]> {
        return [];
      },
      async getProfilePhoto(personId: string): Promise<Photo | null> {
        return profilePhotos[personId] ?? null;
      },
      async getPersonProfile(personId: string): Promise<PersonProfile | null> {
        return profiles[personId] ?? null;
      },
      async getMyProfileClaim(): Promise<ProfileClaim | null> {
        return null;
      },
      async getMyRelationshipRequests(): Promise<unknown[]> {
        return [];
      },
      async listNotifications(): Promise<Notification[]> {
        return [];
      },
      async addPhoto(): Promise<Photo> {
        addPhotoCalls += 1;
        throw new Error("addPhoto must never be called for the real profile");
      },
    };

    return {
      mockActor,
      resetState: () => {
        profiles = {};
        profilePhotos = {};
        addPhotoCalls = 0;
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
      addPhotoCalls: () => addPhotoCalls,
    };
  });

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
  vi.restoreAllMocks();
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

// Waxx Minty is a graph-only person (lorenzoSmithJr) with no static portrait
// URL, exactly as the backend profile resolves it: portrait.src is empty so the
// hero falls back to initials when no selected profile photo exists.
const waxxMintyProfile: PagePersonProfile = {
  id: "lorenzoSmithJr",
  name: "Waxx Minty",
  role: "Family member",
  portrait: { src: "", alt: "Profile for Waxx Minty" },
  facts: [],
  story: "",
  family: { spouseName: "", spouseRole: "", childrenText: "" },
  timeline: [],
  sources: [],
};

function seedCanonicalProfile() {
  seedProfile({
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
    preferredName: "Waxx Minty",
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  });
}

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={waxxMintyProfile}
        onBack={() => {}}
        profilePhoto={undefined}
        onProfilePhotoChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("No seed/demo media is injected into the real profile", () => {
  it("does not upload any media and resolves to initials when the canonical profile has no photo", async () => {
    // The canonical profile exists but has no selected profile photo. The app
    // must NOT inject a bundled/demo portrait (addPhoto is never called); once
    // the photo query resolves, the hero shows the initials placeholder.
    seedCanonicalProfile();
    renderProfile();

    const initials = await screen.findByTestId("profile.header.initials");
    expect(initials).toBeInTheDocument();
    expect(within(initials).getByText("WM")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /profile photo/i }),
    ).not.toBeInTheDocument();
    // No seed/demo media was uploaded to the real profile.
    expect(addPhotoCalls()).toBe(0);
  });

  it("does not re-upload or overwrite an existing real profile photo", async () => {
    // The canonical profile already has a selected profile photo. The app must
    // NOT re-upload a demo portrait (addPhoto is never called); the real photo
    // is shown.
    seedCanonicalProfile();
    seedProfilePhoto("lorenzoSmithJr");
    renderProfile();

    const heroImg = await screen.findByRole("img", {
      name: "Waxx Minty's profile photo",
    });
    expect(heroImg).toHaveAttribute("src", "blob:mock-0");
    expect(
      screen.queryByTestId("profile.header.initials"),
    ).not.toBeInTheDocument();
    // No seed/demo media was uploaded to the real profile.
    expect(addPhotoCalls()).toBe(0);
  });
});
