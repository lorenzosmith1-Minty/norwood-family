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

import { PdfPreview } from "./components/archive/PdfPreview";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";

// ---------------------------------------------------------------------------
// Cover for the two-phase PdfPreview lifecycle.
//
// The component was refactored from a single effect that loaded the document
// and rendered pages together into a two-phase lifecycle:
//
//   Phase 1 loads the document and moves the UI into a `rendering` state so
//   React mounts one canvas per page.
//
//   Phase 2 runs once those canvases exist, sizes and renders each page, and
//   only then marks the preview `ready`.
//
// This file asserts the accepted behavior that the refactor introduces:
//
//   1. One canvas is mounted per page and page.render is called once for each
//      mounted page, in page order.
//   2. The preview is not marked ready before page rendering completes: while a
//      render is in flight the page's canvas is still pending and the document
//      is not cleaned up.
//   3. A canvas that never mounts fails the preview instead of being silently
//      skipped.
//   4. Download Original remains available once ready, and no iframe is
//      introduced anywhere in the preview path.
//
// The PDF.js module and the backend actor are mocked locally, so this asserts
// the component's DOM contract and its renderer seam, not a deployed browser,
// a real PDF parse, or a real gateway fetch.
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
  readonly numPages: number;
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
    // When set, `numPages` reports this value on the first read (phase 1, which
    // mounts the canvases) and `numPages` on every later read (phase 2, which
    // renders). A larger phase-2 value makes a page's canvas genuinely absent.
    firstReadNumPages: null as number | null,
    numPagesReads: 0,
    // Page numbers passed to page.render, in call order.
    renderCalls: [] as number[],
    // When true, page.render returns a promise that stays pending until the
    // test releases it, so readiness gating can be observed deterministically.
    holdRender: false,
    renderResolvers: [] as Array<() => void>,
    cleanupCalls: 0,
    failLoad: false,
    holdLoad: false,
    resolveLoad: null as (() => void) | null,
  };

  function makePage(pageNumber: number): MockPage {
    return {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
      }),
      render: () => {
        state.renderCalls.push(pageNumber);
        if (state.holdRender) {
          return {
            promise: new Promise<void>((resolve) => {
              state.renderResolvers.push(resolve);
            }),
          };
        }
        return { promise: Promise.resolve() };
      },
    };
  }

  function makeDocument(): MockDocument {
    return {
      get numPages() {
        state.numPagesReads += 1;
        if (state.firstReadNumPages !== null && state.numPagesReads === 1) {
          return state.firstReadNumPages;
        }
        return state.numPages;
      },
      getPage: async (pageNumber: number) => makePage(pageNumber),
      cleanup: async () => {
        state.cleanupCalls += 1;
      },
    };
  }

  const getDocument = () => {
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  setApprovedItems([]);
  pdfMock.state.numPages = 1;
  pdfMock.state.firstReadNumPages = null;
  pdfMock.state.numPagesReads = 0;
  pdfMock.state.renderCalls = [];
  pdfMock.state.holdRender = false;
  pdfMock.state.renderResolvers = [];
  pdfMock.state.cleanupCalls = 0;
  pdfMock.state.failLoad = false;
  pdfMock.state.holdLoad = false;
  pdfMock.state.resolveLoad = null;
  // jsdom's requestAnimationFrame fires on a ~16ms timer, so the component's
  // 60-frame canvas wait would take about a second. A zero-delay timer keeps
  // the wait deterministic and fast without changing its semantics.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
});

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

/**
 * Minimal typed stand-in for the stored artifact. PdfPreview only reads bytes
 * from it, so the mock exposes just `getBytes`.
 */
function mockBlob(): ExternalBlob {
  return {
    getBytes: async () => new Uint8Array([1, 2, 3]),
  } as unknown as ExternalBlob;
}

function renderPreview() {
  return render(
    <PdfPreview blob={mockBlob()} filename="deed.pdf" title="Deed scan" />,
  );
}

function previewPages(): HTMLElement | null {
  return document.querySelector(
    '[data-ocid="archive_detail.preview_pages"]',
  ) as HTMLElement | null;
}

function errorState(): HTMLElement | null {
  return document.querySelector(
    '[data-ocid="archive_detail.preview_error_state"]',
  ) as HTMLElement | null;
}

function canvasFor(pageNumber: number, pageCount: number): HTMLCanvasElement {
  const pages = previewPages();
  if (!pages) throw new Error("preview pages are not mounted");
  return within(pages).getByLabelText(
    `Page ${pageNumber} of ${pageCount}`,
  ) as HTMLCanvasElement;
}

