import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
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

import {
  DOCUMENT_MIME_TYPES,
  FORBIDDEN_MIME_TYPES,
  MAX_ARCHIVE_DOCUMENT_BYTES,
  SURFACE_ALLOWED_MIME_TYPES,
  allowedMimeTypes,
  isMimeTypeAllowed,
  sanitizeFilename,
  surfaceForArchiveItemType,
  surfaceForSourceType,
  validateArchiveFile,
  validateFile,
  validateSourceFile,
} from "./lib/fileValidation";
import { ArchiveDetailPage } from "./pages/ArchiveDetailPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the document-MIME-allowlist expansion.
//
// The intentional change is that Word (.doc/.docx), Excel (.xls/.xlsx), and CSV
// (text/csv) uploads move from REJECTED to ACCEPTED on the archive-document
// surface. This file deliberately does NOT freeze that rejection. It freezes the
// adjacent behavior that must survive the expansion:
//
//   1. PDF and plain text stay accepted on the archive-document surface, and
//      the archive item-type / research source-type mappings still route to it.
//   2. Every forbidden type (HTML, SVG, JavaScript, executables, ZIP/RAR/7z,
//      shell scripts) stays rejected on the document surface, even if a future
//      allowlist edit accidentally admits one.
//   3. The archive-document ceiling stays 20 MB: exactly at the ceiling is
//      accepted, one byte over is rejected.
//   4. The non-document surfaces are untouched: image, audio, video, and board
//      attachment allowlists keep their exact membership.
//   5. The frontend document allowlist and the board-attachment document
//      portion stay in lockstep (the same set), so the two surfaces cannot
//      drift apart.
//   6. Word and Excel documents are never rendered inline in an iframe or as
//      HTML: they show a document card with the filename and a Download
//      Original action only.
//   7. Filename sanitization still strips path separators and control
//      characters and preserves a safe extension.
//
// The frontend suite mocks the actor, so this asserts the frontend pre-read
// contract and the rendered DOM contract, not a deployed browser or a real
// canister. Backend/frontend allowlist parity is asserted by reading the
// backend Motoko source in this file (see "backend and frontend document
// allowlists stay in lockstep"); the PocketIC lane additionally exercises the
// real canister when a backend wasm is available.
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

