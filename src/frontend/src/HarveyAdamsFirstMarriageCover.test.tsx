import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

configure({ testIdAttribute: "data-ocid" });

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
// card down the maternal ancestry chain. Clicking the header "Explore Family"
// button first resets the focus to the default anchor (Julia), so this can be
// re-run from any view to return to Harvey.
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

// The 14 recorded children of Harvey Adams Sr. and Mary Louise Sims, in the
// order they appear in the family graph (Gertrude first, then the rest). Each
// entry is the role-qualified accessible name of the Explore Family relative
// card when Harvey is focused.
const FIRST_MARRIAGE_CHILDREN = [
  "Gertrude Adams-Hill Child",
  "John Adams Child",
  "Louis Adams Sr. Child",
  "Albert Adams Child",
  "Charles Adams Child",
  "Homer Adams Child",
  "Versie Adams Sr. Child",
  "Judge Granberry Adams Child",
  "Fannie Adams Child",
  "Harvey Adams Jr. Child",
  "Christine Adams Tucker Child",
  "Robert Adams Sr. Child",
  "Ella Mae Adams Child",
  "Eula Lee Adams Child",
];

// Cover for the Harvey Adams Sr. first-marriage branch in the redesigned
// Explore Family / Heritage Branch views. When Harvey is focused, Explore
// Family shows both wives (Mary Louise Sims and Mary Jane Johnson) as spouse
// cards and all 16 recorded children as child cards. Each first-marriage child
// opens its profile via the focus card's View Profile button, Christine Adams
// Tucker states she married a Tucker, Versie Adams Sr. remains distinct from
// Versie Smith, and the Heritage Branch's Adams Maternal Line cluster shows
// Harvey as the anchor with all children connected.
describe("Harvey Adams Sr. first-marriage branch cover", () => {
  it("shows Harvey's first-marriage connections in Explore Family", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // Mary Louise Sims (first wife) and Mary Jane Johnson (second wife) both
    // render as spouse cards.
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson Spouse/ }),
    ).toBeInTheDocument();

    // All 14 first-marriage children render as child cards.
    for (const child of FIRST_MARRIAGE_CHILDREN) {
      expect(
        screen.getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("opens Mary Louise Sims' profile and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);
    await openProfileFromFocus(user, /Mary Louise Sims Spouse/);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Mary Louise Sims",
    );
    expect(
      screen.getByText("First Wife of Harvey Adams Sr."),
    ).toBeInTheDocument();
    for (const section of [
      "Her Story",
      "Family",
      "Timeline",
      "Sources",
      "Photos",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("opens each first-marriage child profile", async () => {
    const user = userEvent.setup();
    renderApp();

    const cases: { card: RegExp; heading: string }[] = [
      { card: /John Adams Child/, heading: "John Adams" },
      { card: /Louis Adams Sr\. Child/, heading: "Louis Adams Sr." },
      { card: /Albert Adams Child/, heading: "Albert Adams" },
      { card: /Charles Adams Child/, heading: "Charles Adams" },
      { card: /Homer Adams Child/, heading: "Homer Adams" },
      { card: /Versie Adams Sr\. Child/, heading: "Versie Adams Sr." },
      { card: /Judge Granberry Adams Child/, heading: "Judge Granberry Adams" },
      { card: /Fannie Adams Child/, heading: "Fannie Adams" },
      { card: /Harvey Adams Jr\. Child/, heading: "Harvey Adams Jr." },
      {
        card: /Christine Adams Tucker Child/,
        heading: "Christine Adams Tucker",
      },
      { card: /Robert Adams Sr\. Child/, heading: "Robert Adams Sr." },
      { card: /Ella Mae Adams Child/, heading: "Ella Mae Adams" },
      { card: /Eula Lee Adams Child/, heading: "Eula Lee Adams" },
    ];

    for (const { card, heading } of cases) {
      // After "Back to Family Tree" the focus is the person whose profile was
      // opened, so re-focus on Harvey before each profile open.
      await focusHarvey(user);
      await openProfileFromFocus(user, card);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  }, 15000);

  it("opens Gertrude Adams-Hill from her first-marriage child card (the existing Gertrude profile)", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);

    // The Gertrude child card in the first-marriage list opens the existing
    // Gertrude Adams-Hill profile, not a separate Gertrude Adams profile.
    await openProfileFromFocus(user, /Gertrude Adams-Hill Child/);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gertrude Adams-Hill",
    );
    expect(
      screen.getByText("Daughter of Harvey Adams Sr."),
    ).toBeInTheDocument();
  });

  it("keeps Christine Adams Tucker's profile stating she married a Tucker", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await focusHarvey(user);
    await openProfileFromFocus(user, /Christine Adams Tucker Child/);

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Spouse")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Tucker (given name not recorded)"),
    ).toBeInTheDocument();

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Tucker")).toBeInTheDocument();
    expect(family).toHaveTextContent("married a man named Tucker");
  });

  it("keeps Versie Adams Sr. distinct from Versie Smith", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusHarvey(user);
    await openProfileFromFocus(user, /Versie Adams Sr\. Child/);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Adams Sr.",
    );
    expect(
      screen.getByText("Son of Harvey Adams Sr. and Mary Louise Sims"),
    ).toBeInTheDocument();
    // The profile is not the Versie Smith profile.
    expect(
      screen.queryByText("Husband of Lula Mae Norwood"),
    ).not.toBeInTheDocument();
  });

  it("shows the first-marriage branch in the Heritage Branch with all children connected", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // The Adams Maternal Line cluster anchors on Harvey and lists all 16
    // children (both marriages) as connected nodes.
    const adams = screen.getByTestId("hb.cluster.5");
    expect(
      within(adams).getByRole("button", {
        name: /Harvey Adams Sr\., Father of Gertrude Adams-Hill/,
      }),
    ).toBeInTheDocument();
    expect(within(adams).getByTestId("hb.cluster.5.count")).toHaveTextContent(
      "16 children · 2 marriages",
    );
    for (const child of FIRST_MARRIAGE_CHILDREN) {
      const name = child.replace(/ Child$/, "");
      expect(
        within(adams).getByRole("button", {
          name: new RegExp(`^${name}, `),
        }),
      ).toBeInTheDocument();
    }
  });

  it("opens a first-marriage child profile from the Heritage Branch", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Tap a first-marriage child node in the Adams Maternal Line cluster.
    await user.click(screen.getByRole("button", { name: /John Adams, Son/ }));

    // Explore Family opens centered on John Adams.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
    expect(screen.getByText("John Adams")).toBeInTheDocument();
  });
});
