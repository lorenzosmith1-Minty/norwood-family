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

// The 14 recorded children of Harvey Adams Sr. and Mary Louise Sims, with the
// Gertrude child mapping to the existing Gertrude Adams-Hill profile. Each
// entry is the role-qualified accessible name of the Family Tree card.
const FIRST_MARRIAGE_CHILDREN = [
  "John Adams Son",
  "Louis Adams Sr. Son",
  "Albert Adams Son",
  "Charles Adams Son",
  "Homer Adams Son",
  "Versie Adams Sr. Son",
  "Judge Granberry Adams Son",
  "Fannie Adams Daughter",
  "Gertrude Adams-Hill Daughter",
  "Harvey Adams Jr. Son",
  "Christine Adams Tucker Daughter",
  "Robert Adams Sr. Son",
  "Ella Mae Adams Daughter",
  "Eula Lee Adams Daughter",
];

// Cover for the Harvey Adams Sr. first-marriage branch expansion: Mary Louise
// Sims as first wife and the 14 recorded children (Gertrude Adams-Hill as the
// existing Gertrude child) render in the Family Tree under that marriage, the
// Heritage Branch shows the same branch, each new card opens its profile,
// Christine Adams Tucker states she married a Tucker, and Versie Adams Sr.
// remains distinct from Versie Smith.
describe("Harvey Adams Sr. first-marriage branch cover", () => {
  it("shows Mary Louise Sims as first wife and all 14 children under the first marriage in the Family Tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const line = maternalLine();
    // Mary Louise Sims renders as Harvey's first wife.
    expect(
      within(line).getByRole("button", { name: /Mary Louise Sims First Wife/ }),
    ).toBeInTheDocument();

    // All 14 recorded children render as cards under the first marriage.
    for (const child of FIRST_MARRIAGE_CHILDREN) {
      expect(
        within(line).getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("opens Mary Louise Sims' profile from her Family Tree card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    await user.click(
      within(maternalLine()).getByRole("button", {
        name: /Mary Louise Sims First Wife/,
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Mary Louise Sims",
    );
    expect(
      screen.getByText("First Wife of Harvey Adams Sr."),
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

  it("opens each new first-marriage child profile from its Family Tree card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const cases: { card: RegExp; heading: string }[] = [
      { card: /John Adams Son/, heading: "John Adams" },
      { card: /Louis Adams Sr\. Son/, heading: "Louis Adams Sr." },
      { card: /Albert Adams Son/, heading: "Albert Adams" },
      { card: /Charles Adams Son/, heading: "Charles Adams" },
      { card: /Homer Adams Son/, heading: "Homer Adams" },
      { card: /Versie Adams Sr\. Son/, heading: "Versie Adams Sr." },
      { card: /Judge Granberry Adams Son/, heading: "Judge Granberry Adams" },
      { card: /Fannie Adams Daughter/, heading: "Fannie Adams" },
      { card: /Harvey Adams Jr\. Son/, heading: "Harvey Adams Jr." },
      {
        card: /Christine Adams Tucker Daughter/,
        heading: "Christine Adams Tucker",
      },
      { card: /Robert Adams Sr\. Son/, heading: "Robert Adams Sr." },
      { card: /Ella Mae Adams Daughter/, heading: "Ella Mae Adams" },
      { card: /Eula Lee Adams Daughter/, heading: "Eula Lee Adams" },
    ];

    for (const { card, heading } of cases) {
      await user.click(
        within(maternalLine()).getByRole("button", { name: card }),
      );
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });

  it("opens Gertrude Adams-Hill from her first-marriage child card (the existing Gertrude profile)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // The Gertrude child card in the first-marriage list opens the existing
    // Gertrude Adams-Hill profile, not a separate Gertrude Adams profile.
    await user.click(
      within(maternalLine()).getByRole("button", {
        name: /Gertrude Adams-Hill Daughter/,
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gertrude Adams-Hill",
    );
    expect(
      screen.getByText("Daughter of Harvey Adams Sr."),
    ).toBeInTheDocument();
  });

  it("keeps Christine Adams Tucker's profile stating she married a Tucker", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    await user.click(
      within(maternalLine()).getByRole("button", {
        name: /Christine Adams Tucker Daughter/,
      }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Spouse")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Tucker (given name not recorded)"),
    ).toBeInTheDocument();

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Tucker")).toBeInTheDocument();
    expect(family).toHaveTextContent("married a man named Tucker");
  });

  it("keeps Versie Adams Sr. distinct from Versie Smith", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Versie Adams Sr. is a first-marriage child of Harvey and Mary Louise.
    await user.click(
      within(maternalLine()).getByRole("button", {
        name: /Versie Adams Sr\. Son/,
      }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Adams Sr.",
    );
    expect(
      screen.getByText("Son of Harvey Adams Sr. and Mary Louise Sims"),
    ).toBeInTheDocument();
    // The profile is not the Versie Smith profile.
    expect(
      screen.queryByText("Husband of Lula Mae Norwood"),
    ).not.toBeInTheDocument();
  });

  it("shows the same first-marriage branch in the Heritage Branch with all children connected", async () => {
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

    // Anchor on Harvey to reveal Mary Louise Sims and the first-marriage children.
    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    expect(screen.getByText(/Anchor: Harvey Adams Sr\./)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mary Louise Sims, First Wife/ }),
    ).toBeInTheDocument();
    // In the Heritage Branch the cards use comma-separated accessible names,
    // e.g. "John Adams, Son" (comma before the role). Gertrude is rendered
    // with her branch role "Mother" (she is Versie Smith's mother), not
    // "Daughter" as in the Family Tree.
    const heritageChildren = FIRST_MARRIAGE_CHILDREN.map((name) =>
      name === "Gertrude Adams-Hill Daughter"
        ? "Gertrude Adams-Hill, Mother"
        : name.replace(/ ([^ ]+)$/, ", $1"),
    );
    for (const child of heritageChildren) {
      expect(
        screen.getByRole("button", { name: new RegExp(child) }),
      ).toBeInTheDocument();
    }
  });

  it("opens a first-marriage child profile from the Heritage Branch via Open Profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    );

    // Navigate to the Harvey anchor as above.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Gertrude Adams-Hill, Mother/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));
    await user.click(
      screen.getByRole("button", { name: /Harvey Adams Sr\., Father/ }),
    );
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Open Christine Adams Tucker's profile from her Heritage Branch card.
    await user.click(
      screen.getByRole("button", { name: /Christine Adams Tucker, Daughter/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Christine Adams Tucker",
    );
  });
});
