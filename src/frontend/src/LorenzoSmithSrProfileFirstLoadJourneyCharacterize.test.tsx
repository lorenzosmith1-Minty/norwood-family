import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type Photo,
  type ProfileClaim,
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

// Characterization baseline for the full-app journey that the upcoming build
// must keep working: opening Lorenzo Smith Sr.'s profile FRESH (from Home,
// through Explore Family, without ever opening Waxx Minty's profile first)
// shows the Waxx Minty child card in the profile's Family section with the
// canonical profile photo immediately.
//
// The intended change is backend seed data only (lorenzoSmithJr's preferredName
// becomes 'Waxx Minty' and a profile photo is attached). The frontend canonical
// resolution logic (useCanonicalPerson -> usePersonProfile + useProfilePhoto) is
// the adjacent working behavior that must NOT regress. This test seeds the
// intended canonical data (preferredName 'Waxx Minty' + a profile photo) and
// asserts the child card resolves it on first load through the real App
// navigation path — complementing the direct PersonProfilePage render test.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, holding the
// canonical Person Profile records and the durable profile photos so the child
// card can resolve the canonical name + photo by personId.
// ---------------------------------------------------------------------------
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
      async listConfirmedRelationships(): Promise<Relationship[]> {
        return [];
      },
      async listNotifications(): Promise<Notification[]> {
        return [];
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
          __kind__: "err",
          err: "NotImplemented",
        };
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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
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

async function openLorenzoSmithSrProfile(
  user: ReturnType<typeof userEvent.setup>,
) {
  // The focus card for Lorenzo Smith Sr. has a "View Profile" action that
  // routes to the profile page.
  const focusCard = screen.getByTestId("explore.focus.1");
  await user.click(
    within(focusCard).getByRole("button", { name: "View Profile" }),
  );
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    "Lorenzo Smith Sr.",
  );
}

// The Family section renders the child card inside a "Children" block. The
// child card is the FamilyMember row for lorenzoSmithJr (Waxx Minty).
function waxxChildCardImg(): HTMLImageElement | null {
  const familySection = screen.getByRole("region", { name: "Family" });
  const childrenBlock = within(familySection)
    .getByText("Children")
    .closest("div");
  expect(childrenBlock).not.toBeNull();
  const card = within(childrenBlock as HTMLElement)
    .getByText("Waxx Minty")
    .closest("div");
  expect(card).not.toBeNull();
  return (card as HTMLElement).querySelector("img");
}

describe("Lorenzo Smith Sr. profile opened fresh shows the Waxx Minty child card with the canonical photo", () => {
  it("shows Waxx Minty's profile photo on the child card on first load, without opening Waxx's profile first", async () => {
    // The canonical child profile (lorenzoSmithJr / Waxx Minty) exists in the
    // backend with a selected profile photo. Open Lorenzo Smith Sr.'s profile
    // FRESH from Home through Explore Family, never visiting Waxx's profile.
    seedWaxxMintyProfile();
    seedProfilePhoto("lorenzoSmithJr");
    const user = userEvent.setup();
    renderApp();

    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);
    await openLorenzoSmithSrProfile(user);

    // The child card in the profile's Family section resolves the canonical
    // photo on first load: the image renders with the canonical display name
    // and the durable photo URL, and no initials placeholder is shown.
    const img = await screen.findByRole("img", {
      name: "Waxx Minty's portrait",
    });
    expect(img).toHaveAttribute("src", "blob:mock-0");
    expect(screen.queryByText("WM")).not.toBeInTheDocument();
  });

  it("resolves to initials (not a skeleton) on the child card when the canonical child has no photo", async () => {
    // The canonical child profile exists but has no selected profile photo. The
    // first-load fix drives the loading state ONLY from the pending profile-photo
    // query, so once the photo query resolves (to null) the child card resolves
    // to the initials placeholder rather than a permanent loading skeleton.
    seedWaxxMintyProfile();
    const user = userEvent.setup();
    renderApp();

    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);
    await openLorenzoSmithSrProfile(user);

    // The child card resolves to the initials placeholder (WM), not a permanent
    // loading skeleton, once the photo query resolves with no photo.
    expect(await screen.findByText("WM")).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile.family_member.loading_state"),
    ).not.toBeInTheDocument();
    expect(waxxChildCardImg()).toBeNull();
  });
});
