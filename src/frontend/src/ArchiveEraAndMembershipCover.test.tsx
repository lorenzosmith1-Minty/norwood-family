import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  type ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  type PersonProfile,
  type PrivacyLevel,
  type SourceRecord,
  type SourceStatus,
  SourceType,
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

import {
  FAMILY_MEMBERSHIP_REQUIRED_MESSAGE,
  isFamilyMembershipDenial,
  surfaceForArchiveItemType,
  validateArchiveFile,
} from "./lib/fileValidation";
import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { RecipeContributePage } from "./pages/RecipeContributePage";
import { VideoContributePage } from "./pages/VideoContributePage";

// ---------------------------------------------------------------------------
// Cover for the accepted "optional Era + Research/WorkBusiness/Other file
// uploads + family-membership-required message" change.
//
// This file asserts the accepted behavior the change introduces:
//
//   A. Archive item-type mapping: Research, WorkBusiness, and Other are
//      document-style material and accept a PDF (and plain text); a JPEG on the
//      Document/Research surface is still rejected, a Word document is still
//      rejected, and SVG is still rejected.
//   B. A non-empty Era within the 150-character limit is passed through trimmed;
//      the overlong rejection is a backend rule asserted in the PocketIC lane.
//   C. An unapproved signed-in account is denied contribution and the Archive,
//      Recipe, and Video contribution pages show the definitive
//      family-membership-required message instead of the generic retry message.
//   D. isFamilyMembershipDenial detects both backend denial shapes: the trapped
//      message from submitArchiveItem/submitRecipe and the returned
//      #err(#notAuthorized) variant from createSourceWithUpload.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const MEMBER = Principal.fromText(ACCOUNT);

const {
  mockActor,
  resetState,
  setAuthenticated,
  getAuthenticated,
  setMyProfile,
  setSubmitError,
  getSubmittedArchiveItems,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let myProfile: PersonProfile | null = null;
  let submitError: unknown = null;
  let submittedArchiveItems: unknown[][] = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getPersonProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async listApprovedRecipes(): Promise<unknown[]> {
      return [];
    },
    async listSources(): Promise<SourceRecord[]> {
      return [];
    },
    async submitArchiveItem(...args: unknown[]): Promise<ArchiveItem> {
      if (submitError !== null) throw submitError;
      submittedArchiveItems = [...submittedArchiveItems, args];
      return {
        familyId: "norwood",
        id: 1n,
        title: String(args[0] ?? ""),
        description: String(args[1] ?? ""),
        itemType: args[2] as ArchiveItemType,
        blob: args[4] as ExternalBlob,
        era: String(args[5] ?? ""),
        year: (args[6] as bigint | null) ?? undefined,
        tags: (args[7] as string[]) ?? [],
        relatedMemberIds: (args[8] as string[]) ?? [],
        relatedBranchId: (args[9] as string | null) ?? undefined,
        sourceStatus: args[10] as SourceStatus,
        privacyLevel: args[11] as PrivacyLevel,
        classification: args[12] as ArchiveItemClassification,
        status: ArchiveItemStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: MEMBER,
      };
    },
    async submitRecipe(): Promise<unknown> {
      if (submitError !== null) throw submitError;
      return { recipeId: 1n };
    },
    async createSourceWithUpload(): Promise<unknown> {
      if (submitError !== null) return submitError;
      return { __kind__: "ok", ok: { source: {}, archiveItem: {} } };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      myProfile = null;
      submitError = null;
      submittedArchiveItems = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    getAuthenticated: () => isAuthenticated,
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    setSubmitError: (e: unknown) => {
      submitError = e;
    },
    getSubmittedArchiveItems: () => submittedArchiveItems,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetState);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a file is uploaded. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);

  // jsdom's File does not implement Blob.prototype.arrayBuffer, which the
  // upload path uses to read the file bytes. Polyfill it via FileReader.
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

