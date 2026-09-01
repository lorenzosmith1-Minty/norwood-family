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

// The Clayton branch defaults to collapsed; expand it so its cards render.
async function expandClaytonBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Clayton \d+$/ }));
}

// Characterization baseline for the Lula Mae + Versie Smith branch redesign. The
// request will intentionally change the Lula Mae + Versie section of the classic
// Family Tree from its current hardcoded branch layout (couple + Versie's
// maternal line) into a compact "Family Unit" cluster (couple at top, 'Their
// Children' label, 7 compact clickable child cards). So the old maternal-line
// layout is NOT frozen here. These tests protect the adjacent working behavior
// that must survive the redesign: the Lula Mae + Versie couple stays present in
// the Family Tree and Versie's card still opens his profile, Lula Mae's card
// under Erma's branch (a different branch, untouched by the change) still opens
// her profile, and the other major branches (Clayton, Harvey's second marriage)
// remain intact.
describe("Lula Mae + Versie Family Unit characterization: adjacent behavior stays intact", () => {
  it("keeps the Lula Mae and Versie couple present in the Family Tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    // The couple remains present in the Lula Mae + Versie section. The fold row
    // ("Lula Mae & Versie 19") also lives inside this region, so anchor the Lula
    // Mae card query to the exact card name.
    const couple = screen.getByRole("region", { name: "Lula Mae and Versie" });
    expect(
      within(couple).getByRole("button", { name: "Lula Mae" }),
    ).toBeInTheDocument();
    expect(
      within(couple).getByRole("button", { name: "Versie Smith" }),
    ).toBeInTheDocument();
  });

  it("keeps Versie's card opening his profile from the Family Tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    await user.click(
      within(
        screen.getByRole("region", { name: "Lula Mae and Versie" }),
      ).getByRole("button", { name: "Versie Smith" }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
    expect(screen.getByText("Husband of Lula Mae Norwood")).toBeInTheDocument();
  });

  it("keeps Lula Mae's card under Erma's branch opening her profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    // Lula Mae remains a child in Clayton's branch (under Erma T. Williams),
    // which is a different branch from the Lula Mae + Versie section and is not
    // part of the redesign.
    const branch = screen.getByRole("region", { name: "Clayton's branch" });
    await user.click(within(branch).getByRole("button", { name: /Lula Mae/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );
    expect(screen.getByText("Daughter")).toBeInTheDocument();
  });

  it("keeps the Clayton and Harvey's second-marriage branches intact", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);
    await user.click(
      screen.getByRole("button", { name: /^Harvey Adams Sr\. \d+$/ }),
    );

    // Clayton's branch still shows his two marriages and their children.
    const claytonBranch = screen.getByRole("region", {
      name: "Clayton's branch",
    });
    expect(
      within(claytonBranch).getByRole("button", { name: /Ms\. Hudson/ }),
    ).toBeInTheDocument();
    expect(
      within(claytonBranch).getByRole("button", { name: /Erma T\. Williams/ }),
    ).toBeInTheDocument();

    // Harvey's second marriage still shows Mary Jane and their children.
    const secondMarriage = screen.getByRole("region", {
      name: "Harvey's second marriage",
    });
    expect(
      within(secondMarriage).getByRole("button", { name: "Harvey Adams Sr." }),
    ).toBeInTheDocument();
    expect(
      within(secondMarriage).getByRole("button", {
        name: /Mary Jane Johnson/,
      }),
    ).toBeInTheDocument();
    expect(
      within(secondMarriage).getByRole("button", { name: /Mildred Adams/ }),
    ).toBeInTheDocument();
  });
});
