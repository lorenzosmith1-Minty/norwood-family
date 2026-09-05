import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

configure({ testIdAttribute: "data-ocid" });

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

async function openBranchFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Heritage Branch View" }),
  );
}

// Cover for the redesigned Heritage Branch View: a bounded, scannable overview
// of the major family lines. The request replaced the anchor-centered Heritage
// Branch (with its Anchor Tree Here / Open Profile / This is Me actions) with
// this simplified map. These tests protect the new view's working behavior:
// it is reachable from Home, it renders simplified nodes grouped into branch
// clusters with descendant/branch counts, it is a bounded overview (no infinite
// canvas, no full extended tree), and tapping a person opens Explore Family
// focused on that person.
describe("Heritage Branch View", () => {
  it("is reachable from Home alongside Explore Family", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      screen.getByRole("button", { name: "Explore the Family" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Heritage Branch View" }),
    ).toBeInTheDocument();

    await openBranchFromHome(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heritage Branch View",
    );
  });

  it("renders simplified nodes grouped into branch clusters without hardcoded counts", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // The Founding Couple cluster shows the two anchors.
    const founding = screen.getByTestId("hb.unit_cluster.1");
    expect(
      within(founding).getByRole("heading", { name: "Founding Couple" }),
    ).toBeInTheDocument();
    expect(
      within(founding).getByRole("button", {
        name: /Julia “Julie” Norwood, Matriarch/,
      }),
    ).toBeInTheDocument();
    expect(
      within(founding).getByRole("button", {
        name: /Isaiah Norwood, Patriarch/,
      }),
    ).toBeInTheDocument();

    // The Clayton Branch renders as a compact anchor card.
    const clayton = screen.getByTestId("hb.branch_cluster.1");
    expect(
      within(clayton).getByRole("button", {
        name: /Clayton Norwood, Son/,
      }),
    ).toBeInTheDocument();

    // No descendant/branch count chips render: counts are only shown when
    // computed directly from the stored relationship graph, and none are
    // computed here, so the hardcoded counts are gone.
    expect(screen.queryByText("8 children")).not.toBeInTheDocument();
    expect(screen.queryByText("72 Descendants")).not.toBeInTheDocument();
    expect(screen.queryByText("7 children")).not.toBeInTheDocument();
    expect(
      screen.queryByText("16 children · 2 marriages"),
    ).not.toBeInTheDocument();
  });

  it("is a bounded overview with no infinite canvas and no full extended tree", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // No pan/zoom infinite-canvas surface is rendered.
    expect(screen.queryByTestId("explore.canvas")).not.toBeInTheDocument();
    // The overview is a simplified map, not the full multi-generation tree: the
    // old anchor-centered actions are gone.
    expect(
      screen.queryByRole("button", { name: "Anchor Tree Here" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Profile" }),
    ).not.toBeInTheDocument();
  });

  it("opens Explore Family focused on a person when a node is tapped", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBranchFromHome(user);

    // Tap a node in the Adams Maternal Line (Harvey Adams Sr.).
    await user.click(
      screen.getByRole("button", {
        name: /Harvey Adams Sr\., Father of Gertrude Adams-Hill/,
      }),
    );

    // Explore Family opens centered on Harvey.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore Family",
    );
    expect(screen.getByText("Harvey Adams Sr.")).toBeInTheDocument();
  });
});
