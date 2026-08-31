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
  it("renders the app title and subtitle on the default route", () => {
    renderApp();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/Norwood Family\s*Connection/);
    expect(
      screen.getByText("Our story across generations."),
    ).toBeInTheDocument();
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

  it("displays an old-photograph image with a descriptive alt", () => {
    renderApp();

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
    renderApp();

    expect(screen.getByText("The Norwood Family")).toBeInTheDocument();
  });

  it("shows the closing family-history tagline", () => {
    renderApp();

    expect(
      screen.getByText(/A living record of the people, places, and moments/),
    ).toBeInTheDocument();
  });

  it("renders the hero as an image with a descriptive, non-identifying alt", () => {
    renderApp();

    // The hero is the only image on the Home screen.
    const image = screen.getByRole("img");
    expect(image.tagName).toBe("IMG");
    const alt = image.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    // Representative historical imagery must not claim to be an actual family photo.
    expect(alt).not.toMatch(/norwood/i);
  });

  it("keeps the hero as a single representative image that is not labeled as an actual family photo", () => {
    renderApp();

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
    renderApp();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("font-display");
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
