import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  type RelationshipRequest,
  type RelationshipType,
  type Report,
  ReportStatus,
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

// Cover for the new consolidated primary navigation:
//
//  1. Family History hub opens all three options (Family Stories, Family
//     Mysteries, Travel Through Time) and each routes to its existing page.
//  2. The Add Myself / Add Family nav position toggles on claim state: a caller
//     with an approved/claimed profile sees "Add Family"; without one it reads
//     "Add Myself".
//  3. The Family Steward nav pill shows an aggregate action badge when any
//     steward-review work (pending profile claims, relationship requests,
//     reported messages, or pending archive items) exists, derived from
//     canonical backend records.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

const {
  mockActor,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setPendingClaims,
  setPendingRequests,
  setPendingReports,
  setPendingArchive,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let pendingClaims: ProfileClaim[] = [];
  let pendingRequests: RelationshipRequest[] = [];
  let pendingReports: Report[] = [];
  let pendingArchive: unknown[] = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return pendingClaims;
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return pendingRequests;
    },
    async listReports(): Promise<Report[]> {
      return pendingReports;
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return pendingArchive;
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      pendingClaims = [];
      pendingRequests = [];
      pendingReports = [];
      pendingArchive = [];
    },
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    setPendingClaims: (v: ProfileClaim[]) => {
      pendingClaims = v;
    },
    setPendingRequests: (v: RelationshipRequest[]) => {
      pendingRequests = v;
    },
    setPendingReports: (v: Report[]) => {
      pendingReports = v;
    },
    setPendingArchive: (v: unknown[]) => {
      pendingArchive = v;
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
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetState);

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  return queryClient;
}

function claimedProfile(personId: string, name: string): PersonProfile {
  return {
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
}

function pendingClaim(id: bigint): ProfileClaim {
  return {
    id,
    submittedDate: 1_700_000_000_000_000_000n,
    status: "Pending",
    personId: "lorenzoSmithJr",
    requestingUserId: Principal.fromText(ACCOUNT),
  };
}

function pendingRequest(id: bigint): RelationshipRequest {
  return {
    id,
    submittedDate: 1_700_000_000_000_000_000n,
    status: "Pending",
    relatedPersonId: "julia",
    requestingPersonId: "clayton",
    proposedRelationship: "Father" as RelationshipType,
  };
}

function pendingReport(id: bigint): Report {
  return {
    reportId: id,
    reportedMessageId: 1n,
    createdAt: 1_700_000_000_000_000_000n,
    reportingAccountId: Principal.fromText(ACCOUNT),
    reason: "Inappropriate content",
    status: ReportStatus.Pending,
  };
}

describe("Family History hub opens all three options", () => {
  it("shows Family Stories, Family Mysteries, and Travel Through Time options and routes to each page", async () => {
    const user = userEvent.setup();
    renderApp();

    // Open the Family History hub from the primary nav.
    await user.click(
      await screen.findByRole("button", { name: "Family History" }),
    );

    // The hub presents all three options.
    expect(
      await screen.findByRole("heading", { name: "Family History" }),
    ).toBeInTheDocument();
    const grid = screen.getByTestId("family_history_hub.grid");
    expect(
      within(grid).getByRole("button", { name: /Family Stories/ }),
    ).toBeInTheDocument();
    expect(
      within(grid).getByRole("button", { name: /Family Mysteries/ }),
    ).toBeInTheDocument();
    expect(
      within(grid).getByRole("button", { name: /Travel Through Time/ }),
    ).toBeInTheDocument();

    // Family Stories routes to the Stories page.
    await user.click(
      within(grid).getByRole("button", { name: /Family Stories/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Family Stories" }),
    ).toBeInTheDocument();
  });

  it("routes the Family Mysteries and Travel Through Time options to their pages", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Family History" }),
    );
    const grid = await screen.findByTestId("family_history_hub.grid");

    await user.click(
      within(grid).getByRole("button", { name: /Family Mysteries/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Family Mysteries" }),
    ).toBeInTheDocument();

    // Back to the hub, then open Travel Through Time.
    await user.click(screen.getByRole("button", { name: "Family History" }));
    const grid2 = await screen.findByTestId("family_history_hub.grid");
    await user.click(
      within(grid2).getByRole("button", { name: /Travel Through Time/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Travel Through Time" }),
    ).toBeInTheDocument();
  });
});

describe("Add Myself / Add Family nav toggle", () => {
  it("reads 'Add Myself' when the caller has no claimed profile", async () => {
    setAuthenticated(true);
    setMyProfile(null);
    renderApp();

    expect(
      await screen.findByRole("button", { name: "Add Myself" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Family" }),
    ).not.toBeInTheDocument();
  });

  it("reads 'Add Family' when the caller has an approved/claimed profile", async () => {
    setAuthenticated(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    renderApp();

    expect(
      await screen.findByRole("button", { name: "Add Family" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Myself" }),
    ).not.toBeInTheDocument();
  });
});

describe("Family Steward action badge", () => {
  it("shows an aggregate badge when steward review work exists", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setPendingClaims([pendingClaim(1n)]);
    setPendingRequests([pendingRequest(1n)]);
    setPendingReports([pendingReport(1n)]);
    setPendingArchive([{ id: 1n }]);
    renderApp();

    // The badge appears on the Family Steward nav pill, summing all categories.
    const steward = await screen.findByRole("button", {
      name: /Family Steward/,
    });
    const badge = await within(steward).findByTestId("steward_action_badge");
    expect(badge).toHaveTextContent("4");
    expect(badge).toHaveAttribute(
      "aria-label",
      "4 steward actions awaiting review",
    );
  });

  it("hides the badge when no steward review work exists", async () => {
    setAuthenticated(true);
    setAdmin(true);
    renderApp();

    const steward = await screen.findByRole("button", {
      name: /Family Steward/,
    });
    expect(
      within(steward).queryByTestId("steward_action_badge"),
    ).not.toBeInTheDocument();
  });

  it("never shows the badge to a non-steward", async () => {
    setAuthenticated(true);
    setAdmin(false);
    setPendingClaims([pendingClaim(1n)]);
    renderApp();

    expect(
      screen.queryByRole("button", { name: /Family Steward/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("steward_action_badge"),
    ).not.toBeInTheDocument();
  });
});
