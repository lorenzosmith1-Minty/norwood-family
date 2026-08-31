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

function lulaVersieCouple() {
  return screen.getByRole("region", { name: "Lula Mae and Versie" });
}

// Characterization baseline for the Gertrude Adams-Hill / Harvey Adams Sr.
// change. The request will add Gertrude Adams-Hill as Versie Smith's mother and
// Harvey Adams Sr. as Gertrude's father, with new cards in the Family Tree and
// Heritage Branch View and two new profile pages. This protects the adjacent
// working behavior that must remain unchanged: Versie Smith's existing profile
// keeps rendering the full template with his mother Gertrude Adams-Hill recorded
// as a fact, the Lula Mae and Versie couple stays intact in the Family Tree, and
// Versie's card still opens his profile from both the Family Tree and the
// Heritage Branch View. The new Gertrude/Harvey cards and profiles are
// intentionally changing, so their absence is NOT asserted here.
describe("Versie Smith characterization: existing profile and couple stay intact", () => {
  it("loads the app on the default route without a blank screen", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );
  });

  it("keeps the Lula Mae and Versie couple in the Family Tree with Versie's card opening his profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const couple = lulaVersieCouple();
    expect(
      within(couple).getByRole("button", { name: /Lula Mae/ }),
    ).toBeInTheDocument();
    expect(
      within(couple).getByRole("button", { name: /Versie Smith/ }),
    ).toBeInTheDocument();

    await user.click(
      within(couple).getByRole("button", { name: /Versie Smith/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
    expect(screen.getByText("Husband of Lula Mae Norwood")).toBeInTheDocument();
  });

  it("keeps Versie's profile recording his mother Gertrude Adams-Hill as a fact", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(
      within(lulaVersieCouple()).getByRole("button", { name: /Versie Smith/ }),
    );

    // The header facts still list his mother Gertrude Adams-Hill.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Mother")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Gertrude Adams-Hill"),
    ).toBeInTheDocument();

    // The full Person Profile template renders all sections.
    for (const section of [
      "His Story",
      "Family",
      "Timeline",
      "Sources",
      "Photos",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }
  });

  it("keeps Versie's profile listing his mother in the Family narrative", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(lulaVersieCouple()).getByRole("button", { name: /Versie Smith/ }),
    );

    const family = screen.getByRole("region", { name: "Family" });
    expect(family).toHaveTextContent("Gertrude Adams-Hill");
    expect(within(family).getByText("Lula Mae Norwood")).toBeInTheDocument();
  });

  it("keeps Versie's profile opening from the Heritage Branch View via Open Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Anchor the tree on Clayton to reveal Lula Mae as one of his children.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Anchor on Lula Mae to reveal Versie as her spouse beside her.
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Versie renders as Lula Mae's spouse and opens his profile.
    expect(screen.getByText(/Anchor: Lula Mae/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
  });
});
