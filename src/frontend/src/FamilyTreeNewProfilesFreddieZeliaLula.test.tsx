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

function claytonBranch() {
  return screen.getByRole("region", { name: "Clayton's branch" });
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

// Cover for the three new Erma T. Williams child profiles (Freddie, Zelia Mae,
// Lula Mae). Each opens from its Family Tree card, renders the full Person
// Profile template (Header, Story, Family, Timeline, Sources, Photos,
// Completeness) with an initials placeholder portrait, shows only recorded
// facts, labels family-history notes separately from documented details, and
// keeps the timeline to recorded events only.
describe("Family Tree cover: Freddie, Zelia Mae, and Lula Mae profiles", () => {
  it("opens Freddie's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Freddie/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Freddie Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of [
      "His Story",
      "Family",
      "Timeline",
      "Sources",
      "Photos",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
    expect(
      document.querySelector('[data-ocid="profile.completeness"]'),
    ).not.toBeNull();
  });

  it("shows Freddie's recorded facts: son of Clayton and Erma, Mississippi, 1938-1985, Ebenezer Cemetery, daughter Felecia Anita Beasly", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Freddie/ }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Clayton Norwood and Erma T. Williams",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("1938")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("1985")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Buried")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Ebenezer Cemetery"),
    ).toBeInTheDocument();

    // The story records his daughter Felecia Anita Beasly.
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "Felecia Anita Beasly",
    );
  });

  it("opens Zelia Mae's profile from her card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Zelia Mae/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Zelia Mae Norwood",
    );
    expect(screen.getByText("Daughter")).toBeInTheDocument();

    for (const section of [
      "His Story",
      "Family",
      "Timeline",
      "Sources",
      "Photos",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
    expect(
      document.querySelector('[data-ocid="profile.completeness"]'),
    ).not.toBeNull();
  });

  it("shows Zelia Mae's recorded facts: daughter of Clayton and Erma, Mississippi, married twice, no children, Prent Sims and Carter", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Zelia Mae/ }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Clayton Norwood and Erma T. Williams",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Married")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Twice")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Children")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("None")).toBeInTheDocument();

    // The Family section lists both husbands.
    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Prent Sims")).toBeInTheDocument();
    expect(within(family).getByText("First Husband")).toBeInTheDocument();
    expect(within(family).getByText("Carter")).toBeInTheDocument();
    expect(within(family).getByText("Second Husband")).toBeInTheDocument();
  });

  it("labels Prent Sims' June 11, 1914 - April 11, 1970 dates as his lifespan, not a marriage date", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Zelia Mae/ }),
    );

    // The story explicitly distinguishes Prent Sims' dates as his lifespan.
    const story = screen.getByRole("region", { name: "His Story" });
    expect(story).toHaveTextContent("June 11, 1914");
    expect(story).toHaveTextContent("April 11, 1970");
    expect(story).toHaveTextContent("his lifespan, not a marriage date");

    // The Family section repeats the same distinction.
    const family = screen.getByRole("region", { name: "Family" });
    expect(family).toHaveTextContent("his lifespan, not a marriage date");

    // The timeline entry for the first marriage also labels the dates as his
    // lifespan rather than a marriage date.
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline).toHaveTextContent("Marries Prent Sims");
    expect(timeline).toHaveTextContent("his lifespan, not a marriage date");
  });

  it("opens Lula Mae's profile from her card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Lula Mae/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );
    expect(screen.getByText("Daughter")).toBeInTheDocument();

    for (const section of [
      "His Story",
      "Family",
      "Timeline",
      "Sources",
      "Photos",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
    expect(
      document.querySelector('[data-ocid="profile.completeness"]'),
    ).not.toBeNull();
  });

  it("shows Lula Mae's recorded facts: daughter of Clayton and Erma, New York / New Jersey, married Versie Smith, both from Mississippi", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Lula Mae/ }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Clayton Norwood and Erma T. Williams",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("New York / New Jersey"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Versie Smith"),
    ).toBeInTheDocument();

    // The story records that both were from Mississippi.
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "both were from Mississippi",
    );
  });

  it("renders an initials placeholder portrait for each new profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    for (const cardName of [/Freddie/, /Zelia Mae/, /Lula Mae/]) {
      await user.click(
        within(claytonBranch()).getByRole("button", { name: cardName }),
      );

      // No photograph exists, so the profile header renders the shared
      // initials placeholder portrait image.
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

    for (const cardName of [/Freddie/, /Zelia Mae/, /Lula Mae/]) {
      await user.click(
        within(claytonBranch()).getByRole("button", { name: cardName }),
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

  it("shows only recorded events in each new profile's timeline", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Freddie: only his recorded birth, death, and burial events appear.
    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Freddie/ }),
    );
    const freddieTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(within(freddieTimeline).getByText("1938")).toBeInTheDocument();
    // 1985 appears twice: once for the death event and once for the burial.
    expect(within(freddieTimeline).getAllByText("1985")).toHaveLength(2);
    expect(
      within(freddieTimeline).getByText("Buried at Ebenezer Cemetery"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );

    // Zelia Mae: only her two marriages and the no-children note appear; no
    // invented birth or death dates.
    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Zelia Mae/ }),
    );
    const zeliaTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(
      within(zeliaTimeline).getByText("Marries Prent Sims"),
    ).toBeInTheDocument();
    expect(
      within(zeliaTimeline).getByText("Marries Carter"),
    ).toBeInTheDocument();
    expect(within(zeliaTimeline).getByText("No children")).toBeInTheDocument();
    expect(within(zeliaTimeline).queryByText("Born")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );

    // Lula Mae: only her marriage to Versie Smith appears.
    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Lula Mae/ }),
    );
    const lulaTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(
      within(lulaTimeline).getByText("Marries Versie Smith"),
    ).toBeInTheDocument();
    expect(within(lulaTimeline).queryByText("Born")).not.toBeInTheDocument();
  });

  it("reflects recorded vs missing fields in the Completeness section for each new profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Each of the three profiles has birth/death facts, family relationships, a
    // story, a timeline, and a source, but no photo: 6 of 7 fields done.
    for (const cardName of [/Freddie/, /Zelia Mae/, /Lula Mae/]) {
      await user.click(
        within(claytonBranch()).getByRole("button", { name: cardName }),
      );

      const completeness = document.querySelector(
        '[data-ocid="profile.completeness"]',
      );
      expect(completeness).not.toBeNull();
      for (const label of [
        "Photo",
        "Birth information",
        "Death information",
        "Family relationships",
        "Story",
        "Timeline",
        "Sources",
      ]) {
        expect(
          within(completeness as HTMLElement).getByText(label),
        ).toBeInTheDocument();
      }
      expect(completenessPercent()).toBe("86%");

      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });
});

describe("Heritage Branch cover: Freddie, Zelia Mae, and Lula Mae open via Open Profile", () => {
  it("opens each new profile from its Heritage Branch card via Open Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    const cases: { card: RegExp; heading: string }[] = [
      { card: /Freddie, Child/, heading: "Freddie Norwood" },
      { card: /Zelia Mae, Child/, heading: "Zelia Mae Norwood" },
      { card: /Lula Mae, Child/, heading: "Lula Mae Norwood" },
    ];

    for (const { card, heading } of cases) {
      // Re-anchor the tree on Clayton to reveal his children, including Erma's.
      // The branch view remounts on the default Julia anchor after each back
      // navigation, so this must happen on every iteration.
      await user.click(
        screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
      );
      await user.click(
        screen.getByRole("button", { name: "Anchor Tree Here" }),
      );

      await user.click(screen.getByRole("button", { name: card }));
      await user.click(screen.getByRole("button", { name: "Open Profile" }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );

      // Back to the Heritage Branch for the next profile.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      await user.click(screen.getByRole("button", { name: "Heritage Branch" }));
    }
  });
});
