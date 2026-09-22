import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  type Notification,
  NotificationType,
  PrivacyLevel,
  ReviewStatus,
  type SourceRecord,
  SourceStatus,
  SourceType,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { usePendingArchiveItems } from "./hooks/useArchiveStorage";
import { useApproveSource, useRejectSource } from "./hooks/useResearchIntake";
import { AdminApprovalPage } from "./pages/AdminApprovalPage";

// ---------------------------------------------------------------------------
// Frontend consumer contract for the Research Source <-> Archive item
// single-approval fix.
//
// The backend change makes a Research upload create ONE canonical pending
// Archive item linked to the Source, excludes that linked item from
// listPendingArchiveItems, and cascades approveSource / rejectSource to the
// linked item. This file asserts the frontend consumer side of that contract:
//
//   1. Pending Contributions renders exactly what listPendingArchiveItems
//      returns — an ordinary item is shown, and a Research-linked item the
//      backend excludes is not shown.
//   2. useApproveSource calls actor.approveSource with the source id, and the
//      linked Archive item's Approved status is reflected in the approved
//      Archive list the frontend reads.
//   3. useRejectSource calls actor.rejectSource with the source id, and the
//      linked Archive item is absent from the approved Archive list.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits). The real cascade is covered by the PocketIC
// lane (research-archive-single-approval.cover.test.ts).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = Principal.fromText(ACCOUNT);

