import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the "Pending Contributions" admin nav button
// that the upcoming Pending Contributions badge build must NOT break.
//
// The upcoming build adds a numeric badge to this button counting all current
// pending review items. That badge is the intentional change; this baseline
// deliberately does NOT assert anything about a badge. Instead it freezes the
// button's accessible structure and behavior that must survive the badge work:
//
//  1. The button is a real <button> (not a link) with the exact name
//     "Pending Contributions".
//  2. It is gated to an authenticated Family Steward (admin) and hidden from a
//     signed-in normal member.
//  3. Clicking it opens the Pending Contributions review page.
//
// The badge build will modify this exact button, so protecting its role, name,
// gating, and navigation here catches a regression (e.g. the badge work turning
// the button into a link, renaming it, or breaking its onClick) before it ships.
import { Principal } from "@icp-sdk/core/principal";

const ACCOUNT = "2vxsx-fae";

const { mockActor, getAuthenticated, setAuthenticated, setAdmin } = vi.hoisted(
  () => {
    let isAuthenticated = false;
    let isAdmin = false;
    const mockActor = {
      async isCallerAdmin(): Promise<boolean> {
        return isAdmin;
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
    };
  },
);

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

describe("Pending Contributions admin button characterization", () => {
  it("renders as a real button named 'Pending Contributions' for a steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    renderApp();

    // Pending Contributions is now reached through the Family Steward hub.
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Family Steward" }));
    const button = await screen.findByRole("button", {
      name: /Pending Contributions/,
    });
    // It is a button, not a link to a destination screen.
    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toHaveAttribute("href");
  });

  it("is hidden from a signed-in normal member", () => {
    setAuthenticated(true);
    setAdmin(false);
    renderApp();

    expect(
      screen.queryByRole("button", { name: "Pending Contributions" }),
    ).not.toBeInTheDocument();
  });

  it("opens the Pending Contributions review page when clicked", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    // Navigate through the Family Steward hub to the Pending Contributions
    // option, then open the review page.
    await user.click(
      await screen.findByRole("button", { name: "Family Steward" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Pending Contributions/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Pending Contributions" }),
    ).toBeInTheDocument();
  });
});
