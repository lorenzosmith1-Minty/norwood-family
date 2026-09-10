import "@testing-library/jest-dom/vitest";
import {
  type EvidenceStatus,
  EvidenceStatus as EvidenceStatusEnum,
  type Mystery,
  type MysteryContribution,
  type MysteryContributionType,
  MysteryContributionType as MysteryContributionTypeEnum,
  type MysteryStatus,
  MysteryStatus as MysteryStatusEnum,
  type Story,
  type TimelineEvent,
  type TimelineEventType,
  TimelineEventType as TimelineEventTypeEnum,
  type TimelineLinkTarget,
} from "@/backend";
import type { StoryStatus } from "@/types/family-history";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const CONTRIBUTOR = Principal.fromText("aaaaa-aa");

// A stateful in-memory actor standing in for the real backend so the Family
// Stories / Family Mysteries / Travel Through Time journeys can be exercised
// without a canister. It implements the family-history methods the app's hooks
// call, plus the profile/photo seams used by PersonLink and the navbar.
const {
  mockActor,
  resetState,
  setAdmin,
  setAuthenticated,
  getAuthenticated,
  seedStory,
  seedMystery,
  seedTimelineEvent,
} = vi.hoisted(() => {
  let isAdmin = false;
  let isAuthenticated = false;
  let stories: Story[] = [];
  let mysteries: Mystery[] = [];
  let contributions: MysteryContribution[] = [];
  let timelineEvents: TimelineEvent[] = [];
  let nextStoryId = 0n;
  let nextMysteryId = 0n;
  let nextContributionId = 0n;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getMyProfile() {
      return null;
    },
    async getPersonProfile(_personId: string) {
      return null;
    },
    async getProfilePhoto(_personId: string) {
      return null;
    },
    async listApprovedStories(): Promise<Story[]> {
      return stories.filter((s) => s.status === "Approved");
    },
    async listPendingStories(): Promise<Story[]> {
      return stories.filter((s) => s.status === "Pending");
    },
    async submitStory(
      title: string,
      storyText: string,
      relatedMemberIds: string[],
      era: string | null,
      year: bigint | null,
      location: string | null,
      evidenceStatus: EvidenceStatus,
      relatedArchiveItemIds: bigint[],
    ): Promise<Story> {
      const story: Story = {
        id: nextStoryId++,
        title,
        storyText,
        relatedMemberIds,
        era: era ?? undefined,
        year: year ?? undefined,
        location: location ?? undefined,
        contributor: CONTRIBUTOR,
        evidenceStatus,
        relatedArchiveItemIds,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
        status: "Pending",
      };
      stories = [...stories, story];
      return story;
    },
    async addCanonicalStory(
      title: string,
      storyText: string,
      relatedMemberIds: string[],
      era: string | null,
      year: bigint | null,
      location: string | null,
      evidenceStatus: EvidenceStatus,
      relatedArchiveItemIds: bigint[],
    ): Promise<Story> {
      const story: Story = {
        id: nextStoryId++,
        title,
        storyText,
        relatedMemberIds,
        era: era ?? undefined,
        year: year ?? undefined,
        location: location ?? undefined,
        contributor: CONTRIBUTOR,
        evidenceStatus,
        relatedArchiveItemIds,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
        status: "Approved",
      };
      stories = [...stories, story];
      return story;
    },
    async updateCanonicalStory(
      id: bigint,
      title: string,
      storyText: string,
      relatedMemberIds: string[],
      era: string | null,
      year: bigint | null,
      location: string | null,
      evidenceStatus: EvidenceStatus,
      relatedArchiveItemIds: bigint[],
    ): Promise<Story | null> {
      const found = stories.find((s) => s.id === id);
      if (!found) return null;
      const updated: Story = {
        ...found,
        title,
        storyText,
        relatedMemberIds,
        era: era ?? undefined,
        year: year ?? undefined,
        location: location ?? undefined,
        evidenceStatus,
        relatedArchiveItemIds,
        updatedAt: 1_700_000_000_000_000_000n,
      };
      stories = stories.map((s) => (s.id === id ? updated : s));
      return updated;
    },
    async approveStory(id: bigint): Promise<Story | null> {
      const found = stories.find((s) => s.id === id && s.status === "Pending");
      if (!found) return null;
      const updated: Story = { ...found, status: "Approved" };
      stories = stories.map((s) => (s.id === id ? updated : s));
      return updated;
    },
    async rejectStory(id: bigint): Promise<Story | null> {
      const found = stories.find((s) => s.id === id && s.status === "Pending");
      if (!found) return null;
      const updated: Story = { ...found, status: "Rejected" };
      stories = stories.map((s) => (s.id === id ? updated : s));
      return updated;
    },
    async listMysteries(): Promise<Mystery[]> {
      return mysteries;
    },
    async createCanonicalMystery(
      title: string,
      description: string,
      relatedMemberIds: string[],
      relatedBranchId: string | null,
      knownFacts: string[],
      possibilities: string[],
      relatedSourceIds: bigint[],
      relatedArchiveItemIds: bigint[],
      status: MysteryStatus,
    ): Promise<Mystery> {
      const mystery: Mystery = {
        id: nextMysteryId++,
        title,
        description,
        relatedMemberIds,
        relatedBranchId: relatedBranchId ?? undefined,
        knownFacts,
        possibilities,
        relatedSourceIds,
        relatedArchiveItemIds,
        status,
        contributor: CONTRIBUTOR,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
        resolution: undefined,
      };
      mysteries = [...mysteries, mystery];
      return mystery;
    },
    async updateCanonicalMystery(
      id: bigint,
      title: string,
      description: string,
      relatedMemberIds: string[],
      relatedBranchId: string | null,
      knownFacts: string[],
      possibilities: string[],
      relatedSourceIds: bigint[],
      relatedArchiveItemIds: bigint[],
      status: MysteryStatus,
    ): Promise<Mystery | null> {
      const found = mysteries.find((m) => m.id === id);
      if (!found) return null;
      const updated: Mystery = {
        ...found,
        title,
        description,
        relatedMemberIds,
        relatedBranchId: relatedBranchId ?? undefined,
        knownFacts,
        possibilities,
        relatedSourceIds,
        relatedArchiveItemIds,
        status,
        updatedAt: 1_700_000_000_000_000_000n,
      };
      mysteries = mysteries.map((m) => (m.id === id ? updated : m));
      return updated;
    },
    async markMysteryResolved(
      id: bigint,
      summary: string,
      supportingEvidence: string[],
    ): Promise<Mystery | null> {
      const found = mysteries.find((m) => m.id === id);
      if (!found) return null;
      const updated: Mystery = {
        ...found,
        status: MysteryStatusEnum.Resolved,
        resolution: {
          summary,
          supportingEvidence,
          resolvedAt: 1_700_000_000_000_000_000n,
          resolvedBy: CONTRIBUTOR,
        },
        updatedAt: 1_700_000_000_000_000_000n,
      };
      mysteries = mysteries.map((m) => (m.id === id ? updated : m));
      return updated;
    },
    async submitMysteryContribution(
      mysteryId: bigint,
      contributionType: MysteryContributionType,
      text: string,
    ): Promise<MysteryContribution> {
      const contribution: MysteryContribution = {
        id: nextContributionId++,
        mysteryId,
        contributionType,
        text,
        contributor: CONTRIBUTOR,
        status: "Pending",
        createdAt: 1_700_000_000_000_000_000n,
        reviewedBy: undefined,
        reviewedAt: undefined,
      };
      contributions = [...contributions, contribution];
      return contribution;
    },
    async listPendingMysteryContributions(): Promise<MysteryContribution[]> {
      return contributions.filter((c) => c.status === "Pending");
    },
    async reviewMysteryContribution(
      id: bigint,
      approve: boolean,
    ): Promise<MysteryContribution | null> {
      const found = contributions.find(
        (c) => c.id === id && c.status === "Pending",
      );
      if (!found) return null;
      const updated: MysteryContribution = {
        ...found,
        status: approve ? "Approved" : "Rejected",
        reviewedBy: CONTRIBUTOR,
        reviewedAt: 1_700_000_000_000_000_000n,
      };
      contributions = contributions.map((c) => (c.id === id ? updated : c));
      return updated;
    },
    async listTimelineEvents(): Promise<TimelineEvent[]> {
      return timelineEvents;
    },
    async listApprovedArchiveItems() {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAdmin = false;
      isAuthenticated = false;
      stories = [];
      mysteries = [];
      contributions = [];
      timelineEvents = [];
      nextStoryId = 0n;
      nextMysteryId = 0n;
      nextContributionId = 0n;
    },
    setAdmin: (value: boolean) => {
      isAdmin = value;
    },
    setAuthenticated: (value: boolean) => {
      isAuthenticated = value;
    },
    getAuthenticated: () => isAuthenticated,
    seedStory: (story: Story) => {
      stories = [...stories, story];
    },
    seedMystery: (mystery: Mystery) => {
      mysteries = [...mysteries, mystery];
    },
    seedTimelineEvent: (event: TimelineEvent) => {
      timelineEvents = [...timelineEvents, event];
    },
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// authentication state.
vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText("aaaaa-aa") }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetState);

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

