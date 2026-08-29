import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

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
    render(<App />);

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
    render(<App />);
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
    render(<App />);
    await openFamilyTree(user);

    const childrenSection = screen.getByRole("region", { name: "Children" });
    for (const name of CHILDREN) {
      expect(
        within(childrenSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("shows only the two generations (couple + children) and no deeper branches", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });

    expect(within(coupleSection).getAllByRole("button")).toHaveLength(2);
    expect(within(childrenSection).getAllByRole("button")).toHaveLength(8);

    // No other person cards exist beyond the couple and their children.
    const allPersonCards = screen
      .getAllByRole("button")
      .filter((button) =>
        button.getAttribute("data-ocid")?.startsWith("tree.person."),
      );
    expect(allPersonCards).toHaveLength(10);
  });

  it("selects and highlights only the tapped card, moving the highlight on another tap", async () => {
    const user = userEvent.setup();
    render(<App />);
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

    // Tap Clayton (a child).
    const clayton = screen.getByRole("button", { name: /Clayton/ });
    await user.click(clayton);
    expect(clayton).toHaveAttribute("aria-pressed", "true");
    for (const card of allPersonCards) {
      if (card === clayton) continue;
      expect(card).toHaveAttribute("aria-pressed", "false");
    }

    // Tap the patriarch (a non-Julia card) — the highlight moves.
    const isaiah = screen.getByRole("button", { name: /Isaiah Norwood/ });
    await user.click(isaiah);
    expect(isaiah).toHaveAttribute("aria-pressed", "true");
    expect(clayton).toHaveAttribute("aria-pressed", "false");
    for (const card of allPersonCards) {
      if (card === isaiah) continue;
      expect(card).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("keeps non-Julia cards highlight-only: tapping a child or the patriarch does not navigate away", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openFamilyTree(user);

    // Tapping a child card highlights it and stays on the Family Tree.
    const clayton = screen.getByRole("button", { name: /Clayton/ });
    await user.click(clayton);
    expect(clayton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    // Tapping the patriarch (a non-Julia couple card) highlights it and stays.
    const isaiah = screen.getByRole("button", { name: /Isaiah Norwood/ });
    await user.click(isaiah);
    expect(isaiah).toHaveAttribute("aria-pressed", "true");
    expect(clayton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );
  });

  it("opens Julia 'Julie' Norwood's Person Profile when her card is tapped", async () => {
    const user = userEvent.setup();
    render(<App />);
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
    const { container } = render(<App />);
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

  it("shows the four profile sections: Her Story, Family, Timeline, and Sources", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openFamilyTree(user);

    await user.click(screen.getByRole("button", { name: /Julia/ }));

    for (const section of ["Her Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("renders the Timeline as an ordered list of card-styled entries with date/title/detail structure", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    const { container } = render(<App />);
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
    render(<App />);
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
    render(<App />);
    await openFamilyTree(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Family Tree",
    );

    await user.click(screen.getByRole("button", { name: /Back to Home/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );
  });

  it("keeps the couple side by side and the children in a grid below", async () => {
    const user = userEvent.setup();
    render(<App />);
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

    // The children stay in a responsive grid (2 columns on mobile, 4 on larger).
    expect(childrenSection.className).toContain("grid");
    expect(childrenSection.className).toContain("grid-cols-2");
    expect(childrenSection.className).toContain("sm:grid-cols-4");
  });

  it("draws a horizontal relationship line between the couple and a vertical branch down to the children", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
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

    // A vertical line runs down from the couple section toward the children.
    const verticalLine = Array.from(container.querySelectorAll("div")).find(
      (el) => el.className.includes("h-8") && el.className.includes("w-px"),
    );
    expect(verticalLine).toBeDefined();
    expect(verticalLine?.className).toContain("bg-border");

    // The vertical line sits between the couple and the children sections.
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
  });

  it("applies the warm sepia 'Aged Album' card styling to person cards", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
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
      expect(card.className).toContain("rounded-2xl");
    }
  });
});
