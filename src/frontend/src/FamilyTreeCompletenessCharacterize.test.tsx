import "@testing-library/jest-dom/vitest";
import { ClaimStatus, LivingStatus, type PersonProfile } from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// App renders useIsAdmin at the top level, which calls useActor from
// @caffeineai/core-infrastructure. The real useActor requires an
// InternetIdentityProvider, so these tests stub the provider seam with a
// minimal actor. Explore Family is gated behind approved family access, so the
// signed-in caller must hold an approved (CLAIMED) profile for the family graph
// to render; getMyProfile resolves that approved claim.
const APPROVED = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return {
        familyId: "norwood",
        personId: "self",
        name: "Self Norwood",
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(APPROVED),
        preferredName: undefined,
        story: undefined,
        occupation: undefined,
        birthInfo: undefined,
        timeline: undefined,
        privacySettings: undefined,
      };
    },
  };
  return { mockActor };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    identity: {
      getPrincipal: () => Principal.fromText(APPROVED),
    },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

// App renders useIsAdmin at the top level, which calls useQuery, so every render
// must be wrapped in a QueryClientProvider.
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

afterEach(cleanup);

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

// Navigate to a Clayton child's profile via the Explore Family navigator.
async function openClaytonChildProfile(
  user: ReturnType<typeof userEvent.setup>,
  child: RegExp,
) {
  await openExploreFamily(user);
  await tapRelative(user, /Clayton Norwood Child/);
  await tapRelative(user, child);
  await user.click(screen.getByRole("button", { name: "View Profile" }));
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

// Characterization baseline for the Person Profile Completeness section. The
// request adds new profiles that rely on this template behavior, so the section
// itself must remain unchanged: it renders all seven field labels and computes a
// percentage from the recorded vs missing fields. These tests freeze the
// behavior on existing profiles (Wellman and James) that are not part of the
// change, reached through the new Explore Family navigator.
describe("Person Profile Completeness characterization", () => {
  it("renders all seven completeness field labels on a profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openClaytonChildProfile(user, /Wellman Norwood Child/);

    const completeness = document.querySelector(
      '[data-ocid="profile.completeness"]',
    );
    expect(completeness).not.toBeNull();
    for (const label of [
      "Photo",
      "Birth information",
      "Death information",
      "Family relationships",
      "Story",
      "Timeline",
      "Sources",
    ]) {
      expect(
        within(completeness as HTMLElement).getByText(label),
      ).toBeInTheDocument();
    }
  });

  it("reflects recorded vs missing fields for a sparse profile (Wellman, 43%)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openClaytonChildProfile(user, /Wellman Norwood Child/);

    expect(completenessPercent()).toBe("43%");
  });

  it("reflects recorded vs missing fields for a profile with more recorded facts (James, 57%)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openClaytonChildProfile(user, /James Norwood Child/);

    expect(completenessPercent()).toBe("57%");
  });
});
