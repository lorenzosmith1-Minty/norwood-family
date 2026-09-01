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

// The Lula Mae & Versie branch defaults to collapsed; expand it so its Family
// Unit cluster renders.
async function expandLulaVersieBranch(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: /^Lula Mae & Versie \d+$/ }),
  );
}

const SEVEN_CHILDREN = [
  "Lorenzo Smith Sr.",
  "Versie Smith Jr.",
  "Herbert Smith",
  "Alonzo Smith",
  "Sherri Smith",
  "Beatrice Smith",
  "Ed Smith",
];

// Characterization baseline for the Adams-family placement change. The request
// will intentionally move the Adams family (Harvey Adams Sr., Mary Louise Sims,
// their children, and Gertrude Adams-Hill) out of the Lula Mae + Versie section
// into a separate collapsed maternal ancestry branch for Versie. So the current
// Adams-below-the-children layout is NOT frozen here. These tests protect the
// adjacent working behavior that must survive the change: the Lula Mae + Versie
// Family Unit cluster stays a self-contained plate holding only the couple at
// top, the 'Their Children' label, and the seven compact child cards — with the
// Adams family outside that plate — and the cluster keeps its internal order
// (couple, label, then children).
describe("Lula Mae + Versie Family Unit cluster characterization: self-contained plate", () => {
  it("keeps the Family Unit cluster self-contained: only the couple, 'Their Children' label, and 7 children", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    // The Family Unit cluster is the framed plate holding the couple, label,
    // and children. The Adams family renders outside this plate (currently as a
    // sibling section; after the change as a separate branch), so none of its
    // cards live inside the cluster.
    const cluster = container.querySelector(".fu-cluster");
    expect(cluster).not.toBeNull();

    // The couple sits at the top of the cluster.
    expect(
      within(cluster as HTMLElement).getByRole("button", { name: "Lula Mae" }),
    ).toBeInTheDocument();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: "Versie Smith",
      }),
    ).toBeInTheDocument();

    // The 'Their Children' label is inside the cluster.
    expect(
      within(cluster as HTMLElement).getByText("Their Children"),
    ).toBeInTheDocument();

    // All seven children render inside the cluster.
    for (const name of SEVEN_CHILDREN) {
      expect(
        within(cluster as HTMLElement).getByRole("button", { name }),
      ).toBeInTheDocument();
    }

    // The Adams family cards are NOT inside the cluster plate: the cluster is
    // self-contained and ends with the seven children.
    expect(
      within(cluster as HTMLElement).queryByRole("button", {
        name: /Harvey Adams Sr\./,
      }),
    ).toBeNull();
    expect(
      within(cluster as HTMLElement).queryByRole("button", {
        name: /Mary Louise Sims/,
      }),
    ).toBeNull();
    expect(
      within(cluster as HTMLElement).queryByRole("button", {
        name: /Gertrude Adams-Hill/,
      }),
    ).toBeNull();
  });

  it("keeps the cluster's internal order: couple at top, 'Their Children' label, then the children", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    const cluster = container.querySelector(".fu-cluster");
    expect(cluster).not.toBeNull();

    const lulaMae = within(cluster as HTMLElement).getByRole("button", {
      name: "Lula Mae",
    });
    const versie = within(cluster as HTMLElement).getByRole("button", {
      name: "Versie Smith",
    });
    const label = within(cluster as HTMLElement).getByText("Their Children");
    const firstChild = within(cluster as HTMLElement).getByRole("button", {
      name: "Lorenzo Smith Sr.",
    });
    const lastChild = within(cluster as HTMLElement).getByRole("button", {
      name: "Ed Smith",
    });

    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    // Couple at top, label between the couple and the children, children last.
    expect(follows(lulaMae, label)).toBe(true);
    expect(follows(versie, label)).toBe(true);
    expect(follows(label, firstChild)).toBe(true);
    expect(follows(firstChild, lastChild)).toBe(true);
  });
});
