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

// The Clayton branch defaults to collapsed; expand it so its cards render.
async function expandClaytonBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Clayton \d+$/ }));
}

// Cover for the three new Erma T. Williams child profiles (Ardeanus, Willie B.,
// James). Each opens from its Family Tree card and its Heritage Branch card,
// renders the full Person Profile template with recorded-only facts, an
// initials-based portrait, and a timeline containing only recorded dates.
describe("Family Tree cover: three new Erma T. Williams child profiles", () => {
  it("opens Ardeanus's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Ardeanus/ }),
    );

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
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Ardeanus/ }),
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
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Willie B\./ }),
    );

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
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Willie B\./ }),
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
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /James/ }),
    );

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
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /James/ }),
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
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    for (const cardName of [/Ardeanus/, /Willie B\./, /James/]) {
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

  it("shows only recorded dates in each new profile's timeline", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    // Ardeanus: only his recorded birth date appears.
    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Ardeanus/ }),
    );
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

    // Willie B.: his recorded birth and death dates appear.
    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Willie B\./ }),
    );
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

    // James: no dates are recorded, so his timeline is empty.
    await user.click(
      within(claytonBranch()).getByRole("button", { name: /James/ }),
    );
    const jamesTimeline = screen.getByRole("region", { name: "Timeline" });
    expect(within(jamesTimeline).queryByRole("list")).not.toBeInTheDocument();
    expect(
      within(jamesTimeline).getByText("Not yet populated"),
    ).toBeInTheDocument();
  });

  it("labels each new profile's sources as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    for (const cardName of [/Ardeanus/, /Willie B\./, /James/]) {
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
});

describe("Heritage Branch cover: three new Erma child profiles open via Open Profile", () => {
  async function openBranchFromHome(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );
  }

  it("opens each new profile from its Heritage Branch card via Open Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    const cases: { card: RegExp; heading: string }[] = [
      { card: /Ardeanus, Child/, heading: "Ardeanus Norwood" },
      { card: /Willie B\., Child/, heading: "Willie B. Norwood" },
      { card: /James, Child/, heading: "James Norwood" },
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
