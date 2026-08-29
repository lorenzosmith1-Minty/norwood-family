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

    // Tap Julia (the matriarch) — the highlight moves.
    const julia = screen.getByRole("button", { name: /Julia/ });
    await user.click(julia);
    expect(julia).toHaveAttribute("aria-pressed", "true");
    expect(clayton).toHaveAttribute("aria-pressed", "false");
    for (const card of allPersonCards) {
      if (card === julia) continue;
      expect(card).toHaveAttribute("aria-pressed", "false");
    }
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
