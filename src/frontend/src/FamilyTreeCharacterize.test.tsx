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

// Navigate to Clayton (Julia -> Clayton) so his children render.
async function focusClayton(user: ReturnType<typeof userEvent.setup>) {
  await openExploreFamily(user);
  await tapRelative(user, /Clayton Norwood Child/);
}

// Characterization baseline for the Erma T. Williams branch. In the new Explore
// Family focused navigator, every documented child of Clayton renders as a
// clickable relative card that recenters the view, and View Profile opens their
// profile. This protects the adjacent working behavior that must remain
// unchanged: the Erma children (Ardeanus, Willie B., James, Freddie, Zelia Mae,
// Lula Mae) and the Ms. Hudson children (Elbert, Wellman) open their profiles,
// and the existing placeholder profiles keep rendering the full Person Profile
// template.
describe("Explore Family characterization: Clayton's children open their profiles", () => {
  it("opens the three Erma child profiles (Ardeanus, Willie B., James)", async () => {
    const cases: { card: RegExp; heading: string }[] = [
      { card: /Ardeanus Norwood Child/, heading: "Ardeanus Norwood" },
      { card: /Willie B\. Norwood Child/, heading: "Willie B. Norwood" },
      { card: /James Norwood Child/, heading: "James Norwood" },
    ];

    for (const { card, heading } of cases) {
      const user = userEvent.setup();
      renderApp();
      await focusClayton(user);
      await tapRelative(user, card);
      await user.click(screen.getByRole("button", { name: "View Profile" }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      cleanup();
    }
  });

  it("opens Freddie, Zelia Mae, and Lula Mae from their cards", async () => {
    const cases: { card: RegExp; heading: string }[] = [
      { card: /Freddie Norwood Child/, heading: "Freddie Norwood" },
      { card: /Zelia Mae Norwood Child/, heading: "Zelia Mae Norwood" },
      { card: /Lula Mae Norwood Child/, heading: "Lula Mae Norwood" },
    ];

    for (const { card, heading } of cases) {
      const user = userEvent.setup();
      renderApp();
      await focusClayton(user);
      await tapRelative(user, card);
      await user.click(screen.getByRole("button", { name: "View Profile" }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      cleanup();
    }
  });

  it("keeps the 'Son (died at birth)' card present as a non-profile relative", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusClayton(user);

    // The son who died at birth has no profile record, so it renders with its
    // raw id and no profile page. Tapping it recenters the view on a person
    // with no profile, which shows the empty state (no View Profile action).
    const son = screen.getByRole("button", {
      name: /clayton-son-died Child/,
    });
    await user.click(son);
    expect(
      screen.getByText("No family member found to explore."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View Profile" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the Ms. Hudson branch children clickable to open their profiles", async () => {
    const cases: { card: RegExp; heading: string }[] = [
      { card: /Elbert Norwood Child/, heading: "Elbert Norwood" },
      { card: /Wellman Norwood Child/, heading: "Wellman Norwood" },
    ];

    for (const { card, heading } of cases) {
      const user = userEvent.setup();
      renderApp();
      await focusClayton(user);
      await tapRelative(user, card);
      await user.click(screen.getByRole("button", { name: "View Profile" }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      cleanup();
    }
  });

  it("renders the full Person Profile template for an existing placeholder profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusClayton(user);
    await tapRelative(user, /Wellman Norwood Child/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Wellman Norwood",
    );

    for (const section of ["His Story", "Family", "Timeline", "Sources"]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    const dl = document.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Parents")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Clayton Norwood and Ms. Hudson"),
    ).toBeInTheDocument();
  });
});
