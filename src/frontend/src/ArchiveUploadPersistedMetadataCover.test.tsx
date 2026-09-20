import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  type ArchiveItemClassification,
  ArchiveItemStatus,
  type ArchiveItemType,
  type OralHistorySpeaker,
  type PrivacyLevel,
  type SourceStatus,
} from "@/backend";
import type { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
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
import { NOTIFICATION_TYPE_LABELS, NotificationType } from "./types/ownership";

// ---------------------------------------------------------------------------
// Cover for the accepted persisted archive upload metadata change, at the
// PAGE level.
//
// The change persists the validated MIME type and the sanitized filename on the
// ArchiveItem record at every upload-based creation path. The hook-level
// argument order is already characterized elsewhere; this file drives the real
// ArchiveContributionPage upload form and asserts the observable contract:
//
//   1. A file whose raw name carries path separators, control characters, and
//      collapsed whitespace is submitted with the SANITIZED filename and the
//      declared MIME type, and the blob bytes are preserved unchanged.
//   2. The two new archive review notification types carry the accepted
//      friendly labels.
//
// The frontend suite mocks the actor, so this asserts the page's call contract
// and the label map, not a deployed browser or a real canister.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const { mockActor, submitCalls } = vi.hoisted(() => {
  const submitCalls: unknown[][] = [];
  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return false;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async submitArchiveItem(...args: unknown[]): Promise<ArchiveItem> {
      submitCalls.push(args);
      return {
        id: 1n,
        title: String(args[0]),
        description: String(args[1]),
        itemType: args[2] as ArchiveItemType,
        blob: args[4] as ExternalBlob,
        mimeType: String(args[3]),
        filename: String(args[14]),
        era: String(args[5]),
        year: (args[6] as bigint | null) ?? undefined,
        tags: args[7] as string[],
        relatedMemberIds: args[8] as string[],
        relatedBranchId: (args[9] as string | null) ?? undefined,
        sourceStatus: args[10] as SourceStatus,
        privacyLevel: args[11] as PrivacyLevel,
        classification: args[12] as ArchiveItemClassification,
        primarySpeaker: (args[13] as OralHistorySpeaker | null) ?? undefined,
        status: ArchiveItemStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: Principal.fromText("aaaaa-aa"),
      };
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async listNotifications() {
      return [];
    },
  };
  return { mockActor, submitCalls };
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
  submitCalls.length = 0;
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

function renderContributionPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ArchiveContributionPage onBack={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Archive upload persists the sanitized filename and MIME type", () => {
  it("submits the sanitized filename and declared MIME type for a PDF document", async () => {
    const user = userEvent.setup();
    renderContributionPage();

    // Choose the Document type, which accepts PDF uploads.
    await user.click(screen.getByText("Document"));

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    // A raw name with a path separator, a control character, and a whitespace
    // run: the page must persist the sanitized form, not the raw name.
    const rawName = "records/1924\tdeed   scan.pdf";
    const file = new File(["pdf-bytes"], rawName, {
      type: "application/pdf",
    });
    await user.upload(input, file);

    // The sanitized name is what the form shows as selected: the path
    // separator and the control character are removed, and the whitespace run
    // collapses to a single space.
    expect(
      await screen.findByText("records1924deed scan.pdf"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "1924 deed");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Contribution submitted" }),
    ).toBeInTheDocument();

    // Exactly one submit, carrying the sanitized filename and the MIME type.
    expect(submitCalls).toHaveLength(1);
    const args = submitCalls[0];
    expect(args[3]).toBe("application/pdf");
    expect(args[14]).toBe("records1924deed scan.pdf");
    // The blob is preserved unchanged: the same bytes that were uploaded.
    const blob = args[4] as ExternalBlob;
    expect(blob.contentType).toBe("application/pdf");
    expect(blob.filename).toBe("records1924deed scan.pdf");
  });

  it("persists the sanitized filename for a raster image upload", async () => {
    const user = userEvent.setup();
    renderContributionPage();

    await user.click(screen.getByText("Photo"));

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["png-bytes"], "album\\wedding   portrait.png", {
      type: "image/png",
    });
    await user.upload(input, file);

    await user.type(screen.getByLabelText("Title"), "Wedding portrait");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Contribution submitted" }),
    ).toBeInTheDocument();

    expect(submitCalls).toHaveLength(1);
    const args = submitCalls[0];
    expect(args[3]).toBe("image/png");
    expect(args[14]).toBe("albumwedding portrait.png");
  });
});

describe("archive review notification labels", () => {
  it("maps ArchiveApproved and ArchiveRejected to the accepted friendly labels", () => {
    expect(NOTIFICATION_TYPE_LABELS[NotificationType.ArchiveApproved]).toBe(
      "Archive contribution approved",
    );
    expect(NOTIFICATION_TYPE_LABELS[NotificationType.ArchiveRejected]).toBe(
      "Archive contribution rejected",
    );
  });
});
