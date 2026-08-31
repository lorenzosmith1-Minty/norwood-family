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

async function openBranchFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Heritage Branch View" }),
  );
}

// The vertical trunk that descends from the center of the starting couple,
// sitting between the couple and children sections.
function coupleTrunk(container: HTMLElement): HTMLElement | null {
  const coupleSection = screen.getByRole("region", {
    name: "Starting couple",
  });
  const childrenSection = screen.getByRole("region", { name: "Children" });
  return (
    Array.from(container.querySelectorAll<HTMLElement>(".ft-trunk")).find(
      (el) =>
        (coupleSection.compareDocumentPosition(el) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0 &&
        (el.compareDocumentPosition(childrenSection) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
    ) ?? null
  );
}

// Cover for the family-tree connector redesign: visible junction points where
// the trunk meets the children's branch line, subtle downward direction
// chevrons on parent-to-child connectors, and selection highlighting the
// connector path that links a person to their spouse and children.
describe("Family Tree connector cover", () => {
  it("renders a visible junction point on each trunk where it meets the children's branch line", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    // The couple trunk ends in a junction point where it meets the children's
    // branch line.
    const trunk = coupleTrunk(container);
    expect(trunk).not.toBeNull();
    expect(trunk?.querySelector(".ft-junction")).not.toBeNull();

    // Clayton's branch has one junction per marriage (Ms. Hudson and Erma), so
    // multiple marriages each get their own trunk and child branch.
    const branchTrunks = Array.from(
      claytonBranch.querySelectorAll<HTMLElement>(".ft-trunk"),
    ).filter((el) => el.className.includes("h-6"));
    expect(branchTrunks.length).toBeGreaterThanOrEqual(2);
    for (const branchTrunk of branchTrunks) {
      expect(branchTrunk.querySelector(".ft-junction")).not.toBeNull();
    }
  });

  it("reconnects Clayton's trunk to the marriage bar with a junction and a couple line between the spouses", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    // The trunk descends from Clayton's card down to the marriage bar. It is
    // the absolute-positioned trunk (no h-6), distinct from the per-marriage
    // trunks that drop from each spouse to their children.
    const claytonTrunk = Array.from(
      claytonBranch.querySelectorAll<HTMLElement>(".ft-trunk"),
    ).find((el) => !el.className.includes("h-6"));
    expect(claytonTrunk).toBeDefined();
    expect(claytonTrunk?.querySelector(".ft-junction")).not.toBeNull();

    // A distinct horizontal couple line joins the two spouses.
    const coupleLine = claytonBranch.querySelector(".ft-couple-line");
    expect(coupleLine).not.toBeNull();

    // Selecting a highlight-only child of the first marriage lights up the
    // marriage's own trunk and junction, showing the per-marriage trunk is
    // wired to its branch (not left disconnected).
    await user.click(
      within(claytonBranch).getByRole("button", {
        name: /Son \(died at birth\)/,
      }),
    );
    const branchTrunks = Array.from(
      claytonBranch.querySelectorAll<HTMLElement>(".ft-trunk"),
    ).filter((el) => el.className.includes("h-6"));
    expect(branchTrunks).toHaveLength(2);
    expect(branchTrunks[0].className).toContain("ft-connector-selected");
    expect(branchTrunks[0].querySelector(".ft-junction")?.className).toContain(
      "ft-connector-selected",
    );
  });

  it("renders a downward direction chevron on each parent-to-child connector", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const childrenSection = screen.getByRole("region", { name: "Children" });
    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    // One chevron per child under the couple (eight children).
    const childChevrons = Array.from(
      childrenSection.querySelectorAll(".ft-chevron"),
    );
    expect(childChevrons.length).toBe(8);

    // Clayton's branch has one chevron per child across both marriages
    // (four with Ms. Hudson, ten with Erma).
    const branchChevrons = Array.from(
      claytonBranch.querySelectorAll(".ft-chevron"),
    );
    expect(branchChevrons.length).toBe(14);
  });

  it("highlights the trunk, junction, and the selected child's connector when a child is selected", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });

    const coupleLine = coupleSection.querySelector(".ft-couple-line");
    expect(coupleLine).not.toBeNull();
    expect(coupleLine?.className).not.toContain("ft-connector-selected");

    const trunk = coupleTrunk(container);
    expect(trunk).not.toBeNull();

    // Select a highlight-only child (Isaiah Jr. has no profile, so tapping his
    // card selects rather than navigates).
    await user.click(screen.getByRole("button", { name: /Isaiah Jr\./ }));

    // The trunk and its junction highlight as the path from the couple down to
    // the selected child, but the couple line itself does not.
    expect(trunk?.className).toContain("ft-connector-selected");
    expect(trunk?.querySelector(".ft-junction")?.className).toContain(
      "ft-connector-selected",
    );
    expect(coupleLine?.className).not.toContain("ft-connector-selected");

    // Exactly one child stub and one chevron highlight: the selected child's.
    const selectedStubs = Array.from(
      childrenSection.querySelectorAll(".ft-child-stub"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    const selectedChevrons = Array.from(
      childrenSection.querySelectorAll(".ft-chevron"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    expect(selectedStubs).toHaveLength(1);
    expect(selectedChevrons).toHaveLength(1);
  });

  it("highlights only the selected marriage's branch when one of its children is selected", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);

    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });

    // Select 'Son (died at birth)', a highlight-only child of Ms. Hudson's
    // first marriage (no profile, so tapping selects rather than navigates).
    await user.click(
      within(claytonBranch).getByRole("button", {
        name: /Son \(died at birth\)/,
      }),
    );

    // Ms. Hudson's branch trunk and junction highlight; Erma's do not.
    const branchTrunks = Array.from(
      claytonBranch.querySelectorAll<HTMLElement>(".ft-trunk"),
    ).filter((el) => el.className.includes("h-6"));
    expect(branchTrunks).toHaveLength(2);
    expect(branchTrunks[0].className).toContain("ft-connector-selected");
    expect(branchTrunks[1].className).not.toContain("ft-connector-selected");
    expect(branchTrunks[0].querySelector(".ft-junction")?.className).toContain(
      "ft-connector-selected",
    );
    expect(
      branchTrunks[1].querySelector(".ft-junction")?.className,
    ).not.toContain("ft-connector-selected");

    // Exactly one child stub and one chevron highlight: the selected child's.
    const selectedStubs = Array.from(
      claytonBranch.querySelectorAll(".ft-child-stub"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    const selectedChevrons = Array.from(
      claytonBranch.querySelectorAll(".ft-chevron"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    expect(selectedStubs).toHaveLength(1);
    expect(selectedChevrons).toHaveLength(1);
  });
});

