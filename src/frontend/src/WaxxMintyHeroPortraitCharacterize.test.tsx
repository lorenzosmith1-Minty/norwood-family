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

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Cover for the full profile hero portrait of Waxx Minty (the canonical
// preferred name of the graph-only person lorenzoSmithJr). The build makes the
// hero resolve the selected PROFILE photo through the shared canonical resolver
// (useCanonicalPerson -> useProfilePhoto -> Photo.blob.getDirectURL()), exactly
// as every card surface does, instead of the static portrait URL snapshot. These
// tests cover the accepted behavior:
//
//  1. When a selected profile photo exists in the canonical backend store, the
//     hero portrait renders that photo image (alt "…'s profile photo"), not the
//     initials placeholder.
//  2. When no selected profile photo exists, the hero renders the initials
//     placeholder (data-ocid="profile.header.initials") instead of an image.
//
// The tests render PersonProfilePage directly so they cover the hero's
// resolution independent of the navigation that populates the page.
const ACCOUNT = "2vxsx-fae";

const { mockActor, resetState, seedProfile, seedProfilePhoto } = vi.hoisted(
  () => {
    let profiles: Record<string, PersonProfile> = {};
    let profilePhotos: Record<string, Photo | null> = {};

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
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

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

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in so the
  // profile-photo URL resolves.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

describe("Waxx Minty full profile hero portrait", () => {
  it("renders the selected profile photo on the hero when a canonical photo exists", async () => {
    // The canonical profile exists and has a selected profile photo in the
    // durable store. The hero must resolve it through the shared resolver.
    seedCanonicalProfile();
    seedProfilePhoto("lorenzoSmithJr");
    renderProfile();

    // The hero portrait renders the selected photo image, not the initials
    // placeholder.
    const heroImg = await screen.findByRole("img", {
      name: "Waxx Minty's profile photo",
    });
    expect(heroImg).toBeInTheDocument();
    expect(heroImg).toHaveAttribute("src", "blob:mock-0");
    // No initials placeholder is shown.
    expect(
      screen.queryByTestId("profile.header.initials"),
    ).not.toBeInTheDocument();
  });

  it("renders the initials placeholder on the hero when no selected photo exists", async () => {
    // The canonical profile exists but has no selected profile photo, so the
    // hero shows the initials placeholder rather than an image.
    seedCanonicalProfile();
    renderProfile();

    const initials = await screen.findByTestId("profile.header.initials");
    expect(initials).toBeInTheDocument();
    expect(within(initials).getByText("WM")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /profile photo/i }),
    ).not.toBeInTheDocument();
  });
});