/**
 * Clicks a Home-screen navigation card. The Home nav cards live inside a
 * <nav aria-label="Family history sections">, which is distinct from the
 * header nav links that share the same accessible names (e.g. "Family
 * Stories" appears both as a header nav link and as a Home card). Scoping to
 * the Home nav container disambiguates the two.
 */
async function clickHomeNav(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const homeNav = screen.getByRole("navigation", {
    name: "Family history sections",
  });
  await user.click(within(homeNav).getByRole("button", { name }));
}

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 1n,
    title: "The family farm",
    storyText: "How the farm came to be.",
    relatedMemberIds: ["julia"],
    era: "early 1900s",
    year: 1910n,
    location: "Ohio",
    contributor: CONTRIBUTOR,
    evidenceStatus: EvidenceStatusEnum.FamilyHistory,
    relatedArchiveItemIds: [],
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    status: "Approved",
    ...overrides,
  };
}

function makeMystery(overrides: Partial<Mystery> = {}): Mystery {
  return {
    id: 1n,
    title: "Who was the first Norwood?",
    description: "We are still researching the family's origins.",
    relatedMemberIds: ["julia"],
    relatedBranchId: undefined,
    knownFacts: ["The family settled in Ohio in the 1800s."],
    possibilities: ["They may have come from Virginia."],
    relatedSourceIds: [],
    relatedArchiveItemIds: [],
    status: MysteryStatusEnum.Open,
    contributor: CONTRIBUTOR,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    resolution: undefined,
    ...overrides,
  };
}

