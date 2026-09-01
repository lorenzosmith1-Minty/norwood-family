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

async function openFamilyTree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

// The Lula Mae & Versie branch defaults to collapsed; expand it so its cards
// and connectors render.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}

// The Versie's maternal family branch defaults to collapsed; expand it so its
// ancestor cards and connectors render.
async function expandVersieMaternalBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Versie's Maternal Family \d+$/ }),
  );
}

// The vertical trunk that descends from the center of a couple, sitting between
// the two given sections.
function trunkBetween(
  before: HTMLElement,
  after: HTMLElement,
  container: HTMLElement,
): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>(".ft-trunk")).find(
      (el) =>
        (before.compareDocumentPosition(el) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0 &&
        (el.compareDocumentPosition(after) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
    ) ?? null
  );
}

// Characterization baseline for the family-tree connector system across the
// lower tree sections. The request centers on the connector redesign, so these
// tests protect the connector topology that must survive it: every couple in
// the tree (not just the starting couple) keeps a horizontal couple line and a
// vertical trunk ending in a junction, every parent-to-child connector keeps a
// downward chevron, and selecting a child highlights only that child's row.
describe("Family Tree connector characterization: lower tree sections", () => {
  it("renders a couple line, trunk, and junction for the Lula Mae and Versie couple", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    const lulaSection = screen.getByRole("region", {
      name: "Lula Mae and Versie",
    });

    // The Family Unit cluster joins the two spouse cards with a short local
    // couple line.
    const cluster = lulaSection.querySelector(".fu-cluster");
    expect(cluster).not.toBeNull();
    expect(cluster?.querySelector(".fu-couple-line")).not.toBeNull();

    // A vertical trunk descends from the couple's center and ends in a
    // junction where it meets the branch line.
    const trunk = lulaSection.querySelector(".ft-trunk");
    expect(trunk).not.toBeNull();
    expect(trunk?.className).toContain("h-8");
    expect(trunk?.querySelector(".ft-junction")).not.toBeNull();
  });

  it("renders the maternal ancestry connectors: trunks with junctions down the ancestor chain", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandVersieMaternalBranch(user);

    const maternalSection = screen.getByRole("region", {
      name: "Versie's maternal family",
    });

    // The ancestry branch is a vertical chain (Harvey above Gertrude above
    // Versie), so it has no spouse couple line and no parent-to-child stubs.
    expect(maternalSection.querySelector(".ft-couple-line")).toBeNull();
    expect(maternalSection.querySelector(".ft-child-stub")).toBeNull();
    expect(maternalSection.querySelector(".ft-chevron")).toBeNull();

    // Three vertical trunks with junctions: the section's persistent entry
    // trunk (visible even when collapsed), one from Harvey down to Gertrude,
    // and one from Gertrude down to Versie.
    const trunks = Array.from(
      maternalSection.querySelectorAll<HTMLElement>(".ft-trunk"),
    ).filter((el) => el.className.includes("h-8"));
    expect(trunks).toHaveLength(3);
    for (const trunk of trunks) {
      expect(trunk.querySelector(".ft-junction")).not.toBeNull();
    }
  });

  it("highlights the second row's branch bar and only the selected child's stub and chevron", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);

    const coupleSection = screen.getByRole("region", {
      name: "Starting couple",
    });
    const childrenSection = screen.getByRole("region", { name: "Children" });

    // Lula E. is a highlight-only child in the second row (no profile, so
    // tapping selects rather than navigates).
    await user.click(screen.getByRole("button", { name: /Lula E\./ }));

    // The trunk and its junction highlight as the path from the couple down to
    // the selected child, but the couple line itself does not.
    const trunk = trunkBetween(coupleSection, childrenSection, container);
    expect(trunk).not.toBeNull();
    expect(trunk?.className).toContain("ft-connector-selected");
    expect(trunk?.querySelector(".ft-junction")?.className).toContain(
      "ft-connector-selected",
    );
    expect(
      coupleSection.querySelector(".ft-couple-line")?.className,
    ).not.toContain("ft-connector-selected");

    // Only the second row's horizontal branch bar highlights.
    const bars = Array.from(childrenSection.querySelectorAll(".ft-connector"));
    expect(bars).toHaveLength(2);
    expect(bars[0].className).not.toContain("ft-connector-selected");
    expect(bars[1].className).toContain("ft-connector-selected");

    // Exactly one stub and one chevron highlight: the selected child's, in the
    // second row (after the second branch bar).
    const selectedStubs = Array.from(
      childrenSection.querySelectorAll(".ft-child-stub"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    const selectedChevrons = Array.from(
      childrenSection.querySelectorAll(".ft-chevron"),
    ).filter((el) => el.className.includes("ft-connector-selected"));
    expect(selectedStubs).toHaveLength(1);
    expect(selectedChevrons).toHaveLength(1);
    expect(
      bars[1].compareDocumentPosition(selectedStubs[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
