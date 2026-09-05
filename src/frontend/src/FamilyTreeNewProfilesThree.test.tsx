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

// Open Explore Family, recenter on Clayton, then open the given child's profile
// from his card.
async function openClaytonChildProfile(
  user: ReturnType<typeof userEvent.setup>,
  cardName: RegExp,
) {
  await openExploreFamily(user);
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(screen.getByRole("button", { name: cardName }));
  await user.click(screen.getByRole("button", { name: "View Profile" }));
}

// After returning from a child's profile, the view is focused on that child.
// Recenter on Clayton via his Father card for the next profile.
async function recenterOnClayton(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Father/ }),
  );
}

// Cover for the three new Erma T. Williams child profiles (Ardeanus, Willie B.,
// James). Each opens from its Explore Family card and its Heritage Branch node,
// renders the full Person Profile template with recorded-only facts, an
// initials-based portrait, and a timeline containing only recorded dates.
describe("Family Tree cover: three new Erma T. Williams child profiles", () => {
  it("opens Ardeanus's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openClaytonChildProfile(user, /Ardeanus Norwood Child/);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ardeanus Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows Ardeanus's recorded facts: son of Clayton and Erma, born Dec. 3, 1929, California", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openClaytonChildProfile(user, /Ardeanus Norwood Child/);

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Clayton Norwood and Erma T. Williams",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Dec. 3, 1929"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Not recorded"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("California"),
    ).toBeInTheDocument();
  });

  it("opens Willie B.'s profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openClaytonChildProfile(user, /Willie B\. Norwood Child/);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Willie B. Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows Willie B.'s recorded facts: son of Clayton and Erma, dates, Diamond Bar, U.S. Army Korea", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openClaytonChildProfile(user, /Willie B\. Norwood Child/);

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Clayton Norwood and Erma T. Williams",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("July 12, 1932"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("July 6, 1995"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Diamond Bar, California"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Military service"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("U.S. Army; Korea"),
    ).toBeInTheDocument();
  });

  it("opens James's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openClaytonChildProfile(user, /James Norwood Child/);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "James Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows James's recorded facts: son of Clayton and Erma, Chicago, with 'Not recorded' fallbacks", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openClaytonChildProfile(user, /James Norwood Child/);

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Clayton Norwood and Erma T. Williams",
      ),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Chicago")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Military service"),
    ).toBeInTheDocument();
    // James's unrecorded facts (Born, Died, Military service) each fall back to
    // "Not recorded".
    expect(within(dl as HTMLElement).getAllByText("Not recorded")).toHaveLength(
      3,
    );
  });

  it("renders an initials-based portrait for each new profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );

    for (const cardName of [
      /Ardeanus Norwood Child/,
      /Willie B\. Norwood Child/,
      /James Norwood Child/,
    ]) {
      await user.click(screen.getByRole("button", { name: cardName }));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

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
      await recenterOnClayton(user);
    }
  });

  it("shows only recorded dates in each new profile's timeline", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );

    // Ardeanus: only his recorded birth date appears.
    await user.click(
      screen.getByRole("button", { name: /Ardeanus Norwood Child/ }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    const ardeanusTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(
      within(ardeanusTimeline).getByText("Dec. 3, 1929"),
    ).toBeInTheDocument();
    expect(
      within(ardeanusTimeline).queryByText("Died"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    await recenterOnClayton(user);

    // Willie B.: his recorded birth and death dates appear.
    await user.click(
      screen.getByRole("button", { name: /Willie B\. Norwood Child/ }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    const willieTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(
      within(willieTimeline).getByText("July 12, 1932"),
    ).toBeInTheDocument();
    expect(
      within(willieTimeline).getByText("July 6, 1995"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );
    await recenterOnClayton(user);

    // James: no dates are recorded, so his timeline is empty.
    await user.click(
      screen.getByRole("button", { name: /James Norwood Child/ }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    const jamesTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(within(jamesTimeline).queryByRole("list")).not.toBeInTheDocument();
    expect(
      within(jamesTimeline).getByText("Not yet populated"),
    ).toBeInTheDocument();
  });

  it("labels each new profile's sources as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood Child/ }),
    );

    for (const cardName of [
      /Ardeanus Norwood Child/,
      /Willie B\. Norwood Child/,
      /James Norwood Child/,
    ]) {
      await user.click(screen.getByRole("button", { name: cardName }));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

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
      await recenterOnClayton(user);
    }
  });
});

describe("Heritage Branch cover: three new Erma child profiles open via Explore Family", () => {
  it("opens each new profile from Clayton's child cards, not as separate Heritage Branch nodes", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Heritage Branch" }));

    // The Heritage Branch is a compact overview: these individuals are not
    // rendered as separate nodes.
    expect(
      screen.queryByRole("button", { name: /Ardeanus Norwood, Son/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Willie B\. Norwood, Son/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /James Norwood, Son/ }),
    ).not.toBeInTheDocument();

    // They remain reachable through Explore Family from Clayton's child cards.
    const cases: { card: RegExp; heading: string }[] = [
      { card: /Ardeanus Norwood Child/, heading: "Ardeanus Norwood" },
      { card: /Willie B\. Norwood Child/, heading: "Willie B. Norwood" },
      { card: /James Norwood Child/, heading: "James Norwood" },
    ];

    for (const { card, heading } of cases) {
      // The header "Explore Family" button resets the focus to the default
      // anchor (Julia); recenter on Clayton, then open the child's profile.
      await user.click(
        screen.getByRole("button", { name: /^Explore Family$/ }),
      );
      await user.click(
        screen.getByRole("button", { name: /Clayton Norwood Child/ }),
      );
      await user.click(screen.getByRole("button", { name: card }));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );

      // Back to Explore Family, then to Clayton for the next child.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      await recenterOnClayton(user);
    }
  });
});