describe("PDF preview renders every mounted page", () => {
  it("calls page.render once per page, in page order, for a multi-page PDF", async () => {
    pdfMock.state.numPages = 3;
    renderPreview();

    await waitFor(() => {
      expect(pdfMock.state.renderCalls).toHaveLength(3);
    });

    expect(pdfMock.state.renderCalls).toEqual([1, 2, 3]);
    const pages = previewPages() as HTMLElement;
    expect(pages.querySelectorAll("canvas")).toHaveLength(3);
    expect(within(pages).getByLabelText("Page 1 of 3")).toBeInTheDocument();
    expect(within(pages).getByLabelText("Page 2 of 3")).toBeInTheDocument();
    expect(within(pages).getByLabelText("Page 3 of 3")).toBeInTheDocument();
  });

  it("renders every page of a single-page PDF exactly once", async () => {
    pdfMock.state.numPages = 1;
    renderPreview();

    await waitFor(() => {
      expect(pdfMock.state.renderCalls).toEqual([1]);
    });

    expect(previewPages()?.querySelectorAll("canvas")).toHaveLength(1);
  });
});

describe("PDF preview readiness follows render completion", () => {
  it("does not mark a page rendered while its render is still in flight", async () => {
    pdfMock.state.numPages = 2;
    pdfMock.state.holdRender = true;
    renderPreview();

    // Both canvases mount, and the first render is requested but never settles.
    await waitFor(() => {
      expect(pdfMock.state.renderCalls).toEqual([1]);
    });

    expect(canvasFor(1, 2).className).toContain("pdf-preview-canvas-pending");
    // The document is only cleaned up after every page has rendered, so a
    // pending render must not have reached that final step.
    expect(pdfMock.state.cleanupCalls).toBe(0);

    // Release the first render; the second is then requested and held.
    pdfMock.state.renderResolvers[0]?.();
    await waitFor(() => {
      expect(pdfMock.state.renderCalls).toEqual([1, 2]);
    });
    expect(canvasFor(1, 2).className).not.toContain(
      "pdf-preview-canvas-pending",
    );
    expect(canvasFor(2, 2).className).toContain("pdf-preview-canvas-pending");
    expect(pdfMock.state.cleanupCalls).toBe(0);

    // Release the second render; only now does the preview finish.
    pdfMock.state.renderResolvers[1]?.();
    await waitFor(() => {
      expect(pdfMock.state.cleanupCalls).toBe(1);
    });
    expect(canvasFor(2, 2).className).not.toContain(
      "pdf-preview-canvas-pending",
    );
  });
});

describe("PDF preview never silently skips a missing canvas", () => {
  it("fails the preview when a page's canvas never mounts", async () => {
    // Phase 1 sees two pages and mounts two canvases; phase 2 sees three and
    // asks for a third canvas that does not exist. The component must wait for
    // it and then fail, never silently continue to a ready preview.
    pdfMock.state.numPages = 3;
    pdfMock.state.firstReadNumPages = 2;
    renderPreview();

    await waitFor(() => {
      expect(errorState()).toBeInTheDocument();
    });

    // The missing page was never rendered, and the preview never reached the
    // ready page stack.
    expect(pdfMock.state.renderCalls).toEqual([1, 2]);
    expect(previewPages()).toBeNull();
    expect(pdfMock.state.cleanupCalls).toBe(0);
  });
});

describe("PDF preview keeps Download Original and introduces no iframe", () => {
  it("keeps Download Original available once the preview is ready", async () => {
    pdfMock.state.numPages = 2;
    renderPreview();

    await waitFor(() => {
      expect(pdfMock.state.renderCalls).toEqual([1, 2]);
    });

    const download = screen.getByRole("button", { name: "Download Original" });
    expect(download).toBeInTheDocument();
    expect(download).toBeEnabled();
    expect(document.querySelector("iframe")).toBeNull();
  });
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

describe("Archive detail PDF journey", () => {
  it("mounts a canvas per page and renders each page when Preview is opened", async () => {
    pdfMock.state.numPages = 2;
    const user = userEvent.setup();
    renderDetail(documentItem(1n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(pdfMock.state.renderCalls).toEqual([1, 2]);
    });

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(stage.querySelectorAll("canvas")).toHaveLength(2);
    expect(stage.querySelector("iframe")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(
      within(stage).getByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
  });
});
