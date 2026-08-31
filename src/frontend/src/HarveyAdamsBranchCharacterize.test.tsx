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

function maternalLine() {
  return screen.getByRole("region", { name: "Versie's maternal line" });
}

// The Lula Mae & Versie branch defaults to collapsed; expand it so the maternal
// line (and its cards) render.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
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
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Norwood Family\s*Connection/,
    );
  });

  it("keeps Harvey and Gertrude as Versie's maternal line in the Family Tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    const line = maternalLine();
    expect(
      within(line).getByRole("button", { name: /Harvey Adams Sr\./ }),
    ).toBeInTheDocument();
    // Gertrude appears twice in the maternal line: once as a first-marriage
    // child card and once as Versie's Mother card. The Mother card carries her
    // years ("1913–"), so it is disambiguated by years; the child card has no
    // years.
    expect(
      within(line).getByRole("button", { name: /Gertrude Adams-Hill 1913/ }),
    ).toBeInTheDocument();
    expect(
      within(line).getByRole("button", { name: /^Gertrude Adams-Hill$/ }),
    ).toBeInTheDocument();
  });

  it("opens Harvey's profile from his Family Tree card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(maternalLine()).getByRole("button", { name: /Harvey Adams Sr\./ }),
    );

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
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(maternalLine()).getByRole("button", { name: /Harvey Adams Sr\./ }),
    );

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
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(maternalLine()).getByRole("button", { name: /Harvey Adams Sr\./ }),
    );

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Mary Louise Sims")).toBeInTheDocument();
    expect(within(family).getByText("First Wife")).toBeInTheDocument();
    expect(within(family).getByText("Mary Jane Johnson")).toBeInTheDocument();
    expect(within(family).getByText("Second Wife")).toBeInTheDocument();
  });

  it("keeps Harvey opening from the Heritage Branch as Gertrude's father", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Anchor on Clayton to reveal Lula Mae as one of his children.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Anchor on Lula Mae to reveal Versie as her spouse.
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Anchor on Versie to reveal Gertrude as his parent.
    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Anchor on Gertrude to reveal Harvey as her parent.
    await user.click(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    expect(screen.getByText(/Anchor: Gertrude Adams-Hill/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Harvey Adams Sr.",
    );
  });

  it("keeps Gertrude's profile rendering unchanged", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(maternalLine()).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    );

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
