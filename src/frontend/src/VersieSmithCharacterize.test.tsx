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

function claytonBranch() {
  return screen.getByRole("region", { name: "Clayton's branch" });
}

// The Clayton branch defaults to collapsed; expand it so its cards render.
async function expandClaytonBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Clayton \d+$/ }));
}

function completenessPercent(): string {
  const container = document.querySelector(
    '[data-ocid="profile.completeness"]',
  );
  const pill = container?.querySelector(".completeness-pill");
  return pill?.textContent ?? "";
}

// Characterization baseline for the Versie Smith change. The request adds a new
// Versie Smith profile and shows Lula Mae and Versie as a couple in the Family
// Tree and Heritage Branch View. This protects the adjacent working behavior
// that must remain unchanged: Lula Mae's existing card stays under Erma's
// branch in the Family Tree and still opens her profile, her existing profile
// keeps rendering the full template with Versie Smith as husband and
// family-history sources, and the app still loads on the default route without
// a blank screen.
describe("Versie Smith characterization: Lula Mae's existing behavior stays intact", () => {
  it("loads the app on the default route without a blank screen", () => {
    renderApp();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toHaveAttribute("src", "/assets/norwood-logo.png");
  });

  it("keeps Lula Mae's card under Erma's branch in the Family Tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    // Lula Mae remains a child in Clayton's branch (under Erma T. Williams),
    // alongside the other Erma children.
    const branch = claytonBranch();
    expect(
      within(branch).getByRole("button", { name: /Lula Mae/ }),
    ).toBeInTheDocument();
    for (const sibling of [
      "Columbus",
      "Thomas Clayton “Tip / TC”",
      "Alton",
      "Robert Davis “RD”",
      "Ardeanus",
      "Willie B.",
      "James",
      "Freddie",
      "Zelia Mae",
    ]) {
      expect(
        within(branch).getByRole("button", { name: new RegExp(sibling) }),
      ).toBeInTheDocument();
    }
  });

  it("opens Lula Mae's profile from her Family Tree card", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Lula Mae/ }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lula Mae Norwood",
    );
    expect(screen.getByText("Daughter")).toBeInTheDocument();
  });

  it("keeps Lula Mae's profile listing Versie Smith as husband with family-history sources", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Lula Mae/ }),
    );

    // The header facts still list Versie Smith as her husband.
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(within(dl as HTMLElement).getByText("Husband")).toBeInTheDocument();
    expect(
      within(dl as HTMLElement).getByText("Versie Smith"),
    ).toBeInTheDocument();

    // The Family section still names Versie Smith as her husband.
    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Versie Smith")).toBeInTheDocument();

    // Her sources remain family-history notes, not documented records.
    const sources = screen.getByRole("region", { name: "Sources" });
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();
    expect(
      within(sources).queryByText("Documented record"),
    ).not.toBeInTheDocument();
  });

  it("keeps Lula Mae's completeness at 86% with Photo incomplete", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    await user.click(
      within(claytonBranch()).getByRole("button", { name: /Lula Mae/ }),
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

  it("keeps the other Erma child profiles rendering unchanged", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFamilyTree(user);
    await expandClaytonBranch(user);

    for (const { card, heading } of [
      { card: /Freddie/, heading: "Freddie Norwood" },
      { card: /Zelia Mae/, heading: "Zelia Mae Norwood" },
    ]) {
      await user.click(
        within(claytonBranch()).getByRole("button", { name: card }),
      );
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      await user.click(
        screen.getByRole("button", { name: /Back to Family Tree/ }),
      );
    }
  });
});
