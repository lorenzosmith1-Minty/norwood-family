import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyTreePage } from "./pages/FamilyTreePage";

// The FamilyTreePage component is the full multi-generation Norwood family tree
// renderer. It is NOT currently wired into App.tsx (the "family-tree" view shows
// the Explore Family navigator instead), so it has no coverage through the App
// journey. This file characterizes its current rendering directly so the
// upcoming refactor — replacing its hardcoded inline person/relationship arrays
// with the shared FAMILY_GRAPH — can be verified against a stable baseline.
//
// The refactor intentionally removes the hardcoded inline arrays, so these tests
// do NOT freeze those arrays. They freeze the observable rendering contract that
// must survive: every person renders, the four collapsible branches start
// collapsed and expand on tap, PersonCard variants are used (default for the
// couple/children, couple for Lula Mae/Versie, child for their seven children),
// and selecting a card reveals the "Selected:" footer and expands its branch.

function renderTree(
  props: {
    initialExpandedPersonId?: string;
    onOpenProfile?: (id: string) => void;
  } = {},
) {
  const onBack = vi.fn();
  const onOpenProfile = props.onOpenProfile ?? vi.fn();
  render(
    <FamilyTreePage
      onBack={onBack}
      onOpenProfile={onOpenProfile}
      profilePhotos={{}}
      initialExpandedPersonId={props.initialExpandedPersonId}
    />,
  );
  return { onBack, onOpenProfile };
}

afterEach(cleanup);

// The four collapsible branches all start collapsed, so only their fold buttons
// are visible on first render. Expand every branch so the people inside render.
// The folds are queried by data-ocid because their names collide with person
// card names (e.g. "Clayton" is both a card and a branch fold).
async function expandAllBranches(user: ReturnType<typeof userEvent.setup>) {
  for (const ocid of [
    "tree.branch.clayton",
    "tree.branch.lula_versie",
    "tree.branch.versie_maternal",
    "tree.branch.harvey_second",
  ]) {
    const fold = document.querySelector(`[data-ocid="${ocid}"]`);
    if (fold && fold.getAttribute("aria-expanded") === "false") {
      await user.click(fold as HTMLElement);
    }
  }
}

// A person's name may appear both as a PersonCard name and as a branch fold
// name (e.g. "Clayton", "Harvey Adams Sr."). Assert the card is present by
// checking that at least one element with that text exists.
function expectPerson(name: string) {
  expect(screen.getAllByText(name).length).toBeGreaterThan(0);
}

