import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  type FindingContent,
  FindingType,
  LivingStatus,
  type NewPersonCandidate,
  type Notification,
  NotificationType,
  type PersonProfile,
  type ProfileClaim,
  type ProposedFinding,
  type RelationshipProposal,
  type RelationshipRequest,
  type Report,
  type ResearchAuditEntry,
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";
import { NotificationsPage } from "./pages/NotificationsPage";

// Cover for the Research Intake review workflow change:
//
//  1. A pending Source appears in the Research Review Queue with type, title,
//     contributor, provenance, created date, and Approve/Reject/Needs Research
//     actions.
//  2. The Family Steward action badge aggregates pending research (pending +
//     needs-research) into the single steward counter.
//  3. Submitting a Source creates the 'awaiting Family Steward review'
//     notification; approving creates 'was approved'; rejecting creates 'was not
//     approved' — each without duplicates.
//  4. Approve/Reject/Needs Research transition the Source status and update the
//     queue/badge immediately (via query invalidation) without a refresh.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = Principal.fromText(ACCOUNT);

const {
  mockActor,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setSources,
  setReviewQueue,
  getApprovedSourceIds,
  getRejectedSourceIds,
  getNeedsResearchSourceIds,
  getNotifications,
  setNotifications,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  let notifications: Notification[] = [];
  let createdSources: Array<{
    title: string;
    sourceType: SourceType;
    description: string;
    archiveItemId: bigint | null;
  }> = [];
  let approvedSourceIds: bigint[] = [];
  let rejectedSourceIds: bigint[] = [];
  let needsResearchSourceIds: bigint[] = [];
  let nextSourceId = 1n;
  let nextNotifId = 1n;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    // Family Steward authority is the canonical gate; the platform admin role
    // is a separate concern. This mock drives both from the same flag.
    async isCallerSteward(): Promise<boolean> {
      return isAdmin;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return notifications;
    },
    async listSources(): Promise<SourceRecord[]> {
      return sources;
    },
    async getSource(id: bigint): Promise<SourceRecord | null> {
      return sources.find((s) => s.id === id) ?? null;
    },
    async createSource(
      title: string,
      sourceType: SourceType,
      description: string,
      archiveItemId: bigint | null,
    ): Promise<
      { __kind__: "ok"; ok: SourceRecord } | { __kind__: "err"; err: unknown }
    > {
      const record: SourceRecord = {
        id: nextSourceId++,
        title,
        sourceType,
        description,
        archiveItemId: archiveItemId ?? undefined,
        contributor: STEWARD,
        status: ReviewStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      };
      sources = [...sources, record];
      createdSources = [
        ...createdSources,
        { title, sourceType, description, archiveItemId },
      ];
      // Mirrors the backend: a submission creates the awaiting-review
      // notification for the contributor, without duplicates.
      const exists = notifications.some(
        (n) =>
          n.recipient === STEWARD &&
          n.notificationType === NotificationType.ResearchSubmission &&
          n.message ===
            "Your research submission is awaiting Family Steward review.",
      );
      if (!exists) {
        notifications = [
          ...notifications,
          {
            id: nextNotifId++,
            recipient: STEWARD,
            notificationType: NotificationType.ResearchSubmission,
            message:
              "Your research submission is awaiting Family Steward review.",
            createdAt: 1_700_000_000_000_000_000n,
            read: false,
          },
        ];
      }
      return { __kind__: "ok", ok: record };
    },
    async listFindings(): Promise<ProposedFinding[]> {
      return [];
    },
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return [];
    },
    async approveSource(id: bigint): Promise<SourceRecord | null> {
      const found = sources.find((s) => s.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      sources = sources.map((s) =>
        s.id === id ? { ...s, status: ReviewStatus.Approved } : s,
      );
      approvedSourceIds = [...approvedSourceIds, id];
      // Mirrors the backend: approval creates the approved notification.
      const exists = notifications.some(
        (n) =>
          n.recipient === STEWARD &&
          n.notificationType === NotificationType.ResearchApproved &&
          n.message === "Your research submission was approved.",
      );
      if (!exists) {
        notifications = [
          ...notifications,
          {
            id: nextNotifId++,
            recipient: STEWARD,
            notificationType: NotificationType.ResearchApproved,
            message: "Your research submission was approved.",
            createdAt: 1_700_000_000_000_000_000n,
            read: false,
          },
        ];
      }
      return sources.find((s) => s.id === id) ?? null;
    },
    async rejectSource(id: bigint): Promise<SourceRecord | null> {
      const found = sources.find((s) => s.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      sources = sources.map((s) =>
        s.id === id ? { ...s, status: ReviewStatus.Rejected } : s,
      );
      rejectedSourceIds = [...rejectedSourceIds, id];
      // Mirrors the backend: rejection creates the not-approved notification.
      const exists = notifications.some(
        (n) =>
          n.recipient === STEWARD &&
          n.notificationType === NotificationType.ResearchRejected &&
          n.message === "Your research submission was not approved.",
      );
      if (!exists) {
        notifications = [
          ...notifications,
          {
            id: nextNotifId++,
            recipient: STEWARD,
            notificationType: NotificationType.ResearchRejected,
            message: "Your research submission was not approved.",
            createdAt: 1_700_000_000_000_000_000n,
            read: false,
          },
        ];
      }
      return sources.find((s) => s.id === id) ?? null;
    },
    async needsResearchSource(id: bigint): Promise<SourceRecord | null> {
      const found = sources.find((s) => s.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      sources = sources.map((s) =>
        s.id === id ? { ...s, status: ReviewStatus.NeedsResearch } : s,
      );
      needsResearchSourceIds = [...needsResearchSourceIds, id];
      return sources.find((s) => s.id === id) ?? null;
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      notifications = [];
      createdSources = [];
      approvedSourceIds = [];
      rejectedSourceIds = [];
      needsResearchSourceIds = [];
      nextSourceId = 1n;
      nextNotifId = 1n;
    },
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    setSources: (v: SourceRecord[]) => {
      sources = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    getCreatedSources: () => createdSources,
    getApprovedSourceIds: () => approvedSourceIds,
    getRejectedSourceIds: () => rejectedSourceIds,
    getNeedsResearchSourceIds: () => needsResearchSourceIds,
    getNotifications: () => notifications,
    setNotifications: (v: Notification[]) => {
      notifications = v;
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
beforeEach(resetState);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
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

function renderNotificationsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
  return queryClient;
}

function claimedProfile(personId: string, name: string): PersonProfile {
  return {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  };
}

function sourceRecord(id: bigint, title: string): SourceRecord {
  return {
    id,
    title,
    sourceType: SourceType.CensusCitation,
    description: "1900 census, Norwood household",
    contributor: STEWARD,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

async function openReviewQueue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.open_review_queue"));
  await screen.findByRole("heading", { name: "Review Queue" });
}

describe("Research Review Queue: pending source with steward actions", () => {
  it("shows a pending Source with type, title, contributor, provenance, date, and Approve/Reject/Needs Research actions", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census, Norwood household")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The Sources tab is present and shows the pending source count.
    const tabs = screen.getByTestId("research_queue.tabs");
    expect(
      within(tabs).getByRole("button", { name: /Sources/ }),
    ).toBeInTheDocument();

    // Open the Sources tab.
    await user.click(screen.getByTestId("research_queue.tab.sources"));

    // The pending source card shows its title, type, description, and
    // contributor. The title also appears as the description (the seeded
    // source uses the same text), so assert presence with getAllByText.
    const card = await screen.findByTestId("research_queue.source.0");
    expect(
      within(card).getAllByText("1900 census, Norwood household").length,
    ).toBeGreaterThan(0);
    // The source type appears both as the evidence label and in the meta row.
    expect(within(card).getAllByText("Census citation").length).toBeGreaterThan(
      0,
    );
    expect(within(card).getByText(/Submitted by/)).toBeInTheDocument();

    // The three steward actions are present.
    expect(
      within(card).getByTestId("research_queue.source.0.approve_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("research_queue.source.0.reject_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("research_queue.source.0.needs_research_button"),
    ).toBeInTheDocument();
  });

  it("approves a pending source, transitioning it to Approved and removing it from the pending queue", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census, Norwood household")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.sources"));

    await user.click(
      await screen.findByTestId("research_queue.source.0.approve_button"),
    );

    // The approve action was recorded against the real source id.
    expect(getApprovedSourceIds()).toEqual([1n]);
    // The source is now Approved.
    const sources = await mockActor.listSources();
    expect(sources[0].status).toBe(ReviewStatus.Approved);
  });

  it("rejects a pending source, transitioning it to Rejected", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census, Norwood household")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.sources"));

    await user.click(
      await screen.findByTestId("research_queue.source.0.reject_button"),
    );

    expect(getRejectedSourceIds()).toEqual([1n]);
    const sources = await mockActor.listSources();
    expect(sources[0].status).toBe(ReviewStatus.Rejected);
  });

  it("marks a pending source as Needs Research, preserving the source and notes", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census, Norwood household")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.sources"));

    await user.click(
      await screen.findByTestId(
        "research_queue.source.0.needs_research_button",
      ),
    );

    expect(getNeedsResearchSourceIds()).toEqual([1n]);
    // The source is preserved with its notes (description) intact.
    const sources = await mockActor.listSources();
    expect(sources[0].status).toBe(ReviewStatus.NeedsResearch);
    expect(sources[0].description).toBe("1900 census, Norwood household");
  });
});