function makeTimelineEvent(
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    id: "story-1",
    eventType: TimelineEventTypeEnum.Story,
    title: "The family farm",
    description: "How the farm came to be.",
    era: "early 1900s",
    year: 1910n,
    evidenceStatus: EvidenceStatusEnum.FamilyHistory,
    linkTarget: { __kind__: "Story", Story: 1n } as TimelineLinkTarget,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Home routing of the three new destination buttons.
// ---------------------------------------------------------------------------

describe("Home routing to the family-history pages", () => {
  it("routes 'Family Stories' to the Stories page", async () => {
    const user = userEvent.setup();
    renderApp();

    // The home nav card (home.nav_button.4) is distinct from the header nav
    // link (layout.stories_link), so target it by its data-ocid.
    await user.click(screen.getByTestId("home.nav_button.4"));

    expect(
      screen.getByRole("heading", { name: "Family Stories" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The moments and memories that shaped our family."),
    ).toBeInTheDocument();
  });

  it("routes 'Family Mysteries' to the Mysteries page", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId("home.nav_button.5"));

    expect(
      screen.getByRole("heading", { name: "Family Mysteries" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The questions we are still working to answer."),
    ).toBeInTheDocument();
  });

  it("routes 'Travel Through Time' to the Timeline page", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId("home.nav_button.3"));

    expect(
      screen.getByRole("heading", { name: "Travel Through Time" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Our family's journey across the years."),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Family Stories page.
// ---------------------------------------------------------------------------

describe("Family Stories page", () => {
  it("lists approved stories with evidence badges and opens the detail view", async () => {
    seedStory(makeStory({ id: 1n, title: "The family farm" }));
    seedStory(
      makeStory({
        id: 2n,
        title: "Grandma's recipe",
        evidenceStatus: EvidenceStatusEnum.Documented,
      }),
    );
    // A pending story must never appear in the public browse list.
    seedStory(
      makeStory({
        id: 3n,
        title: "Not yet approved",
        status: "Pending" as StoryStatus,
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("home.nav_button.4"));

    expect(screen.getByText("The family farm")).toBeInTheDocument();
    expect(screen.getByText("Grandma's recipe")).toBeInTheDocument();
    expect(screen.queryByText("Not yet approved")).not.toBeInTheDocument();
    // Evidence badges render for each story.
    expect(screen.getAllByTestId("evidence_badge").length).toBeGreaterThan(0);

    // Open the detail view for the documented story.
    await user.click(screen.getByRole("button", { name: "Grandma's recipe" }));
    expect(
      screen.getByRole("heading", { name: "Grandma's recipe" }),
    ).toBeInTheDocument();
    // The detail view shows the Documented evidence badge (rendered in the
    // header and the evidence legend) plus its supporting note.
    expect(screen.getAllByText("Documented").length).toBeGreaterThan(0);
    expect(screen.getByText("Supported by records.")).toBeInTheDocument();
  });

  it("filters stories by evidence status", async () => {
    seedStory(
      makeStory({
        id: 1n,
        title: "Documented story",
        evidenceStatus: EvidenceStatusEnum.Documented,
      }),
    );
    seedStory(
      makeStory({
        id: 2n,
        title: "Memory story",
        evidenceStatus: EvidenceStatusEnum.PersonalMemory,
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Stories");

    // Filter to Documented only.
    await user.selectOptions(
      screen.getByLabelText("Filter by evidence status"),
      EvidenceStatusEnum.Documented,
    );

    expect(screen.getByText("Documented story")).toBeInTheDocument();
    expect(screen.queryByText("Memory story")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no approved stories", async () => {
    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Stories");

    expect(
      screen.getByRole("heading", { name: "No stories yet" }),
    ).toBeInTheDocument();
  });

  it("lets a steward approve a pending story, moving it into the public list", async () => {
    setAuthenticated(true);
    setAdmin(true);
    seedStory(
      makeStory({
        id: 1n,
        title: "Awaiting review",
        status: "Pending" as StoryStatus,
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Stories");

    // The pending story is listed in the steward controls, not the public list.
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Pending review (1)")).toBeInTheDocument();

    await user.click(screen.getByTestId("stories.pending.approve.1"));

    // After approval the story joins the approved list.
    expect(await screen.findByTestId("stories.list")).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    expect(screen.queryByText("Pending review (1)")).not.toBeInTheDocument();
  });

  it("hides steward controls from a non-steward", async () => {
    setAuthenticated(true);
    setAdmin(false);
    seedStory(
      makeStory({
        id: 1n,
        title: "Awaiting review",
        status: "Pending" as StoryStatus,
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Stories");

    expect(screen.queryByText("Steward controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Awaiting review")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Family Mysteries page.
// ---------------------------------------------------------------------------

describe("Family Mysteries page", () => {
  it("lists mysteries with status badges and filters by status", async () => {
    seedMystery(
      makeMystery({
        id: 1n,
        title: "Open mystery",
        status: MysteryStatusEnum.Open,
      }),
    );
    seedMystery(
      makeMystery({
        id: 2n,
        title: "Resolved mystery",
        status: MysteryStatusEnum.Resolved,
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Mysteries");

    expect(screen.getByText("Open mystery")).toBeInTheDocument();
    expect(screen.getByText("Resolved mystery")).toBeInTheDocument();
    // Each mystery card shows its status badge (distinct from the filter tabs,
    // which reuse the same status labels).
    const statusBadges = screen.getAllByTestId("mystery.status_badge");
    expect(statusBadges.map((badge) => badge.textContent)).toEqual(
      expect.arrayContaining(["Open", "Resolved"]),
    );

    // Filter to Resolved only.
    await user.click(screen.getByRole("button", { name: "Resolved" }));
    expect(screen.getByText("Resolved mystery")).toBeInTheDocument();
    expect(screen.queryByText("Open mystery")).not.toBeInTheDocument();
  });

  it("separates KNOWN, POSSIBILITIES, and SOURCES in the detail view", async () => {
    seedMystery(
      makeMystery({
        id: 1n,
        title: "The first Norwood",
        knownFacts: ["Settled in Ohio in the 1800s."],
        possibilities: ["May have come from Virginia."],
        relatedSourceIds: [5n],
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Mysteries");
    await user.click(screen.getByRole("button", { name: "The first Norwood" }));

    // The three sections are visually distinct and labeled.
    expect(screen.getByTestId("mystery.known_section")).toBeInTheDocument();
    expect(
      screen.getByText("Settled in Ohio in the 1800s."),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("mystery.possibilities_section"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("May have come from Virginia."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mystery.sources_section")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
  });

  it("preserves the research trail when a mystery is resolved", async () => {
    seedMystery(
      makeMystery({
        id: 1n,
        title: "The first Norwood",
        knownFacts: ["Settled in Ohio in the 1800s."],
        possibilities: ["May have come from Virginia."],
        status: MysteryStatusEnum.Resolved,
        resolution: {
          summary: "Records show the family arrived in 1842.",
          supportingEvidence: ["1842 census record"],
          resolvedAt: 1_700_000_000_000_000_000n,
          resolvedBy: CONTRIBUTOR,
        },
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Mysteries");
    await user.click(screen.getByRole("button", { name: "The first Norwood" }));

    // The resolution summary is shown AND the prior theories are preserved.
    expect(
      screen.getByTestId("mystery.resolution_section"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Records show the family arrived in 1842."),
    ).toBeInTheDocument();
    expect(screen.getByText("1842 census record")).toBeInTheDocument();
    expect(
      screen.getByText("Settled in Ohio in the 1800s."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("May have come from Virginia."),
    ).toBeInTheDocument();
  });

  it("lets a signed-in member submit a contribution that enters pending review", async () => {
    setAuthenticated(true);
    seedMystery(makeMystery({ id: 1n, title: "The first Norwood" }));

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Mysteries");
    await user.click(screen.getByRole("button", { name: "The first Norwood" }));

    await user.click(
      screen.getByRole("button", {
        name: "Contribute a note, memory, lead, or source",
      }),
    );
    await user.type(
      screen.getByLabelText("Your contribution"),
      "I remember hearing they came from Virginia.",
    );
    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(
      await screen.findByRole("heading", { name: "Contribution submitted" }),
    ).toBeInTheDocument();
    const pending = await mockActor.listPendingMysteryContributions();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      mysteryId: 1n,
      text: "I remember hearing they came from Virginia.",
      status: "Pending",
    });
  });

  it("lets a steward create a canonical mystery", async () => {
    setAuthenticated(true);
    setAdmin(true);

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Family Mysteries");

    await user.click(screen.getByTestId("mysteries.create_button"));
    await user.type(
      screen.getByTestId("mysteries.create_title_input"),
      "Where did the family originate?",
    );
    await user.type(
      screen.getByTestId("mysteries.create_known_input"),
      "Settled in Ohio.",
    );
    await user.click(screen.getByTestId("mysteries.create_submit_button"));

    const mysteries = await mockActor.listMysteries();
    expect(mysteries).toHaveLength(1);
    expect(mysteries[0]).toMatchObject({
      title: "Where did the family originate?",
      knownFacts: ["Settled in Ohio."],
      status: MysteryStatusEnum.Open,
    });
  });
});

// ---------------------------------------------------------------------------
// Travel Through Time page.
// ---------------------------------------------------------------------------

describe("Travel Through Time page", () => {
  it("groups events into eras and only renders eras that contain data", async () => {
    seedTimelineEvent(
      makeTimelineEvent({
        id: "story-1",
        title: "The family farm",
        year: 1910n,
        era: "early 1900s",
      }),
    );
    seedTimelineEvent(
      makeTimelineEvent({
        id: "story-2",
        title: "Modern reunion",
        year: 2005n,
        era: "modern",
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Travel Through Time");

    // Both events render under their era headings.
    expect(screen.getByText("The family farm")).toBeInTheDocument();
    expect(screen.getByText("Modern reunion")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Early 1900s" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Modern Era" }),
    ).toBeInTheDocument();
    // An era with no events is never fabricated.
    expect(
      screen.queryByRole("heading", { name: "The 1800s" }),
    ).not.toBeInTheDocument();
  });

  it("renders a story link target as a View Story button", async () => {
    seedTimelineEvent(
      makeTimelineEvent({
        id: "story-1",
        title: "The family farm",
        linkTarget: { __kind__: "Story", Story: 1n } as TimelineLinkTarget,
      }),
    );

    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Travel Through Time");

    expect(screen.getByText("The family farm")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View Story" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no timeline events", async () => {
    const user = userEvent.setup();
    renderApp();
    await clickHomeNav(user, "Travel Through Time");

    expect(
      screen.getByRole("heading", { name: "Your timeline is just beginning" }),
    ).toBeInTheDocument();
  });
});
