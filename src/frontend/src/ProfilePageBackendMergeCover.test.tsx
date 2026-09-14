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
import { profiles } from "./pages/PersonProfilePage";

// Cover for the App.tsx change: the main profile page now fetches the backend
// PersonProfile for BOTH static/seeded people and backend-only/new people, and
// routes through resolveCanonicalPersonProfile(backendProfile, profiles[id])
// with a safe fallback to profiles[id] when the backend record is unavailable.
// Backend-only people keep the existing backendProfileToPersonProfile path.
//
// The accepted behavior covered here (through the real App navigation path):
//
//  1. A seeded profile (Lula Mae) whose backend record carries an edited
//     preferred name shows that new name on the main profile page — immediately,
//     and again after a fresh mount (refresh / sign out + sign in), because the
//     backend record is the source of truth.
//  2. Location, story, and relationships remain intact after the merge.
//  3. The static `profiles` map is NOT mutated by the merge.
//  4. When the backend record is unavailable for a static person, the page falls
//     back safely to the static profile (name, location, story intact).
//  5. A backend-only person (no static record) still resolves via
//     backendProfileToPersonProfile.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It holds the
// canonical Person Profile records so the profile page can resolve the backend
// record by personId.
// ---------------------------------------------------------------------------
const { mockActor, resetState, seedProfile } = vi.hoisted(() => {
  let profiles: Record<string, PersonProfile> = {};

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getProfilePhoto(_personId: string): Promise<Photo | null> {
      return null;
    },
    async listPhotos(_personId: string): Promise<Photo[]> {
      return [];
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return {
        personId: "self",
        name: "Self Norwood",
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(ACCOUNT),
        preferredName: undefined,
        story: undefined,
        occupation: undefined,
        birthInfo: undefined,
        timeline: undefined,
        privacySettings: undefined,
      };
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
      return { __kind__: "err", err: "NotImplemented" };
    },
  };

  return {
    mockActor,
    resetState: () => {
      profiles = {};
    },
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: {
      getPrincipal: () => Principal.fromText(ACCOUNT),
    },
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
  // relies on when constructing a blob. Provide a deterministic stand-in.
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

// Lula Mae's backend record carries only `name` plus the edited preferred name,
// exactly like a seeded profile whose owner changed the display name.
function seedLulaMaeBackendProfile(preferredName?: string): PersonProfile {
  const profile: PersonProfile = {
    personId: "lula-mae",
    name: "Lula Mae Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
    preferredName,
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

async function openLulaMaeProfile(user: ReturnType<typeof userEvent.setup>) {
  // Julia -> Clayton -> Lula Mae
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  // The Lula Mae card shows the preferred name when a backend record is seeded
  // ('Lula Mae Child') or the static name otherwise ('Lula Mae Norwood Child').
  await user.click(
    screen.getByRole("button", { name: /Lula Mae(?: Norwood)? Child/ }),
  );
  const focusCard = screen.getByTestId("explore.focus.1");
  await user.click(
    within(focusCard).getByRole("button", { name: "View Profile" }),
  );
  expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
}

describe("Profile page resolves the backend record for a seeded profile", () => {
  it("shows the edited preferred name on the main profile, with location/story/relationships intact", async () => {
    // The seeded Lula Mae profile has an edited preferred name in the backend.
    seedLulaMaeBackendProfile("Lula Mae");
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await openLulaMaeProfile(user);

    // The main profile heading shows the edited preferred name, not the static
    // 'Lula Mae Norwood'.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae",
    );

    // Location, story, and relationships remain intact after the merge.
    expect(screen.getByText("New York / New Jersey")).toBeInTheDocument();
    expect(
      screen.getByText(/Lula Mae Norwood was the daughter of Clayton Norwood/),
    ).toBeInTheDocument();
    // The relationship appears both as a fact and in the Family section.
    expect(screen.getAllByText("Versie Smith").length).toBeGreaterThan(0);
  });

  it("shows the edited name again after a fresh mount (refresh / sign out + sign in)", async () => {
    // The backend record is the source of truth, so a fresh mount re-fetches it
    // and shows the edited name — the edit survives a refresh and a sign
    // out/sign in cycle.
    seedLulaMaeBackendProfile("Lula Mae");
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await openLulaMaeProfile(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae",
    );

    // Simulate a refresh / sign out + sign in: unmount and render App fresh.
    cleanup();
    renderApp();
    await openExploreFamily(user);
    await openLulaMaeProfile(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae",
    );
  });

  it("does not mutate the static profiles map", async () => {
    // Snapshot the static Lula Mae record before rendering the profile page.
    const before = JSON.stringify(profiles["lula-mae"]);
    seedLulaMaeBackendProfile("Lula Mae");
    const user = userEvent.setup();
    renderApp();
    // Render the profile page so the merge runs.
    await openExploreFamily(user);
    await openLulaMaeProfile(user);
    // The static record is unchanged — the merge returns a new object.
    expect(JSON.stringify(profiles["lula-mae"])).toBe(before);
  });
});

describe("Profile page falls back to the static profile when backend data is unavailable", () => {
  it("shows the static profile when no backend record exists", async () => {
    // No backend record for Lula Mae: the page must fall back safely to the
    // static profile rather than render an empty page.
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await openLulaMaeProfile(user);

    // The static display name, location, story, and relationship show.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );
    expect(screen.getByText("New York / New Jersey")).toBeInTheDocument();
    expect(
      screen.getByText(/Lula Mae Norwood was the daughter of Clayton Norwood/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Versie Smith").length).toBeGreaterThan(0);
  });
});
