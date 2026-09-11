import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the RESOLVED authenticated navbar that the
// hydration-loading change must NOT break.
//
// The upcoming build changes the navbar so that while account/profile/claim/
// steward state is still loading it shows a neutral loading/skeleton state
// instead of rendering permission-dependent navigation from incomplete state.
// That is the behavior being changed, so the DURING-hydration flash (Add Myself
// showing for an approved owner, Message Board / Family Steward disappearing)
// is deliberately NOT frozen here.
//
// What IS frozen is the resolved-state navbar that must survive the change:
//
//  1. Once hydration resolves, an approved claimed owner sees "Add Family" (not
//     "Add Myself") and the "Message Board" link.
//  2. Once hydration resolves, an admin sees the "Family Steward" link.
//  3. The Waxx Minty profile control is a SINGLE profile button (one
//     layout.my_profile_link) labeled with the canonical display name, and it
//     opens the canonical My Profile.
//  4. The public nav links (Explore Family, Heritage Branch, Family Archive,
//     Family History, Notifications) remain present alongside the resolved
//     authenticated controls.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. getMyProfile
// resolves the profile owned by the signed-in caller, exactly as the real
// backend does for a restored/approved claim, so the resolved navbar can be
// observed end to end.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setAdmin,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  setMyProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let myProfile: PersonProfile | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      myProfile = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    getAuthenticated: () => isAuthenticated,
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    setMyProfile: (profile: PersonProfile | null) => {
      myProfile = profile;
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

function seedClaimedWaxxMinty(): PersonProfile {
  const profile: PersonProfile = {
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
    preferredName: "Waxx Minty",
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  setMyProfile(profile);
  return profile;
}

const PUBLIC_NAV = [
  "Explore Family",
  "Heritage Branch",
  "Family Archive",
  "Family History",
  "Notifications",
];

describe("Resolved authenticated navbar for an approved claimed owner", () => {
  it("shows Add Family (not Add Myself) and Message Board once hydration resolves", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderApp();

    // The approved owner's resolved navbar shows "Add Family", never "Add
    // Myself", and the Message Board link for approved family members.
    expect(
      await screen.findByRole("button", { name: "Add Family" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Myself" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();
  });

  it("keeps the public nav links alongside the resolved authenticated controls", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderApp();

    await screen.findByRole("button", { name: "Add Family" });
    for (const label of PUBLIC_NAV) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});

describe("Resolved authenticated navbar for an admin", () => {
  it("shows the Family Steward link once the admin query resolves", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(STEWARD);
    renderApp();

    // The admin query is async, so wait for the gated steward nav button.
    expect(
      await screen.findByRole("button", { name: "Family Steward" }),
    ).toBeInTheDocument();
  });
});

describe("Waxx Minty profile control is a single button that opens My Profile", () => {
  it("renders exactly one profile button labeled Waxx Minty that opens the canonical My Profile", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // Exactly one profile button, labeled with the canonical display name.
    await screen.findByRole("button", { name: "Add Family" });
    const profileButtons = screen.getAllByTestId("layout.my_profile_link");
    expect(profileButtons).toHaveLength(1);
    expect(profileButtons[0]).toHaveTextContent("Waxx Minty");

    // Clicking it opens the canonical My Profile, whose hero shows the
    // canonical display name (Waxx Minty) and the CLAIMED owner state.
    await user.click(profileButtons[0]);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Waxx Minty",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await screen.findByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).toBeInTheDocument();
    expect(claimSection).toBeInTheDocument();
  });
});