/** Builds a File with a declared size without allocating that many bytes. */
function fileOfSize(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function documentItem(
  id: bigint,
  title: string,
  mimeType: string,
  filename: string,
  itemType: ArchiveItemType = ArchiveItemType.Document,
): ArchiveItem {
  return {
    familyId: "norwood",
    id,
    title,
    description: "A document.",
    itemType,
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

// ---------------------------------------------------------------------------
// 1. PDF and plain text stay accepted on the document surface.
// ---------------------------------------------------------------------------

describe("document surface keeps accepting PDF and plain text", () => {
  it("accepts a PDF on the archive document surface", () => {
    const result = validateFile(
      fileOfSize("deed.pdf", "application/pdf", 2048),
      "archiveDocument",
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("accepts plain text on the archive document surface", () => {
    const result = validateFile(
      fileOfSize("letter.txt", "text/plain", 2048),
      "archiveDocument",
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("keeps PDF and plain text on the document allowlist", () => {
    const allowed = allowedMimeTypes("archiveDocument");
    expect(allowed).toContain("application/pdf");
    expect(allowed).toContain("text/plain");
  });

  it("routes every file-bearing archive item type to the document surface", () => {
    for (const itemType of ["Document", "Research", "WorkBusiness", "Other"]) {
      expect(surfaceForArchiveItemType(itemType)).toBe("archiveDocument");
    }
  });

  it("routes every research source type to the document surface", () => {
    expect(surfaceForSourceType("CensusCitation")).toBe("archiveDocument");
    expect(surfaceForSourceType("UploadedDocumentImage")).toBe(
      "archiveDocument",
    );
    expect(surfaceForSourceType("")).toBeNull();
  });

  it("accepts a PDF through the archive and research entry points", () => {
    expect(
      validateArchiveFile(
        fileOfSize("census.pdf", "application/pdf", 2048),
        "Research",
      ).valid,
    ).toBe(true);
    expect(
      validateSourceFile(
        fileOfSize("census.pdf", "application/pdf", 2048),
        "CensusCitation",
      ).valid,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1b. The expanded document allowlist accepts all seven types on the document
//     surface, through both the archive and research entry points.
// ---------------------------------------------------------------------------

describe("document surface accepts the expanded seven-type allowlist", () => {
  const accepted: Array<[string, string, string]> = [
    ["PDF", "application/pdf", "deed.pdf"],
    ["plain text", "text/plain", "letter.txt"],
    ["CSV", "text/csv", "ledger.csv"],
    ["Word .doc", "application/msword", "notes.doc"],
    [
      "Word .docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "notes.docx",
    ],
    ["Excel .xls", "application/vnd.ms-excel", "ledger.xls"],
    [
      "Excel .xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "ledger.xlsx",
    ],
  ];

  it("accepts every one of the seven document types on the archive document surface", () => {
    for (const [label, mime, filename] of accepted) {
      const result = validateFile(
        fileOfSize(filename, mime, 2048),
        "archiveDocument",
      );
      expect(result.valid, `${label} (${mime}) should be accepted`).toBe(true);
      expect(result.error).toBeNull();
    }
  });

  it("accepts every one of the seven document types through the archive entry point", () => {
    for (const [label, mime, filename] of accepted) {
      const result = validateArchiveFile(
        fileOfSize(filename, mime, 2048),
        "Document",
      );
      expect(result.valid, `${label} (${mime}) should be accepted`).toBe(true);
    }
  });

  it("accepts every one of the seven document types through the research source entry point", () => {
    for (const [label, mime, filename] of accepted) {
      const result = validateSourceFile(
        fileOfSize(filename, mime, 2048),
        "CensusCitation",
      );
      expect(result.valid, `${label} (${mime}) should be accepted`).toBe(true);
    }
  });

  it("keeps the document allowlist to exactly those seven types", () => {
    expect([...DOCUMENT_MIME_TYPES].sort()).toEqual(
      [
        "application/msword",
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/csv",
        "text/plain",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// 1c. Backend/frontend allowlist parity: the backend Motoko document allowlist
//     and the frontend DOCUMENT_MIME_TYPES must contain exactly the same seven
//     MIME types. This reads the backend source directly so drift is caught in
//     the gated frontend suite, not only in the PocketIC lane.
// ---------------------------------------------------------------------------

describe("backend and frontend document allowlists stay in lockstep", () => {
  /** Extracts the string literals of a Motoko `[Text]` list by its binding name. */
  function motokoListLiterals(source: string, binding: string): string[] {
    const start = source.indexOf(`public let ${binding} : [Text] = [`);
    expect(start, `${binding} not found in backend source`).toBeGreaterThan(-1);
    const open = source.indexOf("[", start);
    const close = source.indexOf("];", open);
    expect(close, `${binding} list is not terminated`).toBeGreaterThan(open);
    const body = source.slice(open + 1, close);
    return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  }

  const backendSource = readFileSync(
    `${process.cwd()}/../backend/lib/input-validation.mo`,
    "utf8",
  );

  it("has the same seven document MIME types in the backend and the frontend", () => {
    const backendDocumentTypes = motokoListLiterals(
      backendSource,
      "DOCUMENT_MIME_TYPES",
    );
    expect(backendDocumentTypes.sort()).toEqual(
      [...DOCUMENT_MIME_TYPES].sort(),
    );
    expect(backendDocumentTypes).toHaveLength(7);
  });

  it("has the same forbidden MIME types in the backend and the frontend", () => {
    const backendForbiddenTypes = motokoListLiterals(
      backendSource,
      "FORBIDDEN_MIME_TYPES",
    );
    expect(backendForbiddenTypes.sort()).toEqual(
      [...FORBIDDEN_MIME_TYPES].sort(),
    );
  });

  it("keeps the backend archive-document ceiling at 20 MB", () => {
    expect(backendSource).toMatch(
      /public let MAX_ARCHIVE_DOCUMENT_BYTES : Nat = 20971520;/,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Forbidden types stay rejected on the document surface.
// ---------------------------------------------------------------------------

describe("forbidden types stay rejected on the document surface", () => {
  it("rejects every forbidden MIME type on the archive document surface", () => {
    for (const forbidden of FORBIDDEN_MIME_TYPES) {
      expect(isMimeTypeAllowed("archiveDocument", forbidden)).toBe(false);
      const result = validateFile(
        fileOfSize("blocked", forbidden, 2048),
        "archiveDocument",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not permitted/i);
    }
  });

  it("rejects HTML, SVG, JavaScript, executables, archives, and shell scripts", () => {
    const cases: Array<[string, string]> = [
      ["page.html", "text/html"],
      ["logo.svg", "image/svg+xml"],
      ["app.js", "application/javascript"],
      ["setup.exe", "application/x-msdownload"],
      ["bundle.zip", "application/zip"],
      ["archive.rar", "application/x-rar-compressed"],
      ["archive.7z", "application/x-7z-compressed"],
      ["run.sh", "application/x-sh"],
    ];
    for (const [name, mime] of cases) {
      const result = validateArchiveFile(
        fileOfSize(name, mime, 2048),
        "Document",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not permitted/i);
    }
  });

  it("rejects a forbidden type even when it is case- and space-padded", () => {
    expect(isMimeTypeAllowed("archiveDocument", "  TEXT/HTML  ")).toBe(false);
    expect(isMimeTypeAllowed("archiveDocument", "IMAGE/SVG+XML")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. The archive-document ceiling stays 20 MB.
// ---------------------------------------------------------------------------

describe("archive document ceiling stays 20 MB", () => {
  it("exposes the 20 MB ceiling constant", () => {
    expect(MAX_ARCHIVE_DOCUMENT_BYTES).toBe(20 * 1024 * 1024);
  });

  it("accepts a PDF exactly at the ceiling and rejects one byte over", () => {
    expect(
      validateFile(
        fileOfSize("deed.pdf", "application/pdf", MAX_ARCHIVE_DOCUMENT_BYTES),
        "archiveDocument",
      ).valid,
    ).toBe(true);

    const over = validateFile(
      fileOfSize("deed.pdf", "application/pdf", MAX_ARCHIVE_DOCUMENT_BYTES + 1),
      "archiveDocument",
    );
    expect(over.valid).toBe(false);
    expect(over.error).toMatch(/at most/i);
  });

  it("rejects an empty document", () => {
    const result = validateFile(
      fileOfSize("empty.pdf", "application/pdf", 0),
      "archiveDocument",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Non-document surfaces are untouched.
// ---------------------------------------------------------------------------

describe("non-document surfaces keep their exact allowlists", () => {
  it("keeps the image surface to JPEG, PNG, and WebP", () => {
    expect([...SURFACE_ALLOWED_MIME_TYPES.archiveImage]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("keeps the audio surface to its five types", () => {
    expect([...SURFACE_ALLOWED_MIME_TYPES.archiveAudio]).toEqual([
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
    ]);
  });

  it("keeps the video surface to MP4, WebM, and QuickTime", () => {
    expect([...SURFACE_ALLOWED_MIME_TYPES.archiveVideo]).toEqual([
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]);
  });

  it("rejects a document type on the image-only surface", () => {
    expect(
      validateFile(
        fileOfSize("deed.pdf", "application/pdf", 2048),
        "archiveImage",
      ).valid,
    ).toBe(false);
  });

  it("rejects an image on the document-only surface", () => {
    expect(
      validateFile(
        fileOfSize("photo.png", "image/png", 2048),
        "archiveDocument",
      ).valid,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. The document allowlist and the board-attachment document portion stay in
//    lockstep, so the two surfaces cannot drift apart.
// ---------------------------------------------------------------------------

describe("document allowlist stays consistent across surfaces", () => {
  it("uses the same document set for archiveDocument and the board attachment", () => {
    const documentSet = [...allowedMimeTypes("archiveDocument")].sort();
    const boardSet = [...SURFACE_ALLOWED_MIME_TYPES.boardAttachment]
      .filter((mime) => documentSet.includes(mime))
      .sort();
    expect(boardSet).toEqual(documentSet);
  });

  it("keeps the exported DOCUMENT_MIME_TYPES in sync with the archiveDocument surface", () => {
    expect([...DOCUMENT_MIME_TYPES].sort()).toEqual(
      [...allowedMimeTypes("archiveDocument")].sort(),
    );
  });

  it("admits every document type on the board attachment surface", () => {
    for (const mime of DOCUMENT_MIME_TYPES) {
      expect(isMimeTypeAllowed("boardAttachment", mime)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Word and Excel documents are never rendered inline in an iframe or as
//    HTML: they show a document card with the filename and Download Original.
// ---------------------------------------------------------------------------

describe("Office documents are download-only and never rendered inline", () => {
  const officeCases: Array<[string, string, string]> = [
    ["Word .doc", "application/msword", "notes.doc"],
    [
      "Word .docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "notes.docx",
    ],
    ["Excel .xls", "application/vnd.ms-excel", "ledger.xls"],
    [
      "Excel .xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "ledger.xlsx",
    ],
  ];

  for (const [label, mime, filename] of officeCases) {
    it(`shows a document card with the filename and Download Original for ${label}`, async () => {
      renderDetail(documentItem(30n, `${label} document`, mime, filename));

      const download = await screen.findByRole("button", {
        name: "Download Original",
      });
      expect(download).toBeInTheDocument();
      // The filename is shown on the document card.
      expect(screen.getByText(filename)).toBeInTheDocument();
      // No inline preview is offered for an Office document.
      expect(
        screen.queryByRole("button", { name: "Preview" }),
      ).not.toBeInTheDocument();
      expect(
        document.querySelector('[data-ocid="archive_detail.preview_stage"]'),
      ).not.toBeInTheDocument();
    });
  }

  it("never introduces an iframe for a Word or Excel document", async () => {
    renderDetail(
      documentItem(
        40n,
        "Word document",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "notes.docx",
      ),
    );

    await screen.findByRole("button", { name: "Download Original" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("object")).toBeNull();
    expect(document.querySelector("embed")).toBeNull();
  });

  it("never renders an Office document as inline HTML", async () => {
    renderDetail(
      documentItem(
        41n,
        "Excel document",
        "application/vnd.ms-excel",
        "ledger.xls",
      ),
    );

    await screen.findByRole("button", { name: "Download Original" });
    // The document card is a plain icon + filename + actions; no injected
    // document markup is present.
    const artifact = document.querySelector(
      '[data-ocid="archive_detail.artifact"]',
    ) as HTMLElement;
    expect(artifact.querySelector("table")).toBeNull();
    expect(artifact.querySelector("iframe")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6b. Regression: an Office/CSV document uploaded under a Research,
//     WorkBusiness, or Other item type (all of which the backend maps to the
//     archive-document surface) must render the same download-only document
//     card as a Document item type. These item types are also TEXT_TYPES, so a
//     branch-order regression that evaluates the text-type frame before the
//     Office check would render a filename-less text frame with no Download
//     Original. This freezes the repaired order.
// ---------------------------------------------------------------------------

describe("Office documents under Research/WorkBusiness/Other item types render the document card", () => {
  const officeCases: Array<[string, string, string]> = [
    ["Word .doc", "application/msword", "notes.doc"],
    [
      "Word .docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "notes.docx",
    ],
    ["Excel .xls", "application/vnd.ms-excel", "ledger.xls"],
    [
      "Excel .xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "ledger.xlsx",
    ],
    ["CSV", "text/csv", "ledger.csv"],
  ];

  const itemTypes: Array<[string, ArchiveItemType]> = [
    ["Research", ArchiveItemType.Research],
    ["WorkBusiness", ArchiveItemType.WorkBusiness],
    ["Other", ArchiveItemType.Other],
  ];

  for (const [typeLabel, itemType] of itemTypes) {
    for (const [label, mime, filename] of officeCases) {
      it(`shows the document card with filename and Download Original for ${label} under ${typeLabel}`, async () => {
        renderDetail(
          documentItem(
            60n,
            `${label} under ${typeLabel}`,
            mime,
            filename,
            itemType,
          ),
        );

        // The document card is present with the filename and the download action.
        const card = await screen.findByTestId("archive_detail.document_card");
        expect(card).toBeInTheDocument();
        expect(screen.getByText(filename)).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Download Original" }),
        ).toBeInTheDocument();

        // No inline preview is offered, and no iframe/HTML is introduced.
        expect(
          screen.queryByRole("button", { name: "Preview" }),
        ).not.toBeInTheDocument();
        expect(
          document.querySelector('[data-ocid="archive_detail.preview_stage"]'),
        ).not.toBeInTheDocument();
        expect(document.querySelector("iframe")).toBeNull();
        expect(document.querySelector("object")).toBeNull();
        expect(document.querySelector("embed")).toBeNull();
        expect(card.querySelector("table")).toBeNull();
      });
    }
  }

  it("does not render the text-type frame for an Office document under Research", async () => {
    renderDetail(
      documentItem(
        61n,
        "Research Word document",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "research-notes.docx",
        ArchiveItemType.Research,
      ),
    );

    await screen.findByTestId("archive_detail.document_card");
    // The text-type frame's copy must not appear in the artifact viewer.
    const artifact = document.querySelector(
      '[data-ocid="archive_detail.artifact"]',
    ) as HTMLElement;
    expect(
      within(artifact).queryByText(/original written content is preserved/i),
    ).not.toBeInTheDocument();
    expect(
      within(artifact).getByText("research-notes.docx"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. PDF preview still renders in-app without an iframe; plain text stays
//    download-only.
// ---------------------------------------------------------------------------

describe("PDF preview and plain-text behavior are unchanged", () => {
  it("renders a PDF preview in-app without an iframe", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(50n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(stage).toBeInTheDocument();
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

  it("keeps the filename as the PDF preview stage heading", async () => {
    const user = userEvent.setup();
    renderDetail(documentItem(51n, "Deed scan", "application/pdf", "deed.pdf"));

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(within(stage).getByText("deed.pdf")).toBeInTheDocument();
  });

  it("offers Download Original only for a plain-text document", async () => {
    renderDetail(documentItem(52n, "A letter", "text/plain", "letter.txt"));

    expect(
      await screen.findByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Filename sanitization is unchanged.
// ---------------------------------------------------------------------------

describe("filename sanitization is unchanged", () => {
  it("strips path separators and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("....etcpasswd");
    expect(sanitizeFilename("records/1924\tdeed.pdf")).toBe(
      "records1924deed.pdf",
    );
  });

  it("collapses whitespace runs and trims", () => {
    expect(sanitizeFilename("  my   file.pdf  ")).toBe("my file.pdf");
  });

  it("preserves a safe extension when capping a long name", () => {
    const sanitized = sanitizeFilename(`${"a".repeat(300)}.docx`);
    expect(sanitized).not.toBeNull();
    expect(sanitized!.endsWith(".docx")).toBe(true);
  });

  it("returns null when nothing usable remains", () => {
    expect(sanitizeFilename("")).toBeNull();
    expect(sanitizeFilename("///")).toBeNull();
  });
});
