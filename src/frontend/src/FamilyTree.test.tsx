import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// App renders useIsAdmin at the top level, which calls useActor from
// @caffeineai/core-infrastructure. The real useActor requires an
// InternetIdentityProvider, so these Family Tree tests stub the provider seam
// with a minimal actor (isCallerAdmin is never reached because these renders
// have no QueryClient, so the query stays disabled).
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

const COUPLE = ["Julia “Julie” Norwood", "Isaiah Norwood"];

const CHILDREN = [
  "Clayton",
  "Isaiah Jr.",
  "Edward",
  "Hattie",
  "Pinkie",
  "Louise",
  "Lillie",
  "Lula E.",
];

async function openFamilyTree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

describe("Family Tree screen", () => {
  it("navigates from Home to the Family Tree when 'Explore the Family' is tapped", async () => {
    const user = userEvent.setup();
    renderApp();

    // Home is shown first.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );

    await openFamilyTree(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("shows Julia 'Julie' Norwood and Isaiah Norwood as the starting couple", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    for (const name of COUPLE) {
      expect(
        within(coupleSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("shows all eight children below the couple", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const childrenSection = screen.getByRole("region", { name: "Children" });
    for (const name of CHILDREN) {
      expect(
        within(childrenSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("shows the couple, the eight children, and Clayton's expanded branch", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });
    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    expect(within(coupleSection).getAllByRole("button")).toHaveLength(2);
    expect(within(childrenSection).getAllByRole("button")).toHaveLength(8);

    // Clayton's branch shows his two spouses and their children.
    expect(
      within(claytonBranch).getByRole("button", { name: /Ms\. Hudson/ }),
    ).toBeInTheDocument();
    expect(
      within(claytonBranch).getByRole("button", {
        name: /Erma T\. Williams/,
      }),
    ).toBeInTheDocument();
    for (const name of [
      "Elbert",
      "Wellman",
      "Wetherby",
      "Son \\(died at birth\\)",
      "Columbus",
      "Thomas Clayton “Tip / TC”",
      "Alton",
      "Robert Davis “RD”",
      "Ardeanus",
      "Willie B.",
      "James",
      "Freddie",
      "Zelia Mae",
      "Lula Mae",
    ]) {
      expect(
        within(claytonBranch).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("selects and highlights only the tapped card, moving the highlight on another tap", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const allPersonCards = screen
      .getAllByRole("button")
      .filter((button) =>
        button.getAttribute("data-ocid")?.startsWith("tree.person."),
      );

    // Nothing selected initially.
    for (const card of allPersonCards) {
      expect(card).toHaveAttribute("aria-pressed", "false");
    }

    // Tap a child (Isaiah Jr.).
    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(isaiahJr).toHaveAttribute("aria-pressed", "true");
    for (const card of allPersonCards) {
      if (card === isaiahJr) continue;
      expect(card).toHaveAttribute("aria-pressed", "false");
    }

    // Tap another child — the highlight moves.
    const edward = screen.getByRole("button", { name: /Edward/ });
    await user.click(edward);
    expect(edward).toHaveAttribute("aria-pressed", "true");
    expect(isaiahJr).toHaveAttribute("aria-pressed", "false");
    for (const card of allPersonCards) {
      if (card === edward) continue;
      expect(card).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("keeps child cards highlight-only: tapping a child does not navigate away", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Tapping a child card highlights it and stays on the Family Tree.
    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(isaiahJr).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    // Tapping another child highlights it and stays on the Family Tree.
    const edward = screen.getByRole("button", { name: /Edward/ });
    await user.click(edward);
    expect(edward).toHaveAttribute("aria-pressed", "true");
    expect(isaiahJr).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("opens Julia 'Julie' Norwood's Person Profile when her card is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const julia = screen.getByRole("button", { name: /Julia/ });
    await user.click(julia);

    // The profile replaces the Family Tree view.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
    expect(
      screen.queryByRole("heading", { level: 1, name: "Family Tree" }),
    ).not.toBeInTheDocument();
  });

  it("shows the profile header facts for Julia", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
    expect(screen.getByText("Matriarch")).toBeInTheDocument();

    // The header facts are rendered as a definition list.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("approx. 1860"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("June 19, 1936"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Isaiah Norwood"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("opens Isaiah Norwood's Person Profile when his card is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const isaiah = screen.getByRole("button", { name: /Isaiah Norwood/ });
    await user.click(isaiah);

    // The profile replaces the Family Tree view.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Isaiah Norwood",
    );
    expect(
      screen.queryByRole("heading", { level: 1, name: "Family Tree" }),
    ).not.toBeInTheDocument();
  });

  it("shows the profile header facts for Isaiah", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Isaiah Norwood/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Isaiah Norwood",
    );
    expect(screen.getByText("Patriarch")).toBeInTheDocument();

    // The header facts are rendered as a definition list.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("1858")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("shows the four profile sections for Isaiah as populated", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Isaiah Norwood/ }));

    // The four sections are present, with Isaiah's story labeled "His Story".
    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    // Each section is populated (not an empty placeholder).
    expect(screen.queryByText("Not yet populated")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "Isaiah Norwood was the patriarch",
    );
    expect(screen.getByRole("region", { name: "Timeline" })).toHaveTextContent(
      "Born",
    );
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(
      "1880 U.S. Census",
    );
  });

  it("returns to the Family Tree when Isaiah's profile Back button is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Isaiah Norwood/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Isaiah Norwood",
    );

    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("opens Clayton Norwood's Person Profile when his card is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const clayton = screen.getByRole("button", { name: /Clayton Child/ });
    await user.click(clayton);

    // The profile replaces the Family Tree view.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );
    expect(
      screen.queryByRole("heading", { level: 1, name: "Family Tree" }),
    ).not.toBeInTheDocument();
  });

  it("shows the profile header facts for Clayton", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Clayton Child/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    // The header facts are rendered as a definition list.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("approx. 1883"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Julia “Julie” Norwood and Isaiah Norwood",
      ),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("shows the four profile sections for Clayton as populated", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Clayton Child/ }));

    // The four sections are present, with Clayton's story labeled "His Story".
    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    // Each section is populated (not an empty placeholder).
    expect(screen.queryByText("Not yet populated")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "1920 census",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Ms. Hudson",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Erma T. Williams",
    );
    expect(screen.getByRole("region", { name: "Timeline" })).toHaveTextContent(
      "Born",
    );
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(
      "1920 U.S. Census",
    );
  });

  it("shows the four profile sections: Her Story, Family, Timeline, and Sources", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    for (const section of ["Her Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("renders the Timeline as an ordered list of card-styled entries with date/title/detail structure", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    const timeline = screen.getByRole("region", { name: "Timeline" });
    // The timeline is an ordered list so entries keep their chronological order.
    const list = timeline.querySelector("ol");
    expect(list).not.toBeNull();

    const entries = Array.from(timeline.querySelectorAll("ol > li"));
    // The timeline is populated (not empty); the exact entry set is intentionally
    // changing, so only the shared visual/layout structure is characterized here.
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      // Each entry keeps the warm card styling shared across the profile.
      expect(entry.className).toContain("bg-card");
      expect(entry.className).toContain("border");
      expect(entry.className).toContain("rounded-2xl");
      // Each entry carries a date, a title, and a detail paragraph.
      expect(entry.querySelector("p")).not.toBeNull();
      expect(entry.querySelectorAll("p").length).toBeGreaterThanOrEqual(2);
    }

    // The paper grain overlay is still rendered by the Layout on the profile.
    expect(container.querySelector(".paper-grain")).not.toBeNull();
  });

  it("shows the four requested Timeline entries in order on Julia's profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const entries = Array.from(timeline.querySelectorAll("ol > li"));

    // The four requested entries are present, in chronological order.
    expect(entries).toHaveLength(4);

    const expected = [
      { date: "c. 1860", title: "Born" },
      { date: "1880", title: "Appears in the census" },
      { date: "After Isaiah’s death", title: "Raises her children" },
      { date: "June 19, 1936", title: "Died" },
    ];

    expected.forEach(({ date, title }, index) => {
      const entry = entries[index];
      expect(within(entry as HTMLElement).getByText(date)).toBeInTheDocument();
      expect(within(entry as HTMLElement).getByText(title)).toBeInTheDocument();
    });
  });

  it("keeps the Sources section present with the shared warm card styling", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    const sources = screen.getByRole("region", { name: "Sources" });
    // The Sources section keeps the warm card surface shared across the profile.
    // Only the shared visual structure is characterized here; the specific source
    // cards inside are intentionally changing (single mixed-evidence card -> three
    // distinct source cards), so their content is not frozen as a baseline.
    const card = sources.querySelector(".rounded-2xl");
    expect(card).not.toBeNull();
    expect(card?.className).toContain("bg-card");
    expect(card?.className).toContain("border");
  });

  it("shows the three requested source cards on Julia's profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    const sources = screen.getByRole("region", { name: "Sources" });
    const cards = Array.from(sources.querySelectorAll(".rounded-2xl")).filter(
      (el) => el.querySelector("p"),
    );

    // The three requested source cards are present.
    expect(cards).toHaveLength(3);
    for (const title of [
      "1880 U.S. Census",
      "Family Research Notes",
      "Death Information",
    ]) {
      expect(within(sources).getByText(title)).toBeInTheDocument();
    }
  });

  it("distinguishes documented records from family-history notes with kind-driven badges", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    const sources = screen.getByRole("region", { name: "Sources" });

    // Documented records are labeled "Documented record".
    const censusCard = sources.querySelector(".rounded-2xl") as HTMLElement;
    expect(
      within(censusCard).getByText("Documented record"),
    ).toBeInTheDocument();

    // The family-history note is labeled "Family-history note".
    const notesCard = Array.from(sources.querySelectorAll(".rounded-2xl")).find(
      (el) => within(el as HTMLElement).queryByText("Family Research Notes"),
    );
    expect(notesCard).toBeDefined();
    expect(
      within(notesCard as HTMLElement).getByText("Family-history note"),
    ).toBeInTheDocument();

    // The two documented records both carry the documented badge.
    const documentedBadges = within(sources).getAllByText("Documented record");
    expect(documentedBadges).toHaveLength(2);
  });

  it("keeps the non-Timeline profile sections and header facts intact", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    // The other profile sections remain present alongside the Timeline.
    for (const section of ["Her Story", "Family", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    // The header facts (definition list) are unchanged. Scope to the <dl> so
    // the same dates appearing in the Timeline don't create ambiguity.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(screen.getByText("Matriarch")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("approx. 1860"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("June 19, 1936"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Isaiah Norwood"),
    ).toBeInTheDocument();
  });

  it("returns to the Family Tree when the profile Back button is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );

    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("returns to Home when the Back button is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    await user.click(screen.getByRole("button", { name: /Back to Home/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );
  });

  it("keeps the couple side by side and the children in branching rows below", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });

    // The couple section is positioned relative so the relationship line can
    // sit between the two cards; the side-by-side grid lives on its inner div.
    expect(coupleSection.className).toContain("relative");
    const coupleGrid = coupleSection.querySelector(".grid");
    expect(coupleGrid).not.toBeNull();
    expect(coupleGrid?.className).toContain("grid-cols-2");

    // The children are laid out in responsive grids (2 columns on mobile, 4 on
    // larger), one grid per branching row.
    const childGrids = Array.from(
      childrenSection.querySelectorAll(".grid"),
    ).filter((el) => el.querySelector('[data-ocid^="tree.person."]'));
    expect(childGrids.length).toBeGreaterThan(0);
    for (const grid of childGrids) {
      expect(grid.className).toContain("grid-cols-2");
      expect(grid.className).toContain("sm:grid-cols-4");
    }
  });

  it("draws a horizontal couple connector, a vertical trunk, and branching lines to each child", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });

    // A horizontal line spans the center of the couple section, between the two cards.
    const horizontalLine = Array.from(
      coupleSection.querySelectorAll("div"),
    ).find(
      (el) =>
        el.className.includes("left-1/2") && el.className.includes("top-1/2"),
    );
    expect(horizontalLine).toBeDefined();
    expect(horizontalLine?.className).toContain("h-px");
    expect(horizontalLine?.className).toContain("w-1/2");

    // A vertical trunk runs down from the couple section toward the children.
    const verticalLine = Array.from(container.querySelectorAll("div")).find(
      (el) => el.className.includes("h-8") && el.className.includes("w-px"),
    );
    expect(verticalLine).toBeDefined();
    expect(verticalLine?.className).toContain("bg-border");

    // The vertical trunk sits between the couple and the children sections.
    const coupleNode = coupleSection;
    const childrenNode = childrenSection;
    expect(
      coupleNode.compareDocumentPosition(verticalLine as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (verticalLine as Element).compareDocumentPosition(childrenNode) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Each branching row has a horizontal branch bar spanning its width.
    const branchBars = Array.from(
      childrenSection.querySelectorAll("div"),
    ).filter(
      (el) =>
        el.className.includes("left-0") &&
        el.className.includes("right-0") &&
        el.className.includes("top-0") &&
        el.className.includes("h-px"),
    );
    expect(branchBars.length).toBeGreaterThan(0);
    for (const bar of branchBars) {
      expect(bar.className).toContain("bg-border");
    }

    // Vertical stubs drop from each branch bar down to the children.
    const stubs = Array.from(childrenSection.querySelectorAll("div")).filter(
      (el) => el.className.includes("h-6") && el.className.includes("w-px"),
    );
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.className).toContain("bg-border");
    }
  });

  it("applies the warm sepia 'Aged Album' card styling to person cards", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    // The paper grain overlay is rendered by the Layout on every screen.
    expect(container.querySelector(".paper-grain")).not.toBeNull();

    const allPersonCards = screen
      .getAllByRole("button")
      .filter((button) =>
        button.getAttribute("data-ocid")?.startsWith("tree.person."),
      );
    for (const card of allPersonCards) {
      expect(card.className).toContain("bg-card");
      expect(card.className).toContain("border");
      expect(card.className).toContain("rounded-xl");
    }
  });

  it("shows a circular photo for the couple and initials placeholders for the children", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });

    // The couple cards render a circular photo area with an image.
    const coupleImages = Array.from(coupleSection.querySelectorAll("img"));
    expect(coupleImages).toHaveLength(2);
    for (const img of coupleImages) {
      expect(img.className).toContain("object-cover");
      expect(img.getAttribute("alt")).toBeTruthy();
    }

    // The children cards render a circular initials placeholder instead of a photo.
    const childrenImages = Array.from(childrenSection.querySelectorAll("img"));
    expect(childrenImages).toHaveLength(0);

    // Each child card shows initials derived from their name (first + last letter).
    const clayton = within(childrenSection).getByRole("button", {
      name: /Clayton/,
    });
    expect(clayton).toHaveTextContent("C");
    const isaiahJr = within(childrenSection).getByRole("button", {
      name: /Isaiah Jr\./,
    });
    expect(isaiahJr).toHaveTextContent("I");
  });

  it("keeps the couple's photo area and name clickable to open their profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // The whole couple card (photo area + name) is a single button that opens the profile.
    const julia = screen.getByRole("button", { name: /Julia/ });
    await user.click(julia);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
  });

  it("hides the Relation to You area until a card is selected", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const clayton = screen.getByRole("button", { name: /Clayton Child/ });
    expect(clayton).not.toHaveTextContent("Relation to You");
  });

  it("shows 'Relation to You: Not set' on a selected card with no relation value", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Isaiah Jr. has no relation value populated yet.
    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(isaiahJr).toHaveAttribute("aria-pressed", "true");
    expect(isaiahJr).toHaveTextContent("Relation to You");
    expect(isaiahJr).toHaveTextContent("Not set");
  });

  it("shows the populated relation value on a selected card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Hattie has a relation value populated.
    const hattie = screen.getByRole("button", { name: /Hattie/ });
    await user.click(hattie);
    expect(hattie).toHaveAttribute("aria-pressed", "true");
    expect(hattie).toHaveTextContent("Relation to You");
    expect(hattie).toHaveTextContent("grandaunt");
  });

  it("shows each selected card's own relation value", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const hattie = screen.getByRole("button", { name: /Hattie/ });
    await user.click(hattie);
    expect(hattie).toHaveTextContent("grandaunt");

    const lula = screen.getByRole("button", { name: /Lula E\./ });
    await user.click(lula);
    expect(lula).toHaveTextContent("great-grandmother");
    expect(hattie).not.toHaveTextContent("grandaunt");
  });

  it("shows the 'This is Me' action only on the selected card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // No card is selected, so no 'This is Me' action is shown.
    expect(screen.queryByRole("button", { name: "This is Me" })).toBeNull();

    // Selecting a card reveals the action on that card.
    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();

    // Selecting a different card moves the action to that card.
    const edward = screen.getByRole("button", { name: /Edward/ });
    await user.click(edward);
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
  });

  it("marks the selected card as 'Me' when 'This is Me' is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(isaiahJr).not.toHaveTextContent("Me");

    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // The card is now labeled 'Me' and the action disappears.
    expect(isaiahJr).toHaveTextContent("Me");
    expect(screen.queryByRole("button", { name: "This is Me" })).toBeNull();
  });

  it("moves the 'Me' label to the newly marked person", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    await user.click(screen.getByRole("button", { name: "This is Me" }));
    expect(isaiahJr).toHaveTextContent("Me");

    // Select and mark a second person.
    const edward = screen.getByRole("button", { name: /Edward/ });
    await user.click(edward);
    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // Only the newly marked person keeps the label.
    expect(edward).toHaveTextContent("Me");
    expect(isaiahJr).not.toHaveTextContent("Me");
  });

  it("keeps the 'Me' label when the selection moves to another card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    await user.click(screen.getByRole("button", { name: "This is Me" }));
    expect(isaiahJr).toHaveTextContent("Me");

    // Select a different card — the 'Me' label stays on Isaiah Jr.
    const edward = screen.getByRole("button", { name: /Edward/ });
    await user.click(edward);
    expect(isaiahJr).toHaveTextContent("Me");
    expect(edward).not.toHaveTextContent("Me");
  });

  it("keeps relation display unchanged when a card is marked 'Me'", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Hattie has a stored relation value and is a highlight-only child card
    // (she does not navigate to a profile), so she can be selected and marked.
    const hattie = screen.getByRole("button", { name: /Hattie/ });
    await user.click(hattie);
    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // The stored relation value still displays on the selected card.
    expect(hattie).toHaveTextContent("Relation to You");
    expect(hattie).toHaveTextContent("grandaunt");

    // A card without a stored value still shows 'Not set'.
    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(isaiahJr).toHaveTextContent("Relation to You");
    expect(isaiahJr).toHaveTextContent("Not set");
  });

  it("opens Erma T. Williams' Person Profile when her card is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    const erma = within(claytonBranch).getByRole("button", {
      name: /Erma T\. Williams/,
    });
    await user.click(erma);

    // The profile replaces the Family Tree view.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Erma T. Williams",
    );
    expect(
      screen.queryByRole("heading", { level: 1, name: "Family Tree" }),
    ).not.toBeInTheDocument();
  });

  it("shows the profile header facts for Erma T. Williams", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    await user.click(
      within(claytonBranch).getByRole("button", { name: /Erma T\. Williams/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Erma T. Williams",
    );
    expect(screen.getByText("Wife of Clayton Norwood")).toBeInTheDocument();

    // The header facts are rendered as a definition list.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(
      within(dl as HTMLElement).getByText("Birth year"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Uncertain (c. 1885 or 1897)"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Clayton Norwood"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("labels Erma's story section 'Her Story'", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    await user.click(
      within(claytonBranch).getByRole("button", { name: /Erma T\. Williams/ }),
    );

    expect(
      screen.getByRole("region", { name: "Her Story" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Her Story" })).toHaveTextContent(
      "1920 census",
    );
  });

  it("shows the four profile sections for Erma as populated", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    await user.click(
      within(claytonBranch).getByRole("button", { name: /Erma T\. Williams/ }),
    );

    for (const section of ["Her Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    // Each section is populated (not an empty placeholder).
    expect(screen.queryByText("Not yet populated")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Clayton Norwood",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Lula Mae",
    );
    expect(screen.getByRole("region", { name: "Timeline" })).toHaveTextContent(
      "Birth year uncertain",
    );
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(
      "1920 U.S. Census",
    );
  });

  it("renders the unresolved-conflict badge on Erma's profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    await user.click(
      within(claytonBranch).getByRole("button", { name: /Erma T\. Williams/ }),
    );

    const sources = screen.getByRole("region", { name: "Sources" });

    // The documented records and family-history note keep their badges.
    expect(within(sources).getAllByText("Documented record")).toHaveLength(2);
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();

    // The conflicting birth-year account is labeled an unresolved conflict.
    const conflictCard = Array.from(
      sources.querySelectorAll(".rounded-2xl"),
    ).find((el) =>
      within(el as HTMLElement).queryByText("Birth year conflict"),
    );
    expect(conflictCard).toBeDefined();
    expect(
      within(conflictCard as HTMLElement).getByText("Unresolved conflict"),
    ).toBeInTheDocument();
  });
});
