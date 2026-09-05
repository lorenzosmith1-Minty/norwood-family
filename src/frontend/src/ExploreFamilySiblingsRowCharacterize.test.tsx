import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

configure({ testIdAttribute: "data-ocid" });

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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

// Lorenzo Smith Sr.'s six siblings, derived from his shared parents (Lula Mae
// Norwood and Versie Smith) in the relationship graph.
const SIX_SIBLINGS = [
  "Versie Smith Jr.",
  "Herbert Smith",
  "Alonzo Smith",
  "Sherri Smith",
  "Beatrice Smith",
  "Ed Smith",
];

// Characterization baseline for the Siblings section structure in the Explore
// Family view. The restored mobile-friendly layout places the Siblings section
// BELOW the focus card as a wrapping row (never a horizontal rail beside the
// card), so every sibling stays fully visible with no horizontal scrolling.
// These tests protect that preserved structure: all sibling cards live together
// in the single wrapping row, and each sibling card is a compact,
// consistently-styled relative card.
describe("Explore Family siblings row structure characterization", () => {
  async function focusLorenzo(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr. (six documented siblings).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);
  }

  it("keeps all six sibling cards as direct children of the single wrapping row", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row");
    expect(row).not.toBeNull();

    // Every sibling card is a direct child of the one wrapping row, so the
    // section stays a single flex-wrap row that wraps onto multiple lines on
    // mobile rather than a horizontally scrollable rail.
    const rowCards = Array.from(row!.children).filter((el) =>
      el.classList.contains("ex-relative-card"),
    );
    expect(rowCards).toHaveLength(SIX_SIBLINGS.length);

    for (const name of SIX_SIBLINGS) {
      const card = within(siblingsZone).getByRole("button", {
        name: new RegExp(`${name} Sibling`),
      });
      expect(row!.contains(card)).toBe(true);
    }
  });

  it("renders each sibling as a compact, consistently-styled relative card", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");

    // Every sibling card carries the same compact relative-card class, so the
    // rail reads as a consistent row of equal-sized cards.
    for (const name of SIX_SIBLINGS) {
      const card = within(siblingsZone).getByRole("button", {
        name: new RegExp(`${name} Sibling`),
      });
      expect(card.className).toContain("ex-relative-card");
    }
  });
});
