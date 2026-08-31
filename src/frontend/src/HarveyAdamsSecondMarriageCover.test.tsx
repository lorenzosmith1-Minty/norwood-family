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

async function openFamilyTree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

function secondMarriageSection() {
  return screen.getByRole("region", { name: "Harvey's second marriage" });
}

// The Harvey second-marriage branch defaults to collapsed; expand it so its
// cards render.
async function expandHarveySecondBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Harvey Adams Sr\. \d+$/ }),
  );
}

// The Lula Mae & Versie branch defaults to collapsed; expand it so the maternal
// line (and Harvey's card there) renders.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}

// The six new second-marriage profiles, keyed by their Family Tree card
// accessible name (the person name; role labels are hidden by default) and the
// profile heading they open.
const NEW_PROFILES: { card: RegExp; heading: string; role: string }[] = [
  {
    card: /^Mary Jane Johnson$/,
    heading: "Mary Jane Johnson",
    role: "Second Wife of Harvey Adams Sr.",
  },
  {
    card: /^Mildred Adams$/,
    heading: "Mildred Adams",
    role: "Daughter of Harvey Adams Sr. and Mary Jane Johnson",
  },
  {
    card: /^Christine Adams$/,
    heading: "Christine Adams",
    role: "Daughter of Harvey Adams Sr. and Mary Jane Johnson",
  },
  {
    card: /^Tammy$/,
    heading: "Tammy",
    role: "Daughter of Mildred Adams",
  },
  {
    card: /^Punchy$/,
    heading: "Punchy",
    role: "Daughter of Mildred Adams",
  },
  {
    card: /^Patricia Rollins$/,
    heading: "Patricia Rollins",
    role: "Daughter of Mildred Adams",
  },
];

// Cover for the Harvey Adams Sr. second-marriage expansion: the six new Person
// Profile pages (Mary Jane Johnson, Mildred Adams, Christine Adams, Tammy,
// Punchy, Patricia Rollins) render the full template with recorded-only facts,
// Harvey's profile lists Mary Jane Johnson as his second wife with Mildred and
// Christine as their children, and the Family Tree and Heritage Branch View show
// the second-marriage connections. The first-marriage branch is protected by the
// characterization suite; this file covers the intentionally-added behavior.
describe("Harvey Adams Sr. second-marriage cover", () => {
  it("shows the second-marriage connections in the Family Tree: Mary Jane as second wife, Mildred and Christine as children, and Mildred's daughters below", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    const section = secondMarriageSection();
    // Harvey and Mary Jane Johnson render as the second-marriage couple. The
    // fold row ("Harvey Adams Sr. 6") also lives inside this region, so the
    // Harvey card is anchored to the exact name.
    expect(
      within(section).getByRole("button", { name: /^Harvey Adams Sr\.$/ }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", {
        name: /^Mary Jane Johnson$/,
      }),
    ).toBeInTheDocument();

    // Mildred and Christine render as the children of that marriage.
    expect(
      within(section).getByRole("button", { name: /^Mildred Adams$/ }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", {
        name: /^Christine Adams$/,
      }),
    ).toBeInTheDocument();

    // Tammy, Punchy, and Patricia Rollins render as Mildred's daughters.
    for (const name of [/^Tammy$/, /^Punchy$/, /^Patricia Rollins$/]) {
      expect(
        within(section).getByRole("button", { name: name }),
      ).toBeInTheDocument();
    }
  });

  it("opens each new second-marriage profile from its Family Tree card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    for (const { card, heading, role } of NEW_PROFILES) {
      await user.click(
        within(secondMarriageSection()).getByRole("button", { name: card }),
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      expect(screen.getByText(role)).toBeInTheDocument();

      // The full Person Profile template renders all sections, with the story
      // labeled "Her Story" for each of the six new profiles.
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

      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("shows Mary Jane Johnson's recorded facts: second wife of Harvey, mother of Mildred and Christine", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    await user.click(
      within(secondMarriageSection()).getByRole("button", {
        name: /^Mary Jane Johnson$/,
      }),
    );

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

    // The Family section names Harvey as her husband with Mildred and Christine
    // as the children of the marriage.
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
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    await user.click(
      within(secondMarriageSection()).getByRole("button", {
        name: /^Mildred Adams$/,
      }),
    );

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

    // The Family section records her three daughters without inventing a spouse.
    const family = screen.getByRole("region", { name: "Family" });
    expect(family).toHaveTextContent(
      "Mildred Adams had three daughters — Tammy, Punchy, and Patricia Rollins.",
    );
  });

  it("records each remaining new profile's parent facts without inventing details", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    // Christine Adams is a daughter of Harvey and Mary Jane.
    await user.click(
      within(secondMarriageSection()).getByRole("button", {
        name: /^Christine Adams$/,
      }),
    );
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
    for (const card of [/^Tammy$/, /^Punchy$/, /^Patricia Rollins$/]) {
      await user.click(
        within(secondMarriageSection()).getByRole("button", { name: card }),
      );
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
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    for (const { card } of NEW_PROFILES) {
      await user.click(
        within(secondMarriageSection()).getByRole("button", { name: card }),
      );

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
    await openFamilyTree(user);
    await expandHarveySecondBranch(user);

    for (const { card } of NEW_PROFILES) {
      await user.click(
        within(secondMarriageSection()).getByRole("button", { name: card }),
      );

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
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    // Harvey's card in the maternal line opens his profile.
    await user.click(
      within(
        screen.getByRole("region", { name: "Versie's maternal line" }),
      ).getByRole("button", { name: /Harvey Adams Sr\./ }),
    );

    const family = screen.getByRole("region", { name: "Family" });
    // Mary Jane Johnson renders as the second-wife spouse card.
    expect(within(family).getByText("Mary Jane Johnson")).toBeInTheDocument();
    expect(within(family).getByText("Second Wife")).toBeInTheDocument();
    // The second-wife card lists Mildred and Christine as the children of that
    // marriage (distinct from the first-wife card's 14 children).
    expect(family).toHaveTextContent(
      "Children: Mildred Adams, Christine Adams",
    );
  });

  it("shows the second-marriage connections in the Heritage Branch under the Harvey anchor", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Navigate to the Harvey anchor.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    expect(screen.getByText(/Anchor: Harvey Adams Sr\./)).toBeInTheDocument();
    // Mary Jane Johnson renders as Harvey's second wife.
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson, Second Wife/ }),
    ).toBeInTheDocument();
    // Mildred and Christine render as children of the second marriage.
    expect(
      screen.getByRole("button", { name: /Mildred Adams, Daughter/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Christine Adams, Daughter/ }),
    ).toBeInTheDocument();

    // Anchor on Mildred to reveal her daughters.
    await user.click(
      screen.getByRole("button", { name: /Mildred Adams, Daughter/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    expect(screen.getByText(/Anchor: Mildred Adams/)).toBeInTheDocument();
    // Harvey and Mary Jane render as Mildred's parents above her.
    expect(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Jane Johnson, Second Wife/ }),
    ).toBeInTheDocument();
    // Tammy, Punchy, and Patricia Rollins render as Mildred's daughters below.
    for (const name of [
      /Tammy, Daughter/,
      /Punchy, Daughter/,
      /Patricia Rollins, Daughter/,
    ]) {
      expect(screen.getByRole("button", { name: name })).toBeInTheDocument();
    }
  });

  it("opens a new second-marriage profile from the Heritage Branch via Open Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Navigate to the Harvey anchor.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Open Mildred Adams' profile from her Heritage Branch card.
    await user.click(
      screen.getByRole("button", { name: /Mildred Adams, Daughter/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Mildred Adams",
    );
  });
});
