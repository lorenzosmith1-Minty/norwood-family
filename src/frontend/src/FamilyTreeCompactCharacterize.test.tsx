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

// The major descendant branches default to collapsed; expand them so their
// cards (and nested regions) render.
async function expandClaytonBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Clayton \d+$/ }));
}
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}
async function expandHarveySecondBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Harvey Adams Sr\. \d+$/ }),
  );
}
async function expandVersieMaternalBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Versie's Maternal Family \d+$/ }),
  );
}

// Characterization baseline for the Family Tree compact-card / collapsible-branch
// change. The request will intentionally change the card layout (compact cards
// showing only photo/initials, name, and birth/death years; relationship labels
// hidden by default) and make major descendant branches collapsible. So the
// current always-labeled, always-expanded layout is NOT frozen here. These tests
// protect the working behavior that must survive the change: selecting a card
// reveals its relationship details and moving the selection hides the previous
// card's details, and the full tree structure (every couple, marriage, and
// parent-to-child relationship) remains present and reachable.
describe("Family Tree compact-card characterization: selection reveals relationship details", () => {
  it("reveals a selected card's relationship details and hides the previous card's on re-selection", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // Hattie carries a recorded relation value ("grandaunt"). Query by name
    // only so the assertion survives the compact-card change (role labels are
    // being hidden from the default card).
    const hattie = screen.getByRole("button", { name: /Hattie/ });
    expect(hattie).not.toHaveTextContent("Relation to You");

    await user.click(hattie);
    expect(hattie).toHaveAttribute("aria-pressed", "true");
    expect(hattie).toHaveTextContent("Relation to You");
    expect(hattie).toHaveTextContent("grandaunt");

    // Selecting a different card hides the previous card's details and shows
    // the newly selected card's own details.
    const lula = screen.getByRole("button", { name: /Lula E\./ });
    await user.click(lula);
    expect(lula).toHaveAttribute("aria-pressed", "true");
    expect(lula).toHaveTextContent("Relation to You");
    expect(lula).toHaveTextContent("great-grandmother");
    expect(hattie).not.toHaveTextContent("grandaunt");
  });

  it("shows the 'This is Me' action only on the selected card and hides it when selection moves", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    // No card is selected, so no 'This is Me' action is shown.
    expect(screen.queryByRole("button", { name: "This is Me" })).toBeNull();

    const isaiahJr = screen.getByRole("button", { name: /Isaiah Jr\./ });
    await user.click(isaiahJr);
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();

    // Selecting a different card keeps exactly one 'This is Me' action, on the
    // newly selected card.
    const edward = screen.getByRole("button", { name: /Edward/ });
    await user.click(edward);
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
    expect(isaiahJr).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Family Tree compact-card characterization: tree structure stays intact", () => {
  it("keeps every couple, marriage, and parent-to-child relationship present", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);
    await expandLulaVersieBranch(user);
    await expandHarveySecondBranch(user);
    await expandVersieMaternalBranch(user);

    // The starting couple and their eight children.
    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    for (const name of ["Julia “Julie” Norwood", "Isaiah Norwood"]) {
      expect(
        within(coupleSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    const childrenSection = screen.getByRole("region", { name: "Children" });
    for (const name of [
      "Clayton",
      "Isaiah Jr.",
      "Edward",
      "Hattie",
      "Pinkie",
      "Louise",
      "Lillie",
      "Lula E.",
    ]) {
      expect(
        within(childrenSection).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }

    // Clayton's two marriages and their children.
    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    for (const name of ["Ms. Hudson", "Erma T. Williams"]) {
      expect(
        within(claytonBranch).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    for (const name of ["Elbert", "Columbus", "Freddie", "Lula Mae"]) {
      expect(
        within(claytonBranch).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }

    // The Lula Mae / Versie couple.
    const lulaSection = screen.getByRole("region", {
      name: "Lula Mae and Versie",
    });
    // The fold row ("Lula Mae & Versie 19") also lives inside this region, so
    // anchor the Lula Mae card query to the exact card name to avoid matching
    // the fold button.
    expect(
      within(lulaSection).getByRole("button", { name: "Lula Mae" }),
    ).toBeInTheDocument();
    expect(
      within(lulaSection).getByRole("button", { name: "Versie Smith" }),
    ).toBeInTheDocument();

    // Versie's maternal ancestry: Harvey (grandfather) above Gertrude (mother)
    // above Versie (the person). The first-marriage branch (Mary Louise Sims
    // and her children) is no longer part of the Family Tree.
    const maternalSection = screen.getByRole("region", {
      name: "Versie's maternal family",
    });
    expect(
      within(maternalSection).getByRole("button", {
        name: /^Harvey Adams Sr\.$/,
      }),
    ).toBeInTheDocument();
    expect(
      within(maternalSection).getByRole("button", {
        name: /Gertrude Adams-Hill 1913/,
      }),
    ).toBeInTheDocument();
    expect(
      within(maternalSection).getByRole("button", {
        name: /^Versie Smith$/,
      }),
    ).toBeInTheDocument();
    // The first-marriage cards are gone from the Family Tree.
    expect(
      within(maternalSection).queryByRole("button", {
        name: /Mary Louise Sims/,
      }),
    ).toBeNull();
    expect(
      within(maternalSection).queryByRole("button", {
        name: /John Adams/,
      }),
    ).toBeNull();

    // Harvey's second marriage: Mary Jane, their children, and Mildred's
    // daughters.
    const secondMarriage = screen.getByRole("region", {
      name: "Harvey's second marriage",
    });
    // The fold row ("Harvey Adams Sr. 6") also lives inside this region, so
    // anchor the Harvey card query to the exact card name.
    expect(
      within(secondMarriage).getByRole("button", { name: "Harvey Adams Sr." }),
    ).toBeInTheDocument();
    for (const name of [
      "Mary Jane Johnson",
      "Mildred Adams",
      "Christine Adams",
    ]) {
      expect(
        within(secondMarriage).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    for (const name of ["Tammy", "Punchy", "Patricia Rollins"]) {
      expect(
        within(secondMarriage).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("keeps the tree sections in their established vertical order", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);
    await expandLulaVersieBranch(user);
    await expandHarveySecondBranch(user);

    const sections = [
      screen.getByRole("region", { name: "Starting couple" }),
      screen.getByRole("region", { name: "Children" }),
      screen.getByRole("region", { name: "Clayton's branch" }),
      screen.getByRole("region", { name: "Lula Mae and Versie" }),
      screen.getByRole("region", { name: "Versie's maternal family" }),
      screen.getByRole("region", { name: "Harvey's second marriage" }),
    ];

    for (let i = 0; i < sections.length - 1; i++) {
      expect(
        sections[i].compareDocumentPosition(sections[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
