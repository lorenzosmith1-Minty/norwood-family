import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonProfilePage, juliaProfile } from "./pages/PersonProfilePage";

// PersonProfilePage renders the PhotosSection, whose hooks call useActor from
// @caffeineai/core-infrastructure. The real useActor requires an
// InternetIdentityProvider, so these direct-render tests stub the provider seam
// with a minimal actor exposing the photo methods (never reached because the
// gallery starts empty).
const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
  };
  return { mockActor };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

// PersonProfilePage's photo hooks use useQuery, so every render must be wrapped
// in a QueryClientProvider.
function renderProfile(person = juliaProfile) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={person}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

// Characterization baseline for the Person Profile template. The redesign
// replaces the multi-generation Family Tree and the Heritage Branch anchor
// navigator, but the profile page itself is not part of that change — profiles
// must keep rendering their full template (facts, story, family, timeline,
// sources, completeness) no matter how a user navigates to them. These tests
// render PersonProfilePage directly so they protect the template independent of
// the tree/branch navigation that will intentionally change.
describe("Person Profile template characterization", () => {
  it("renders the profile header with name, role, and portrait", () => {
    renderProfile();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Julia “Julie” Norwood",
    );
    expect(screen.getByText("Matriarch")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /representative vintage sepia/i }),
    ).toBeInTheDocument();
  });

  it("renders every recorded fact as a labeled value", () => {
    renderProfile();

    // The facts live in the profile header's <dl>; "Born" also appears as a
    // timeline entry title, so scope the query to the facts list.
    const factsList = document.querySelector(
      "header dl.mt-6",
    ) as HTMLDListElement;
    expect(factsList).not.toBeNull();
    for (const [label, value] of [
      ["Born", "approx. 1860"],
      ["Died", "June 19, 1936"],
      ["Location", "Mississippi"],
      ["Husband", "Isaiah Norwood"],
      ["Evidence status", "Mixed"],
    ]) {
      const dt = within(factsList).getByText(label);
      expect(dt).toBeInTheDocument();
      expect(dt.nextElementSibling).toHaveTextContent(value);
    }
  });

  it("renders the story, family, timeline, and sources sections", () => {
    renderProfile();

    expect(
      screen.getByRole("region", { name: "Her Story" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Family" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Timeline" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sources" })).toBeInTheDocument();
  });

  it("renders the family spouse and children text", () => {
    renderProfile();

    const family = screen.getByRole("region", { name: "Family" });
    expect(within(family).getByText("Isaiah Norwood")).toBeInTheDocument();
    expect(within(family).getByText("Husband")).toBeInTheDocument();
    expect(
      within(family).getByText(/Julia and Isaiah raised eight children/),
    ).toBeInTheDocument();
  });

  it("renders the timeline entries in order", () => {
    renderProfile();

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const entries = within(timeline).getAllByRole("listitem");
    expect(entries).toHaveLength(4);
    expect(entries[0]).toHaveTextContent("c. 1860");
    expect(entries[0]).toHaveTextContent("Born");
    expect(entries[3]).toHaveTextContent("June 19, 1936");
    expect(entries[3]).toHaveTextContent("Died");
  });

  it("labels documented sources as documented records", () => {
    renderProfile();

    const sources = screen.getByRole("region", { name: "Sources" });
    expect(within(sources).getByText("1880 U.S. Census")).toBeInTheDocument();
    expect(within(sources).getAllByText("Documented record")).toHaveLength(2);
    expect(
      within(sources).getByText("Family-history note"),
    ).toBeInTheDocument();
  });

  it("computes a complete profile as 100%", () => {
    renderProfile();

    const container = document.querySelector(
      '[data-ocid="profile.completeness"]',
    );
    const pill = container?.querySelector(".completeness-pill");
    expect(pill?.textContent).toBe("100%");
  });
});
