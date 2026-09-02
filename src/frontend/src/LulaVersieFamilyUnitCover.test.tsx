import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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

const SEVEN_CHILDREN = [
  "Lorenzo Smith Sr.",
  "Versie Smith Jr.",
  "Herbert Smith",
  "Alonzo Smith",
  "Sherri Smith",
  "Beatrice Smith",
  "Ed Smith",
];

// Cover for the Lula Mae + Versie family unit and the seven child profiles. The
// request intentionally replaced the classic Family Tree with the focused
// Explore Family navigator, so the old Family Unit cluster DOM is not asserted.
// These tests protect the accepted behavior that survives: focusing on Lula Mae
// shows Versie as her spouse and all seven children as relative cards, and each
// child's card opens that child's profile page.
describe("Lula Mae + Versie Family Unit cover: compact cluster and seven child profiles", () => {
  it("shows the couple and all seven child cards when focused on Lula Mae", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    // Lula Mae is the focus; Versie renders as her spouse.
    expect(screen.getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith Spouse/ }),
    ).toBeInTheDocument();

    // All seven children render as relative cards.
    for (const name of SEVEN_CHILDREN) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${name} Child`) }),
      ).toBeInTheDocument();
    }
  });

  it("opens each child's profile page via View Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    for (const name of SEVEN_CHILDREN) {
      // Tap the child card to recenter on them, then open their profile.
      await tapRelative(user, new RegExp(`${name} Child`));
      await user.click(screen.getByRole("button", { name: "View Profile" }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name);

      // Back to Explore Family (now focused on the child), then recenter on
      // Lula Mae via her Mother card for the next child.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      await tapRelative(user, /Lula Mae Norwood Mother/);
    }
  });

  it("renders each child card with its relationship label and recenters on tap", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);

    // The first child card carries the "Child" relationship label.
    const child = screen.getByRole("button", {
      name: /Lorenzo Smith Sr\. Child/,
    });
    expect(child).toBeInTheDocument();

    // Tapping it recenters the view on that child.
    await user.click(child);
    expect(screen.getByText("Lorenzo Smith Sr.")).toBeInTheDocument();
  });
});
