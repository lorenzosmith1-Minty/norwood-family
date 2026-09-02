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

async function tap(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole("button", { name }));
}

// Navigate the Explore Family chain to focus on Versie Smith.
async function focusVersie(user: ReturnType<typeof userEvent.setup>) {
  await openExploreFamily(user);
  await tap(user, /Clayton Norwood Child/);
  await tap(user, /Lula Mae Norwood Child/);
  await tap(user, /Versie Smith Spouse/);
}

// Characterization baseline for the Harvey Adams Sr. first-marriage branch
// expansion. The request will add Mary Louise Sims as a first-wife profile and
// 14 recorded children under that marriage, and wire them into the Family Tree
// and Heritage Branch views. That intentionally changes Harvey's profile
// narrative (which currently states "no full children list") and the Heritage
// Branch children array. This file protects the adjacent working behavior that
// must remain unchanged: Harvey and Gertrude stay as Versie's maternal line in
// the Family Tree, Harvey's profile keeps rendering the full template with his
// occupation/livestock/married-twice facts and both wives as spouse cards, and
// Harvey still opens from the Heritage Branch as Gertrude's father. The
// intentionally-changing children-list narrative is NOT asserted here.
describe("Harvey Adams Sr. branch characterization: stable maternal-line behavior", () => {
  it("loads the app on the default route without a blank screen", () => {
    renderApp();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toHaveAttribute("src", "/assets/norwood-logo.png");
  });

  it("keeps Harvey and Gertrude as Versie's maternal ancestry", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusVersie(user);

    // Focusing on Versie shows Gertrude as his mother.
    expect(
      screen.getByRole("button", { name: /Gertrude Adams-Hill Mother/ }),
    ).toBeInTheDocument();

    // Focusing on Gertrude shows Harvey as her father.
    await tap(user, /Gertrude Adams-Hill Mother/);
    expect(
      screen.getByRole("button", { name: /Harvey Adams Sr\. Father/ }),
    ).toBeInTheDocument();
  });

  it("opens Harvey's profile from his card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusVersie(user);
    await tap(user, /Gertrude Adams-Hill Mother/);
    await tap(user, /Harvey Adams Sr\. Father/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Harvey Adams Sr.",
    );
    expect(
      screen.getByText("Father of Gertrude Adams-Hill"),
    ).toBeInTheDocument();

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

  it("keeps Harvey's occupation, livestock, and married-twice facts", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await focusVersie(user);
    await tap(user, /Gertrude Adams-Hill Mother/);
    await tap(user, /Harvey Adams Sr\. Father/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(
      within(dl as HTMLElement).getByText("Occupation"),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Farmer in Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Raised")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Livestock"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Married")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Twice")).toBeInTheDocument();
  });

  it("keeps both wives as spouse cards in Harvey's Family section", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusVersie(user);
    await tap(user, /Gertrude Adams-Hill Mother/);
    await tap(user, /Harvey Adams Sr\. Father/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Mary Louise Sims")).toBeInTheDocument();
    expect(within(family).getByText("First Wife")).toBeInTheDocument();
    expect(within(family).getByText("Mary Jane Johnson")).toBeInTheDocument();
    expect(within(family).getByText("Second Wife")).toBeInTheDocument();
  });

  it("keeps Harvey opening from the Heritage Branch as Gertrude's father", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Heritage Branch" }));

    // Harvey's node opens Explore Family centered on him, then his profile.
    await user.click(
      screen.getByRole("button", {
        name: /Harvey Adams Sr\., Father of Gertrude Adams-Hill/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Harvey Adams Sr.",
    );
  });

  it("keeps Gertrude's profile rendering unchanged", async () => {
    const user = userEvent.setup();
    renderApp();
    await focusVersie(user);
    await tap(user, /Gertrude Adams-Hill Mother/);
    await user.click(screen.getByRole("button", { name: "View Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gertrude Adams-Hill",
    );
    expect(
      screen.getByText("Daughter of Harvey Adams Sr."),
    ).toBeInTheDocument();
    for (const section of [
      "Her Story",
      "Family",
      "Timeline",
      "Sources",
      "Photos",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });
});
