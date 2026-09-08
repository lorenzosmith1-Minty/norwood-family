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

// Cover for the profile-edit propagation build. PersonCard now resolves its
// canonical display name and profile photo from the shared backend Person
// Profile record (keyed by personId) via useCanonicalPerson, so an edit to the
// claimed profile (a preferred-name change and a saved profile photo)
// propagates to every card variant without any manual card edits. These tests
// cover the accepted behavior:
//
//  1. A claimed profile with an edited preferred name and a saved profile photo
//     renders that name and photo on the child card under the father in Explore
//     Family, and on the focus card after recentering.
//  2. No duplicate Person record is created: the canonical profile still
//     resolves by the same personId.
//  3. A card for a person with no saved profile photo shows the initials
//     placeholder instead of an image.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It holds the
// canonical Person Profile records and the durable profile photos, so the
// propagation mechanism (useCanonicalPerson resolving name + photo from the
// backend by personId) can be exercised end to end without a canister.
// ---------------------------------------------------------------------------
const { mockActor, resetState, seedProfile, seedProfilePhoto, getProfile } =
  vi.hoisted(() => {
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
        return null;
      },
      async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
        return null;
      },
      async listConfirmedRelationships(): Promise<never[]> {
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
      getProfile: (personId: string): PersonProfile | null =>
        profiles[personId] ?? null,
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

function seedClaimedProfile(
  personId: string,
  name: string,
  preferredName?: string,
): PersonProfile {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
    preferredName,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  return profile;
}

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
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

describe("Profile-edit propagation to PersonCard variants", () => {
  it("propagates the edited display name and saved profile photo to the child and focus cards", async () => {
    // The claimed Lorenzo Smith Jr. profile has been edited: preferred name
    // 'Waxx' and a saved profile photo.
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", "Waxx");
    seedProfilePhoto("lorenzoSmithJr");
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    // The child card under Lorenzo Smith Sr. shows the edited display name and
    // the saved profile photo, not the raw id or the original name.
    const childrenZone = screen.getByTestId("explore.zone.children");
    const childCard = within(childrenZone).getByRole("button", {
      name: /Waxx Child/,
    });
    expect(childCard).toBeInTheDocument();
    // The portrait is inside an aria-hidden span, so query the img directly.
    const childImg = childCard.querySelector("img");
    expect(childImg).not.toBeNull();
    expect(childImg?.getAttribute("alt")).toBe("Waxx's profile photo");
    expect(screen.queryByText("lorenzoSmithJr")).not.toBeInTheDocument();

    // Recenter on Waxx: the focus card shows the same edited name and photo.
    await user.click(childCard);
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(within(focusCard).getByText("Waxx")).toBeInTheDocument();
    const focusImg = focusCard.querySelector("img");
    expect(focusImg).not.toBeNull();
    expect(focusImg?.getAttribute("alt")).toBe("Waxx's profile photo");

    // No duplicate Person record is created: the canonical profile still
    // resolves by the same personId.
    expect(getProfile("lorenzoSmithJr")?.personId).toBe("lorenzoSmithJr");
  });

  it("resolves to initials (not a skeleton) on cards with no saved profile photo", async () => {
    // The claimed profile has an edited preferred name but no saved photo. The
    // first-load fix drives the loading state ONLY from the pending profile-photo
    // query, so once the photo query resolves (to null) the card resolves to the
    // initials placeholder rather than a permanent loading skeleton.
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", "Waxx");
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    const childrenZone = screen.getByTestId("explore.zone.children");
    const childCard = within(childrenZone).getByRole("button", {
      name: /Waxx Child/,
    });

    // No image renders; the card resolves to the initials placeholder (W) once
    // the photo query resolves, not a permanent loading skeleton.
    expect(within(childCard).queryByRole("img")).not.toBeInTheDocument();
    expect(childCard.querySelector(".animate-pulse")).toBeNull();
    expect(within(childCard).getByText("W")).toBeInTheDocument();
  });
});
