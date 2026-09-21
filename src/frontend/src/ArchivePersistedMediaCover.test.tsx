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
// Cover for the accepted persisted archive media metadata change.
//
// The change persists the validated MIME type and the sanitized filename on the
// ArchiveItem record itself, and makes ArchiveDetailPage resolve the preview
// type from those persisted fields FIRST, falling back to the ExternalBlob
// metadata only when they are absent. It also adds two archive review
// notification types and renames the Pending Contributions page's header badge.
//
// This file asserts the accepted behavior:
//
//   1. A PDF whose persisted mimeType is application/pdf renders a Preview
//      action that mounts the in-app PDF.js renderer (no iframe) while Download
//      Original stays available.
//   2. The persisted mimeType/filename WIN over the ExternalBlob metadata: an
//      item whose blob metadata says text/plain but whose persisted mimeType is
//      application/pdf is previewed as a PDF, and the persisted filename is the
//      one shown.
//   3. HTML, SVG, and unknown persisted types never render an inline preview and
//      offer Download Original only.
//   4. The Pending Contributions page shows "Family Steward Review" and no
//      user-facing "Admin Review".
//   5. The two new notification types carry friendly labels.
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
 * Builds an ArchiveItem carrying the persisted `mimeType`/`filename` fields.
 * The ExternalBlob metadata is deliberately set to a DIFFERENT type so a test
 * can prove the persisted fields are authoritative.
 */
function persistedDocumentItem(
  id: bigint,
  title: string,
  persistedMimeType: string,
  persistedFilename: string,
  blobMimeType: string,
  blobFilename: string,
): ArchiveItem {
  return {
    familyId: "norwood",
    id,
    title,
    description: "A document.",
    itemType: ArchiveItemType.Document,
    blob: ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      blobMimeType,
      blobFilename,
    ),
    mimeType: persistedMimeType,
    filename: persistedFilename,
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

describe("Archive Detail resolves preview from the persisted mimeType/filename", () => {
  it("previews a persisted PDF in-app without an iframe and keeps Download Original", async () => {
    const user = userEvent.setup();
    renderDetail(
      persistedDocumentItem(
        1n,
        "Deed scan",
        "application/pdf",
        "deed.pdf",
        "application/pdf",
        "deed.pdf",
      ),
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

    // Download Original stays available alongside the preview.
    expect(
      within(stage).getByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
  });

  it("lets the persisted mimeType win over the ExternalBlob metadata", async () => {
    const user = userEvent.setup();
    // The blob metadata claims text/plain; the persisted field says PDF. The
    // persisted value is authoritative, so a Preview action must be offered and
    // must mount the in-app PDF renderer.
    renderDetail(
      persistedDocumentItem(
        2n,
        "Persisted PDF",
        "application/pdf",
        "persisted.pdf",
        "text/plain",
        "blob-name.txt",
      ),
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(stage).toBeInTheDocument();
    // The persisted filename is the one shown, not the blob's.
    expect(within(stage).getByText("persisted.pdf")).toBeInTheDocument();
    expect(within(stage).queryByText("blob-name.txt")).not.toBeInTheDocument();
    expect(stage.querySelector("iframe")).toBeNull();
  });

  it("renders a persisted raster image as an <img>, never an iframe", async () => {
    const user = userEvent.setup();
    renderDetail(
      persistedDocumentItem(
        3n,
        "Portrait scan",
        "image/png",
        "portrait.png",
        "image/png",
        "portrait.png",
      ),
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
});

describe("scriptable and unknown persisted types are download-only", () => {
  const downloadOnly: Array<[string, string, string]> = [
    ["HTML", "text/html", "page.html"],
    ["SVG", "image/svg+xml", "logo.svg"],
    ["unknown", "application/octet-stream", "blob.bin"],
  ];

  for (const [label, mime, filename] of downloadOnly) {
    it(`offers Download Original only for a persisted ${label} document`, async () => {
      renderDetail(
        persistedDocumentItem(
          10n,
          `${label} document`,
          mime,
          filename,
          mime,
          filename,
        ),
      );

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
  }

  it("never renders a persisted SVG as an inline <img>", async () => {
    renderDetail(
      persistedDocumentItem(
        20n,
        "Logo",
        "image/svg+xml",
        "logo.svg",
        "image/svg+xml",
        "logo.svg",
      ),
    );

    await screen.findByRole("button", { name: "Download Original" });
    expect(screen.queryByRole("img", { name: "Logo" })).not.toBeInTheDocument();
  });
});

describe("Pending Contributions page uses the Family Steward Review label", () => {
  it("shows 'Family Steward Review' and no user-facing 'Admin Review'", async () => {
    renderApprovalPage();

    expect(
      await screen.findByText("Family Steward Review"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Admin Review/i)).not.toBeInTheDocument();
  });
});

describe("archive review notification types carry friendly labels", () => {
  it("maps ArchiveApproved and ArchiveRejected to non-empty labels", () => {
    for (const type of [
      NotificationType.ArchiveApproved,
      NotificationType.ArchiveRejected,
    ]) {
      const label = NOTIFICATION_TYPE_LABELS[type];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
