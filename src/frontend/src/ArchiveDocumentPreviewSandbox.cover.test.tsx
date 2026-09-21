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
// Cover for the accepted document-preview safety behavior.
//
// The Archive Detail preview is safe by construction:
//
//   1. A PDF preview renders in-app through PDF.js into <canvas> elements —
//      no embedded script runs, no document HTML is injected, and no
//      navigation or form submission is possible — while keeping the filename
//      as the stage heading. No iframe is used anywhere in the preview path.
//   2. A raster image preview renders as an <img>, never an iframe.
//   3. Scriptable / unknown document types (SVG, HTML, XML, Word) are never
//      previewed inline: they offer Download Original only, with no Preview
//      button and no preview stage.
//
// The frontend suite mocks the actor, so this asserts the rendered DOM contract
// of the pages, not a deployed browser or a real gateway fetch.
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

describe("PDF preview renders in-app without an iframe", () => {
  it("mounts the PDF renderer and never introduces an iframe", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(1n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
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

  it("keeps the filename as the stage heading", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(2n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(within(stage).getByText("deed.pdf")).toBeInTheDocument();
  });

  it("closes the preview stage without leaving the renderer mounted", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(3n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(
      document.querySelector('[data-ocid="archive_detail.preview_stage"]'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(
      document.querySelector('[data-ocid="archive_detail.preview_stage"]'),
    ).not.toBeInTheDocument();
  });
});

describe("raster image preview renders as an <img>, never an iframe", () => {
  it("renders a PNG preview as an <img> with the item title as alt text", async () => {
    const user = userEvent.setup();
    renderDetail(
      documentItem(4n, "Portrait scan", "image/png", "portrait.png"),
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

describe("scriptable and unknown document types are download-only", () => {
  const downloadOnly: Array<[string, string, string]> = [
    ["SVG", "image/svg+xml", "logo.svg"],
    ["HTML", "text/html", "page.html"],
    ["XML", "application/xml", "data.xml"],
    ["Word", "application/msword", "notes.docx"],
  ];

  for (const [label, mime, filename] of downloadOnly) {
    it(`offers Download Original only for a ${label} document`, async () => {
      renderDetail(documentItem(10n, `${label} document`, mime, filename));

      expect(
        await screen.findByRole("button", { name: "Download Original" }),
      ).toBeInTheDocument();
      // No inline preview is offered for a scriptable or unknown type.
      expect(
        screen.queryByRole("button", { name: "Preview" }),
      ).not.toBeInTheDocument();
      expect(
        document.querySelector('[data-ocid="archive_detail.preview_stage"]'),
      ).not.toBeInTheDocument();
    });
  }

  it("never renders an SVG as an inline <img>", async () => {
    renderDetail(documentItem(20n, "Logo", "image/svg+xml", "logo.svg"));

    await screen.findByRole("button", { name: "Download Original" });
    expect(screen.queryByRole("img", { name: "Logo" })).not.toBeInTheDocument();
  });
});
