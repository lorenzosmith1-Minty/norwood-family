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

// Characterization baseline for the Explore Family sibling-section layout and
// the landscape focus-card proportions. The restored mobile-friendly layout
// places the Siblings section BELOW the focus card as a wrapping row with no
// horizontal scrolling — so there is no wheel/trackpad handler, no arrow
// control, and no single-line scrollable rail. These tests protect the working
// behavior that must survive: every sibling renders in the wrapping row below
// the focus card, and the landscape focus card keeps its portrait beside a
// compact body column (name, years, Relation to You, View Profile) rather than
// stacking everything vertically.
describe("Explore Family scroll affordance and focus-card proportions characterization", () => {
  async function focusLorenzo(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr. (six documented siblings).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);
  }

  it("renders the Siblings section below the focus card in a wrapping row with no horizontal-scroll rail", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row") as HTMLElement;
    expect(row).not.toBeNull();

    // The row is the wrapping row (flex-wrap), not a horizontally scrollable
    // rail: no ex-siblings-scroll class and no arrow controls.
    expect(row.className).toContain("ex-siblings-row");
    expect(siblingsZone.querySelector(".ex-siblings-scroll")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Scroll siblings left" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scroll siblings right" }),
    ).not.toBeInTheDocument();
  });

  it("keeps all six sibling cards as direct children of the wrapping row", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row") as HTMLElement;
    expect(row).not.toBeNull();

    // Every sibling card is a direct child of the wrapping row, so the section
    // stays one flex-wrap row that wraps onto multiple lines on mobile.
    const rowCards = Array.from(row.children).filter((el) =>
      el.classList.contains("ex-relative-card"),
    );
    expect(rowCards).toHaveLength(SIX_SIBLINGS.length);
  });

  it("renders the focus card as a landscape card with portrait beside a compact body column", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The default focus is Julia. The focus card is the landscape-style card:
    // a portrait element and a body column as siblings, so the photo sits to
    // the left of the text rather than stacking everything vertically.
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(focusCard.className).toContain("ex-focus-card");

    const portrait = focusCard.querySelector(".ex-focus-portrait");
    const body = focusCard.querySelector(".ex-focus-body");
    expect(portrait).not.toBeNull();
    expect(body).not.toBeNull();

    // The body column carries name, years, Relation to You, and View Profile
    // together, so the card reads without excessive vertical stacking.
    const bodyEl = body as HTMLElement;
    expect(
      within(bodyEl).getByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
    expect(within(bodyEl).getByText("1860–1936")).toBeInTheDocument();
    expect(within(bodyEl).getByText("Family member")).toBeInTheDocument();
    expect(
      within(bodyEl).getByRole("button", { name: "View Profile" }),
    ).toBeInTheDocument();
  });

  it("keeps spouse, parent, sibling, and child cards compact with their own classes", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Spouse card uses the compact half-size spouse class.
    const spouseStack = screen.getByTestId("explore.zone.spouse");
    const spouseCard = within(spouseStack).getByRole("button", {
      name: /Isaiah Norwood Spouse/,
    });
    expect(spouseCard.className).toContain("ex-spouse-half");

    // Recenter on Clayton to see parent and child cards.
    await tapRelative(user, /Clayton Norwood Child/);

    // Parent cards use the compact parent card class.
    const father = screen.getByRole("button", {
      name: /Isaiah Norwood Father/,
    });
    expect(father.className).toContain("ex-parent-card");
    const mother = screen.getByRole("button", {
      name: /Julia “Julie” Norwood Mother/,
    });
    expect(mother.className).toContain("ex-parent-card");

    // Child cards use the compact relative card class.
    const childrenZone = screen.getByTestId("explore.zone.children");
    const childCard = within(childrenZone).getByRole("button", {
      name: /Elbert Norwood Child/,
    });
    expect(childCard.className).toContain("ex-relative-card");
  });

  it("renders no sibling-rail arrow controls in the restored layout", async () => {
    const user = userEvent.setup();
    await focusLorenzo(user);

    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    const row = siblingsZone.querySelector(".ex-siblings-row") as HTMLElement;
    expect(row).not.toBeNull();

    // The restored mobile-friendly layout has no horizontal-scroll rail, so no
    // arrow controls render, because the wrapping row never overflows
    // horizontally.
    expect(
      screen.queryByRole("button", { name: "Scroll siblings left" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scroll siblings right" }),
    ).not.toBeInTheDocument();
  });
});
