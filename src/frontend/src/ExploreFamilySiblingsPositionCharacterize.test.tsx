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

// Characterization for the Siblings section position in the Explore Family
// navigator. The restored mobile-friendly layout places the Siblings section
// BELOW the focus card as a wrapping row (not a horizontal rail beside the
// card). These tests capture that accepted position so it stays observable and
// protected.
describe("Explore Family siblings section position characterization", () => {
  it("renders the Siblings zone below the focus card, not inside the center band", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Recenter on Lorenzo Smith Sr., who has six documented siblings.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    const focusCard = screen.getByTestId("explore.focus.1");
    const siblingsZone = screen.getByTestId("explore.zone.siblings");

    // The Siblings zone is NOT inside the center band that holds the focus
    // card; it is a separate full-width block below it.
    const centerBand = focusCard.parentElement;
    expect(centerBand).not.toBeNull();
    expect(centerBand!.contains(siblingsZone)).toBe(false);

    // The Siblings zone follows the focus card in document order, i.e. it is
    // rendered below the focus card.
    expect(
      focusCard.compareDocumentPosition(siblingsZone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the Siblings zone before the Children zone, keeping the vertical order", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const childrenZone = screen.getByTestId("explore.zone.children");

    // Siblings come before Children in the vertical stack.
    expect(
      siblingsZone.compareDocumentPosition(childrenZone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the Siblings row wrapping with the ex-siblings-row class", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row");
    expect(row).not.toBeNull();
    expect((row as HTMLElement).className).toContain("ex-siblings-row");

    // All six siblings still render in the Siblings zone.
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