describe("Heritage Branch connector cover", () => {
  it("renders junction points and downward chevrons on the branch connectors", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBranchFromHome(user);

    // The default Julia anchor renders her spouse beside her and her eight
    // children below, so the branch canvas carries a couple line, a trunk with
    // a junction, and one chevron per child.
    expect(container.querySelector(".ft-couple-line")).not.toBeNull();
    expect(container.querySelector(".ft-trunk")).not.toBeNull();
    expect(container.querySelector(".ft-junction")).not.toBeNull();
    const chevrons = Array.from(container.querySelectorAll(".ft-chevron"));
    expect(chevrons.length).toBe(8);
  });

  it("highlights the couple line and the children's connector path when the anchor is selected", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBranchFromHome(user);

    // Select the anchor (Julia). Every card in the Heritage Branch selects on
    // tap, so the anchor's connector path to her spouse and children lights up.
    await user.click(
      screen.getByRole("button", { name: /Julia “Julie” Norwood, Matriarch/ }),
    );

    // The horizontal couple line between Julia and Isaiah highlights.
    const coupleLine = Array.from(
      container.querySelectorAll<HTMLElement>(".ft-couple-line"),
    ).find((el) => el.className.includes("w-8"));
    expect(coupleLine).toBeDefined();
    expect(coupleLine?.className).toContain("ft-connector-selected");

    // The children's row connector (trunk, junction, stubs, and chevrons)
    // highlights as the path from the anchor down to her children.
    expect(container.querySelector(".ft-trunk")?.className).toContain(
      "ft-connector-selected",
    );
    expect(container.querySelector(".ft-junction")?.className).toContain(
      "ft-connector-selected",
    );
    const stubs = Array.from(container.querySelectorAll(".ft-child-stub"));
    const chevrons = Array.from(container.querySelectorAll(".ft-chevron"));
    expect(stubs.length).toBe(8);
    for (const stub of stubs) {
      expect(stub.className).toContain("ft-connector-selected");
    }
    for (const chevron of chevrons) {
      expect(chevron.className).toContain("ft-connector-selected");
    }
  });

  it("highlights the children's connector path but not the couple line when a child is selected", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBranchFromHome(user);

    // Select Clayton, a child of the Julia anchor.
    await user.click(
      screen.getByRole("button", { name: /Clayton Norwood, Son/ }),
    );

    // The children's row connector highlights as the path from the anchor to
    // the selected child.
    expect(container.querySelector(".ft-trunk")?.className).toContain(
      "ft-connector-selected",
    );
    expect(container.querySelector(".ft-junction")?.className).toContain(
      "ft-connector-selected",
    );
    const selectedStubs = Array.from(
      container.querySelectorAll(".ft-child-stub"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    expect(selectedStubs.length).toBe(8);

    // The horizontal couple line between Julia and Isaiah does not highlight
    // when a child is selected.
    const coupleLine = Array.from(
      container.querySelectorAll<HTMLElement>(".ft-couple-line"),
    ).find((el) => el.className.includes("w-8"));
    expect(coupleLine).toBeDefined();
    expect(coupleLine?.className).not.toContain("ft-connector-selected");
  });

  it("highlights only the couple line to the selected spouse, not the children's path", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBranchFromHome(user);

    // Select Isaiah, Julia's spouse. The couple line between them highlights as
    // the connector path to the spouse, but the children's row connector does
    // not: Isaiah is not on the path from the anchor down to her children.
    await user.click(
      screen.getByRole("button", { name: /Isaiah Norwood, Patriarch/ }),
    );

    const coupleLine = Array.from(
      container.querySelectorAll<HTMLElement>(".ft-couple-line"),
    ).find((el) => el.className.includes("w-8"));
    expect(coupleLine).toBeDefined();
    expect(coupleLine?.className).toContain("ft-connector-selected");

    // The children's row connector (trunk, junction, stubs, and chevrons)
    // stays unselected.
    expect(container.querySelector(".ft-trunk")?.className).not.toContain(
      "ft-connector-selected",
    );
    expect(container.querySelector(".ft-junction")?.className).not.toContain(
      "ft-connector-selected",
    );
    const stubs = Array.from(container.querySelectorAll(".ft-child-stub"));
    expect(stubs.length).toBe(8);
    for (const stub of stubs) {
      expect(stub.className).not.toContain("ft-connector-selected");
    }
  });
});
