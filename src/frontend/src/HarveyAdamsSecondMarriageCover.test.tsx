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
  // The header nav button is always labeled "Explore Family" (the home page
  // has a separate "Explore the Family" button). Clicking the header button
  // resets the focus to the default anchor (Julia).
  await user.click(screen.getByRole("button", { name: /^Explore Family$/ }));
}

// Recenter the Explore Family view on Harvey Adams Sr. by tapping each relative
// card down the maternal ancestry chain. Clicking the header "Explore the
// Family" button first resets the focus to the default anchor (Julia), so this
// can be re-run from any view to return to Harvey.
async function focusHarvey(user: ReturnType<typeof userEvent.setup>) {
  await openExploreFamily(user);
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
  );
  await user.click(screen.getByRole("button", { name: /Versie Smith Spouse/ }));
  await user.click(
    screen.getByRole("button", { name: /Gertrude Adams-Hill Mother/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Harvey Adams Sr\. Father/ }),
  );
}

// Recenter on a relative of the current focus, then open their profile via the
// focus card's View Profile button.
async function openProfileFromFocus(
  user: ReturnType<typeof userEvent.setup>,
  relativeCardName: RegExp,
) {
  await user.click(screen.getByRole("button", { name: relativeCardName }));
  await user.click(screen.getByRole("button", { name: "View Profile" }));
}

// Cover for the Harvey Adams Sr. second-marriage expansion: the six new Person
// Profile pages (Mary Jane Johnson, Mildred Adams, Christine Adams, Tammy,
// Punchy, Patricia Rollins) render the full template with recorded-only facts,
// and Harvey's profile lists Mary Jane Johnson as his second wife with Mildred
// and Christine as their children. The redesign replaced the old Family Tree /
// Heritage Branch navigation with the focused Explore Family view, so these
// tests reach each profile by recentering down the maternal ancestry chain and
// opening it via the focus card's View Profile button.
describe("Harvey Adams Sr. second-marriage cover", () => {
  it("shows the second-marriage connections around Harvey in Explore Family", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // Harvey is the focus. His two wives render as spouse cards.
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    ).toBeInTheDocument();
    // Mildred and Christine render as children of the second marriage.
    expect(
      screen.getByRole("button", { name: /Mildred Adams Child/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Christine Adams Child/ }),
    ).toBeInTheDocument();
  });

  it("opens each new second-marriage profile and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();

    const cases: { card: RegExp; heading: string; role: string }[] = [
      {
        card: /Mary Jane Johnson Spouse/,
        heading: "Mary Jane Johnson",
        role: "Second Wife of Harvey Adams Sr.",
      },
      {
        card: /Mildred Adams Child/,
        heading: "Mildred Adams",
        role: "Daughter of Harvey Adams Sr. and Mary Jane Johnson",
      },
      {
        card: /Christine Adams Child/,
        heading: "Christine Adams",
        role: "Daughter of Harvey Adams Sr. and Mary Jane Johnson",
      },
    ];

    for (const { card, heading, role } of cases) {
      await focusHarvey(user);
      await openProfileFromFocus(user, card);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      expect(screen.getByText(role)).toBeInTheDocument();
      for (const section of [
        "Her Story",
        "Family",
        "Timeline",
        "Sources",
        "Photos",
      ]) {
        expect(
          screen.getByRole("region", { name: section }),
        ).toBeInTheDocument();
      }
      expect(
        document.querySelector('[data-ocid="profile.completeness"]'),
      ).not.toBeNull();

      // Return to Explore Family before the next case.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("shows Mary Jane Johnson's recorded facts: second wife of Harvey, mother of Mildred and Christine", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await focusHarvey(user);
    await openProfileFromFocus(user, /Mary Jane Johnson Spouse/);

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Harvey Adams Sr."),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Children")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mildred Adams and Christine Adams"),
    ).toBeInTheDocument();

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Harvey Adams Sr.")).toBeInTheDocument();
    expect(within(family).getByText("Husband")).toBeInTheDocument();
    expect(family).toHaveTextContent(
      "Children: Mildred Adams, Christine Adams",
    );
  });

  it("shows Mildred Adams' recorded facts: daughter of Harvey and Mary Jane, mother of Tammy, Punchy, and Patricia Rollins", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await focusHarvey(user);
    await openProfileFromFocus(user, /Mildred Adams Child/);

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Harvey Adams Sr. and Mary Jane Johnson",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Children")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Tammy, Punchy, and Patricia Rollins",
      ),
    ).toBeInTheDocument();

    const family = screen.getByRole("region", { name: "Family" });
    expect(family).toHaveTextContent(
      "Mildred Adams had three daughters — Tammy, Punchy, and Patricia Rollins.",
    );
  });

  it("records each remaining new profile's parent facts without inventing details", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    // Christine Adams is a daughter of Harvey and Mary Jane.
    await focusHarvey(user);
    await openProfileFromFocus(user, /Christine Adams Child/);
    let dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Harvey Adams Sr. and Mary Jane Johnson",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );

    // Tammy, Punchy, and Patricia Rollins are each daughters of Mildred Adams.
    // Recenter on Mildred first so her children are visible, then open each.
    for (const card of [
      /Tammy Child/,
      /Punchy Child/,
      /Patricia Rollins Child/,
    ]) {
      await focusHarvey(user);
      await user.click(
        screen.getByRole("button", { name: /Mildred Adams Child/ }),
      );
      await openProfileFromFocus(user, card);
      dl = container.querySelector("dl");
      expect(dl).not.toBeNull();
      expect(within(dl as HTMLElement).getByText("Mother")).toBeInTheDocument();
      expect(
        within(dl as HTMLElement).getByText("Mildred Adams"),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("renders an initials placeholder portrait for each new profile since no photo exists", async () => {
    const user = userEvent.setup();
    renderApp();

    const cases: RegExp[] = [
      /Mary Jane Johnson Spouse/,
      /Mildred Adams Child/,
      /Christine Adams Child/,
    ];
    for (const card of cases) {
      await focusHarvey(user);
      await openProfileFromFocus(user, card);
      const portrait = screen.getByRole("img", {
        name: /initials placeholder portrait/i,
      });
      expect(portrait).toBeInTheDocument();
      expect(portrait).toHaveAttribute("src", "/assets/images/placeholder.svg");
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("labels each new profile's sources as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();

    const cases: RegExp[] = [
      /Mary Jane Johnson Spouse/,
      /Mildred Adams Child/,
      /Christine Adams Child/,
    ];
    for (const card of cases) {
      await focusHarvey(user);
      await openProfileFromFocus(user, card);
      const sources = screen.getByRole("region", { name: "Sources" });
      expect(
        within(sources).getByText("Family-history note"),
      ).toBeInTheDocument();
      expect(
        within(sources).queryByText("Documented record"),
      ).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("lists Mary Jane Johnson as Harvey's second wife with Mildred and Christine as their children", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // Open Harvey's own profile via the focus card.
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Mary Jane Johnson")).toBeInTheDocument();
    expect(within(family).getByText("Second Wife")).toBeInTheDocument();
    expect(family).toHaveTextContent(
      "Children: Mildred Adams, Christine Adams",
    );
  });
});
