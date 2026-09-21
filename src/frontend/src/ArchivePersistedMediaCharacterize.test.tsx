import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
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

import { AdminApprovalPage } from "./pages/AdminApprovalPage";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";
import { NOTIFICATION_TYPE_LABELS, NotificationType } from "./types/ownership";

// ---------------------------------------------------------------------------
// Characterization baseline for the persisted archive media metadata change.
//
// The upcoming change adds optional persisted `mimeType` and `filename` fields
// to ArchiveItem and makes ArchiveDetailPage resolve the preview type from
// those persisted fields FIRST, falling back to the ExternalBlob metadata only
// when they are absent. It also adds two notification types and renames the
// Pending Contributions page's header badge.
//
// This baseline deliberately does NOT assert the new persisted fields, the new
// notification types, or the new badge label — those are the intentional
// changes. Instead it freezes the adjacent behavior that must survive:
//
//   1. An EXISTING record whose MIME type and filename live only on the
//      ExternalBlob (no persisted fields) still resolves its preview type and
//      renders correctly. This is the migration-safety fallback: records
//      written before the change must keep working.
//   2. Download Original stays available for a previewable document.
//   3. The Pending Contributions page keeps its heading, its approve/reject
//      actions, its empty state, and its Pending Recipes section. The badge
//      label is intentionally NOT asserted here.
//   4. The ten existing notification types keep their friendly labels.
//
// The frontend suite mocks the actor, so this asserts the rendered DOM contract
// of the pages, not a deployed browser or a real gateway fetch.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const { mockActor, setApprovedItems, setPendingItems } = vi.hoisted(() => {
  let approvedItems: ArchiveItem[] = [];
  let pendingItems: ArchiveItem[] = [];
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
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return approvedItems;
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return pendingItems;
    },
    async listPendingRecipes(): Promise<unknown[]> {
      return [];
    },
    async listNotifications() {
      return [];
    },
  };
  return {
    mockActor,
    setApprovedItems: (items: ArchiveItem[]) => {
      approvedItems = items;
    },
    setPendingItems: (items: ArchiveItem[]) => {
      pendingItems = items;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  setApprovedItems([]);
  setPendingItems([]);
});

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

/**
 * Builds an ArchiveItem whose MIME type and filename live ONLY on the
 * ExternalBlob — the shape of every record written before the persisted
 * mimeType/filename fields existed. The persisted fields are intentionally not
 * set here.
 */
function legacyDocumentItem(
  id: bigint,
  title: string,
  mimeType: string,
  filename: string,
): ArchiveItem {
  return {
    familyId: "norwood",
    id,
    title,
    description: "A document.",
    itemType: ArchiveItemType.Document,
    blob: ExternalBlob.fromBytes(new Uint8Array([1, 2, 3]), mimeType, filename),
    era: "1924",
    year: 1924n,
    tags: [],
    relatedMemberIds: [],
    relatedBranchId: undefined,
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    classification: ArchiveItemClassification.Standard,
    status: ArchiveItemStatus.Approved,
    createdAt: 1_700_000_000_000_000_000n,
    contributor: Principal.fromText("aaaaa-aa"),
  };
}

function renderDetail(item: ArchiveItem) {
  setApprovedItems([item]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ArchiveDetailPage
        itemId={item.id}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />
    </QueryClientProvider>,
  );
}

function renderApprovalPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminApprovalPage onBack={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Archive Detail resolves preview from ExternalBlob metadata for legacy records", () => {
  it("previews a legacy PDF (blob-only MIME) in-app without an iframe", async () => {
    const user = userEvent.setup();
    renderDetail(
      legacyDocumentItem(1n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(stage).toBeInTheDocument();
    // The renderer mounts its own loading or error state; either way no
    // iframe is used anywhere in the preview path.
    await waitFor(() => {
      expect(
        stage.querySelector(
          '[data-ocid="archive_detail.preview_loading_state"], [data-ocid="archive_detail.preview_error_state"], [data-ocid="archive_detail.preview_pages"]',
        ),
      ).not.toBeNull();
    });
    expect(stage.querySelector("iframe")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("previews a legacy raster image (blob-only MIME) as an <img>, not an iframe", async () => {
    const user = userEvent.setup();
    renderDetail(
      legacyDocumentItem(2n, "Portrait scan", "image/png", "portrait.png"),
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(
      within(stage).getByRole("img", { name: "Portrait scan" }),
    ).toBeInTheDocument();
    expect(within(stage).queryByTitle("portrait.png")).not.toBeInTheDocument();
  });

  it("keeps Download Original available for a legacy previewable document", async () => {
    renderDetail(
      legacyDocumentItem(3n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    expect(
      await screen.findByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("never offers an inline preview for a legacy scriptable document", async () => {
    renderDetail(legacyDocumentItem(4n, "Logo", "image/svg+xml", "logo.svg"));

    expect(
      await screen.findByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-ocid="archive_detail.preview_stage"]'),
    ).not.toBeInTheDocument();
  });
});

describe("Pending Contributions page keeps its review structure", () => {
  it("renders the Pending Contributions heading and the approve/reject actions", async () => {
    setPendingItems([
      {
        ...legacyDocumentItem(
          10n,
          "A family letter",
          "text/plain",
          "letter.txt",
        ),
        status: ArchiveItemStatus.Pending,
      },
    ]);
    renderApprovalPage();

    expect(
      await screen.findByRole("heading", { name: "Pending Contributions" }),
    ).toBeInTheDocument();
    // The pending list resolves asynchronously; wait for the item to render.
    expect(await screen.findByText("A family letter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("shows the empty state when there are no pending contributions", async () => {
    renderApprovalPage();

    expect(
      await screen.findByRole("heading", { name: "Nothing awaiting review" }),
    ).toBeInTheDocument();
  });

  it("keeps the Pending Recipes section on the review page", async () => {
    renderApprovalPage();

    expect(
      await screen.findByRole("heading", { name: "Pending Recipes" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "No recipes awaiting review",
      }),
    ).toBeInTheDocument();
  });
});

describe("existing notification type labels stay mapped", () => {
  it("maps every pre-existing notification type to a friendly label", () => {
    const existing: NotificationType[] = [
      NotificationType.ResearchSubmission,
      NotificationType.ResearchApproved,
      NotificationType.ResearchRejected,
      NotificationType.ProfileClaimRequested,
      NotificationType.ProfileClaimReviewed,
      NotificationType.RelationshipRequested,
      NotificationType.RelationshipReviewed,
      NotificationType.BoardMention,
      NotificationType.BoardReply,
      NotificationType.NewMessage,
    ];

    for (const type of existing) {
      const label = NOTIFICATION_TYPE_LABELS[type];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
