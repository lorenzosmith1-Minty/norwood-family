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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function tapRelative(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("button", { name }));
}

// Cover for the restored mobile-friendly Explore Family layout's spouse and
// children sections. The accepted layout keeps the spouse(s) beside the focus
// card in the center band (multiple spouses stack in the spouse column) and
// renders Children BELOW the Siblings section as a wrapping row. These tests
// assert the two observable seams the surrounding covers do not pin down
// directly: that multiple recorded spouses render together in the same spouse
// stack, and that the Children zone uses the wrapping ex-children-row class so
// child cards wrap naturally into rows on mobile with no horizontal scrolling.
describe("Explore Family spouse and children sections cover", () => {
  async function focusClayton(user: ReturnType<typeof userEvent.setup>) {
    renderApp();
    await openExploreFamily(user);
    // Julia -> Clayton Norwood, who has two recorded spouses (Ms. Hudson and
    // Erma T. Williams) and many children.
    await tapRelative(user, /Clayton Norwood Child/);
  }

  it("renders multiple recorded spouses together in the spouse stack beside the focus card", async () => {
    const user = userEvent.setup();
    await focusClayton(user);

    // Clayton has two recorded spouses. Both render as half-size spouse cards
    // inside the same spouse stack, which sits in the center band immediately
    // left of the focus card.
    const spouseStack = screen.getByTestId("explore.zone.spouse");
    const firstSpouse = within(spouseStack).getByRole("button", {
      name: /Ms\. Hudson Spouse/,
    });
    const secondSpouse = within(spouseStack).getByRole("button", {
      name: /Erma T\. Williams Spouse/,
    });
    expect(firstSpouse.className).toContain("ex-spouse-half");
    expect(secondSpouse.className).toContain("ex-spouse-half");

    // Both spouses are direct children of the same spouse stack, so multiple
    // spouses stack together in the column beside the focus card.
    expect(spouseStack.contains(firstSpouse)).toBe(true);
    expect(spouseStack.contains(secondSpouse)).toBe(true);

    // The spouse stack precedes the focus card in the center band (to its left).
    const focusCard = screen.getByTestId("explore.focus.1");
    expect(
      spouseStack.compareDocumentPosition(focusCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the Children zone below the Siblings section as a wrapping row", async () => {
    const user = userEvent.setup();
    await focusClayton(user);

    // The Children zone carries the wrapping ex-children-row class, so child
    // cards wrap naturally into rows on mobile with no horizontal scrolling.
    const childrenZone = screen.getByTestId("explore.zone.children");
    const row = childrenZone.querySelector(".ex-children-row");
    expect(row).not.toBeNull();
    expect((row as HTMLElement).className).toContain("ex-children-row");

    // Children render below the Siblings section in the vertical stack.
    const siblingsZone = screen.getByTestId("explore.zone.siblings");
    expect(
      siblingsZone.compareDocumentPosition(childrenZone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // A documented child renders as a compact relative card in the Children row.
    const childCard = within(childrenZone).getByRole("button", {
      name: /Elbert Norwood Child/,
    });
    expect(childCard.className).toContain("ex-relative-card");
  });
});
