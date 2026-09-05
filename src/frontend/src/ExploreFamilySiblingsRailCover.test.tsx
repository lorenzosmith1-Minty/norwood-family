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

// Cover for the Explore Family siblings-section rendering in the restored
// mobile-friendly layout. The focus card is a fixed-width (w-52) anchor in the
// center band with the spouse stack to its left, and the Siblings section is a
// separate full-width wrapping row BELOW the focus card (never a horizontal
// rail beside it). The Tailwind utilities live in index.css via @apply on the
// semantic classes, so this cover asserts the observable seam: the focus card
// and the siblings row carry the semantic classes that the CSS binds the
// layout to, and all six siblings still render together in the wrapping row.
describe("Explore Family siblings section rendering cover", () => {
  async function focusLorenzo(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr. (six documented siblings).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);
  }

  it("keeps the focus card as the fixed-width anchor with the spouse stack beside it", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    // Recenter on Clayton Norwood, who has documented spouses.
    await tapRelative(user, /Clayton Norwood Child/);

    // The focus card carries the ex-focus-card class, which the CSS binds to the
    // fixed w-52 shrink-0 width that keeps the spouse stack visible beside it.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(focusCard.className).toContain("ex-focus-card");

    // The spouse stack shares the center band with the focus card, to its left.
    const spouseStack = screen.getByTestId("explore.zone.spouse");
    const centerBand = focusCard.parentElement;
    expect(centerBand).not.toBeNull();
    expect(centerBand!.contains(spouseStack)).toBe(true);

    // The Siblings zone is NOT inside the center band; it is below the focus card.
    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    expect(centerBand!.contains(siblingsZone)).toBe(false);
  });

  it("renders all six siblings together in the single wrapping row", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    // The siblings row carries the ex-siblings-row class (the wrapping row that
    // keeps every sibling visible with no horizontal scrolling).
    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row");
    expect(row).not.toBeNull();

    // All six siblings render in that one row.
    for (const name of [
      "Versie Smith Jr.",
      "Herbert Smith",
      "Alonzo Smith",
      "Sherri Smith",
      "Beatrice Smith",
      "Ed Smith",
    ]) {
      expect(
        within(siblingsZone).getByRole("button", {
          name: new RegExp(`${name} Sibling`),
        }),
      ).toBeInTheDocument();
    }
  });
});
