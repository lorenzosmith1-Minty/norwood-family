import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// App renders useIsAdmin at the top level, which calls useActor from
// @caffeineai/core-infrastructure. The real useActor requires an
// InternetIdentityProvider, so these tests stub the provider seam with a
// minimal actor (isCallerAdmin is never reached because these renders have no
// QueryClient, so the query stays disabled).
const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
  };
  return { mockActor };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
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

async function openFamilyTree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

function claytonBranch() {
  return screen.getByRole("region", { name: "Clayton's branch" });
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

// Characterization baseline for the Person Profile Completeness section. The
// request adds three new profiles (Freddie, Zelia Mae, Lula Mae) that will rely
// on this template behavior, so the section itself must remain unchanged: it
// renders all seven field labels and computes a percentage from the recorded vs
// missing fields. These tests freeze the behavior on existing profiles (Wellman
// and James) that are not part of the change.
describe("Person Profile Completeness characterization", () => {
  it("renders all seven completeness field labels on a profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Wellman/ }),
    );

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
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Wellman/ }),
    );

    // Wellman has a story, a single timeline entry, and a source, but no photo,
    // no birth/death facts, and no family relationships: 3 of 7 fields done.
    expect(completenessPercent()).toBe("43%");
  });

  it("reflects recorded vs missing fields for a profile with more recorded facts (James, 57%)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /James/ }),
    );

    // James has birth/death facts (recorded as "Not recorded"), a story, and a
    // source, but no photo, no family relationships, and an empty timeline:
    // 4 of 7 fields done.
    expect(completenessPercent()).toBe("57%");
  });
});
