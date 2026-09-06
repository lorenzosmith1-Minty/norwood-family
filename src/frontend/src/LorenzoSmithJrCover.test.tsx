import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type Notification,
  NotificationType,
  type PersonProfile,
  type ProfileClaim,
} from "@/backend";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { FamilyStewardReviewPage } from "./pages/FamilyStewardReviewPage";
import { NotificationsPage } from "./pages/NotificationsPage";

// Cover for the canonical Lorenzo Smith Jr. display-name change. The build
// routes graph-only nodes (e.g. lorenzoSmithJr) through the shared
// resolveDisplayName resolver so the canonical display name 'Lorenzo Smith Jr.'
// (exact capitalization and spacing) appears everywhere the profile is shown,
// and no internal id leaks into a user-facing surface. These tests cover the
// accepted behavior:
//
//  1. The canonical name appears on the Lorenzo Smith Jr. child card under
//     Lorenzo Smith Sr. in Explore Family.
//  2. No raw id ('lorenzoSmithJr') leaks into the Explore Family view.
//  3. Clicking the child card recenters on Lorenzo Smith Jr. and opening the
//     profile shows the canonical claimed profile (CLAIMED card, no pending
//     terminology).
//  4. The Family Steward review shows the canonical name for a Lorenzo Smith
//     Jr. claim.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam. The mock records which backend methods
// the flows invoke so the tests can assert observable behavior (the canonical
// profile resolves by personId, a claimed profile surfaces CLAIMED, the graph
// renders regardless of claim state).
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
  seedClaim,
  seedNotification,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let notifications: Notification[] = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(personId: string): Promise<ProfileClaim | null> {
      return (
        claims.find(
          (c) =>
            c.personId === personId &&
            c.requestingUserId.toString() === currentPrincipal,
        ) ?? null
      );
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [...claims];
    },
    async listConfirmedRelationships(): Promise<never[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return notifications.filter(
        (n) => n.recipient.toString() === currentPrincipal,
      );
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      claims = [];
      notifications = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    seedClaim: (claim: ProfileClaim) => {
      claims = [...claims, claim];
    },
    seedNotification: (notification: Notification) => {
      notifications = [...notifications, notification];
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

function renderPage(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

function seedClaimedProfile(personId: string, name: string): PersonProfile {
  const profile: PersonProfile = {
    personId,
    name,
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

describe("Canonical Lorenzo Smith Jr. display name in Explore Family", () => {
  it("renders the canonical name on the child card under Lorenzo Smith Sr., with no raw id leak", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    // The child card under Lorenzo Smith Sr. shows the canonical display name
    // 'Lorenzo Smith Jr.' (exact capitalization and spacing), not the raw id.
    const childrenZone = screen.getByTestId("explore.zone.children");
    expect(
      within(childrenZone).getByRole("button", {
        name: /Lorenzo Smith Jr\. Child/,
      }),
    ).toBeInTheDocument();

    // No internal id leaks into the Explore Family view.
    expect(screen.queryByText("lorenzoSmithJr")).not.toBeInTheDocument();
  });

  it("recenters on the canonical profile when the child card is clicked and opens the claimed profile", async () => {
    // The canonical Lorenzo Smith Jr. profile exists in the backend as a
    // claimed (approved) living profile.
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.");
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    // Click the child card to recenter on Lorenzo Smith Jr.
    await user.click(
      screen.getByRole("button", { name: /Lorenzo Smith Jr\. Child/ }),
    );

    // The focus card now shows the canonical name.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(
      within(focusCard).getByText("Lorenzo Smith Jr."),
    ).toBeInTheDocument();

    // Open the profile from the focus card.
    await user.click(
      within(focusCard).getByRole("button", { name: "View Profile" }),
    );

    // The canonical claimed profile renders: the header shows the canonical
    // name and the CLAIMED status card, with no pending terminology.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Claimed"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByText("Pending claim"),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByText(
        "Your claim to this profile is awaiting Family Steward review.",
      ),
    ).not.toBeInTheDocument();
  });
});

describe("Family Steward review shows the canonical Lorenzo Smith Jr. name", () => {
  it("renders the canonical name for a pending Lorenzo Smith Jr. claim", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(STEWARD);
    setAdmin(true);
    seedClaim({
      id: 1n,
      personId: "lorenzoSmithJr",
      requestingUserId: Principal.fromText(ACCOUNT),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    renderPage(<FamilyStewardReviewPage onBack={() => {}} />);

    // The claim card resolves the canonical display name for the graph-only
    // node, not the raw id.
    expect(await screen.findByText("Lorenzo Smith Jr.")).toBeInTheDocument();
    expect(screen.queryByText("lorenzoSmithJr")).not.toBeInTheDocument();
  });
});

describe("Notifications surface the canonical Lorenzo Smith Jr. name", () => {
  it("renders a Lorenzo Smith Jr. notification with the canonical name and no raw id leak", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The backend builds the notification message from the profile's display
    // name, so a claim on the canonical profile surfaces 'Lorenzo Smith Jr.'
    // (exact capitalization and spacing), never the raw id.
    seedNotification({
      id: 1n,
      recipient: Principal.fromText(ACCOUNT),
      notificationType: NotificationType.ProfileClaimRequested,
      message: "Your profile claim for Lorenzo Smith Jr. is pending review.",
      createdAt: 1_700_000_000_000_000_000n,
      read: false,
    });
    renderPage(<NotificationsPage />);

    expect(
      await screen.findByText(
        "Your profile claim for Lorenzo Smith Jr. is pending review.",
      ),
    ).toBeInTheDocument();
    // No internal id leaks into the notifications surface.
    expect(screen.queryByText("lorenzoSmithJr")).not.toBeInTheDocument();
  });
});
