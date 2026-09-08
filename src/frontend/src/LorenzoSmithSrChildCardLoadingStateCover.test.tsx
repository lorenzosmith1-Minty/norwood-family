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

// Cover for the loading/skeleton branch the production change added to the
// relationship-card surfaces (PersonProfilePage FamilyMember rows and PersonCard
// variants). The requirement: if profile/person data is loaded asynchronously,
// render a loading/skeleton state until canonical data resolves, then render the
// correct photo — do NOT permanently fall back to initials before the async
// canonical photo lookup completes.
//
// The characterize test (LorenzoSmithSrFirstLoadChildCardCharacterize) asserts
// the resolved state: the child card shows the canonical photo on first load, or
// the initials placeholder when no photo exists. This cover asserts the NEW
// branch: while the canonical person/photo queries are still pending, the child
// card shows a loading skeleton (not the initials placeholder), and once the
// async lookup resolves it renders the correct photo.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// A deferred promise lets the test hold the canonical person/photo queries in
// their pending (isLoading) state so the loading skeleton is observable before
// the async lookup resolves.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const { mockActor, resetState, seedProfile, seedProfilePhoto } = vi.hoisted(
  () => {
    let profiles: Record<string, PersonProfile> = {};
    let profilePhotos: Record<string, Photo | null> = {};
    // When set, the person/photo lookups stay pending until the deferred is
    // resolved, letting the test observe the loading skeleton.
    let pendingPerson: ReturnType<
      typeof deferred<PersonProfile | null>
    > | null = null;
    let pendingPhoto: ReturnType<typeof deferred<Photo | null>> | null = null;

    const mockActor = {
      async isCallerAdmin(): Promise<boolean> {
        return false;
      },
      async getPersonProfile(personId: string): Promise<PersonProfile | null> {
        if (pendingPerson) return pendingPerson.promise;
        return profiles[personId] ?? null;
      },
      async getProfilePhoto(personId: string): Promise<Photo | null> {
        if (pendingPhoto) return pendingPhoto.promise;
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
      holdPersonPending: () => {
        pendingPerson = deferred<PersonProfile | null>();
        return pendingPerson;
      },
      holdPhotoPending: () => {
        pendingPhoto = deferred<Photo | null>();
        return pendingPhoto;
      },
    };

    return {
      mockActor,
      resetState: () => {
        profiles = {};
        profilePhotos = {};
        pendingPerson = null;
        pendingPhoto = null;
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

// The Family section renders the child card inside a "Children" block. The
// child card is the FamilyMember row for lorenzoSmithJr (Waxx Minty).
function waxxChildCard(): HTMLElement {
  const familySection = screen.getByRole("region", { name: "Family" });
  const childrenBlock = within(familySection)
    .getByText("Children")
    .closest("div");
  expect(childrenBlock).not.toBeNull();
  const card = within(childrenBlock as HTMLElement)
    .getByText("Waxx Minty")
    .closest("div");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("Lorenzo Smith Sr. child card shows a loading skeleton until the canonical photo resolves", () => {
  it("renders a loading skeleton (not initials) while the canonical lookup is pending, then the photo", async () => {
    // The canonical child profile (lorenzoSmithJr / Waxx Minty) exists with a
    // selected profile photo, but the backend person/photo lookups are held
    // pending so the async canonical resolution has not completed yet.
    seedWaxxMintyProfile();
    seedProfilePhoto("lorenzoSmithJr");
    const personGate = mockActor.holdPersonPending();
    const photoGate = mockActor.holdPhotoPending();
    renderLorenzoSmithSrProfile();

    // While the canonical person/photo queries are pending, the child card must
    // show the loading skeleton — NOT permanently fall back to the initials
    // placeholder before the async lookup completes.
    const loadingState = await screen.findByTestId(
      "profile.family_member.loading_state",
    );
    expect(loadingState).toBeInTheDocument();
    // No initials placeholder and no image yet while loading.
    expect(screen.queryByText("WM")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Waxx Minty's portrait" }),
    ).not.toBeInTheDocument();

    // Resolve the pending canonical lookups; the child card must now render the
    // correct profile photo instead of the skeleton.
    personGate.resolve(seedWaxxMintyProfile());
    photoGate.resolve({
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
    });

    const img = await screen.findByRole("img", {
      name: "Waxx Minty's portrait",
    });
    // The resolved photo is a real object-storage blob URL, not the initials
    // placeholder.
    expect(img.getAttribute("src")).toMatch(/^blob:mock-/);
    // The loading skeleton is gone and no stale initials remain.
    expect(
      screen.queryByTestId("profile.family_member.loading_state"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("WM")).not.toBeInTheDocument();
  });

  it("resolves to initials (not a skeleton) once the photo query resolves with no photo", async () => {
    // The canonical child profile exists but has no selected profile photo. The
    // first-load fix drives the loading state ONLY from the pending profile-photo
    // query, so while the photo query is pending the child card shows the loading
    // skeleton, and once it resolves (to null) the card resolves to the initials
    // placeholder rather than a permanent skeleton.
    seedWaxxMintyProfile();
    const photoGate = mockActor.holdPhotoPending();
    renderLorenzoSmithSrProfile();

    // While the canonical photo query is pending, the child card shows the
    // loading skeleton — not a premature initials placeholder.
    const loadingState = await screen.findByTestId(
      "profile.family_member.loading_state",
    );
    expect(loadingState).toBeInTheDocument();
    expect(screen.queryByText("WM")).not.toBeInTheDocument();

    // Resolve the pending photo lookup to null (no photo seeded). The canonical
    // profile now exists but has no photo, so the card resolves to the initials
    // placeholder — the loading skeleton is gone.
    photoGate.resolve(null);

    expect(await screen.findByText("Waxx Minty")).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile.family_member.loading_state"),
    ).not.toBeInTheDocument();
    expect(waxxChildCard().querySelector("img")).toBeNull();
    expect(screen.getByText("WM")).toBeInTheDocument();
  });
});
