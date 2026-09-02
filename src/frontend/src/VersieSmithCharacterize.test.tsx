import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

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

// Navigate the Explore Family focused navigator to Lula Mae's profile:
// Julia (default) -> Clayton (child) -> Lula Mae (child).
async function openLulaMaeProfile(user: ReturnType<typeof userEvent.setup>) {
  await openExploreFamily(user);
  await tapRelative(user, /Clayton Norwood Child/);
  await tapRelative(user, /Lula Mae Norwood Child/);
  await user.click(screen.getByRole("button", { name: "View Profile" }));
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

// Characterization baseline for the Versie Smith change. The request adds a new
// Versie Smith profile and shows Lula Mae and Versie as a couple in the Explore
// Family view and Heritage Branch View. This protects the adjacent working
// behavior that must remain unchanged: Lula Mae's existing card stays under
// Clayton in the Explore Family view and still opens her profile, her existing
// profile keeps rendering the full template with Versie Smith as husband and
// family-history sources, and the app still loads on the default route without
// a blank screen.
describe("Versie Smith characterization: Lula Mae's existing behavior stays intact", () => {
  it("loads the app on the default route without a blank screen", () => {
    renderApp();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toHaveAttribute("src", "/assets/norwood-logo.png");
  });

  it("keeps Lula Mae's card under Clayton in the Explore Family view", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);

    // Lula Mae remains a child of Clayton, alongside the other Erma children.
    expect(
      screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
    ).toBeInTheDocument();
    for (const sibling of [
      "Columbus Norwood Child",
      "Thomas Clayton “Tip / TC” Norwood Child",
      "Alton Norwood Child",
      "Robert Davis “RD” Norwood Child",
      "Ardeanus Norwood Child",
      "Willie B. Norwood Child",
      "James Norwood Child",
      "Freddie Norwood Child",
      "Zelia Mae Norwood Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(sibling) }),
      ).toBeInTheDocument();
    }
  });

  it("opens Lula Mae's profile from the Explore Family navigator", async () => {
    const user = userEvent.setup();
    renderApp();
    await openLulaMaeProfile(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );
    expect(screen.getByText("Daughter")).toBeInTheDocument();
  });

  it("keeps Lula Mae's profile listing Versie Smith as husband with family-history sources", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openLulaMaeProfile(user);

    // The header facts still list Versie Smith as her husband.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Versie Smith"),
    ).toBeInTheDocument();

    // The Family section still names Versie Smith as her husband.
    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Versie Smith")).toBeInTheDocument();

    // Her sources remain family-history notes, not documented records.
    const sources = screen.getByRole("region", { name: "Sources" });
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();
    expect(
      within(sources).queryByText("Documented record"),
    ).not.toBeInTheDocument();
  });

  it("keeps Lula Mae's completeness at 86% with Photo incomplete", async () => {
    const user = userEvent.setup();
    renderApp();
    await openLulaMaeProfile(user);

    const completeness = document.querySelector(
      '[data-ocid="profile.completeness"]',
    );
    expect(completeness).not.toBeNull();
    expect(completenessPercent()).toBe("86%");

    // No photograph exists, so the header renders the initials placeholder.
    const portrait = screen.getByRole("img", {
      name: /initials placeholder portrait/i,
    });
    expect(portrait).toHaveAttribute("src", "/assets/images/placeholder.svg");
  });

  it("keeps the other Erma child profiles rendering unchanged", async () => {
    for (const { card, heading } of [
      { card: /Freddie Norwood Child/, heading: "Freddie Norwood" },
      { card: /Zelia Mae Norwood Child/, heading: "Zelia Mae Norwood" },
    ]) {
      const user = userEvent.setup();
      renderApp();
      await openExploreFamily(user);
      await tapRelative(user, /Clayton Norwood Child/);
      await tapRelative(user, card);
      await user.click(screen.getByRole("button", { name: "View Profile" }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      cleanup();
    }
  });
});
