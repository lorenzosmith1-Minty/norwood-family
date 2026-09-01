import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { FamilyTreePage } from "./pages/FamilyTreePage";

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

// Cover for the Family Unit cluster redesign and the seven new child profiles.
// The Lula Mae + Versie section now renders as a compact Family Unit cluster
// (couple at top, 'Their Children' label, 7 compact clickable child cards), each
// child card opens that child's profile page, and selecting a child card shows
// Relation to You and This is Me.
describe("Lula Mae + Versie Family Unit cover: compact cluster and seven child profiles", () => {
  it("renders the Family Unit cluster with the couple at top, 'Their Children' label, and 7 child cards", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    const section = screen.getByRole("region", { name: "Lula Mae and Versie" });

    // The couple sits at the top of the cluster.
    expect(
      within(section).getByRole("button", { name: "Lula Mae" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Versie Smith" }),
    ).toBeInTheDocument();

    // The 'Their Children' label is present.
    expect(within(section).getByText("Their Children")).toBeInTheDocument();

    // All seven child cards render with their correct names.
    for (const name of SEVEN_CHILDREN) {
      expect(within(section).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("opens each child's profile page via the reveal's Open Profile button", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandLulaVersieBranch(user);

    for (const name of SEVEN_CHILDREN) {
      // Re-query the section each iteration: navigating away and back
      // re-renders the tree, so a captured element goes stale.
      const section = screen.getByRole("region", {
        name: "Lula Mae and Versie",
      });
      // Clicking a child card selects it (openOnSelect={false}) and reveals
      // the Relation to You / This is Me area with an explicit Open Profile
      // button; it no longer navigates straight to the profile.
      await user.click(within(section).getByRole("button", { name }));
      await user.click(
        within(section).getByRole("button", { name: "Open Profile" }),
      );

      // The profile page opens with the child's name as the heading.
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name);

      // Return to the Family Tree. The branch containing the explored child
      // starts expanded on return, so re-expand only if it is currently
      // collapsed.
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
      const fold = screen.getByRole("button", {
        name: /^Lula Mae & Versie \d+$/,
      });
      if (fold.getAttribute("aria-expanded") === "false") {
        await user.click(fold);
      }
    }
  });

  it("shows a real Relation to You value, This is Me, and Open Profile when a child card is selected", async () => {
    const user = userEvent.setup();
    // Render the Family Tree directly with a no-op profile opener so selecting
    // a child card reveals its details without navigating away.
    render(
      <FamilyTreePage
        onBack={() => {}}
        onOpenProfile={() => {}}
        profilePhotos={{}}
      />,
    );
    await expandLulaVersieBranch(user);

    const section = screen.getByRole("region", { name: "Lula Mae and Versie" });
    const child = within(section).getByRole("button", {
      name: "Lorenzo Smith Sr.",
    });

    // Selecting the card reveals its relationship details, the This is Me
    // action, and the Open Profile action.
    await user.click(child);
    expect(child).toHaveAttribute("aria-pressed", "true");
    // The reveal shows a real recorded relation value, not 'Not set'.
    expect(child).toHaveTextContent("Relation to You: granduncle");
    expect(child).not.toHaveTextContent("Not set");
    expect(
      within(section).getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Open Profile" }),
    ).toBeInTheDocument();
  });
});