describe("Family Steward action badge: pending research in the aggregate count", () => {
  it("includes pending research in the steward action badge count", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    // One pending source contributes to the aggregate steward action badge.
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    renderApp();

    // The badge is mounted inside the Family Steward nav link.
    const badge = await screen.findByTestId("steward_action_badge");
    expect(badge).toHaveTextContent("1");
    expect(badge).toHaveAttribute(
      "aria-label",
      "1 steward action awaiting review",
    );
  });

  it("includes needs-research sources in the steward action badge count", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    // One pending + one needs-research source = 2 steward actions.
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 1n,
      items: [],
    });
    renderApp();

    const badge = await screen.findByTestId("steward_action_badge");
    expect(badge).toHaveTextContent("2");
    expect(badge).toHaveAttribute(
      "aria-label",
      "2 steward actions awaiting review",
    );
  });

  it("hides the steward action badge when there is no pending research", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    renderApp();

    expect(
      screen.queryByTestId("steward_action_badge"),
    ).not.toBeInTheDocument();
  });
});

describe("Research notifications: awaiting review, approved, not approved", () => {
  it("creates the awaiting-review notification on source submission without duplicates", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    renderApp();

    // The mock actor's createSource mirrors the backend: a submission creates
    // the awaiting-review notification for the contributor, and a second
    // submission of the same message does NOT duplicate it (the backend
    // deduplicates by recipient + type + message).
    const first = await mockActor.createSource(
      "1900 census, Norwood household",
      SourceType.CensusCitation,
      "Census record listing the Norwood family.",
      null,
    );
    expect(first.__kind__).toBe("ok");
    const second = await mockActor.createSource(
      "1900 census, Norwood household",
      SourceType.CensusCitation,
      "Census record listing the Norwood family.",
      null,
    );
    expect(second.__kind__).toBe("ok");

    const notifications = getNotifications();
    const awaiting = notifications.filter(
      (n) =>
        n.notificationType === NotificationType.ResearchSubmission &&
        n.message ===
          "Your research submission is awaiting Family Steward review.",
    );
    // Two submissions of the same message produce exactly one notification —
    // no duplicates.
    expect(awaiting).toHaveLength(1);
  });

  it("creates the approved notification on source approval without duplicates", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census, Norwood household")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.sources"));

    await user.click(
      await screen.findByTestId("research_queue.source.0.approve_button"),
    );

    const notifications = getNotifications();
    const approved = notifications.filter(
      (n) =>
        n.notificationType === NotificationType.ResearchApproved &&
        n.message === "Your research submission was approved.",
    );
    expect(approved).toHaveLength(1);
  });

  it("creates the not-approved notification on source rejection without duplicates", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census, Norwood household")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.sources"));

    await user.click(
      await screen.findByTestId("research_queue.source.0.reject_button"),
    );

    const notifications = getNotifications();
    const rejected = notifications.filter(
      (n) =>
        n.notificationType === NotificationType.ResearchRejected &&
        n.message === "Your research submission was not approved.",
    );
    expect(rejected).toHaveLength(1);
  });

  it("renders the research notifications on the Notifications page", async () => {
    setAuthenticated(true);
    setNotifications([
      {
        id: 1n,
        recipient: STEWARD,
        notificationType: NotificationType.ResearchSubmission,
        message: "Your research submission is awaiting Family Steward review.",
        createdAt: 1_700_000_000_000_000_000n,
        read: false,
      },
      {
        id: 2n,
        recipient: STEWARD,
        notificationType: NotificationType.ResearchApproved,
        message: "Your research submission was approved.",
        createdAt: 1_700_000_000_000_000_000n,
        read: false,
      },
      {
        id: 3n,
        recipient: STEWARD,
        notificationType: NotificationType.ResearchRejected,
        message: "Your research submission was not approved.",
        createdAt: 1_700_000_000_000_000_000n,
        read: false,
      },
    ]);
    renderNotificationsPage();

    expect(
      await screen.findByText(
        "Your research submission is awaiting Family Steward review.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your research submission was approved."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your research submission was not approved."),
    ).toBeInTheDocument();
  });
});
