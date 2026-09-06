import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PersonProfile,
  PersonProfilePage,
} from "./pages/PersonProfilePage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Characterization baseline for the Person Profile header on an APPROVED
// (claimed) living profile with no uploaded photo. The upcoming build changes
// how the approved profile header renders (removing stale pending terminology)
// and how the living photo placeholder caption reads (dropping the
// "Representative historical portrait" wording). These tests freeze the
// adjacent behavior that must NOT change:
//
//  1. The CLAIMED status card still renders (via StatusBadge) once a claim is
//     approved — the change keeps it, only removing stale pending wording.
//  2. A living profile with no uploaded photo still renders the initials
//     placeholder (data-ocid="profile.header.initials"), not a representative
//     portrait image.
//  3. The canonical display name 'Lorenzo Smith Jr.' renders in the profile
//     header when the backend profile carries that name.
//
// The tests render PersonProfilePage directly so they protect the header
// independent of the navigation that will intentionally change.
const { mockActor, mockBackendProfile } = vi.hoisted(() => {
  const mockActor = {
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
    async getPersonProfile(): Promise<unknown> {
      return mockBackendProfile;
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getMyRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
  };
  const mockBackendProfile = {
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: "Living",
    claimStatus: "Claimed",
    claimedByUserId: null,
    preferredName: null,
    story: null,
    occupation: null,
    birthInfo: null,
    timeline: null,
    privacySettings: null,
  };
  return { mockActor, mockBackendProfile };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

// A living profile with no uploaded photo: the portrait src is empty so the
// header renders the initials placeholder rather than an image.
const livingNoPhotoProfile: PersonProfile = {
  id: "lorenzoSmithJr",
  name: "Lorenzo Smith Jr.",
  role: "Family member",
  portrait: { src: "", alt: "Profile for Lorenzo Smith Jr." },
  facts: [],
  story: "",
  family: { spouseName: "", spouseRole: "", childrenText: "" },
  timeline: [],
  sources: [],
};

function renderProfile(person: PersonProfile = livingNoPhotoProfile) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={person}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("Approved (claimed) living profile header characterization", () => {
  it("renders the CLAIMED status card once a claim is approved", async () => {
    renderProfile();

    const claimSection = screen.getByTestId("profile.claim_section");
    // The CLAIMED status card renders via StatusBadge.
    expect(
      await within(claimSection).findByText("Claimed"),
    ).toBeInTheDocument();
    // No stale pending terminology appears on the approved profile.
    expect(
      within(claimSection).queryByText("Pending claim"),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByText(
        "Your claim to this profile is awaiting Family Steward review.",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders the initials placeholder for a living profile with no uploaded photo", async () => {
    renderProfile();

    // The initials placeholder renders instead of a representative portrait.
    const initials = await screen.findByTestId("profile.header.initials");
    expect(initials).toBeInTheDocument();
    expect(within(initials).getByText("LJ")).toBeInTheDocument();
    // No representative-portrait image is shown.
    expect(
      screen.queryByRole("img", { name: /representative/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the canonical display name 'Lorenzo Smith Jr.' in the profile header", async () => {
    renderProfile();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
  });
});
