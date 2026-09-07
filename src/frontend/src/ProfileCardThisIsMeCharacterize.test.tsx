import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExploreFamilyPage from "./pages/ExploreFamilyPage";
import { FamilyTreePage } from "./pages/FamilyTreePage";
import type { PersonProfile } from "./pages/PersonProfilePage";

// Characterization baseline for the current "This is Me" behavior on the
// profile cards in the Family Tree, captured BEFORE the profile-ownership and
// relationship-verification feature is built.
//
// Today "This is Me" is a purely local, in-session action: selecting a card
// reveals a "This is Me" button, and clicking it marks that card as "me" in
// session state (showing a "This is me" badge) with NO sign-in requirement and
// NO claim/ownership record. The upcoming feature intentionally changes this to
// require sign-in and create a pending profile claim, so this baseline freezes
// the current observable behavior that the change will replace.
//
// The FamilyTreePage is not wired into App.tsx (the "family-tree" view shows the
// Explore Family navigator instead), so it is rendered directly here.

function renderTree() {
  const onBack = vi.fn();
  const onOpenProfile = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FamilyTreePage
        onBack={onBack}
        onOpenProfile={onOpenProfile}
        profilePhotos={{}}
      />
    </QueryClientProvider>,
  );
  return { onBack, onOpenProfile };
}

afterEach(cleanup);

describe("Profile card 'This is Me' characterization", () => {
  it("shows no 'This is me' badge and no 'This is Me' action before any card is selected", () => {
    renderTree();

    // No person is marked "me" by default.
    expect(screen.queryByText("This is me")).not.toBeInTheDocument();
    // The "This is Me" action only appears once a card is selected.
    expect(
      screen.queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("reveals a 'This is Me' action when a card is selected", async () => {
    const user = userEvent.setup();
    renderTree();

    // Select Julia's card.
    await user.click(
      screen.getByRole("button", { name: /Julia “Julie” Norwood/ }),
    );

    // The selected card now offers the "This is Me" action.
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
  });

  it("marks the selected card as 'me' in-session when 'This is Me' is clicked", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(
      screen.getByRole("button", { name: /Julia “Julie” Norwood/ }),
    );
    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // The card is now marked "me": the badge shows and the action is gone.
    expect(screen.getByText("This is me")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("marks only the clicked card as 'me', leaving other cards unmarked", async () => {
    const user = userEvent.setup();
    renderTree();

    // Select and mark Julia.
    await user.click(
      screen.getByRole("button", { name: /Julia “Julie” Norwood/ }),
    );
    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // Julia is marked "me".
    expect(screen.getByText("This is me")).toBeInTheDocument();

    // Select a different card (Isaiah); it is not marked "me".
    await user.click(screen.getByRole("button", { name: /Isaiah Norwood/ }));
    expect(screen.queryByText("This is me")).not.toBeInTheDocument();
    // The newly selected card offers its own "This is Me" action.
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Explore Family focus card "This is me" badge characterization.
//
// In the Explore Family navigator the focus card's "This is me" badge is
// DATA-DRIVEN from the profile's `relationToYou === "me"` (or a `me === true`
// flag) — it is not an in-session action and not a claim. No seeded profile sets
// this, so the badge never shows by default. The upcoming profile-ownership
// feature will introduce a real claim/ownership concept; this baseline freezes
// the current data-driven badge contract so it is not silently conflated with
// the new claim flow.
// ---------------------------------------------------------------------------

// A minimal profile record: one person marked "me" and one unmarked, so the
// focus card badge can be asserted for both cases without touching the real
// seeded profiles. Defined via vi.hoisted because the vi.mock factory below is
// hoisted above these declarations.
const { meProfile, plainProfile } = vi.hoisted(() => {
  const meProfile: PersonProfile = {
    id: "me-person",
    name: "Me Person",
    role: "Family member",
    portrait: { src: "/assets/images/placeholder.svg", alt: "Me Person" },
    facts: [],
    story: "",
    family: { spouseName: "", spouseRole: "", childrenText: "" },
    timeline: [],
    sources: [],
    relationToYou: "me",
  };

  const plainProfile: PersonProfile = {
    id: "plain-person",
    name: "Plain Person",
    role: "Family member",
    portrait: { src: "/assets/images/placeholder.svg", alt: "Plain Person" },
    facts: [],
    story: "",
    family: { spouseName: "", spouseRole: "", childrenText: "" },
    timeline: [],
    sources: [],
  };
  return { meProfile, plainProfile };
});

vi.mock("./pages/PersonProfilePage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./pages/PersonProfilePage")>();
  return {
    ...actual,
    profiles: {
      "me-person": meProfile,
      "plain-person": plainProfile,
    },
  };
});

// ExploreFamilyPage now derives its constellation through useExploreFamily,
// which calls useListConfirmedRelationships (useActor) and the page reads the
// caller's identity (useInternetIdentity). Stub the provider seam so the focus
// card badge can be asserted without a canister or an InternetIdentityProvider.
const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async listConfirmedRelationships(): Promise<unknown[]> {
      return [];
    },
    async getPersonProfile(): Promise<null> {
      return null;
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
  };
  return { mockActor };
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

function renderExplore(focusPersonId: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ExploreFamilyPage
        focusPersonId={focusPersonId}
        onSelectPerson={() => {}}
        onOpenProfile={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("Explore Family focus card 'This is me' badge characterization", () => {
  it("shows no 'This is me' badge for a profile without the me flag", () => {
    renderExplore("plain-person");

    expect(screen.getByText("Plain Person")).toBeInTheDocument();
    expect(screen.queryByText("This is me")).not.toBeInTheDocument();
  });

  it("shows the 'This is me' badge when the focus profile carries the me flag", () => {
    renderExplore("me-person");

    expect(screen.getByText("Me Person")).toBeInTheDocument();
    expect(screen.getByText("This is me")).toBeInTheDocument();
  });
});
