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

const SEVEN_CHILDREN: { name: string; storyLabel: string }[] = [
  { name: "Lorenzo Smith Sr.", storyLabel: "His Story" },
  { name: "Versie Smith Jr.", storyLabel: "His Story" },
  { name: "Herbert Smith", storyLabel: "His Story" },
  { name: "Alonzo Smith", storyLabel: "His Story" },
  { name: "Sherri Smith", storyLabel: "Her Story" },
  { name: "Beatrice Smith", storyLabel: "Her Story" },
  { name: "Ed Smith", storyLabel: "His Story" },
];

// Characterization baseline for the seven Lula Mae + Versie child profiles. The
// request intentionally replaced the classic Family Tree with the focused
// Explore Family navigator, so the old Family Unit cluster DOM is not asserted.
// These tests protect the adjacent working behavior that must survive: each
// child profile still opens from its relative card and still renders the full
// Person Profile template with only the recorded facts (parents, evidence
// status) and no invented details.
describe("Lula Mae + Versie child profiles characterization: recorded facts and full template stay intact", () => {
  it("opens each child profile from its relative card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    for (const { name, storyLabel } of SEVEN_CHILDREN) {
      // Tap the child card to recenter, then open their profile.
      await tapRelative(user, new RegExp(`${name} Child`));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

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

      // Back to Explore Family (focused on the child), then recenter on Lula
      // Mae via her Mother card for the next child.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      await tapRelative(user, /Lula Mae Norwood Mother/);
    }
  });

  it("shows each child's recorded facts: parents Lula Mae and Versie, and evidence status Family history", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    for (const { name } of SEVEN_CHILDREN) {
      await tapRelative(user, new RegExp(`${name} Child`));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

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
      await tapRelative(user, /Lula Mae Norwood Mother/);
    }
  });

  it("keeps each child's sources labeled as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    for (const { name } of SEVEN_CHILDREN) {
      await tapRelative(user, new RegExp(`${name} Child`));
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
      await tapRelative(user, /Lula Mae Norwood Mother/);
    }
  });
});
