import "@testing-library/jest-dom/vitest";
import { ClaimStatus, LivingStatus, type PersonProfile } from "@/backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNavbarIdentity } from "./hooks/useNavbarIdentity";
import { resolveMyProfileRoute } from "./types/ownership";

// Characterization baseline for the claim-aware profile-button routing and the
// navbar identity resolution that the single-profile-button build must NOT
// break.
//
// The upcoming build replaces the separate profile-name + "My Profile" controls
// with ONE button labeled with the canonical display name that opens My Profile.
// That build changes the button's UI, but the two pieces of logic underneath it
// are the adjacent working behavior that must survive:
//
//  1. resolveMyProfileRoute — where the profile button routes based on the
//     caller's own claim state:
//       - an APPROVED (Claimed) claim routes to the owned canonical profile;
//       - a PENDING (Unclaimed) claim routes to the same canonical profile
//         (rendering the PENDING CLAIM state), never back to "This is Me";
//       - no claim routes to the Add Myself / matching flow.
//  2. useNavbarIdentity — the display name the button is labeled with resolves
//     from the canonical backend profile (preferredName || canonical mapping ||
//     composed name || raw name), never a raw account id, and reports the
//     claim status that drives the routing above.
//
// It deliberately does NOT assert the current two-control navbar layout (name
// span + separate "My Profile" button) — that is exactly what the request
// changes.

describe("resolveMyProfileRoute claim-aware routing", () => {
  it("routes an approved (Claimed) claim to the owned canonical profile", () => {
    expect(resolveMyProfileRoute(ClaimStatus.Claimed, "lorenzoSmithJr")).toBe(
      "owned",
    );
  });

  it("routes a pending (Unclaimed) claim to the canonical profile, never back to Add Myself", () => {
    expect(resolveMyProfileRoute(ClaimStatus.Unclaimed, "lorenzoSmithJr")).toBe(
      "pending",
    );
  });

  it("routes to Add Myself when no profile is connected", () => {
    expect(resolveMyProfileRoute(undefined, undefined)).toBe("add-myself");
    expect(resolveMyProfileRoute(ClaimStatus.Claimed, undefined)).toBe(
      "add-myself",
    );
  });
});

// ---------------------------------------------------------------------------
// useNavbarIdentity: the display-name + claim-status resolution seam.
// ---------------------------------------------------------------------------

const { getAuthenticated, setAuthenticated, getProfile, setProfile } =
  vi.hoisted(() => {
    let isAuthenticated = false;
    let profile: PersonProfile | null = null;
    return {
      getAuthenticated: () => isAuthenticated,
      setAuthenticated: (v: boolean) => {
        isAuthenticated = v;
      },
      getProfile: () => profile,
      setProfile: (p: PersonProfile | null) => {
        profile = p;
      },
    };
  });

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: getAuthenticated(),
    accountId: "2vxsx-fae",
    signOut: () => {},
  }),
}));

vi.mock("./hooks/useProfileClaims", () => ({
  useMyProfile: () => ({ data: getProfile() }),
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: {}, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    clear: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(() => {
  setAuthenticated(false);
  setProfile(null);
});

function renderIdentity() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useNavbarIdentity(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useNavbarIdentity display-name resolution", () => {
  it("resolves the canonical display name from a claimed profile", async () => {
    setAuthenticated(true);
    setProfile({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: "Waxx Minty",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });

    const { result } = renderIdentity();
    await waitFor(() => expect(result.current.status).toBe("linked"));
    expect(result.current.displayName).toBe("Waxx Minty");
    expect(result.current.claimStatus).toBe(ClaimStatus.Claimed);
    expect(result.current.personId).toBe("lorenzoSmithJr");
  });

  it("reports a pending claim as pending with the profile's display name", async () => {
    setAuthenticated(true);
    setProfile({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      preferredName: undefined,
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });

    const { result } = renderIdentity();
    await waitFor(() => expect(result.current.status).toBe("pending"));
    expect(result.current.displayName).toBe("Lorenzo Smith Jr.");
    expect(result.current.claimStatus).toBe(ClaimStatus.Unclaimed);
  });

  it("degrades to the none state with no display name when no profile is connected", async () => {
    setAuthenticated(true);
    setProfile(null);

    const { result } = renderIdentity();
    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(result.current.displayName).toBe("");
    expect(result.current.personId).toBeUndefined();
  });
});
