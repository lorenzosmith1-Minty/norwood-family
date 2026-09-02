import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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

// Branding characterization: the upcoming change swaps the hero graphic and the
// header icon for the uploaded Norwood logo. These tests deliberately avoid the
// old generated asset paths (/assets/generated/norwood-tree-logo.svg and
// /assets/generated/norwood-icon.svg) and the tree-specific alt copy, and pin
// only the structure that must survive: a single logo image hero that is not a
// family photograph, and the Norwood wordmark as the header brand.
describe("Branding characterization: hero and header structure stays intact", () => {
  it("keeps the home hero as a single logo image with a descriptive alt", () => {
    renderApp();

    // Exactly one accessible image on the Home screen: the hero logo. The
    // header icon is aria-hidden and presentational, so it is not exposed.
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);

    const hero = images[0];
    expect(hero.tagName).toBe("IMG");
    const alt = hero.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    // The hero is a logo, not a claim of an actual family photograph.
    expect(alt).not.toMatch(/actual/i);
  });

  it("keeps the Norwood wordmark as the header brand name", () => {
    renderApp();

    // The header brand name stays 'Norwood' (not the old 'Norwood Family
    // Connection' text), whether the header shows the logo or the wordmark.
    expect(screen.getByText("Norwood")).toBeInTheDocument();
    expect(
      screen.queryByText("Norwood Family Connection"),
    ).not.toBeInTheDocument();
  });

  it("keeps the closing family-history tagline on the home screen", () => {
    renderApp();

    expect(
      screen.getByText(/A living record of the people, places, and moments/),
    ).toBeInTheDocument();
  });
});
