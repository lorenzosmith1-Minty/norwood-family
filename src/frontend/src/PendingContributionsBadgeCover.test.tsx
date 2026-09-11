import "@testing-library/jest-dom/vitest";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Cover for the Pending Contributions badge added to the Family Steward nav
// item. The badge reads the backend's aggregate pending-review count
// (getPendingContributionsCount) and renders a small pill only when there is at
// least one pending item; it is gated to stewards (admins).
const ACCOUNT = "2vxsx-fae";

const {
  mockActor,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setPendingCount,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let pendingCount = 0n;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPendingContributionsCount(): Promise<bigint> {
      return pendingCount;
    },
  };

  return {
    mockActor,
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setPendingCount: (v: bigint) => {
      pendingCount = v;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  setAuthenticated(false);
  setAdmin(false);
  setPendingCount(0n);
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("Pending Contributions badge", () => {
  it("shows a numeric badge for a steward when there are pending items", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setPendingCount(3n);
    const user = userEvent.setup();
    renderApp();

    // The badge now lives inside the Family Steward hub (no longer a top-level
    // header pill), so open the hub first.
    await user.click(
      await screen.findByRole("button", { name: "Family Steward" }),
    );

    const badge = await screen.findByTestId("pending_contributions_badge");
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAttribute("aria-label", "3 pending contributions");
  });

  it("hides the badge for a steward when there are no pending items", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setPendingCount(0n);
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Family Steward" }),
    );

    // The Pending Contributions option is present, but no badge pill is shown.
    expect(
      await screen.findByRole("button", { name: /Pending Contributions/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("pending_contributions_badge"),
    ).not.toBeInTheDocument();
  });

  it("never shows the badge for a signed-in non-steward member", async () => {
    setAuthenticated(true);
    setAdmin(false);
    setPendingCount(5n);
    renderApp();

    expect(
      screen.queryByRole("button", { name: "Pending Contributions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("pending_contributions_badge"),
    ).not.toBeInTheDocument();
  });

  it("updates the badge from the backend count and hides it at zero after a decrement", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setPendingCount(3n);
    const queryClient = renderApp();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Family Steward" }),
    );

    // The badge reflects the backend's aggregate pending count.
    const badge = await screen.findByTestId("pending_contributions_badge");
    expect(badge).toHaveTextContent("3");

    // Simulate a steward Approve/Reject decrementing the backend pending count
    // to zero. The badge derives from backend state, so after the query
    // refetches it reflects the new count and hides at zero.
    setPendingCount(0n);
    await queryClient.invalidateQueries({
      queryKey: ["pendingContributionsCount"],
    });

    await waitFor(() =>
      expect(
        screen.queryByTestId("pending_contributions_badge"),
      ).not.toBeInTheDocument(),
    );
    // The Pending Contributions option remains, but the badge pill is gone.
    expect(
      screen.getByRole("button", { name: /Pending Contributions/ }),
    ).toBeInTheDocument();
  });

  it("reflects an incremented backend count after a submission", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setPendingCount(1n);
    const queryClient = renderApp();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Family Steward" }),
    );

    const badge = await screen.findByTestId("pending_contributions_badge");
    expect(badge).toHaveTextContent("1");

    // A new submission increments the backend pending count; the badge updates
    // to match on refetch (persisting across navigation/refresh because it is
    // always derived from the backend).
    setPendingCount(4n);
    await queryClient.invalidateQueries({
      queryKey: ["pendingContributionsCount"],
    });

    await waitFor(() => expect(badge).toHaveTextContent("4"));
  });
});