const {
  mockActor,
  resetState,
  setPendingItems,
  setSources,
  getApprovedSourceIds,
  getRejectedSourceIds,
  getNotifications,
} = vi.hoisted(() => {
  let pendingItems: ArchiveItem[] = [];
  let approvedItems: ArchiveItem[] = [];
  let sources: SourceRecord[] = [];
  let notifications: Notification[] = [];
  let approvedSourceIds: bigint[] = [];
  let rejectedSourceIds: bigint[] = [];
  let nextNotifId = 1n;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return true;
    },
    async isCallerSteward(): Promise<boolean> {
      return true;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return pendingItems;
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return approvedItems;
    },
    async listPendingRecipes(): Promise<unknown[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return notifications;
    },
    async listSources(): Promise<SourceRecord[]> {
      return sources;
    },
    async approveSource(id: bigint): Promise<SourceRecord | null> {
      const found = sources.find((s) => s.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      sources = sources.map((s) =>
        s.id === id ? { ...s, status: ReviewStatus.Approved } : s,
      );
      approvedSourceIds = [...approvedSourceIds, id];
      // Mirrors the backend cascade: the linked Archive item transitions to
      // Approved and appears in the approved list; no Archive notification.
      const linkedId = found.archiveItemId;
      if (linkedId !== undefined) {
        approvedItems = [
          ...approvedItems,
          {
            ...archiveItem(linkedId, found.title),
            status: ArchiveItemStatus.Approved,
          },
        ];
      }
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
      return sources.find((s) => s.id === id) ?? null;
    },
    async rejectSource(id: bigint): Promise<SourceRecord | null> {
      const found = sources.find((s) => s.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      sources = sources.map((s) =>
        s.id === id ? { ...s, status: ReviewStatus.Rejected } : s,
      );
      rejectedSourceIds = [...rejectedSourceIds, id];
      // Mirrors the backend cascade: the linked Archive item is rejected and
      // never appears in the approved list; no Archive notification.
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
      return sources.find((s) => s.id === id) ?? null;
    },
  };

  return {
    mockActor,
    resetState: () => {
      pendingItems = [];
      approvedItems = [];
      sources = [];
      notifications = [];
      approvedSourceIds = [];
      rejectedSourceIds = [];
      nextNotifId = 1n;
    },
    setPendingItems: (items: ArchiveItem[]) => {
      pendingItems = items;
    },
    setSources: (items: SourceRecord[]) => {
      sources = items;
    },
    getApprovedSourceIds: () => approvedSourceIds,
    getRejectedSourceIds: () => rejectedSourceIds,
    getNotifications: () => notifications,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => Principal.fromText(ACCOUNT) },
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

function archiveItem(id: bigint, title: string): ArchiveItem {
  return {
    familyId: "norwood",
    id,
    title,
    description: "A letter from 1924.",
    itemType: ArchiveItemType.Document,
    blob: ExternalBlob.fromBytes(new Uint8Array([1, 2, 3])),
    era: "1924",
    year: 1924n,
    tags: ["letters"],
    relatedMemberIds: ["julia"],
    relatedBranchId: undefined,
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    classification: ArchiveItemClassification.Standard,
    primarySpeaker: undefined,
    status: ArchiveItemStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    contributor: STEWARD,
  };
}

function sourceRecord(
  id: bigint,
  title: string,
  archiveItemId: bigint,
): SourceRecord {
  return {
    id,
    title,
    sourceType: SourceType.CensusCitation,
    description: "Census record listing the Norwood family.",
    archiveItemId,
    contributor: STEWARD,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return queryClient;
}

function hookWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Pending Contributions excludes Research-linked items", () => {
  it("renders an ordinary pending item but not a Research-linked item the backend excludes", async () => {
    // The backend's listPendingArchiveItems returns only the ordinary item;
    // the Research-linked item is filtered out server-side.
    setPendingItems([archiveItem(1n, "Ordinary pending letter")]);
    renderWithClient(<AdminApprovalPage onBack={() => {}} />);

    expect(
      await screen.findByText("Ordinary pending letter"),
    ).toBeInTheDocument();
    // The Research-linked item is not in the pending list.
    expect(
      screen.queryByText("Research-linked census upload"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when the only pending item is Research-linked and excluded", async () => {
    // The backend returns [] because the sole pending item is Research-linked.
    setPendingItems([]);
    renderWithClient(<AdminApprovalPage onBack={() => {}} />);

    expect(
      await screen.findByTestId("admin_approval.empty_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Research-linked census upload"),
    ).not.toBeInTheDocument();
  });
});

describe("useApproveSource / useRejectSource consumer contract", () => {
  it("approveSource calls the backend with the source id and the linked item becomes approved", async () => {
    setSources([sourceRecord(7n, "Research-linked census upload", 42n)]);
    const { result } = renderHookWithWrapper(() => useApproveSource());

    await result.current.mutateAsync(7n);

    expect(getApprovedSourceIds()).toEqual([7n]);
    // The linked Archive item is now in the approved list the frontend reads.
    const approved = await mockActor.listApprovedArchiveItems();
    expect(approved.find((i) => i.id === 42n)).toBeDefined();
    // Exactly one ResearchApproved notification, no Archive notification.
    const notifications = getNotifications();
    expect(
      notifications.filter(
        (n) => n.notificationType === NotificationType.ResearchApproved,
      ),
    ).toHaveLength(1);
    expect(
      notifications.filter(
        (n) => n.notificationType === NotificationType.ArchiveApproved,
      ),
    ).toHaveLength(0);
  });

  it("rejectSource calls the backend with the source id and the linked item is not approved", async () => {
    setSources([sourceRecord(9n, "Research-linked census upload", 43n)]);
    const { result } = renderHookWithWrapper(() => useRejectSource());

    await result.current.mutateAsync(9n);

    expect(getRejectedSourceIds()).toEqual([9n]);
    // The linked Archive item never appears in the approved list.
    const approved = await mockActor.listApprovedArchiveItems();
    expect(approved.find((i) => i.id === 43n)).toBeUndefined();
    // Exactly one ResearchRejected notification, no Archive notification.
    const notifications = getNotifications();
    expect(
      notifications.filter(
        (n) => n.notificationType === NotificationType.ResearchRejected,
      ),
    ).toHaveLength(1);
    expect(
      notifications.filter(
        (n) => n.notificationType === NotificationType.ArchiveRejected,
      ),
    ).toHaveLength(0);
  });
});

describe("usePendingArchiveItems reads the backend-filtered list", () => {
  it("returns exactly the items the backend lists as pending", async () => {
    setPendingItems([archiveItem(1n, "Ordinary pending letter")]);
    const { result } = renderHookWithWrapper(() => usePendingArchiveItems());

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((i) => i.id)).toEqual([1n]);
  });
});

function renderHookWithWrapper<T>(callback: () => T) {
  return renderHook(callback, { wrapper: hookWrapper() });
}
