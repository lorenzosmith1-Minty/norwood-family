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

// Cover for the intentionally-changed behavior: the four Erma T. Williams branch
// cards (Columbus, Thomas Clayton 'Tip / TC', Alton, Robert Davis 'RD') are now
// clickable and open their new Person Profile pages. Each profile renders the
// full template with the recorded facts only — no invented timeline events,
// biography details, or family facts — and its sources distinguish documented
// records from family-history notes.
describe("Family Tree cover: four new Erma T. Williams child profiles", () => {
  it("opens Columbus's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Columbus/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Columbus Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    // The full Person Profile template renders all four sections.
    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows Columbus's recorded facts: son of Clayton and Erma, Ogden Utah, no additional details", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Columbus/ }),
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
      within(dl as HTMLElement).getByText("Ogden, Utah"),
    ).toBeInTheDocument();

    // No additional details are invented: the story explicitly records that
    // nothing more is known, and the Family section is not populated.
    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "No additional details",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Not yet populated",
    );
  });

  it("opens Thomas Clayton 'Tip / TC''s profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", {
        name: /Thomas Clayton/,
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Thomas Clayton “Tip / TC” Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows Thomas Clayton's recorded facts: son of Clayton and Erma, Mississippi, daughters Vanessa and Denise, Vanessa in Texas", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", {
        name: /Thomas Clayton/,
      }),
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

    // The story records his daughters Vanessa and Denise, with Vanessa
    // associated with Texas — as a family-history note, not a documented record.
    const story = screen.getByRole("region", { name: "His Story" });
    expect(story).toHaveTextContent("Vanessa");
    expect(story).toHaveTextContent("Denise");
    expect(story).toHaveTextContent("Texas");
  });

  it("opens Alton's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Alton/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Alton Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows Alton's recorded facts: son of Clayton and Erma, Chicago, no additional details", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Alton/ }),
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
    expect(within(dl as HTMLElement).getByText("Chicago")).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "His Story" })).toHaveTextContent(
      "No additional details",
    );
    expect(screen.getByRole("region", { name: "Family" })).toHaveTextContent(
      "Not yet populated",
    );
  });

  it("opens Robert Davis 'RD''s profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Robert Davis/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Robert Davis “RD” Norwood",
    );
    expect(screen.getByText("Son")).toBeInTheDocument();

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("shows Robert Davis's recorded facts: son of Clayton and Erma, Aug. 22, 1927 – March 28, 1987, Los Angeles", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Robert Davis/ }),
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
      within(dl as HTMLElement).getByText("Aug. 22, 1927"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("March 28, 1987"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Los Angeles"),
    ).toBeInTheDocument();
  });

  it("labels each new profile's sources as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    for (const cardName of [
      /Columbus/,
      /Thomas Clayton/,
      /Alton/,
      /Robert Davis/,
    ]) {
      await user.click(
        within(claytonBranch()).getByRole("button", { name: cardName }),
      );

      const sources = screen.getByRole("region", { name: "Sources" });
      // Each of the four profiles carries only the family-history note, so the
      // source is labeled a family-history note and there is no documented badge.
      expect(
        within(sources).getByText("Family-history note"),
      ).toBeInTheDocument();
      expect(
        within(sources).queryByText("Documented record"),
      ).not.toBeInTheDocument();

      // Back to the tree for the next profile.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });
});
