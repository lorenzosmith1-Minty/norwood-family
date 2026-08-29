import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(cleanup);

const NAV_LABELS = [
  "Explore the Family",
  "Travel Through Time",
  "Family Stories",
  "Family Mysteries",
  "Add to Our History",
];

describe("Home screen", () => {
  it("renders the app title and subtitle on the default route", () => {
    render(<App />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/Norwood Family\s*Connection/);
    expect(
      screen.getByText("Our story across generations."),
    ).toBeInTheDocument();
  });

  it("shows all five navigation buttons with exact labels", () => {
    render(<App />);

    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(5);
    for (const label of NAV_LABELS) {
      expect(
        within(nav).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("renders the five buttons as non-navigating buttons", () => {
    render(<App />);

    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    for (const label of NAV_LABELS) {
      const button = within(nav).getByRole("button", { name: label });
      // Buttons must not be links to destination screens (which are not built).
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toHaveAttribute("href");
    }
  });

  it("displays an old-photograph image with a descriptive alt", () => {
    render(<App />);

    const image = screen.getByRole("img", {
      name: /vintage sepia-toned portrait of a Black family/i,
    });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute(
      "src",
      "/assets/generated/black-family-portrait.dim_800x900.png",
    );
  });

  it("shows the family eyebrow label above the title", () => {
    render(<App />);

    expect(screen.getByText("The Norwood Family")).toBeInTheDocument();
  });

  it("shows the closing family-history tagline", () => {
    render(<App />);

    expect(
      screen.getByText(/A living record of the people, places, and moments/),
    ).toBeInTheDocument();
  });

  it("renders the hero as an image with a descriptive, non-identifying alt", () => {
    render(<App />);

    // The hero is the only image on the Home screen.
    const image = screen.getByRole("img");
    expect(image.tagName).toBe("IMG");
    const alt = image.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    // Representative historical imagery must not claim to be an actual family photo.
    expect(alt).not.toMatch(/norwood/i);
  });

  it("keeps the hero as a single representative image that is not labeled as an actual family photo", () => {
    render(<App />);

    // Exactly one image on the Home screen: the hero.
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);

    const alt = images[0].getAttribute("alt") ?? "";
    // The image is representative historical imagery, not a claim of an actual
    // Norwood family photograph.
    expect(alt).not.toMatch(/norwood/i);
    expect(alt).not.toMatch(/actual/i);
  });

  it("applies the distinctive display typography to the title", () => {
    render(<App />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("font-display");
  });

  it("applies warm paper texture and clean card styling", () => {
    const { container } = render(<App />);

    // Warm paper grain overlay is rendered by the Layout.
    expect(container.querySelector(".paper-grain")).not.toBeNull();
    // Each navigation button is framed by a card-style surface.
    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    for (const button of within(nav).getAllByRole("button")) {
      expect(button.className).toContain("bg-card");
      expect(button.className).toContain("border");
    }
  });

  it("provides hover and focus transitions on interactive elements", () => {
    render(<App />);

    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    for (const button of within(nav).getAllByRole("button")) {
      expect(button.className).toContain("transition-all");
      expect(button.className).toContain("hover:");
      expect(button.className).toContain("focus-visible:");
    }
  });
});
