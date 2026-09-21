import "@testing-library/jest-dom/vitest";
import { SourceType } from "@/backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
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

import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { ResearchIntakePage } from "./pages/ResearchIntakePage";

// ---------------------------------------------------------------------------
// Cover for the accepted Office/CSV upload SUBMIT journeys.
//
// The pre-read acceptance of the expanded seven-type document allowlist is
// already covered at the page level (UploadPreReadRejectionSurfaces.cover) and
// the rendered Office document card is covered by
// ArchiveDocumentAllowlistCharacterize. This file closes the remaining seam:
// the accepted requirement that a CSV, Word, or Excel upload is SUBMITTED with
// its sanitized filename and validated MIME type preserved, on both the archive
// contribution surface and the research source surface.
//
//   1. ArchiveContributionPage: choosing Document and uploading a CSV/Word/
//      Excel file submits `submitArchiveItem` with the sanitized filename
//      (arg 14) and the declared MIME type (arg 3), and the blob carries the
//      same MIME type and sanitized name.
//   2. ResearchIntakePage: uploading a CSV/Word/Excel source file submits
//      `createSourceWithUpload` with the sanitized filename (arg 12) and the
//      declared MIME type (arg 3).
//
// The frontend suite mocks the actor, so this asserts the page's call contract,
// not a deployed browser or a real canister. The PocketIC lane exercises the
// real canister's storage of these types separately.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const { mockActor, submitCalls, sourceUploadCalls } = vi.hoisted(() => {
  const submitCalls: unknown[][] = [];
  const sourceUploadCalls: unknown[][] = [];
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      // The Research Intake workspace is Steward-gated; the research source
      // submit journey below needs the form to render.
      return true;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async submitArchiveItem(...args: unknown[]): Promise<unknown> {
      submitCalls.push(args);
      return null;
    },
    async createSourceWithUpload(...args: unknown[]): Promise<unknown> {
      sourceUploadCalls.push(args);
      return { ok: { id: 1n, archiveItemId: 1n } };
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listSources(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<unknown> {
      return { pending: 0n, conflicting: 0n };
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
  };
  return { mockActor, submitCalls, sourceUploadCalls };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  submitCalls.length = 0;
  sourceUploadCalls.length = 0;
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
  // jsdom's File does not implement Blob.prototype.arrayBuffer, which the
  // upload path uses to read the file bytes. Polyfill it via FileReader so the
  // page's handleFile can run end to end.
  if (typeof File.prototype.arrayBuffer !== "function") {
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function fileInput(testId: string): HTMLInputElement {
  return document.querySelector(`[data-ocid="${testId}"]`) as HTMLInputElement;
}

/** The accepted Office/CSV document types and a representative filename each. */
const OFFICE_CASES: Array<[string, string]> = [
  ["ledger.csv", "text/csv"],
  ["notes.doc", "application/msword"],
  [
    "notes.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["ledger.xls", "application/vnd.ms-excel"],
  [
    "ledger.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
];

// ---------------------------------------------------------------------------
// 1. Archive contribution submit journey.
// ---------------------------------------------------------------------------

describe("archive contribution submits Office/CSV uploads with sanitized name and MIME type", () => {
  async function openArchiveDocumentForm() {
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);
    // Document is the second type choice (index 1 -> card.2).
    await user.click(await screen.findByTestId("archive.type.card.2"));
    await screen.findByTestId("archive.form.file_input");
    return user;
  }

  for (const [filename, mime] of OFFICE_CASES) {
    it(`submits ${filename} (${mime}) with the sanitized filename and MIME type`, async () => {
      const user = await openArchiveDocumentForm();

      // A raw name with a path separator and a control character: the page must
      // persist the sanitized form, not the raw name.
      const rawName = `records/${filename.replace(".", "\t.")}`;
      const sanitized = rawName.replace(/[/\\]/g, "").replace(/\t/g, "");
      await user.upload(
        fileInput("archive.form.file_input"),
        new File(["office-bytes"], rawName, { type: mime }),
      );

      // The sanitized name is what the form shows as selected.
      expect(await screen.findByText(sanitized)).toBeInTheDocument();

      await user.type(screen.getByLabelText("Title"), "Office upload");
      await user.click(
        screen.getByRole("button", { name: "Submit for approval" }),
      );

      expect(
        await screen.findByRole("heading", { name: "Contribution submitted" }),
      ).toBeInTheDocument();

      expect(submitCalls).toHaveLength(1);
      const args = submitCalls[0];
      // Arg 3 is the validated MIME type; arg 14 is the sanitized filename.
      expect(args[3]).toBe(mime);
      expect(args[14]).toBe(sanitized);
      // The blob carries the same MIME type and sanitized name.
      const blob = args[4] as { contentType: string; filename: string };
      expect(blob.contentType).toBe(mime);
      expect(blob.filename).toBe(sanitized);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Research source upload submit journey.
// ---------------------------------------------------------------------------

describe("research source submits Office/CSV uploads with sanitized name and MIME type", () => {
  async function openResearchUploadForm() {
    const user = userEvent.setup();
    renderWithQueryClient(
      <ResearchIntakePage
        onBack={() => {}}
        onOpenReviewQueue={() => {}}
        onOpenConflictReview={() => {}}
      />,
    );
    await user.click(
      await screen.findByTestId("research.source.mode_upload_tab"),
    );
    await user.selectOptions(
      await screen.findByTestId("research.source.type_select"),
      SourceType.UploadedDocumentImage,
    );
    await screen.findByTestId("research.source.file_input");
    return user;
  }

  for (const [filename, mime] of OFFICE_CASES) {
    it(`submits ${filename} (${mime}) with the sanitized filename and MIME type`, async () => {
      const user = await openResearchUploadForm();

      const rawName = `sources/${filename.replace(".", "\t.")}`;
      const sanitized = rawName.replace(/[/\\]/g, "").replace(/\t/g, "");
      await user.upload(
        fileInput("research.source.file_input"),
        new File(["office-bytes"], rawName, { type: mime }),
      );

      expect(await screen.findByText(sanitized)).toBeInTheDocument();

      // The source form requires a title, a type, and a description.
      await user.type(
        screen.getByTestId("research.source.title_input"),
        "Office source",
      );
      await user.type(
        screen.getByTestId("research.source.description_input"),
        "An uploaded Office source.",
      );
      await user.click(screen.getByTestId("research.source.submit_button"));

      expect(sourceUploadCalls).toHaveLength(1);
      const args = sourceUploadCalls[0];
      // Arg 3 is the validated MIME type; arg 12 is the sanitized filename.
      expect(args[3]).toBe(mime);
      expect(args[12]).toBe(sanitized);
      const blob = args[4] as { contentType: string; filename: string };
      expect(blob.contentType).toBe(mime);
      expect(blob.filename).toBe(sanitized);
    });
  }
});
