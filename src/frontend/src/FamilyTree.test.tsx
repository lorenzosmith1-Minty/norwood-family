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

// The Explore Family view is a focused navigator. Julia "Julie" Norwood is the
// default anchor (no person is marked "Me"), and tapping a relative recenters
// the view on that person. This file characterizes the new focused navigator
// and the profile pages it opens, replacing the old full-tree layout tests.
describe("Explore Family screen", () => {
  it("navigates from Home to Explore Family when 'Explore the Family' is tapped", async () => {
    const user = userEvent.setup();
    renderApp();

    // Home is shown first.
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toHaveAttribute("src", "/assets/norwood-logo.png");

    await openExploreFamily(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
  });

  it("defaults the focus to Julia 'Julie' Norwood with no 'Me' badge", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia is the default focus card.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
    // No person is marked "Me", so no "This is me" badge is shown.
    expect(screen.queryByText("This is me")).not.toBeInTheDocument();
  });

  it("shows Julia's closest relatives grouped into labeled zones", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia's spouse (Isaiah) and children render as relative cards.
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Spouse/ }),
    ).toBeInTheDocument();
    for (const child of [
      "Clayton Norwood Child",
      "isaiah-jr Child",
      "edward Child",
      "hattie Child",
      "pinkie Child",
      "louise Child",
      "lillie Child",
      "lula-e Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("recenters the view when a relative card is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Tap Clayton (a child of Julia). The view recenters on Clayton.
    await tapRelative(user, /Clayton Norwood Child/);
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();

    // Clayton's parents (Julia and Isaiah) now render as Father/Mother zones.
    expect(
      screen.getByRole("button", { name: /Julia “Julie” Norwood Mother/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Isaiah Norwood Father/ }),
    ).toBeInTheDocument();
  });

  it("shows Clayton's two spouses and his children when focused", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await tapRelative(user, /Clayton Norwood Child/);

    // Clayton's spouses render in the Spouse zone.
    expect(
      screen.getByRole("button", { name: /Ms\. Hudson Spouse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Erma T\. Williams Spouse/ }),
    ).toBeInTheDocument();

    // Clayton's children render in the Children zone.
    for (const child of [
      "Elbert Norwood Child",
      "Wellman Norwood Child",
      "Wetherby Norwood Child",
      "Columbus Norwood Child",
      "Thomas Clayton “Tip / TC” Norwood Child",
      "Alton Norwood Child",
      "Robert Davis “RD” Norwood Child",
      "Ardeanus Norwood Child",
      "Willie B. Norwood Child",
      "James Norwood Child",
      "Freddie Norwood Child",
      "Zelia Mae Norwood Child",
      "Lula Mae Norwood Child",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("opens Julia 'Julie' Norwood's Person Profile via View Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
    expect(
      screen.queryByRole("heading", { level: 1, name: "Explore Family" }),
    ).not.toBeInTheDocument();
  });

  it("shows the profile header facts for Julia", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
    expect(screen.getByText("Matriarch")).toBeInTheDocument();

    // The header facts are rendered as a definition list.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("approx. 1860"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("June 19, 1936"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Isaiah Norwood"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("opens Isaiah Norwood's Person Profile from the Explore Family navigator", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Isaiah Norwood Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Isaiah Norwood",
    );
  });

  it("shows the profile header facts for Isaiah", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Isaiah Norwood Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Isaiah Norwood",
    );
    expect(screen.getByText("Patriarch")).toBeInTheDocument();

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("1858")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("shows the four profile sections for Isaiah as populated", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Isaiah Norwood Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    expect(screen.queryByText("Not yet populated")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "Isaiah Norwood was the patriarch",
    );
    expect(screen.getByRole("region", { name: "Timeline" })).toHaveTextContent(
      "Born",
    );
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(
      "1880 U.S. Census",
    );
  });

  it("returns to Explore Family when the profile Back button is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );

    await user.click(
      screen.getByRole("button", { name: /Back to Family Tree/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
  });

  it("opens Clayton Norwood's Person Profile from the Explore Family navigator", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );
  });

  it("shows the profile header facts for Clayton", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Clayton Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("approx. 1883"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(
        "Julia “Julie” Norwood and Isaiah Norwood",
      ),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("shows the four profile sections for Clayton as populated", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    expect(screen.queryByText("Not yet populated")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "1920 census",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Ms. Hudson",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Erma T. Williams",
    );
    expect(screen.getByRole("region", { name: "Timeline" })).toHaveTextContent(
      "Born",
    );
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(
      "1920 U.S. Census",
    );
  });

  it("shows the four profile sections: Her Story, Family, Timeline, and Sources", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    for (const section of ["Her Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("renders the Timeline as an ordered list of card-styled entries with date/title/detail structure", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const list = timeline.querySelector("ol");
    expect(list).not.toBeNull();

    const entries = Array.from(timeline.querySelectorAll("ol > li"));
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.className).toContain("bg-card");
      expect(entry.className).toContain("border");
      expect(entry.className).toContain("rounded-2xl");
      expect(entry.querySelector("p")).not.toBeNull();
      expect(entry.querySelectorAll("p").length).toBeGreaterThanOrEqual(2);
    }

    expect(container.querySelector(".paper-grain")).not.toBeNull();
  });

  it("shows the four requested Timeline entries in order on Julia's profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const entries = Array.from(timeline.querySelectorAll("ol > li"));

    expect(entries).toHaveLength(4);

    const expected = [
      { date: "c. 1860", title: "Born" },
      { date: "1880", title: "Appears in the census" },
      { date: "After Isaiah’s death", title: "Raises her children" },
      { date: "June 19, 1936", title: "Died" },
    ];

    expected.forEach(({ date, title }, index) => {
      const entry = entries[index];
      expect(within(entry as HTMLElement).getByText(date)).toBeInTheDocument();
      expect(within(entry as HTMLElement).getByText(title)).toBeInTheDocument();
    });
  });

  it("keeps the Sources section present with the shared warm card styling", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const sources = screen.getByRole("region", { name: "Sources" });
    const card = sources.querySelector(".rounded-2xl");
    expect(card).not.toBeNull();
    expect(card?.className).toContain("bg-card");
    expect(card?.className).toContain("border");
  });

  it("shows the three requested source cards on Julia's profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const sources = screen.getByRole("region", { name: "Sources" });
    const cards = Array.from(sources.querySelectorAll(".rounded-2xl")).filter(
      (el) => el.querySelector("p"),
    );

    expect(cards).toHaveLength(3);
    for (const title of [
      "1880 U.S. Census",
      "Family Research Notes",
      "Death Information",
    ]) {
      expect(within(sources).getByText(title)).toBeInTheDocument();
    }
  });

  it("distinguishes documented records from family-history notes with kind-driven badges", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const sources = screen.getByRole("region", { name: "Sources" });

    const censusCard = sources.querySelector(".rounded-2xl") as HTMLElement;
    expect(
      within(censusCard).getByText("Documented record"),
    ).toBeInTheDocument();

    const notesCard = Array.from(sources.querySelectorAll(".rounded-2xl")).find(
      (el) => within(el as HTMLElement).queryByText("Family Research Notes"),
    );
    expect(notesCard).toBeDefined();
    expect(
      within(notesCard as HTMLElement).getByText("Family-history note"),
    ).toBeInTheDocument();

    const documentedBadges = within(sources).getAllByText("Documented record");
    expect(documentedBadges).toHaveLength(2);
  });

  it("keeps the non-Timeline profile sections and header facts intact", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await user.click(screen.getByRole("button", { name: "View Profile" }));

    for (const section of ["Her Story", "Family", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(screen.getByText("Matriarch")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("approx. 1860"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("June 19, 1936"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Isaiah Norwood"),
    ).toBeInTheDocument();
  });

  it("opens Erma T. Williams' Person Profile from the Explore Family navigator", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Erma T\. Williams Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Erma T. Williams",
    );
  });

  it("shows the profile header facts for Erma T. Williams", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Erma T\. Williams Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Erma T. Williams",
    );
    expect(screen.getByText("Wife of Clayton Norwood")).toBeInTheDocument();

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(
      within(dl as HTMLElement).getByText("Birth year"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Uncertain (c. 1885 or 1897)"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Clayton Norwood"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Evidence status"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mixed")).toBeInTheDocument();
  });

  it("labels Erma's story section 'Her Story'", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Erma T\. Williams Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(
      screen.getByRole("region", { name: "Her Story" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Her Story" })).toHaveTextContent(
      "1920 census",
    );
  });

  it("shows the four profile sections for Erma as populated", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Erma T\. Williams Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    for (const section of ["Her Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    expect(screen.queryByText("Not yet populated")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Clayton Norwood",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Lula Mae",
    );
    expect(screen.getByRole("region", { name: "Timeline" })).toHaveTextContent(
      "Birth year uncertain",
    );
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(
      "1920 U.S. Census",
    );
  });

  it("renders the unresolved-conflict badge on Erma's profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Erma T\. Williams Spouse/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const sources = screen.getByRole("region", { name: "Sources" });

    expect(within(sources).getAllByText("Documented record")).toHaveLength(2);
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();

    const conflictCard = Array.from(
      sources.querySelectorAll(".rounded-2xl"),
    ).find((el) =>
      within(el as HTMLElement).queryByText("Birth year conflict"),
    );
    expect(conflictCard).toBeDefined();
    expect(
      within(conflictCard as HTMLElement).getByText("Unresolved conflict"),
    ).toBeInTheDocument();
  });
});
