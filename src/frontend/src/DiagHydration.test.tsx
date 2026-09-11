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

// Cover for the authenticated-navbar hydration change.
//
// The build gates the authenticated navbar on fully-resolved hydration
// (identity + admin state). While that state is still loading it shows a
// neutral skeleton in place of the permission-dependent controls, so the
// navbar never renders "Add Myself" for an account that owns an approved
// claim, nor hides authorized features (Message Board, Family Steward) from
// incomplete state.
//
// This suite asserts the DURING-hydration behavior that the change introduces:
//
//  1. While hydration is pending, the neutral skeleton (layout.hydration_skeleton)
//     is shown and NONE of the permission-dependent controls (Add Myself /
//     Add Family, Message Board, Family Steward, the profile control, Sign out)
//     are rendered — so an approved owner never flashes "Add Myself".
//  2. The public nav links stay visible during hydration.
//  3. Once hydration resolves, the approved owner's controls appear: "Add
//     Family" (never "Add Myself"), Message Board, and the single profile
//     button — so Message Board / Family Steward do not disappear.
//  4. An admin's Family Steward link appears once hydration resolves.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. isCallerAdmin
// is deferred so the test can hold hydration open and observe the skeleton
// before the admin query resolves.
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
  resolveAdmin,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let myProfile: PersonProfile | null = null;
  const adminResolvers: Array<(v: boolean) => void> = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        adminResolvers.push(resolve);
      });
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
      adminResolvers.length = 0;
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
    resolveAdmin: () => {
      for (const resolve of adminResolvers.splice(0)) {
        resolve(isAdmin);
      }
    },
    adminResolvers,
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

describe("Authenticated navbar hydration: neutral skeleton while loading", () => {
  it("shows the skeleton and never Add Myself for an approved owner while hydration is pending", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    renderApp();

    // The admin query is deferred, so hydration stays open. The neutral
    // skeleton is shown in place of the permission-dependent controls.
    expect(
      await screen.findByTestId("layout.hydration_skeleton"),
    ).toBeInTheDocument();

    // None of the permission-dependent controls render during hydration — in
    // particular an approved owner must never flash "Add Myself".
    expect(
      screen.queryByRole("button", { name: "Add Myself" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Family" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Message Board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Family Steward" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("layout.my_profile_link"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();

    // The public nav links stay visible during hydration.
    for (const label of PUBLIC_NAV) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("resolves to Add Family, Message Board, and the profile button once hydration completes", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // Hold hydration open and confirm the skeleton is present first.
    expect(
      await screen.findByTestId("layout.hydration_skeleton"),
    ).toBeInTheDocument();

    // Let the admin query resolve; hydration clears and the resolved controls
    // appear. The approved owner sees "Add Family" (never "Add Myself") and
    // the Message Board link — they do not disappear.
    resolveAdmin();
    expect(
      await screen.findByRole("button", { name: "Add Family" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Myself" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("layout.hydration_skeleton"),
    ).not.toBeInTheDocument();

    // The single profile button labeled with the canonical display name opens
    // the canonical My Profile.
    const profileButtons = screen.getAllByTestId("layout.my_profile_link");
    expect(profileButtons).toHaveLength(1);
    expect(profileButtons[0]).toHaveTextContent("Waxx Minty");
    await user.click(profileButtons[0]);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Waxx Minty",
    );
  });
});

describe("Authenticated navbar hydration: admin Family Steward", () => {
  it("shows the skeleton while loading and the Family Steward link once resolved", async () => {
    seedClaimedWaxxMinty();
    setAuthenticated(true);
    setAdmin(true);
    setCurrentPrincipal(STEWARD);
    renderApp();

    // While the admin query is pending, the skeleton is shown and the steward
    // link is not rendered from incomplete state.
    expect(
      await screen.findByTestId("layout.hydration_skeleton"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Family Steward" }),
    ).not.toBeInTheDocument();

    // Once hydration resolves, the admin's Family Steward link appears.
    resolveAdmin();
    expect(
      await screen.findByRole("button", { name: "Family Steward" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("layout.hydration_skeleton"),
    ).not.toBeInTheDocument();
  });
});
