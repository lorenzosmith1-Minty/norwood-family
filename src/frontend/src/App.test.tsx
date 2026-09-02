import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// App renders useIsAdmin at the top level, which calls useActor from
// @caffeineai/core-infrastructure. The real useActor requires an
// InternetIdentityProvider, so these Home-screen tests stub the provider seam
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

const NAV_LABELS = [
  "Explore the Family",
  "Heritage Branch View",
  "Travel Through Time",
  "Family Stories",
  "Family Mysteries",
  "Add to Our History",
];

describe("Home screen", () => {
  it("renders the Norwood brand and tagline on the default route", () => {
    renderApp();

    // The header shows 'Norwood' as the primary brand name.
    expect(screen.getByText("Norwood")).toBeInTheDocument();
    // The hero is a single logo image; the tagline lives inside the SVG, so it
    // is asserted through the image's descriptive alt rather than DOM text.
    const hero = screen.getByRole("img", { name: /Norwood family tree logo/i });
    expect(hero.getAttribute("alt")).toContain("Our story across generations.");
  });

  it("shows all six navigation buttons with exact labels", () => {
    renderApp();

    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(6);
    for (const label of NAV_LABELS) {
      expect(
        within(nav).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("renders the six buttons as non-navigating buttons", () => {
    renderApp();

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

  it("displays the uploaded Norwood logo as the hero", () => {
    renderApp();

    const image = screen.getByRole("img", {
      name: /Norwood family tree logo/i,
    });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "/assets/norwood-logo.png");
  });

  it("shows 'Norwood' as the primary brand name in the header as the wordmark", () => {
    const { container } = renderApp();

    // The header brand name replaces the old 'Norwood Family Connection' text.
    expect(screen.getByText("Norwood")).toBeInTheDocument();
    expect(
      screen.queryByText("Norwood Family Connection"),
    ).not.toBeInTheDocument();
    // The header uses the Norwood wordmark, not a recreated tree icon image.
    // The top navigation header is the first <header> in the document (the hero
    // is a separate <header> element further down).
    const topHeader = container.querySelectorAll("header")[0];
    expect(topHeader.querySelector("img")).toBeNull();
  });

  it("shows the closing family-history tagline", () => {
    renderApp();

    expect(
      screen.getByText(/A living record of the people, places, and moments/),
    ).toBeInTheDocument();
  });

  it("renders the hero as a single logo image with a descriptive alt", () => {
    renderApp();

    // The hero is the only image on the Home screen.
    const image = screen.getByRole("img");
    expect(image.tagName).toBe("IMG");
    const alt = image.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    // The alt describes the Norwood tree logo and its tagline.
    expect(alt).toMatch(/Norwood family tree logo/i);
    // The logo is a tree silhouette with the Norwood name across the middle.
    expect(alt).toMatch(/tree silhouette/i);
    expect(alt).toMatch(/Norwood name across the trunk/i);
    expect(alt).toMatch(/Our story across generations/);
  });

  it("keeps the hero as a single logo image, not a family photograph", () => {
    renderApp();

    // Exactly one image on the Home screen: the hero logo. The header icon is
    // aria-hidden and presentational, so it is not exposed as an image.
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);

    const alt = images[0].getAttribute("alt") ?? "";
    // The hero is the Norwood tree logo, not a claim of an actual family photo.
    expect(alt).toMatch(/Norwood family tree logo/i);
    expect(alt).not.toMatch(/actual/i);
  });

  it("applies the distinctive display typography to the brand name", () => {
    renderApp();

    const brand = screen.getByText("Norwood");
    expect(brand.className).toContain("font-display");
  });

  it("applies warm paper texture and clean card styling", () => {
    const { container } = renderApp();

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
    renderApp();

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
