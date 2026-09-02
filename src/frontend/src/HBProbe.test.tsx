import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

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

async function openExplore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function tap(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole("button", { name }));
}

describe("probe", () => {
  it("navigates to Harvey profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExplore(user);
    await tap(user, /Clayton Norwood Child/);
    await tap(user, /Lula Mae Norwood Child/);
    await tap(user, /Versie Smith Spouse/);
    await tap(user, /Gertrude Adams-Hill Mother/);
    await tap(user, /Harvey Adams Sr\. Father/);
    expect(screen.getByText("Harvey Adams Sr.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Harvey Adams Sr.",
    );
  });

  it("navigates to Erma profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExplore(user);
    await tap(user, /Clayton Norwood Child/);
    await tap(user, /Erma T\. Williams Spouse/);
    expect(screen.getByText("Erma T. Williams")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Erma T. Williams",
    );
  });

  it("navigates to Elbert profile", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExplore(user);
    await tap(user, /Clayton Norwood Child/);
    await tap(user, /Elbert Norwood Child/);
    expect(screen.getByText("Elbert Norwood")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Elbert Norwood",
    );
  });
});
