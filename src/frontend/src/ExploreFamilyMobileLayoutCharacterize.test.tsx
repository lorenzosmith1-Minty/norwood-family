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

// Characterization baseline for the mobile-first Explore Family layout. The
// accepted change moves the Siblings section from a right-side horizontal rail
// to a compact section BELOW the focus card that wraps into rows with no
// horizontal scrolling. That rail behavior is intentionally NOT frozen here.
// What must stay observable is the mobile-first constraint the change preserves:
// the page container stays bounded to the viewport width (no page-wide
// horizontal scrolling), and the Siblings zone still hides entirely when the
// focus person has no documented siblings (the same empty-zone hiding the other
// relationship zones use).
describe("Explore Family mobile-first layout characterization", () => {
  it("keeps the page container bounded to the viewport width with no page-wide horizontal scrolling", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // The page stage is the bounded mobile-first container. The CSS binds the
    // w-full max-w-md width constraint to the ex-stage semantic class (via
    // @apply), so the stage never exceeds the viewport width on a phone-sized
    // screen. This is the observable seam that keeps the page from widening.
    const stage = screen.getByTestId("explore.page");
    expect(stage.className).toContain("ex-stage");

    // The center band (spouse + focus + siblings) is the bounded flex row. The
    // CSS binds overflow-x-auto to the ex-center-band semantic class, so a wide
    // trio scrolls horizontally within its own area rather than widening the
    // page. This is the observable seam that prevents page-wide horizontal
    // scrolling.
    const focusCard = screen.getByTestId("explore.focus.1");
    const centerBand = focusCard.parentElement;
    expect(centerBand).not.toBeNull();
    expect(centerBand!.className).toContain("ex-center-band");
  });

  it("hides the Siblings zone entirely when the focus person has no documented siblings", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae -> Versie Smith (spouse). Versie Smith's
    // only parent is Gertrude Adams-Hill, who records exactly one child
    // (Versie), so Versie has no documented siblings.
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Versie Smith Spouse/);

    // Versie Smith is the focus.
    expect(screen.getByText("Versie Smith")).toBeInTheDocument();

    // No Siblings zone renders for a person with no documented siblings.
    expect(
      screen.queryByTestId("explore.zone.siblings"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Siblings")).not.toBeInTheDocument();

    // The rest of the layout still renders around him: his spouse above.
    expect(
      screen.getByRole("button", { name: /Lula Mae Norwood Spouse/ }),
    ).toBeInTheDocument();
  });

  it("still renders every documented sibling somewhere on the page when siblings exist", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);

    // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr. (six documented siblings).
    await tapRelative(user, /Clayton Norwood Child/);
    await tapRelative(user, /Lula Mae Norwood Child/);
    await tapRelative(user, /Lorenzo Smith Sr\. Child/);

    // All six siblings render as relative cards with the "Sibling" label. This
    // is the preserved data behavior: moving the section below the focus card
    // must not drop any sibling.
    for (const name of [
      "Versie Smith Jr.",
      "Herbert Smith",
      "Alonzo Smith",
      "Sherri Smith",
      "Beatrice Smith",
      "Ed Smith",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${name} Sibling`) }),
      ).toBeInTheDocument();
    }
  });
});
