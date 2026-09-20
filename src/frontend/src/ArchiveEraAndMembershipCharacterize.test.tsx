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

import { surfaceForArchiveItemType } from "./lib/fileValidation";
import { ArchiveContributionPage } from "./pages/ArchiveContributionPage";
import { ResearchIntakePage } from "./pages/ResearchIntakePage";

// ---------------------------------------------------------------------------
// Characterization baseline for the "optional Era + Research/WorkBusiness/Other
// file uploads + family-membership-required message" change.
//
// The change intentionally alters three things, and this file deliberately does
// NOT freeze any of them:
//
//   1. Era becomes optional in submitArchiveItem / createSourceWithUpload. The
//      current backend rejects a blank era; that rejection is what the change
//      removes, so it is not asserted here.
//   2. surfaceForArchiveItemType gains Research / WorkBusiness / Other ->
//      archiveDocument. The current `null` mapping for those three is what the
//      change replaces, so it is not asserted here.
//   3. The contribution pages gain a specific family-membership-required
//      message for an unapproved signed-in account. The current generic
//      behavior is not asserted here.
//
// What this file protects is the adjacent behavior that must survive:
//
//   A. The archive contribution form still accepts a valid JPEG photo, shows it
//      selected, and submits it with the Photo item type and the declared MIME
//      type — with the era value passed through unchanged (blank included).
//   B. The research intake upload form still accepts a valid PDF and calls
//      createSourceWithUpload with the exact argument order, era passed through.
//   C. The stable archive item-type -> upload-surface mappings (Photo,
//      Document, Audio, Video) and the no-file WrittenStoryNote mapping are
//      unchanged.
//   D. The anonymous sign-in gate still prompts a signed-out visitor to sign in,
//      and an approved family member still reaches the eight-type chooser.
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
  setSteward,
  setMyProfile,
  getSubmittedArchiveItems,
  getCreatedSourceUploads,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let myProfile: PersonProfile | null = null;
  let submittedArchiveItems: unknown[][] = [];
  let createdSourceUploads: unknown[][] = [];

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
    async listSources(): Promise<SourceRecord[]> {
      return [];
    },
    async submitArchiveItem(...args: unknown[]): Promise<ArchiveItem> {
      submittedArchiveItems = [...submittedArchiveItems, args];
      return {
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
    async createSourceWithUpload(...args: unknown[]): Promise<unknown> {
      createdSourceUploads = [...createdSourceUploads, args];
      return { __kind__: "ok", ok: { source: {}, archiveItem: {} } };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      myProfile = null;
      submittedArchiveItems = [];
      createdSourceUploads = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    getAuthenticated: () => isAuthenticated,
    setSteward: (v: boolean) => {
      isSteward = v;
    },
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    getSubmittedArchiveItems: () => submittedArchiveItems,
    getCreatedSourceUploads: () => createdSourceUploads,
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

// ---------------------------------------------------------------------------
// A. Archive contribution form: a valid JPEG photo with a blank Era.
// ---------------------------------------------------------------------------

describe("Archive contribution form: valid JPEG photo with a blank Era", () => {
  it("accepts a valid JPEG photo, shows it selected, and submits it with the Photo item type and blank era", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    // The Photo card is the first type choice.
    await user.click(await screen.findByTestId("archive.type.card.1"));
    await screen.findByTestId("archive.form.file_input");

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("portrait.jpg", "image/jpeg", 2048));

    // The valid JPEG is accepted and shown as selected, with no error.
    expect(
      await screen.findByTestId("archive.form.file_selected"),
    ).toHaveTextContent("portrait.jpg");
    expect(
      screen.queryByTestId("archive.form.error_state"),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Wedding portrait");
    // The era field is deliberately left blank.
    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    // The form submits the Photo item with the declared JPEG MIME type and the
    // blank era passed through unchanged.
    const calls = getSubmittedArchiveItems();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("Wedding portrait");
    expect(calls[0][2]).toBe(ArchiveItemType.Photo);
    expect(calls[0][3]).toBe("image/jpeg");
    expect(calls[0][5]).toBe("");
  });

  it("still rejects a non-image file on the Photo surface before reading bytes", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    const user = userEvent.setup();
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    await user.click(await screen.findByTestId("archive.type.card.1"));
    await screen.findByTestId("archive.form.file_input");

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
});

// ---------------------------------------------------------------------------
// B. Research intake: a valid PDF with a blank Era.
// ---------------------------------------------------------------------------

describe("Research intake upload form: valid PDF with a blank Era", () => {
  it("accepts a valid PDF and calls createSourceWithUpload with the era passed through", async () => {
    setAuthenticated(true);
    // The Research Intake workspace is gated to an active Family Steward, so the
    // authorized contributor here is a steward.
    setSteward(true);
    setMyProfile(approvedMemberProfile());
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
    await user.type(
      screen.getByTestId("research.source.title_input"),
      "1900 census, Norwood household",
    );
    await user.selectOptions(
      screen.getByTestId("research.source.type_select"),
      SourceType.CensusCitation,
    );
    await user.type(
      screen.getByTestId("research.source.description_input"),
      "Census record listing the Norwood family.",
    );

    const input = document.querySelector(
      '[data-ocid="research.source.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("census.pdf", "application/pdf", 2048));
    expect(
      await screen.findByTestId("research.source.file_selected"),
    ).toHaveTextContent("census.pdf");

    // The era field is deliberately left blank.
    await user.click(screen.getByTestId("research.source.submit_button"));

    // The upload calls createSourceWithUpload with the exact argument order and
    // the blank era passed through unchanged.
    const calls = getCreatedSourceUploads();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("1900 census, Norwood household");
    expect(calls[0][1]).toBe(SourceType.CensusCitation);
    expect(calls[0][2]).toBe("Census record listing the Norwood family.");
    expect(calls[0][3]).toBe("application/pdf");
    expect(calls[0][6]).toBe("");
  });

  it("still rejects a non-document file on the research source surface", async () => {
    setAuthenticated(true);
    setSteward(true);
    setMyProfile(approvedMemberProfile());
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
      SourceType.CensusCitation,
    );

    const input = document.querySelector(
      '[data-ocid="research.source.file_input"]',
    ) as HTMLInputElement;
    await user.upload(input, fileOfSize("clip.mp4", "video/mp4", 1024));

    expect(
      await screen.findByTestId("research.form.error_state"),
    ).toHaveTextContent(/unsupported file type/i);
    expect(
      screen.queryByTestId("research.source.file_selected"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. Stable archive item-type -> upload-surface mappings.
//
// Research / WorkBusiness / Other are intentionally omitted: the change maps
// them to archiveDocument, so freezing their current `null` would freeze the
// behavior the request removes.
// ---------------------------------------------------------------------------

describe("archive item-type -> upload-surface mapping (stable types)", () => {
  it("maps the four media/document item types to their surfaces", () => {
    expect(surfaceForArchiveItemType("Photo")).toBe("archiveImage");
    expect(surfaceForArchiveItemType("Document")).toBe("archiveDocument");
    expect(surfaceForArchiveItemType("Audio")).toBe("archiveAudio");
    expect(surfaceForArchiveItemType("Video")).toBe("archiveVideo");
  });

  it("keeps the written story/note as a no-file item type", () => {
    expect(surfaceForArchiveItemType("WrittenStoryNote")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D. Sign-in gate and approved-member access.
// ---------------------------------------------------------------------------

describe("Archive contribution access gate", () => {
  it("prompts a signed-out visitor to sign in before contributing", async () => {
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to add to our history",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("archive.signin.primary_button"),
    ).toBeInTheDocument();
    // The eight type choices are not shown until the user is signed in.
    expect(
      screen.queryByRole("heading", { name: "What would you like to share?" }),
    ).not.toBeInTheDocument();
  });

  it("offers all eight contribution types to an approved family member", async () => {
    setAuthenticated(true);
    setMyProfile(approvedMemberProfile());
    renderWithQueryClient(<ArchiveContributionPage onBack={() => {}} />);

    expect(
      await screen.findByRole("heading", {
        name: "What would you like to share?",
      }),
    ).toBeInTheDocument();
    for (const label of [
      "Photo",
      "Document",
      "Audio",
      "Video",
      "Written Story or Note",
      "Research",
      "Work or Business Material",
      "Other",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