describe("FamilyTreePage characterization: rendering contract", () => {
  it("renders the founding couple and their eight children as PersonCards", () => {
    renderTree();

    // The couple renders as two default cards.
    expectPerson("Julia “Julie” Norwood");
    expectPerson("Isaiah Norwood");

    // The eight children render in the children rows.
    for (const name of [
      "Clayton",
      "Isaiah Jr.",
      "Edward",
      "Hattie",
      "Pinkie",
      "Louise",
      "Lillie",
      "Lula E.",
    ]) {
      expectPerson(name);
    }

    // PersonCards carry the tree.person.<n> data-ocid.
    expect(
      document.querySelector('[data-ocid="tree.person.1"]'),
    ).not.toBeNull();
  });

  it("starts all four collapsible branches collapsed", () => {
    renderTree();

    for (const ocid of [
      "tree.branch.clayton",
      "tree.branch.lula_versie",
      "tree.branch.versie_maternal",
      "tree.branch.harvey_second",
    ]) {
      const fold = document.querySelector(`[data-ocid="${ocid}"]`);
      expect(fold).not.toBeNull();
      expect(fold).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("expands the Clayton branch to show both spouses and their children", async () => {
    const user = userEvent.setup();
    renderTree();

    // Collapsed: the branch contents are not rendered.
    expect(screen.queryByText("Ms. Hudson")).not.toBeInTheDocument();
    expect(screen.queryByText("Erma T. Williams")).not.toBeInTheDocument();

    await user.click(
      document.querySelector(
        '[data-ocid="tree.branch.clayton"]',
      ) as HTMLElement,
    );

    // Both spouses render.
    expect(screen.getByText("Ms. Hudson")).toBeInTheDocument();
    expect(screen.getByText("Erma T. Williams")).toBeInTheDocument();

    // Children of the first marriage.
    for (const name of ["Elbert", "Wellman", "Wetherby"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Children of the second marriage.
    for (const name of [
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
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("expands the Lula Mae & Versie branch to show the couple and their seven children", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(
      document.querySelector(
        '[data-ocid="tree.branch.lula_versie"]',
      ) as HTMLElement,
    );

    // The couple renders with the "couple" PersonCard variant.
    expect(screen.getByText("Lula Mae")).toBeInTheDocument();
    expect(screen.getByText("Versie Smith")).toBeInTheDocument();

    // The seven children render with the "child" variant.
    for (const name of [
      "Lorenzo Smith Sr.",
      "Versie Smith Jr.",
      "Herbert Smith",
      "Alonzo Smith",
      "Sherri Smith",
      "Beatrice Smith",
      "Ed Smith",
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("expands Versie's maternal family to show Harvey, Gertrude, and Versie", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(
      document.querySelector(
        '[data-ocid="tree.branch.versie_maternal"]',
      ) as HTMLElement,
    );

    expectPerson("Harvey Adams Sr.");
    expect(screen.getByText("Gertrude Adams-Hill")).toBeInTheDocument();
    expect(screen.getByText("Versie Smith")).toBeInTheDocument();
  });

  it("expands Harvey's second marriage to show Mary Jane, Mildred, Christine, and Mildred's daughters", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(
      document.querySelector(
        '[data-ocid="tree.branch.harvey_second"]',
      ) as HTMLElement,
    );

    expect(screen.getByText("Mary Jane Johnson")).toBeInTheDocument();
    expect(screen.getByText("Mildred Adams")).toBeInTheDocument();
    expect(screen.getByText("Christine Adams")).toBeInTheDocument();
    for (const name of ["Tammy", "Punchy", "Patricia Rollins"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("renders every person across the whole tree when all branches are expanded", async () => {
    const user = userEvent.setup();
    renderTree();
    await expandAllBranches(user);

    // Every person that previously appeared in the tree is present.
    for (const name of [
      // Couple
      "Julia “Julie” Norwood",
      "Isaiah Norwood",
      // Children
      "Clayton",
      "Isaiah Jr.",
      "Edward",
      "Hattie",
      "Pinkie",
      "Louise",
      "Lillie",
      "Lula E.",
      // Clayton branch
      "Ms. Hudson",
      "Erma T. Williams",
      "Elbert",
      "Wellman",
      "Wetherby",
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
      // Lula Mae & Versie
      "Versie Smith",
      "Lorenzo Smith Sr.",
      "Versie Smith Jr.",
      "Herbert Smith",
      "Alonzo Smith",
      "Sherri Smith",
      "Beatrice Smith",
      "Ed Smith",
      // Versie's maternal family
      "Harvey Adams Sr.",
      "Gertrude Adams-Hill",
      // Harvey's second marriage
      "Mary Jane Johnson",
      "Mildred Adams",
      "Christine Adams",
      "Tammy",
      "Punchy",
      "Patricia Rollins",
    ]) {
      expectPerson(name);
    }
  });
});

describe("FamilyTreePage characterization: selection and branch behavior", () => {
  it("shows the selected person's name in the footer when a card is tapped", async () => {
    const user = userEvent.setup();
    renderTree();

    // Tap Julia's card (tree.person.1).
    await user.click(
      screen.getByRole("button", { name: /Julia “Julie” Norwood/ }),
    );

    expect(
      screen.getByText("Selected: “Julia “Julie” Norwood”"),
    ).toBeInTheDocument();
  });

  it("expands the branch containing a selected card", async () => {
    const user = userEvent.setup();
    renderTree();

    // Clayton's card is in the collapsed Clayton branch. Selecting it expands
    // the branch so the selected person is never hidden.
    await user.click(screen.getByRole("button", { name: /^Clayton$/ }));

    const claytonFold = document.querySelector(
      '[data-ocid="tree.branch.clayton"]',
    );
    expect(claytonFold).toHaveAttribute("aria-expanded", "true");
    // The branch contents now render.
    expect(screen.getByText("Ms. Hudson")).toBeInTheDocument();
  });

  it("opens a person's profile via onOpenProfile when a card is tapped", async () => {
    const user = userEvent.setup();
    const onOpenProfile = vi.fn();
    renderTree({ onOpenProfile });

    await user.click(
      screen.getByRole("button", { name: /Julia “Julie” Norwood/ }),
    );

    expect(onOpenProfile).toHaveBeenCalledWith("julia");
  });

  it("starts a branch expanded when initialExpandedPersonId is inside it", () => {
    renderTree({ initialExpandedPersonId: "elbert" });

    // Elbert is in the Clayton branch, so that branch starts expanded.
    const claytonFold = document.querySelector(
      '[data-ocid="tree.branch.clayton"]',
    );
    expect(claytonFold).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Elbert")).toBeInTheDocument();
  });
});
