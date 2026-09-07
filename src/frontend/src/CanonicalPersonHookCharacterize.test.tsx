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
import { useCanonicalPerson } from "./hooks/useCanonicalPerson";

// Characterization baseline for the useCanonicalPerson hook — the single seam
// every PersonCard variant resolves its display name and profile photo from.
// The upcoming build makes Explore Family reflect profile edits immediately
// after save (without navigation away and back); that fix routes the cards
// through this same hook, so its resolution contract is the adjacent working
// behavior that must NOT regress:
//
//  1. When a backend canonical Person Profile exists, its preferredName-first
//     display name and durable profile photo win over the inline fallback.
//  2. When no backend profile exists, the hook falls back to the caller's
//     inline name and reports no canonical profile (so the initials placeholder
//     shows instead of a photo).
//  3. When no personId is supplied, there is no backend to resolve from, so the
//     inline fallback is returned unchanged.
//
// These tests assert the hook contract directly, independent of any card
// layout, so a propagation change cannot silently break the resolution the
// immediate-reflection build depends on.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, holding the
// canonical Person Profile records and the durable profile photos so the hook
// can resolve name + photo from the backend by personId.
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
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in so the
  // profile-photo URL resolves.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

// A tiny harness that renders the hook's resolved values so the test can assert
// the observable contract.
function Harness({
  personId,
  fallbackName,
}: {
  personId: string | undefined;
  fallbackName: string;
}) {
  const canonical = useCanonicalPerson(personId, fallbackName);
  return (
    <div>
      <span data-ocid="name">{canonical.displayName}</span>
      <span data-ocid="photo">{canonical.profilePhotoUrl ?? "none"}</span>
      <span data-ocid="hasCanonical">
        {canonical.hasCanonicalProfile ? "yes" : "no"}
      </span>
    </div>
  );
}

function renderHook(personId: string | undefined, fallbackName: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness personId={personId} fallbackName={fallbackName} />
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

describe("useCanonicalPerson resolution contract", () => {
  it("resolves the preferredName-first display name and photo from the backend profile when one exists", async () => {
    // The claimed profile has been edited: preferred name 'Waxx' and a saved
    // profile photo. The hook must surface both, overriding the inline fallback.
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.", "Waxx");
    seedProfilePhoto("lorenzoSmithJr");
    renderHook("lorenzoSmithJr", "Inline Fallback");

    // The query resolves asynchronously; wait for the canonical name to appear.
    expect(await screen.findByText("Waxx")).toBeInTheDocument();
    expect(screen.getByTestId("hasCanonical")).toHaveTextContent("yes");
    // The durable profile photo URL resolves from the object-storage blob.
    expect(screen.getByTestId("photo").textContent).not.toBe("none");
  });

  it("falls back to the inline name with no canonical profile when no backend record exists", async () => {
    // No backend profile exists for this person, so the hook must fall back to
    // the caller's inline name and report no canonical profile (the card then
    // shows the initials placeholder rather than a photo).
    renderHook("graphOnlyPerson", "Inline Fallback");

    expect(await screen.findByTestId("name")).toHaveTextContent(
      "Inline Fallback",
    );
    expect(screen.getByTestId("hasCanonical")).toHaveTextContent("no");
    expect(screen.getByTestId("photo")).toHaveTextContent("none");
  });

  it("returns the inline fallback unchanged when no personId is supplied", async () => {
    // With no personId there is no backend to resolve from, so the inline
    // fallback is returned unchanged and no canonical profile is reported.
    renderHook(undefined, "Inline Fallback");

    expect(await screen.findByTestId("name")).toHaveTextContent(
      "Inline Fallback",
    );
    expect(screen.getByTestId("hasCanonical")).toHaveTextContent("no");
    expect(screen.getByTestId("photo")).toHaveTextContent("none");
  });
});
