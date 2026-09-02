import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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

async function openVersieProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
  // Recenter through the Explore Family focused navigator to Versie Smith.
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
  );
  await user.click(screen.getByRole("button", { name: /Versie Smith Spouse/ }));
  await user.click(screen.getByRole("button", { name: "View Profile" }));
}

// Characterization baseline for the verification request: Versie Smith's profile
// must use male pronouns (he/him/his) throughout with no incorrect she/her
// references, and his relationship labels must read "Husband of Lula Mae
// Norwood" and "Son of Gertrude Adams-Hill". This protects the working behavior
// that must remain unchanged.
describe("Versie Smith characterization: male pronouns and relationship labels", () => {
  it("labels Versie as Husband of Lula Mae Norwood and Son of Gertrude Adams-Hill", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVersieProfile(user);

    // The header role reads "Husband of Lula Mae Norwood".
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Versie Smith",
    );
    expect(screen.getByText("Husband of Lula Mae Norwood")).toBeInTheDocument();

    // The story names him as the son of Gertrude Adams-Hill.
    const story = screen.getByRole("region", { name: "His Story" });
    expect(story).toHaveTextContent("son of Gertrude Adams-Hill");

    // The Family section names his mother Gertrude Adams-Hill.
    const family = screen.getByRole("region", { name: "Family" });
    expect(family).toHaveTextContent("Gertrude Adams-Hill");
  });

  it("uses male pronouns (he/him/his) throughout the story with no she/her references", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVersieProfile(user);

    const story = screen.getByRole("region", { name: "His Story" });
    const storyText = story.textContent ?? "";

    // The story is told with male pronouns.
    expect(storyText).toMatch(/\bHe\b/);
    expect(storyText).toMatch(/\bhis\b/);

    // No female pronoun refers to Versie anywhere in the story.
    expect(storyText).not.toMatch(/\bshe\b/i);
    expect(storyText).not.toMatch(/\bher\b/i);
  });

  it("uses male pronouns in the timeline and family narrative with no she/her references", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVersieProfile(user);

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const timelineText = timeline.textContent ?? "";
    expect(timelineText).toMatch(/\bhis\b/);
    expect(timelineText).not.toMatch(/\bshe\b/i);
    expect(timelineText).not.toMatch(/\bher\b/i);

    const family = screen.getByRole("region", { name: "Family" });
    const familyText = family.textContent ?? "";
    expect(familyText).toMatch(/\bHis\b/);
    expect(familyText).not.toMatch(/\bshe\b/i);
    expect(familyText).not.toMatch(/\bher\b/i);
  });

  it("labels the story section 'His Story' (not 'Her Story')", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVersieProfile(user);

    expect(
      screen.getByRole("region", { name: "His Story" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Her Story" }),
    ).not.toBeInTheDocument();
  });
});
