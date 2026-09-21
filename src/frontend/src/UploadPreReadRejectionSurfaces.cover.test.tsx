import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  SourceType,
} from "@/backend";
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
import { BoardPostComposer } from "./pages/BoardPostComposer";
import { ProfileEditPage } from "./pages/ProfileEditPage";
import { RecipeContributePage } from "./pages/RecipeContributePage";
import { ResearchIntakePage } from "./pages/ResearchIntakePage";

// ---------------------------------------------------------------------------
// Cover for the accepted pre-read upload rejection on the remaining surfaces.
//
// UploadPreReadRejection.cover.test.tsx already covers the archive document and
// video contribution surfaces. This file extends the same accepted behavior to
// the profile photo, recipe media, board attachment, and research source
// surfaces: a forbidden type (SVG/HTML/executable/archive), an oversized file,
// or a type that does not match the surface is rejected with a clear message
// BEFORE any `file.arrayBuffer()` read, and a valid file is accepted.
//
// The frontend suite mocks the actor, so this asserts each page's own pre-read
// gate, not a deployed browser or a real backend.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const { mockActor } = vi.hoisted(() => {
  // An unclaimed living profile: the steward may edit it, so the profile-edit
  // form (including the photo section) renders.
  const editableProfile = {
    personId: "clayton",
    name: "Clayton Norwood",
    livingStatus: "Living",
    claimStatus: "Unclaimed",
    claimedByUserId: undefined,
    preferredName: undefined,
    firstName: undefined,
    middleName: undefined,
    lastName: undefined,
    suffix: undefined,
    nickname: undefined,
    birthDate: undefined,
    birthplace: undefined,
    currentLocation: undefined,
    occupation: undefined,
    shortBio: undefined,
    longerStory: undefined,
    story: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };

  return {
    mockActor: {
      async isCallerAdmin(): Promise<boolean> {
        return false;
      },
      async isCallerSteward(): Promise<boolean> {
        return true;
      },
      async hasActiveSteward(): Promise<boolean> {
        return true;
      },
      async getPersonProfile(): Promise<unknown> {
        return editableProfile;
      },
      async getMyProfile(): Promise<unknown> {
        return null;
      },
      async getMyProfileClaim(): Promise<unknown> {
        return null;
      },
      async listPhotos(): Promise<unknown[]> {
        return [];
      },
      async getProfilePhoto(): Promise<unknown> {
        return null;
      },
      async listApprovedArchiveItems(): Promise<unknown[]> {
        return [];
      },
      async listPendingArchiveItems(): Promise<unknown[]> {
        return [];
      },
      async listApprovedRecipes(): Promise<unknown[]> {
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
      async submitArchiveItem(): Promise<unknown> {
        return null;
      },
      async submitRecipe(): Promise<unknown> {
        return null;
      },
      async createSourceWithUpload(): Promise<unknown> {
        return null;
      },
      async createBoardPostWithMedia(): Promise<unknown> {
        return null;
      },
    },
  };
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
  window.history.replaceState(null, "", "/");
  localStorage.clear();
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

function fileInput(testId: string): HTMLInputElement {
  return document.querySelector(`[data-ocid="${testId}"]`) as HTMLInputElement;
}

// ---------------------------------------------------------------------------
// Profile photo: images only, 10 MB ceiling.
// ---------------------------------------------------------------------------

describe("profile photo rejects invalid files before reading bytes", () => {
  async function openProfilePhotoForm() {
    renderWithQueryClient(
      <ProfileEditPage personId="clayton" onBack={() => {}} />,
    );
    await screen.findByTestId("profile_edit.photo_input");
  }

  it("rejects a scriptable SVG", async () => {
    const user = userEvent.setup();
    await openProfilePhotoForm();

    await user.upload(
      fileInput("profile_edit.photo_input"),
      fileOfSize("logo.svg", "image/svg+xml", 1024),
    );

    expect(
      await screen.findByTestId("profile_edit.photo_error"),
    ).toHaveTextContent(/not permitted/i);
  });

  it("rejects a file over the 10 MB profile ceiling", async () => {
    const user = userEvent.setup();
    await openProfilePhotoForm();

    await user.upload(
      fileInput("profile_edit.photo_input"),
      fileOfSize("huge.png", "image/png", 10 * 1024 * 1024 + 1),
    );

    expect(
      await screen.findByTestId("profile_edit.photo_error"),
    ).toHaveTextContent(/at most/i);
  });

  it("rejects a PDF on the image-only surface", async () => {
    // `applyAccept: false` because the input's `accept="image/*"` hint would
    // otherwise make user-event drop the PDF before the change event fires. The
    // browser's accept attribute is only a picker hint — a user can choose "All
    // files" — so the page's own pre-read gate is what must reject it.
    const user = userEvent.setup({ applyAccept: false });
    await openProfilePhotoForm();

    await user.upload(
      fileInput("profile_edit.photo_input"),
      fileOfSize("deed.pdf", "application/pdf", 1024),
    );

    expect(
      await screen.findByTestId("profile_edit.photo_error"),
    ).toHaveTextContent(/unsupported file type/i);
  });

  it("accepts a valid PNG without an error", async () => {
    const user = userEvent.setup();
    await openProfilePhotoForm();

    await user.upload(
      fileInput("profile_edit.photo_input"),
      fileOfSize("portrait.png", "image/png", 1024),
    );

    expect(
      screen.queryByTestId("profile_edit.photo_error"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Recipe media: images only, 10 MB ceiling.
// ---------------------------------------------------------------------------

describe("recipe media rejects invalid files before reading bytes", () => {
  async function openRecipeForm() {
    renderWithQueryClient(
      <RecipeContributePage onBack={() => {}} onOpenRecipes={() => {}} />,
    );
    await screen.findByTestId("recipe.form.file_input");
  }

  it("rejects a scriptable SVG", async () => {
    const user = userEvent.setup();
    await openRecipeForm();

    await user.upload(
      fileInput("recipe.form.file_input"),
      fileOfSize("logo.svg", "image/svg+xml", 1024),
    );

    expect(
      await screen.findByTestId("recipe.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
    expect(
      screen.queryByTestId("recipe.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects a file over the 10 MB recipe ceiling", async () => {
    const user = userEvent.setup();
    await openRecipeForm();

    await user.upload(
      fileInput("recipe.form.file_input"),
      fileOfSize("huge.png", "image/png", 10 * 1024 * 1024 + 1),
    );

    expect(
      await screen.findByTestId("recipe.form.error_state"),
    ).toHaveTextContent(/at most/i);
    expect(
      screen.queryByTestId("recipe.form.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("accepts a valid PNG and shows it as selected", async () => {
    const user = userEvent.setup();
    await openRecipeForm();

    await user.upload(
      fileInput("recipe.form.file_input"),
      fileOfSize("dish.png", "image/png", 1024),
    );

    expect(
      await screen.findByTestId("recipe.form.file_selected"),
    ).toHaveTextContent("dish.png");
    expect(
      screen.queryByTestId("recipe.form.error_state"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Board attachment: image, video, PDF, or plain text only, 20 MB ceiling.
// ---------------------------------------------------------------------------

describe("board attachment rejects invalid files before reading bytes", () => {
  async function openBoardComposer() {
    renderWithQueryClient(
      <BoardPostComposer
        postId={null}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
    );
    await screen.findByTestId("board_compose.upload_input");
  }

  it("rejects a scriptable SVG", async () => {
    const user = userEvent.setup();
    await openBoardComposer();

    await user.upload(
      fileInput("board_compose.upload_input"),
      fileOfSize("logo.svg", "image/svg+xml", 1024),
    );

    expect(await screen.findByTestId("board_compose.error")).toHaveTextContent(
      /not permitted/i,
    );
    expect(
      screen.queryByTestId("board_compose.upload.1"),
    ).not.toBeInTheDocument();
  });

  it("rejects an executable", async () => {
    // `applyAccept: false`: an executable matches none of the input's accept
    // tokens, so user-event would drop it before the change event. The page's
    // own pre-read gate is what must reject it.
    const user = userEvent.setup({ applyAccept: false });
    await openBoardComposer();

    await user.upload(
      fileInput("board_compose.upload_input"),
      fileOfSize("setup.exe", "application/x-msdownload", 1024),
    );

    expect(await screen.findByTestId("board_compose.error")).toHaveTextContent(
      /not permitted/i,
    );
  });

  it("rejects a file over the 20 MB attachment ceiling", async () => {
    const user = userEvent.setup();
    await openBoardComposer();

    await user.upload(
      fileInput("board_compose.upload_input"),
      fileOfSize("huge.pdf", "application/pdf", 20 * 1024 * 1024 + 1),
    );

    expect(await screen.findByTestId("board_compose.error")).toHaveTextContent(
      /at most/i,
    );
    expect(
      screen.queryByTestId("board_compose.upload.1"),
    ).not.toBeInTheDocument();
  });

  it("accepts a valid PDF and shows it as an attachment", async () => {
    const user = userEvent.setup();
    await openBoardComposer();

    await user.upload(
      fileInput("board_compose.upload_input"),
      fileOfSize("minutes.pdf", "application/pdf", 1024),
    );

    expect(
      await screen.findByTestId("board_compose.upload.1"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("board_compose.error")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Research source: every source upload is gated on the document surface
// (PDF or plain text), 20 MB ceiling.
// ---------------------------------------------------------------------------

describe("research source rejects invalid files before reading bytes", () => {
  async function openResearchUploadForm() {
    const user = userEvent.setup();
    renderWithQueryClient(
      <ResearchIntakePage
        onBack={() => {}}
        onOpenReviewQueue={() => {}}
        onOpenConflictReview={() => {}}
      />,
    );
    // The upload tab must be selected before the file input renders.
    await user.click(
      await screen.findByTestId("research.source.mode_upload_tab"),
    );
    // A source type must be chosen before any file is accepted: the page gates
    // every upload on the selected source type (the document surface), so an
    // unselected type rejects the file with "Choose a source type before
    // uploading a file." rather than showing it as selected.
    await user.selectOptions(
      await screen.findByTestId("research.source.type_select"),
      SourceType.UploadedDocumentImage,
    );
    await screen.findByTestId("research.source.file_input");
  }

  it("rejects a scriptable SVG", async () => {
    const user = userEvent.setup();
    await openResearchUploadForm();

    await user.upload(
      fileInput("research.source.file_input"),
      fileOfSize("logo.svg", "image/svg+xml", 1024),
    );

    expect(
      await screen.findByTestId("research.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
    expect(
      screen.queryByTestId("research.source.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("rejects an HTML document", async () => {
    const user = userEvent.setup();
    await openResearchUploadForm();

    await user.upload(
      fileInput("research.source.file_input"),
      fileOfSize("page.html", "text/html", 1024),
    );

    expect(
      await screen.findByTestId("research.form.error_state"),
    ).toHaveTextContent(/not permitted/i);
  });

  it("rejects a file over the 20 MB document ceiling", async () => {
    const user = userEvent.setup();
    await openResearchUploadForm();

    await user.upload(
      fileInput("research.source.file_input"),
      fileOfSize("huge.pdf", "application/pdf", 20 * 1024 * 1024 + 1),
    );

    expect(
      await screen.findByTestId("research.form.error_state"),
    ).toHaveTextContent(/at most/i);
    expect(
      screen.queryByTestId("research.source.file_selected"),
    ).not.toBeInTheDocument();
  });

  it("accepts a valid PDF and shows it as selected", async () => {
    const user = userEvent.setup();
    await openResearchUploadForm();

    await user.upload(
      fileInput("research.source.file_input"),
      fileOfSize("census.pdf", "application/pdf", 1024),
    );

    expect(
      await screen.findByTestId("research.source.file_selected"),
    ).toHaveTextContent("census.pdf");
    expect(
      screen.queryByTestId("research.form.error_state"),
    ).not.toBeInTheDocument();
  });

  it("accepts CSV, Word, and Excel source files and shows them as selected", async () => {
    const accepted: Array<[string, string]> = [
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

    for (const [name, mime] of accepted) {
      cleanup();
      const user = userEvent.setup();
      await openResearchUploadForm();

      await user.upload(
        fileInput("research.source.file_input"),
        fileOfSize(name, mime, 1024),
      );

      expect(
        await screen.findByTestId("research.source.file_selected"),
        `${name} (${mime}) should be accepted`,
      ).toHaveTextContent(name);
      expect(
        screen.queryByTestId("research.form.error_state"),
      ).not.toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Archive document: the expanded seven-type allowlist is accepted at the page
// level, and the sanitized filename is what the form shows as selected.
// ---------------------------------------------------------------------------

describe("archive document accepts the expanded allowlist before reading bytes", () => {
  async function openArchiveDocumentForm() {
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);
    // Document is the second type choice (index 1 -> card.2).
    await user.click(await screen.findByTestId("archive.type.card.2"));
    await screen.findByTestId("archive.form.file_input");
    return user;
  }

  it("accepts CSV, Word, and Excel files and shows the sanitized filename", async () => {
    const accepted: Array<[string, string]> = [
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

    for (const [name, mime] of accepted) {
      cleanup();
      const user = await openArchiveDocumentForm();

      await user.upload(
        fileInput("archive.form.file_input"),
        fileOfSize(name, mime, 1024),
      );

      expect(
        await screen.findByTestId("archive.form.file_selected"),
        `${name} (${mime}) should be accepted`,
      ).toHaveTextContent(name);
      expect(
        screen.queryByTestId("archive.form.error_state"),
      ).not.toBeInTheDocument();
    }
  });

  it("stores the sanitized filename for a path-traversal Office upload", async () => {
    const user = await openArchiveDocumentForm();

    await user.upload(
      fileInput("archive.form.file_input"),
      fileOfSize(
        "../../etc/ledger.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        1024,
      ),
    );

    // The path separators are stripped before the name is shown as selected.
    expect(
      await screen.findByTestId("archive.form.file_selected"),
    ).toHaveTextContent("....etcledger.xlsx");
  });
});
