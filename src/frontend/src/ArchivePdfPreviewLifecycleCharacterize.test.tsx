import "@testing-library/jest-dom/vitest";
import type { ExternalBlob } from "@caffeineai/object-storage";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
  within,
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

import { PdfPreview } from "./components/archive/PdfPreview";

// ---------------------------------------------------------------------------
// Characterization baseline for the PdfPreview component contract.
//
// PdfPreview is about to be refactored from a single effect that loads the
// document and renders pages together into a two-phase load-then-render
// lifecycle. This file deliberately does NOT freeze the current single-effect
// structure, and it does NOT assert the current silent `continue` when a canvas
// ref is missing — that is the behavior the refactor intentionally changes.
//
// It protects only the surrounding component contract that must survive:
//
//   1. One canvas per page is mounted, up to the 100-page preview limit, each
//      labelled "Page N of M".
//   2. The loading state is shown while the document is being prepared, and
//      Download Original is available in it.
//   3. A load failure shows the exact fallback message and keeps Download
//      Original available.
//   4. No iframe is introduced anywhere in the preview path.
//   5. A document longer than 100 pages mounts only the first 100 canvases and
//      surfaces the truncation notice.
//
// The PDF.js module is mocked locally, so this asserts the component's rendered
// DOM contract and its renderer seam, not a deployed browser or a real PDF
// parse.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

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
    failLoad: false,
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
      render: () => ({ promise: Promise.resolve() }),
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
  pdfMock.state.numPages = 1;
  pdfMock.state.failLoad = false;
  pdfMock.state.holdLoad = false;
  pdfMock.state.resolveLoad = null;
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

describe("PdfPreview mounts one canvas per page", () => {
  it("mounts a single labelled canvas for a one-page document", async () => {
    pdfMock.state.numPages = 1;
    renderPreview();

    await waitFor(() => {
      expect(previewPages()).not.toBeNull();
    });

    const pages = previewPages() as HTMLElement;
    expect(pages.querySelectorAll("canvas")).toHaveLength(1);
    expect(within(pages).getByLabelText("Page 1 of 1")).toBeInTheDocument();
    expect(pages.querySelector("iframe")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("mounts one labelled canvas per page for a multi-page document", async () => {
    pdfMock.state.numPages = 3;
    renderPreview();

    await waitFor(() => {
      expect(previewPages()).not.toBeNull();
    });

    const pages = previewPages() as HTMLElement;
    expect(pages.querySelectorAll("canvas")).toHaveLength(3);
    expect(within(pages).getByLabelText("Page 1 of 3")).toBeInTheDocument();
    expect(within(pages).getByLabelText("Page 2 of 3")).toBeInTheDocument();
    expect(within(pages).getByLabelText("Page 3 of 3")).toBeInTheDocument();
  });

  it("caps the mounted canvases at 100 pages and shows the truncation notice", async () => {
    pdfMock.state.numPages = 150;
    renderPreview();

    await waitFor(() => {
      expect(previewPages()).not.toBeNull();
    });

    const pages = previewPages() as HTMLElement;
    expect(pages.querySelectorAll("canvas")).toHaveLength(100);
    expect(
      within(pages).queryByLabelText("Page 101 of 150"),
    ).not.toBeInTheDocument();

    const notice = document.querySelector(
      '[data-ocid="archive_detail.preview_truncated_notice"]',
    );
    expect(notice).toBeInTheDocument();
    expect(notice?.textContent).toContain("Download");
  });
});

describe("PdfPreview loading and error states", () => {
  it("shows the loading state with Download Original while the document is prepared", async () => {
    pdfMock.state.holdLoad = true;
    renderPreview();

    const loadingState = document.querySelector(
      '[data-ocid="archive_detail.preview_loading_state"]',
    ) as HTMLElement;
    expect(loadingState).toBeInTheDocument();
    expect(
      within(loadingState).getByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(loadingState.querySelector("iframe")).toBeNull();

    // Release the load so the effect can settle before the test ends. The
    // effect reaches getDocument asynchronously, so wait for the resolver to be
    // installed before invoking it.
    await waitFor(() => {
      expect(pdfMock.state.resolveLoad).not.toBeNull();
    });
    pdfMock.state.resolveLoad?.();
    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-ocid="archive_detail.preview_loading_state"]',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the fallback message and keeps Download Original when the load fails", async () => {
    pdfMock.state.failLoad = true;
    renderPreview();

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
    expect(
      within(errorState).getByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(errorState.querySelector("canvas")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("PdfPreview Download Original action", () => {
  it("remains available once the preview is ready", async () => {
    pdfMock.state.numPages = 2;
    renderPreview();

    await waitFor(() => {
      expect(previewPages()).not.toBeNull();
    });

    const download = screen.getByRole("button", { name: "Download Original" });
    expect(download).toBeInTheDocument();
    expect(download).toBeEnabled();
  });
});
