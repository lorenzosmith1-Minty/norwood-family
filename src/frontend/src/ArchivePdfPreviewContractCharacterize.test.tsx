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

import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the Archive Detail document preview, updated
// for the accepted PDF.js canvas renderer.
//
// The sandboxed <iframe> PDF preview was replaced by an in-app PDF.js canvas
// renderer, so the PDF-specific assertions below now describe the canvas
// contract. The ADJACENT behavior this file protects is unchanged:
//
//   - the Preview button is offered for approved PDF documents;
//   - Preview opens the preview stage panel;
//   - raster images preview safely as an <img>, never an iframe;
//   - scriptable and unknown document types stay download-only;
//   - Download Original remains available for archive items.
//
// The frontend suite mocks the actor, so this asserts the rendered DOM contract
// of the page, not a deployed browser or a real gateway fetch.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const { mockActor, setApprovedItems } = vi.hoisted(() => {
  let approvedItems: ArchiveItem[] = [];
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return approvedItems;
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
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
});

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function documentItem(
  id: bigint,
  title: string,
  mimeType: string,
  filename: string,
): ArchiveItem {
  return {
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

function previewStage(): HTMLElement {
  return document.querySelector(
    '[data-ocid="archive_detail.preview_stage"]',
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// 1. Accepted PDF preview contract: an in-app PDF.js canvas renderer, never an
//    iframe. In jsdom the real PDF.js module cannot parse a document, so the
//    renderer settles into its loading or error state; these assertions cover
//    the stage mounting and the absence of any iframe, not a successful parse.
// ---------------------------------------------------------------------------

describe("PDF preview contract (in-app canvas renderer)", () => {
  it("offers a Preview button for an approved PDF document", async () => {
    renderDetail(documentItem(1n, "Deed scan", "application/pdf", "deed.pdf"));

    expect(
      await screen.findByRole("button", { name: "Preview" }),
    ).toBeInTheDocument();
  });

  it("opens the preview stage panel when Preview is selected", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(2n, "Deed scan", "application/pdf", "deed.pdf"));

    expect(previewStage()).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    expect(previewStage()).toBeInTheDocument();
  });

  it("mounts the PDF renderer without introducing an iframe", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(3n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = previewStage();
    expect(stage).toBeInTheDocument();

    // The renderer mounts its own loading or error state; either way no
    // sandboxed iframe is used anywhere in the preview path.
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

  it("shows the filename as the preview stage heading", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(4n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    expect(within(previewStage()).getByText("deed.pdf")).toBeInTheDocument();
  });

  it("closes the preview stage when Close preview is selected", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(5n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(previewStage()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(previewStage()).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Adjacent behavior that must survive the PDF.js change.
// ---------------------------------------------------------------------------

describe("raster image preview stays an <img>", () => {
  it("renders a PNG preview as an <img> with the item title as alt text", async () => {
    const user = userEvent.setup();
    renderDetail(
      documentItem(10n, "Portrait scan", "image/png", "portrait.png"),
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = previewStage();
    expect(
      within(stage).getByRole("img", { name: "Portrait scan" }),
    ).toBeInTheDocument();
    // An image preview is never an iframe.
    expect(within(stage).queryByTitle("portrait.png")).not.toBeInTheDocument();
  });
});

describe("scriptable and unknown document types stay download-only", () => {
  const downloadOnly: Array<[string, string, string]> = [
    ["SVG", "image/svg+xml", "logo.svg"],
    ["HTML", "text/html", "page.html"],
    ["XML", "application/xml", "data.xml"],
    ["Word", "application/msword", "notes.docx"],
    ["unknown", "application/octet-stream", "blob.bin"],
  ];

  for (const [label, mime, filename] of downloadOnly) {
    it(`offers Download Original only for a ${label} document`, async () => {
      renderDetail(documentItem(20n, `${label} document`, mime, filename));

      expect(
        await screen.findByRole("button", { name: "Download Original" }),
      ).toBeInTheDocument();
      // No inline preview is offered for a scriptable or unknown type.
      expect(
        screen.queryByRole("button", { name: "Preview" }),
      ).not.toBeInTheDocument();
      expect(previewStage()).not.toBeInTheDocument();
    });
  }

  it("never renders an SVG as an inline <img>", async () => {
    renderDetail(documentItem(30n, "Logo", "image/svg+xml", "logo.svg"));

    await screen.findByRole("button", { name: "Download Original" });
    expect(screen.queryByRole("img", { name: "Logo" })).not.toBeInTheDocument();
  });
});

describe("Download Original remains available for archive items", () => {
  it("keeps Download Original alongside Preview for a PDF", async () => {
    renderDetail(documentItem(40n, "Deed scan", "application/pdf", "deed.pdf"));

    expect(
      await screen.findByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("keeps Download Original alongside Preview for a raster image", async () => {
    renderDetail(
      documentItem(41n, "Portrait scan", "image/png", "portrait.png"),
    );

    expect(
      await screen.findByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });
});
