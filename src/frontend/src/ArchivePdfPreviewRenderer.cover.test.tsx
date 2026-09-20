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
// Cover for the accepted in-app PDF.js canvas preview.
//
// The sandboxed-iframe PDF preview was replaced by a reusable PdfPreview
// component that reads the PDF bytes from the existing ExternalBlob and
// rasterizes pages into <canvas> elements inside the existing preview stage.
//
// This file asserts the accepted behavior:
//
//   1. Opening Preview for an application/pdf item invokes the PDF.js renderer
//      (getDocument) and paints pages into <canvas> elements.
//   2. No iframe is introduced anywhere in the preview path.
//   3. A multi-page PDF renders one canvas per page.
//   4. A render failure shows the exact fallback message
//      "Preview unavailable. You can still download the original file."
//   5. Download Original remains available in loading and error states.
//   6. Rendering is capped at 100 pages; beyond that the first 100 render and
//      a notice says the full original can be downloaded.
//   7. HTML, SVG, and unknown documents never use the PDF renderer.
//
// The frontend suite mocks the actor and the PDF.js module, so this asserts the
// rendered DOM contract and the renderer seam, not a deployed browser, a real
// PDF parse, or a real gateway fetch.
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

// ---------------------------------------------------------------------------
// Typed local PDF.js mock. The real pdfjs-dist module cannot parse a document
// in jsdom, so the renderer seam is mocked with the smallest surface PdfPreview
// uses: GlobalWorkerOptions, getDocument, and the document/page/render proxies.
// ---------------------------------------------------------------------------

interface MockRenderTask {
  promise: Promise<void>;
}

interface MockPage {
  getViewport: (params: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (params: unknown) => MockRenderTask;
}

interface MockDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<MockPage>;
  cleanup: () => Promise<void>;
}

interface MockLoadingTask {
  promise: Promise<MockDocument>;
  destroy: () => Promise<void>;
}

const pdfMock = vi.hoisted(() => {
  const state = {
    numPages: 1,
    getDocumentCalls: 0,
    getBytesCalls: 0,
    failLoad: false,
    failRender: false,
    // When set, the loading task's promise stays pending until `resolveLoad`
    // is called, so a test can observe the loading state deterministically.
    holdLoad: false,
    resolveLoad: null as (() => void) | null,
  };

  function makePage(): MockPage {
    return {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
      }),
      render: () => {
        if (state.failRender) {
          return { promise: Promise.reject(new Error("render failed")) };
        }
        return { promise: Promise.resolve() };
      },
    };
  }

  function makeDocument(): MockDocument {
    return {
      numPages: state.numPages,
      getPage: async () => makePage(),
      cleanup: async () => {},
    };
  }

  const getDocument = () => {
    state.getDocumentCalls += 1;
    let promise: Promise<MockDocument>;
    if (state.failLoad) {
      promise = Promise.reject(new Error("load failed"));
    } else if (state.holdLoad) {
      promise = new Promise<MockDocument>((resolve) => {
        state.resolveLoad = () => resolve(makeDocument());
      });
    } else {
      promise = Promise.resolve(makeDocument());
    }
    const task: MockLoadingTask = {
      promise,
      destroy: async () => {},
    };
    return task;
  };

  return {
    state,
    module: {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument,
    },
  };
});

vi.mock("pdfjs-dist", () => pdfMock.module);

