import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddMyselfPage } from "./pages/AddMyselfPage";

// Characterization baseline for the Add Myself possible-match card structure
// that the name-normalization search change must NOT break.
//
// The upcoming build normalizes names before matching (case-insensitive,
// punctuation/period/space normalization, suffix variants, fuzzy matching) and
// makes the search query the authoritative shared family graph/profile data.
// This baseline freezes the match-card RENDERING contract that must survive
// that change:
//
//  1. A match card shows the person's Name.
//  2. A match card shows the person's Parents when known ("Child of X and Y").
//  3. Each match card offers "This is Me" and "None of these are me".
//
// It uses the real shared profiles record / family graph (Clayton Norwood, child
// of Julia and Isaiah) so the card structure is asserted against authoritative
// data, not a hand-built fixture.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async searchPossibleMatches(): Promise<
      { name: string; personId: string; parents: string[] }[]
    > {
      // The real backend search is not available in this test; the local match
      // builder (buildLocalMatches) queries the shared profiles record and
      // family graph, which is the authoritative data source under test.
      return [];
    },
  };
  return { mockActor };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Add Myself possible-match card structure characterization", () => {
  it("shows the matched person's name and parents on the match card", async () => {
    const user = userEvent.setup();
    renderPage();

    // Search for a real person in the shared profiles record.
    await user.type(screen.getByTestId("add_myself.name_input"), "Clayton");
    await user.click(screen.getByTestId("add_myself.search_button"));

    // The match card shows the person's name.
    expect(await screen.findByText("Clayton Norwood")).toBeInTheDocument();
    // The match card shows the person's parents when known (father first, then
    // mother, as recorded in the shared family graph).
    expect(
      screen.getByText("Child of Isaiah Norwood and Julia “Julie” Norwood"),
    ).toBeInTheDocument();
  });

  it("offers 'This is Me' and 'None of these are me' on each match card", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByTestId("add_myself.name_input"), "Clayton");
    await user.click(screen.getByTestId("add_myself.search_button"));

    // Every match card offers both choices. Searching "Clayton" can surface
    // more than one match, so assert at least one of each action is present.
    expect(
      (await screen.findAllByRole("button", { name: "This is Me" })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "None of these are me" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows 'No parents recorded' on a match card when parents are unknown", async () => {
    const user = userEvent.setup();
    renderPage();

    // Julia is the founding matriarch with no documented parents in the graph,
    // so her match card shows the no-parents fallback.
    await user.type(screen.getByTestId("add_myself.name_input"), "Julia");
    await user.click(screen.getByTestId("add_myself.search_button"));

    expect(
      await screen.findByText("Julia “Julie” Norwood"),
    ).toBeInTheDocument();
    expect(screen.getByText("No parents recorded")).toBeInTheDocument();
  });
});
