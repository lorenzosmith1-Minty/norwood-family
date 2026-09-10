import "@testing-library/jest-dom/vitest";
import type { Story } from "@/types/family-history";
import { EvidenceStatus } from "@/types/family-history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryContributionForm } from "./components/StoryContributionForm";
import { profiles } from "./pages/PersonProfilePage";

// The form's hooks call useActor from @caffeineai/core-infrastructure. Stub the
// provider seam with a minimal actor so the archive query resolves to an empty
// list and the story mutations are no-ops; the Related Family Members chips do
// not depend on any backend data, only on the static `profiles` record.
const { mockActor } = vi.hoisted(() => {
  const mockActor = {
    async listApprovedArchiveItems() {
      return [];
    },
    async submitStory() {
      return null;
    },
    async addCanonicalStory() {
      return null;
    },
    async updateCanonicalStory() {
      return null;
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

afterEach(cleanup);

function renderForm(
  props: {
    isSteward?: boolean;
    initialStory?: Parameters<typeof StoryContributionForm>[0]["initialStory"];
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StoryContributionForm
        onClose={() => {}}
        isSteward={props.isSteward ?? false}
        initialStory={props.initialStory}
      />
    </QueryClientProvider>,
  );
}

/** Returns the member chip button for a given profile id. */
function memberChip(personId: string) {
  return screen.getByRole("button", {
    name: profiles[personId].name,
  });
}

describe("StoryContributionForm Related Family Members chips", () => {
  it("renders a chip for every family member profile", () => {
    renderForm();

    for (const personId of Object.keys(profiles)) {
      expect(memberChip(personId)).toBeInTheDocument();
    }
  });

  it("starts with no member selected when adding a new story", () => {
    renderForm();

    for (const personId of Object.keys(profiles)) {
      expect(memberChip(personId)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("selects a member chip on tap and deselects it on a second tap", async () => {
    const user = userEvent.setup();
    renderForm();

    const julia = memberChip("julia");
    expect(julia).toHaveAttribute("aria-pressed", "false");

    await user.click(julia);
    expect(julia).toHaveAttribute("aria-pressed", "true");

    await user.click(julia);
    expect(julia).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps multiple members selected at the same time", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(memberChip("julia"));
    await user.click(memberChip("clayton"));
    await user.click(memberChip("isaiah"));

    expect(memberChip("julia")).toHaveAttribute("aria-pressed", "true");
    expect(memberChip("clayton")).toHaveAttribute("aria-pressed", "true");
    expect(memberChip("isaiah")).toHaveAttribute("aria-pressed", "true");
    // An unselected member stays unselected.
    expect(memberChip("erma")).toHaveAttribute("aria-pressed", "false");
  });

  it("deselecting one member leaves the others selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(memberChip("julia"));
    await user.click(memberChip("clayton"));
    await user.click(memberChip("julia"));

    expect(memberChip("julia")).toHaveAttribute("aria-pressed", "false");
    expect(memberChip("clayton")).toHaveAttribute("aria-pressed", "true");
  });

  it("loads previously linked members already highlighted when editing a story", () => {
    const initialStory: Story = {
      id: 1n,
      title: "A family story",
      storyText: "The story text.",
      relatedMemberIds: ["julia", "clayton"],
      era: "1920s",
      year: 1920n,
      location: "Mississippi",
      evidenceStatus: EvidenceStatus.FamilyHistory,
      relatedArchiveItemIds: [],
      status: "Approved",
      createdAt: 1_700_000_000_000_000_000n,
      updatedAt: 1_700_000_000_000_000_000n,
      contributor: "aaaaa-aa" as unknown as Story["contributor"],
    };

    renderForm({ isSteward: true, initialStory });

    expect(memberChip("julia")).toHaveAttribute("aria-pressed", "true");
    expect(memberChip("clayton")).toHaveAttribute("aria-pressed", "true");
    // Members not linked to the story load unselected.
    expect(memberChip("isaiah")).toHaveAttribute("aria-pressed", "false");
  });
});