afterEach(cleanup);
beforeEach(() => {
  setApprovedItems([]);
  pdfMock.state.numPages = 1;
  pdfMock.state.getDocumentCalls = 0;
  pdfMock.state.getBytesCalls = 0;
  pdfMock.state.failLoad = false;
  pdfMock.state.failRender = false;
  pdfMock.state.holdLoad = false;
  pdfMock.state.resolveLoad = null;
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

async function openPdfPreview(item: ArchiveItem) {
  const user = userEvent.setup();
  renderDetail(item);
  await user.click(await screen.findByRole("button", { name: "Preview" }));
  return user;
}

describe("PDF preview renders through PDF.js into canvases", () => {
  it("invokes the PDF.js renderer when Preview is opened", async () => {
    await openPdfPreview(
      documentItem(1n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    await waitFor(() => {
      expect(pdfMock.state.getDocumentCalls).toBeGreaterThan(0);
    });
  });

  it("renders a single-page PDF into a canvas with no iframe", async () => {
    await openPdfPreview(
      documentItem(2n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    const stage = previewStage();
    expect(stage).toBeInTheDocument();

    await waitFor(() => {
      expect(within(stage).getByLabelText("Page 1 of 1")).toBeInTheDocument();
    });

    const canvas = within(stage).getByLabelText("Page 1 of 1");
    expect(canvas.tagName).toBe("CANVAS");
    // No iframe is introduced anywhere in the preview path.
    expect(stage.querySelector("iframe")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("renders one canvas per page for a multi-page PDF", async () => {
    pdfMock.state.numPages = 3;

    await openPdfPreview(
      documentItem(3n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    const stage = previewStage();
    await waitFor(() => {
      expect(within(stage).getByLabelText("Page 3 of 3")).toBeInTheDocument();
    });

    const canvases = stage.querySelectorAll("canvas");
    expect(canvases).toHaveLength(3);
    expect(within(stage).getByLabelText("Page 1 of 3")).toBeInTheDocument();
    expect(within(stage).getByLabelText("Page 2 of 3")).toBeInTheDocument();
    expect(within(stage).getByLabelText("Page 3 of 3")).toBeInTheDocument();
  });

  it("caps rendering at 100 pages and tells the user to download the original", async () => {
    pdfMock.state.numPages = 150;

    await openPdfPreview(
      documentItem(4n, "Big scan", "application/pdf", "big.pdf"),
    );

    const stage = previewStage();
    await waitFor(() => {
      expect(
        within(stage).getByLabelText("Page 100 of 150"),
      ).toBeInTheDocument();
    });

    expect(stage.querySelectorAll("canvas")).toHaveLength(100);
    expect(
      within(stage).queryByLabelText("Page 101 of 150"),
    ).not.toBeInTheDocument();

    const notice = document.querySelector(
      '[data-ocid="archive_detail.preview_truncated_notice"]',
    );
    expect(notice).toBeInTheDocument();
    expect(notice?.textContent).toContain("Download");
  });
});

describe("PDF preview loading and error states", () => {
  it("shows a loading state while the PDF is being prepared", async () => {
    // A held load keeps the component in its loading state until released.
    pdfMock.state.holdLoad = true;
    const user = userEvent.setup();
    renderDetail(documentItem(10n, "Deed scan", "application/pdf", "deed.pdf"));
    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const loadingState = document.querySelector(
      '[data-ocid="archive_detail.preview_loading_state"]',
    ) as HTMLElement;
    expect(loadingState).toBeInTheDocument();
    // Download Original stays available while loading.
    expect(
      within(loadingState).getByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();

    // Release the load so the effect can settle before the test ends.
    pdfMock.state.resolveLoad?.();
    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-ocid="archive_detail.preview_loading_state"]',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the fallback message when the PDF cannot be rendered", async () => {
    pdfMock.state.failLoad = true;

    await openPdfPreview(
      documentItem(11n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    const errorState = await waitFor(() => {
      const node = document.querySelector(
        '[data-ocid="archive_detail.preview_error_state"]',
      );
      expect(node).toBeInTheDocument();
      return node as HTMLElement;
    });

    expect(
      within(errorState).getByText(
        "Preview unavailable. You can still download the original file.",
      ),
    ).toBeInTheDocument();
    // No canvas or iframe is left behind on failure.
    expect(errorState.querySelector("canvas")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("keeps Download Original available in the error state", async () => {
    pdfMock.state.failLoad = true;

    await openPdfPreview(
      documentItem(12n, "Deed scan", "application/pdf", "deed.pdf"),
    );

    const errorState = await waitFor(() => {
      const node = document.querySelector(
        '[data-ocid="archive_detail.preview_error_state"]',
      );
      expect(node).toBeInTheDocument();
      return node as HTMLElement;
    });

    expect(
      within(errorState).getByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
  });
});

describe("non-PDF documents never use the PDF renderer", () => {
  const nonPdf: Array<[string, string, string]> = [
    ["HTML", "text/html", "page.html"],
    ["SVG", "image/svg+xml", "logo.svg"],
    ["unknown", "application/octet-stream", "blob.bin"],
  ];

  for (const [label, mime, filename] of nonPdf) {
    it(`offers Download Original only for a ${label} document`, async () => {
      renderDetail(documentItem(20n, `${label} document`, mime, filename));

      expect(
        await screen.findByRole("button", { name: "Download Original" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Preview" }),
      ).not.toBeInTheDocument();
      expect(previewStage()).not.toBeInTheDocument();
      expect(pdfMock.state.getDocumentCalls).toBe(0);
    });
  }

  it("renders a raster image as an <img> and never invokes PDF.js", async () => {
    const user = userEvent.setup();
    renderDetail(
      documentItem(21n, "Portrait scan", "image/png", "portrait.png"),
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = previewStage();
    expect(
      within(stage).getByRole("img", { name: "Portrait scan" }),
    ).toBeInTheDocument();
    expect(stage.querySelector("canvas")).toBeNull();
    expect(stage.querySelector("iframe")).toBeNull();
    expect(pdfMock.state.getDocumentCalls).toBe(0);
  });
});
