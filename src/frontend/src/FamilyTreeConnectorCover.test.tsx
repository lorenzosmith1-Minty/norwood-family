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

// The relationship zones of the focused Explore Family view. Each zone renders
// only when the family record documents that relationship for the focus person.
// This file covers the closest-relationship layout around a focus person: the
// father/mother zones above, the spouse/siblings/children zones below, each
// populated only when known.
describe("Explore Family relationship zones", () => {
  it("shows the focus person's closest relatives grouped into labeled zones", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia (default focus) has no documented parents, so no Father/Mother
    // zones render. Her spouse and children do.
    expect(screen.queryByText("Father")).not.toBeInTheDocument();
    expect(screen.queryByText("Mother")).not.toBeInTheDocument();
    // "Spouse" appears both as the zone label and on the relative card, so use
    // the plural query.
    expect(screen.getAllByText("Spouse").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Children").length).toBeGreaterThan(0);
    expect(screen.queryByText("Siblings")).not.toBeInTheDocument();

    // The spouse zone holds Isaiah; the children zone holds her eight children.
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();
    for (const name of [
      "Clayton Norwood Child",
      "isaiah-jr Child",
      "edward Child",
      "hattie Child",
      "pinkie Child",
      "louise Child",
      "lillie Child",
      "lula-e Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("recenters on a tapped relative and shows their own relationship zones", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Tap Clayton (Julia's child) to recenter on him.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );

    // Clayton now shows his documented parents, spouses, siblings, and children.
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Father/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    ).toBeInTheDocument();
    // Siblings (shared parents with Julia/Isaiah).
    expect(
      screen.getByRole("button", { name: /isaiah-jr Sibling/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edward Sibling/ }),
    ).toBeInTheDocument();
    // Children from both marriages.
    expect(
      screen.getByRole("button", { name: /Elbert Norwood Child/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
    ).toBeInTheDocument();
  });

  it("shows only the documented relationships for a person with no parents or siblings", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Erma (Clayton's second wife). She has no documented parents
    // or siblings, only her spouse (Clayton) and children.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    );

    expect(screen.queryByText("Father")).not.toBeInTheDocument();
    expect(screen.queryByText("Mother")).not.toBeInTheDocument();
    expect(screen.queryByText("Siblings")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Clayton Norwood Spouse/ }),
    ).toBeInTheDocument();
    // Erma's ten children with Clayton.
    expect(
      screen.getByRole("button", { name: /Columbus Norwood Child/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
    ).toBeInTheDocument();
  });
});
