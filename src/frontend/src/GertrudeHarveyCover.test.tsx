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

function maternalFamily() {
  return screen.getByRole("region", { name: "Versie's maternal family" });
}

// The Versie's maternal family branch defaults to collapsed; expand it so the
// ancestor cards (Harvey, Gertrude, Versie) render.
async function expandVersieMaternalBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Versie's Maternal Family \d+$/ }),
  );
}

// Cover for the Gertrude Adams-Hill and Harvey Adams Sr. change. The request
// adds two new Person Profile pages (Gertrude Adams-Hill and Harvey Adams Sr.),
// Family Tree cards for both (Gertrude as Versie Smith's mother, Harvey as
// Gertrude's father) that open their profiles, and Heritage Branch entries with
// the same parent connections. Each profile renders the full template with an
// initials avatar (no photo exists), records only the stated facts, and labels
// family-history notes distinctly from documented details.
describe("Gertrude Adams-Hill and Harvey Adams Sr. cover", () => {
  it("shows Harvey and Gertrude as Versie's maternal ancestry in the Family Tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    const line = maternalFamily();
    // Harvey Adams Sr. (grandfather) sits at the top of the ancestry branch.
    expect(
      within(line).getByRole("button", { name: /Harvey Adams Sr\./ }),
    ).toBeInTheDocument();
    // Gertrude Adams-Hill (mother) carries her years ("1913–") and appears once
    // as Versie's mother — the first-marriage child card is gone from the tree.
    expect(
      within(line).getByRole("button", { name: /Gertrude Adams-Hill 1913/ }),
    ).toBeInTheDocument();
    expect(
      within(line).queryByRole("button", { name: /^Gertrude Adams-Hill$/ }),
    ).toBeNull();
    // Versie Smith (the person) sits at the bottom of the ancestry chain.
    expect(
      within(line).getByRole("button", { name: /^Versie Smith$/ }),
    ).toBeInTheDocument();

    // Ancestors upward, descendants downward: Harvey above Gertrude above
    // Versie.
    const harvey = within(line).getByRole("button", {
      name: /Harvey Adams Sr\./,
    });
    const gertrude = within(line).getByRole("button", {
      name: /Gertrude Adams-Hill 1913/,
    });
    const versie = within(line).getByRole("button", {
      name: /^Versie Smith$/,
    });
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(harvey, gertrude)).toBe(true);
    expect(follows(gertrude, versie)).toBe(true);
  });

  it("opens Gertrude Adams-Hill's profile from her Family Tree card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gertrude Adams-Hill",
    );
    expect(
      screen.getByText("Daughter of Harvey Adams Sr."),
    ).toBeInTheDocument();

    // The full Person Profile template renders all sections, with the story
    // labeled "Her Story" for Gertrude.
    for (const section of [
      "Her Story",
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

  it("shows Gertrude's recorded facts: born Oct. 19, 1913 in Mississippi, father Harvey, son Versie, spouse Hill", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Oct. 19, 1913"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Location")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Father")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Harvey Adams Sr."),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Son")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Versie Smith"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Spouse")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Hill (given name not recorded)"),
    ).toBeInTheDocument();
  });

  it("labels Gertrude's children as family-history notes, not documented facts", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    );

    const family = screen.getByRole("region", { name: "Family" });
    // The three children recorded in the family notes are listed together in the
    // spouse card's children line and the family narrative.
    for (const child of [
      "David Earl Johnson",
      "Gertrude Louise",
      "Versie Smith",
    ]) {
      expect(family).toHaveTextContent(child);
    }
    // They are explicitly labeled as family-history notes, not documented facts.
    expect(family).toHaveTextContent("family-history notes");
    expect(family).toHaveTextContent("not documented records");

    // The spouse card names Hill.
    expect(within(family).getByText("Hill")).toBeInTheDocument();
  });

  it("shows Gertrude's sources as family-history notes, not documented records", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    );

    const sources = screen.getByRole("region", { name: "Sources" });
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();
    expect(
      within(sources).queryByText("Documented record"),
    ).not.toBeInTheDocument();
  });

  it("renders an initials avatar for Gertrude since no photo exists", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    );

    const portrait = screen.getByRole("img", {
      name: /initials placeholder portrait/i,
    });
    expect(portrait).toHaveAttribute("src", "/assets/images/placeholder.svg");
  });

  it("opens Harvey Adams Sr.'s profile from his Family Tree card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Harvey Adams Sr\./,
      }),
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

  it("shows Harvey's recorded facts: farmer in Mississippi, raised livestock, daughter Gertrude, both wives", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Harvey Adams Sr\./,
      }),
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
    expect(within(dl as HTMLElement).getByText("Daughter")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Gertrude Adams-Hill"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Married")).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Twice")).toBeInTheDocument();
  });

  it("lists both wives in Harvey's Family section and the full first-marriage children list", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Harvey Adams Sr\./,
      }),
    );

    const family = screen.getByRole("region", { name: "Family" });
    // Both wives are listed as spouse cards.
    expect(within(family).getByText("Mary Louise Sims")).toBeInTheDocument();
    expect(within(family).getByText("First Wife")).toBeInTheDocument();
    expect(within(family).getByText("Mary Jane Johnson")).toBeInTheDocument();
    expect(within(family).getByText("Second Wife")).toBeInTheDocument();

    // The first-marriage spouse card now lists all 14 recorded children,
    // including Gertrude Adams (the existing Gertrude Adams-Hill profile).
    const firstWifeCard = within(family)
      .getByText("Mary Louise Sims")
      .closest("div");
    expect(firstWifeCard).not.toBeNull();
    for (const child of [
      "John Adams",
      "Louis Adams Sr.",
      "Albert Adams",
      "Charles Adams",
      "Homer Adams",
      "Versie Adams Sr.",
      "Judge Granberry Adams",
      "Fannie Adams",
      "Gertrude Adams",
      "Harvey Adams Jr.",
      "Christine Adams Tucker",
      "Robert Adams Sr.",
      "Ella Mae Adams",
      "Eula Lee Adams",
    ]) {
      expect(family).toHaveTextContent(child);
    }
    // The narrative explicitly records the full children list as family-history
    // notes, not documented records.
    expect(family).toHaveTextContent("family-history notes");
    expect(family).toHaveTextContent("not confirmed documented records");
  });

  it("renders an initials avatar for Harvey since no photo exists", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    await user.click(
      within(maternalFamily()).getByRole("button", {
        name: /Harvey Adams Sr\./,
      }),
    );

    const portrait = screen.getByRole("img", {
      name: /initials placeholder portrait/i,
    });
    expect(portrait).toHaveAttribute("src", "/assets/images/placeholder.svg");
  });

  it("shows Gertrude as Versie's mother in the Heritage Branch and opens her profile", async () => {
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

    // Gertrude Adams-Hill renders as Versie's parent (mother).
    expect(screen.getByText(/Anchor: Versie Smith/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    ).toBeInTheDocument();

    // Gertrude's card opens her profile.
    await user.click(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gertrude Adams-Hill",
    );
  });

  it("shows Harvey as Gertrude's father in the Heritage Branch and opens his profile", async () => {
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

    // Harvey Adams Sr. renders as Gertrude's parent (father).
    expect(screen.getByText(/Anchor: Gertrude Adams-Hill/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    ).toBeInTheDocument();

    // Harvey's card opens his profile.
    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Harvey Adams Sr.",
    );
  });
});