/** A claimed (approved) family member profile for the signed-in caller. */
function approvedMemberProfile(): PersonProfile {
  return {
    personId: "julia",
    name: "Julia Norwood",
    claimStatus: ClaimStatus.Claimed,
    livingStatus: "Living",
  } as PersonProfile;
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
// A. Archive item-type mapping: Research / WorkBusiness / Other accept a PDF.
// ---------------------------------------------------------------------------

describe("archive item-type -> upload-surface mapping (new document types)", () => {
  it("maps Research, WorkBusiness, and Other to the archive document surface", () => {
    expect(surfaceForArchiveItemType("Research")).toBe("archiveDocument");
    expect(surfaceForArchiveItemType("WorkBusiness")).toBe("archiveDocument");
    expect(surfaceForArchiveItemType("Other")).toBe("archiveDocument");
  });

  it("accepts a PDF for Research, WorkBusiness, and Other", () => {
    for (const itemType of ["Research", "WorkBusiness", "Other"]) {
      const result = validateArchiveFile(
        fileOfSize("notes.pdf", "application/pdf", 2048),
        itemType,
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    }
  });

  it("accepts plain text for Research, WorkBusiness, and Other", () => {
    for (const itemType of ["Research", "WorkBusiness", "Other"]) {
      expect(
        validateArchiveFile(
          fileOfSize("notes.txt", "text/plain", 2048),
          itemType,
        ).valid,
      ).toBe(true);
    }
  });

  it("still rejects a JPEG on the Document and Research surfaces", () => {
    for (const itemType of ["Document", "Research"]) {
      const result = validateArchiveFile(
        fileOfSize("portrait.jpg", "image/jpeg", 2048),
        itemType,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/unsupported file type/i);
    }
  });

  it("now accepts a Word document on the document surface", () => {
    // The document allowlist was intentionally expanded to admit Word, Excel,
    // and CSV. A .docx is accepted and stored; it is never rendered inline.
    const result = validateArchiveFile(
      fileOfSize(
        "letter.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        2048,
      ),
      "Research",
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("still rejects a scriptable SVG on the document surface", () => {
    const result = validateArchiveFile(
      fileOfSize("logo.svg", "image/svg+xml", 2048),
      "Research",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });
});

// ---------------------------------------------------------------------------
// A2. Page-level: the Research contribution form accepts a PDF and submits it
//     with the Research item type.
// ---------------------------------------------------------------------------

describe("archive contribution form: Research accepts a PDF", () => {
  it("accepts a PDF on the Research surface and submits it with the Research item type", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    // Research is the sixth type choice (index 5 -> card.6).
    await user.click(await screen.findByTestId("archive.type.card.6"));
    await screen.findByTestId("archive.form.file_input");

    await user.upload(
      fileInput("archive.form.file_input"),
      fileOfSize("census.pdf", "application/pdf", 2048),
    );

    expect(
      await screen.findByTestId("archive.form.file_selected"),
    ).toHaveTextContent("census.pdf");
    expect(
      screen.queryByTestId("archive.form.error_state"),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Census notes");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    const calls = getSubmittedArchiveItems();
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toBe(ArchiveItemType.Research);
    expect(calls[0][3]).toBe("application/pdf");
  });

  it("still rejects a JPEG on the Research surface before reading bytes", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    await user.click(await screen.findByTestId("archive.type.card.6"));
    await screen.findByTestId("archive.form.file_input");

    await user.upload(
      fileInput("archive.form.file_input"),
      fileOfSize("portrait.jpg", "image/jpeg", 2048),
    );

    expect(
      await screen.findByTestId("archive.form.error_state"),
    ).toHaveTextContent(/unsupported file type/i);
    expect(
      screen.queryByTestId("archive.form.file_selected"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. A non-empty Era within the limit is passed through trimmed.
// ---------------------------------------------------------------------------

describe("archive contribution form: non-empty Era within the limit", () => {
  it("passes a non-empty Era through trimmed on submit", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    await user.click(await screen.findByTestId("archive.type.card.1"));
    await screen.findByTestId("archive.form.file_input");

    await user.upload(
      fileInput("archive.form.file_input"),
      fileOfSize("portrait.jpg", "image/jpeg", 2048),
    );
    await screen.findByTestId("archive.form.file_selected");

    await user.type(screen.getByLabelText("Title"), "Wedding portrait");
    await user.type(
      screen.getByTestId("archive.form.era_input"),
      "  circa 1920s  ",
    );
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    const calls = getSubmittedArchiveItems();
    expect(calls).toHaveLength(1);
    // The era is trimmed before it reaches the backend.
    expect(calls[0][5]).toBe("circa 1920s");
  });
});

// ---------------------------------------------------------------------------
// C. An unapproved signed-in account sees the family-membership-required
//    message, not the generic retry message.
// ---------------------------------------------------------------------------

describe("unapproved account: definitive family-membership-required message", () => {
  it("shows the membership message on the Archive page when the backend traps the denial", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    setSubmitError(
      new Error(
        "Unauthorized: Only approved family members can contribute family content",
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    await user.click(await screen.findByTestId("archive.type.card.1"));
    await screen.findByTestId("archive.form.file_input");
    await user.upload(
      fileInput("archive.form.file_input"),
      fileOfSize("portrait.jpg", "image/jpeg", 2048),
    );
    await screen.findByTestId("archive.form.file_selected");
    await user.type(screen.getByLabelText("Title"), "Wedding portrait");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    const error = await screen.findByTestId("archive.form.error_state");
    expect(error).toHaveTextContent(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE);
    expect(error).not.toHaveTextContent(/something went wrong/i);
  });

  it("shows the membership message on the Recipe page when the backend traps the denial", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    setSubmitError(
      new Error(
        "Unauthorized: Only approved family members can contribute family content",
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(
      <RecipeContributePage onBack={() => {}} onOpenRecipes={() => {}} />,
    );

    await user.type(
      await screen.findByTestId("recipe.form.title_input"),
      "Sweet potato pie",
    );
    await user.click(screen.getByTestId("recipe.form.originating.julia"));
    await user.click(screen.getByTestId("recipe.form.submit_button"));

    const error = await screen.findByTestId("recipe.form.error_state");
    expect(error).toHaveTextContent(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE);
    expect(error).not.toHaveTextContent(/something went wrong/i);
  });

  it("shows the membership message on the Video page when the backend traps the denial", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    setSubmitError(
      new Error(
        "Unauthorized: Only approved family members can contribute family content",
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(
      <VideoContributePage onBack={() => {}} initialKind="uploaded-video" />,
    );

    await screen.findByTestId("video_contribute.form.file_input");
    await user.upload(
      fileInput("video_contribute.form.file_input"),
      fileOfSize("clip.mp4", "video/mp4", 2048),
    );
    await screen.findByTestId("video_contribute.form.file_selected");
    await user.type(
      screen.getByTestId("video_contribute.form.title_input"),
      "Reunion clip",
    );
    await user.click(screen.getByTestId("video_contribute.form.submit_button"));

    const error = await screen.findByTestId(
      "video_contribute.form.error_state",
    );
    expect(error).toHaveTextContent(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE);
    expect(error).not.toHaveTextContent(/something went wrong/i);
  });

  it("still shows the generic retry message for an unrelated failure", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    setSubmitError(new Error("Network request failed"));
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    await user.click(await screen.findByTestId("archive.type.card.1"));
    await screen.findByTestId("archive.form.file_input");
    await user.upload(
      fileInput("archive.form.file_input"),
      fileOfSize("portrait.jpg", "image/jpeg", 2048),
    );
    await screen.findByTestId("archive.form.file_selected");
    await user.type(screen.getByLabelText("Title"), "Wedding portrait");
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    const error = await screen.findByTestId("archive.form.error_state");
    expect(error).toHaveTextContent(/something went wrong/i);
    expect(error).not.toHaveTextContent(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// D. isFamilyMembershipDenial detects both backend denial shapes.
// ---------------------------------------------------------------------------

describe("isFamilyMembershipDenial detects both backend denial shapes", () => {
  it("detects the trapped submitArchiveItem/submitRecipe message", () => {
    // The message the backend is documented to trap with for a signed-in but
    // unapproved caller (api-doc.mo). The frontend must recognize it so the
    // contribution pages show the definitive membership message rather than a
    // generic retry.
    expect(
      isFamilyMembershipDenial(
        new Error(
          "Unauthorized: Only approved family members can contribute family content",
        ),
      ),
    ).toBe(true);
    expect(
      isFamilyMembershipDenial(
        "Unauthorized: Only approved family members can contribute family content",
      ),
    ).toBe(true);
  });

  it("detects the returned #err(#notAuthorized) variant from createSourceWithUpload", () => {
    expect(isFamilyMembershipDenial({ notAuthorized: null })).toBe(true);
    expect(isFamilyMembershipDenial({ err: { notAuthorized: null } })).toBe(
      true,
    );
  });

  it("does not treat an unrelated error as a membership denial", () => {
    expect(isFamilyMembershipDenial(new Error("Network request failed"))).toBe(
      false,
    );
    expect(isFamilyMembershipDenial({ err: { notFound: 1n } })).toBe(false);
    expect(isFamilyMembershipDenial(null)).toBe(false);
    expect(isFamilyMembershipDenial(undefined)).toBe(false);
  });
});
