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

// The Lula Mae & Versie branch defaults to collapsed; expand it so its Family
// Unit cluster renders.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}

const SEVEN_CHILDREN: { name: string; storyLabel: string }[] = [
  { name: "Lorenzo Smith Sr.", storyLabel: "His Story" },
  { name: "Versie Smith Jr.", storyLabel: "His Story" },
  { name: "Herbert Smith", storyLabel: "His Story" },
  { name: "Alonzo Smith", storyLabel: "His Story" },
  { name: "Sherri Smith", storyLabel: "Her Story" },
  { name: "Beatrice Smith", storyLabel: "Her Story" },
  { name: "Ed Smith", storyLabel: "His Story" },
];

// The Family Unit child cards select on click (openOnSelect={false}) and reveal
// an explicit 'Open Profile' button; the profile opens through that button
// rather than navigating straight from the card click.
async function openChildProfile(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const section = screen.getByRole("region", { name: "Lula Mae and Versie" });
  await user.click(within(section).getByRole("button", { name }));
  await user.click(
    within(section).getByRole("button", { name: "Open Profile" }),
  );
}

// Characterization baseline for the seven Lula Mae + Versie child profiles. The
// intended change will give each child a real 'Relation to You' value and switch
// their profile portrait from the placeholder SVG to an initials avatar. Those
// two behaviors are intentionally changing and are NOT frozen here. These tests
// protect the adjacent working behavior that must survive: each child profile
// still opens from its Family Unit card (via the reveal's Open Profile button)
// and still renders the full Person Profile template with only the recorded
// facts (parents, siblings, evidence status) and no invented details.
describe("Lula Mae + Versie child profiles characterization: recorded facts and full template stay intact", () => {
  it("opens each child profile from its Family Unit card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    for (const { name, storyLabel } of SEVEN_CHILDREN) {
      await openChildProfile(user, name);

      // The profile page opens with the child's name as the heading.
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name);

      // The full Person Profile template renders all sections.
      for (const sectionName of [
        storyLabel,
        "Family",
        "Timeline",
        "Sources",
        "Photos",
      ]) {
        expect(
          screen.getByRole("region", { name: sectionName }),
        ).toBeInTheDocument();
      }

      // Return to the Family Tree for the next child.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      const fold = screen.getByRole("button", {
        name: /^Lula Mae & Versie \d+$/,
      });
      if (fold.getAttribute("aria-expanded") === "false") {
        await user.click(fold);
      }
    }
  });

  it("shows each child's recorded facts: parents Lula Mae and Versie, and evidence status Family history", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    for (const { name } of SEVEN_CHILDREN) {
      await openChildProfile(user, name);

      const dl = container.querySelector("dl");
      expect(dl).not.toBeNull();
      expect(
        within(dl as HTMLElement).getByText("Parents"),
      ).toBeInTheDocument();
      expect(
        within(dl as HTMLElement).getByText(
          "Lula Mae Norwood and Versie Smith",
        ),
      ).toBeInTheDocument();
      expect(
        within(dl as HTMLElement).getByText("Evidence status"),
      ).toBeInTheDocument();
      expect(
        within(dl as HTMLElement).getByText("Family history"),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      const fold = screen.getByRole("button", {
        name: /^Lula Mae & Versie \d+$/,
      });
      if (fold.getAttribute("aria-expanded") === "false") {
        await user.click(fold);
      }
    }
  });

  it("keeps each child's sources labeled as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    for (const { name } of SEVEN_CHILDREN) {
      await openChildProfile(user, name);

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
      const fold = screen.getByRole("button", {
        name: /^Lula Mae & Versie \d+$/,
      });
      if (fold.getAttribute("aria-expanded") === "false") {
        await user.click(fold);
      }
    }
  });
});
