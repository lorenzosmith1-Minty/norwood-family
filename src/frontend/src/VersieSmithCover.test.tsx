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

// The Lula Mae & Versie branch defaults to collapsed; expand it so its cards
// render.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

// Cover for the Versie Smith change. The request adds a Versie Smith profile
// (husband of Lula Mae Norwood, son of Gertrude Adams-Hill, born out of wedlock,
// raised as an Adams in Mississippi, moved to New York after Army service, died
// from lung cancer), shows Lula Mae and Versie as a couple in both the Family
// Tree and the Heritage Branch View, and makes Versie's card open his profile.
describe("Versie Smith cover: profile, Family Tree couple, and Heritage Branch couple", () => {
  it("opens Versie's profile from his Family Tree card and renders the full template", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    // The couple section shows Lula Mae and Versie side by side. The fold row
    // ("Lula Mae & Versie 19") also lives inside this region, so anchor the
    // Lula Mae card query to the exact card name.
    const couple = screen.getByRole("region", { name: "Lula Mae and Versie" });
    expect(
      within(couple).getByRole("button", { name: "Lula Mae" }),
    ).toBeInTheDocument();
    expect(
      within(couple).getByRole("button", { name: "Versie Smith" }),
    ).toBeInTheDocument();

    await user.click(
      within(couple).getByRole("button", { name: "Versie Smith" }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
    expect(screen.getByText("Husband of Lula Mae Norwood")).toBeInTheDocument();

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

  it("records only the stated facts with no invented dates or extra relatives", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(
        screen.getByRole("region", { name: "Lula Mae and Versie" }),
      ).getByRole("button", { name: "Versie Smith" }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Wife")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Lula Mae Norwood"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Mother")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Gertrude Adams-Hill"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Born")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Out of wedlock"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Raised")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("As an Adams in Mississippi"),
    ).toBeInTheDocument();
    expect(within(dl as HTMLElement).getByText("Died")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("From lung cancer"),
    ).toBeInTheDocument();

    // No invented birth/death years appear anywhere in the profile.
    expect(screen.queryByText(/19\d\d/)).not.toBeInTheDocument();

    // The Family section lists only wife Lula Mae Norwood and mother Gertrude
    // Adams-Hill — no additional relatives. The mother is named in the family
    // narrative text rather than as a separate spouse card.
    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Lula Mae Norwood")).toBeInTheDocument();
    expect(within(family).getByText("Wife")).toBeInTheDocument();
    expect(family).toHaveTextContent("Gertrude Adams-Hill");
  });

  it("preserves the father as 'Mr. Beard?' with the question mark and labels it uncertain", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(
        screen.getByRole("region", { name: "Lula Mae and Versie" }),
      ).getByRole("button", { name: "Versie Smith" }),
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Father")).toBeInTheDocument();
    // The question mark is preserved and the uncertainty is labeled.
    expect(
      within(dl as HTMLElement).getByText(/Mr\. Beard\?/),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(/uncertain/),
    ).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText(/not confirmed/),
    ).toBeInTheDocument();

    // The story also records that he did not know his biological father.
    const story = screen.getByRole("region", { name: "His Story" });
    expect(story).toHaveTextContent("Mr. Beard?");
    expect(story).toHaveTextContent("did not know his biological father");
  });

  it("labels family-history notes distinctly from documented details", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(
        screen.getByRole("region", { name: "Lula Mae and Versie" }),
      ).getByRole("button", { name: "Versie Smith" }),
    );

    const sources = screen.getByRole("region", { name: "Sources" });
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();
    expect(
      within(sources).queryByText("Documented record"),
    ).not.toBeInTheDocument();
  });

  it("shows only recorded events in the timeline with 'Not recorded' dates", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(
        screen.getByRole("region", { name: "Lula Mae and Versie" }),
      ).getByRole("button", { name: "Versie Smith" }),
    );

    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(
      within(timeline).getByText("Marries Lula Mae Norwood"),
    ).toBeInTheDocument();
    expect(within(timeline).getByText("Moves to New York")).toBeInTheDocument();
    // No invented dates; the recorded events carry an 'Unknown' date label and
    // the detail text states the date is not recorded.
    expect(within(timeline).getAllByText("Unknown")).toHaveLength(2);
    expect(timeline).toHaveTextContent("The date is not recorded");
    expect(within(timeline).queryByText(/19\d\d/)).not.toBeInTheDocument();
  });

  it("renders Completeness with Photo marked incomplete (initials shown, no photo)", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(
        screen.getByRole("region", { name: "Lula Mae and Versie" }),
      ).getByRole("button", { name: "Versie Smith" }),
    );

    const completeness = document.querySelector(
      '[data-ocid="profile.completeness"]',
    );
    expect(completeness).not.toBeNull();
    expect(completenessPercent()).toBe("86%");

    // No photograph exists, so the header renders the initials placeholder.
    const portrait = screen.getByRole("img", {
      name: /initials placeholder portrait/i,
    });
    expect(portrait).toHaveAttribute("src", "/assets/images/placeholder.svg");
  });

  it("shows Lula Mae and Versie as a couple in the Heritage Branch and opens Versie's profile", async () => {
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

    // Now anchor on Lula Mae to reveal Versie as her spouse beside her.
    await user.click(screen.getByRole("button", { name: /Lula Mae, Child/ }));
    await user.click(screen.getByRole("button", { name: "Anchor Tree Here" }));

    // Lula Mae is the anchor and Versie Smith renders as her spouse.
    expect(screen.getByText(/Anchor: Lula Mae/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lula Mae, Child/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    ).toBeInTheDocument();

    // Versie's card opens his profile.
    await user.click(
      screen.getByRole("button", { name: /Versie Smith, Husband/ }),
    );
    await user.click(screen.getByRole("button", { name: "Open Profile" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
  });
});
