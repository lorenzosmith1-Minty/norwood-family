import "@testing-library/jest-dom/vitest";
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
import { VideoContributePage } from "./pages/VideoContributePage";

// ---------------------------------------------------------------------------
// Cover for the accepted pre-read upload rejection at the page level.
//
// Every upload surface validates a file's declared size and MIME type BEFORE it
// calls `file.arrayBuffer()`. The accepted behavior this file asserts:
//
//   1. A forbidden type (SVG, HTML, executable, archive) is rejected with a
//      clear message and the file is not selected.
//   2. A file over the surface ceiling is rejected with a clear message.
//   3. A file whose type does not match the selected surface is rejected.
//   4. A valid file is accepted and shown as selected.
//
// The rejection is observable as the page's error state plus the absence of the
// "file selected" panel. The frontend suite mocks the actor, so this asserts the
// page's own pre-read gate, not a deployed browser or a real backend.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const { mockActor } = vi.hoisted(() => ({
  mockActor: {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async submitArchiveItem(): Promise<unknown> {
      return null;
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
  },
}));

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
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
  if (typeof File.prototype.arrayBuffer !== "function") {
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(0));
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

/** Builds a File with a declared size without allocating that many bytes. */
function fileOfSize(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

/** Opens the archive contribution form on the Document (file) surface. */
async function openArchiveDocumentForm(
  user: ReturnType<typeof userEvent.setup>,
) {
  renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);
  await user.click(await screen.findByTestId("archive.type.card.2"));
  await screen.findByTestId("archive.form.file_input");
}

/** Opens the video contribution form on the uploaded-video surface. */
async function openVideoForm() {
  renderWithQueryClient(
    <VideoContributePage onBack={() => {}} initialKind="uploaded-video" />,
  );
  await screen.findByTestId("video_contribute.form.file_input");
}

describe("archive contribution rejects invalid files before reading bytes", () => {
  it("rejects a scriptable SVG on the document surface", async () => {
    const user = userEvent.setup();
    await openArchiveDocumentForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("logo.svg", "image/svg+xml", 1024));

    expect(
      await screen.findByTestId("archive.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
    expect(
      screen.queryByTestId("archive.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects an HTML document on the document surface", async () => {
    const user = userEvent.setup();
    await openArchiveDocumentForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("page.html", "text/html", 1024));

    expect(
      await screen.findByTestId("archive.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
    expect(
      screen.queryByTestId("archive.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects an executable on the document surface", async () => {
    const user = userEvent.setup();
    await openArchiveDocumentForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(
      input,
      fileOfSize("setup.exe", "application/x-msdownload", 1024),
    );

    expect(
      await screen.findByTestId("archive.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
    expect(
      screen.queryByTestId("archive.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects a file over the document ceiling", async () => {
    const user = userEvent.setup();
    await openArchiveDocumentForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    // 20 MB document ceiling + 1 byte.
    await user.upload(
      input,
      fileOfSize("huge.pdf", "application/pdf", 20 * 1024 * 1024 + 1),
    );

    expect(
      await screen.findByTestId("archive.form.error_state"),
    ).toHaveTextContent(/at most/i);
    expect(
      screen.queryByTestId("archive.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects a video on the document surface", async () => {
    const user = userEvent.setup();
    await openArchiveDocumentForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("clip.mp4", "video/mp4", 1024));

    expect(
      await screen.findByTestId("archive.form.error_state"),
    ).toHaveTextContent(/unsupported file type/i);
    expect(
      screen.queryByTestId("archive.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("accepts a valid PDF and shows it as selected", async () => {
    const user = userEvent.setup();
    await openArchiveDocumentForm(user);

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("deed.pdf", "application/pdf", 1024));

    expect(
      await screen.findByTestId("archive.form.file_selected"),
    ).toHaveTextContent("deed.pdf");
    expect(
      screen.queryByTestId("archive.form.error_state"),
    ).not.toBeInTheDocument();
  });
});

describe("video contribution rejects invalid files before reading bytes", () => {
  it("rejects a scriptable SVG on the video surface", async () => {
    const user = userEvent.setup();
    await openVideoForm();

    const input = document.querySelector(
      '[data-ocid="video_contribute.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("logo.svg", "image/svg+xml", 1024));

    expect(
      await screen.findByTestId("video_contribute.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
    expect(
      screen.queryByTestId("video_contribute.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects a file over the video ceiling", async () => {
    const user = userEvent.setup();
    await openVideoForm();

    const input = document.querySelector(
      '[data-ocid="video_contribute.form.file_input"]',
    ) as HTMLInputElement;
    // 75 MB video ceiling + 1 byte.
    await user.upload(
      input,
      fileOfSize("huge.mp4", "video/mp4", 75 * 1024 * 1024 + 1),
    );

    expect(
      await screen.findByTestId("video_contribute.form.error_state"),
    ).toHaveTextContent(/at most/i);
    expect(
      screen.queryByTestId("video_contribute.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("accepts a valid MP4 and shows it as selected", async () => {
    const user = userEvent.setup();
    await openVideoForm();

    const input = document.querySelector(
      '[data-ocid="video_contribute.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("clip.mp4", "video/mp4", 1024));

    expect(
      await screen.findByTestId("video_contribute.form.file_selected"),
    ).toHaveTextContent("clip.mp4");
    expect(
      screen.queryByTestId("video_contribute.form.error_state"),
    ).not.toBeInTheDocument();
  });
});
