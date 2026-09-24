import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  type Post,
  PostType,
  PrivacyLevel,
  SourceStatus,
  SourceType,
} from "@/backend";
import type { BoardMediaUpload } from "@/types/board";
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
import App from "./App";
import {
  type SubmitArchiveItemInput,
  useSubmitArchiveItem,
} from "./hooks/useArchiveStorage";
import {
  type CreateBoardPostWithMediaInput,
  useCreateBoardPostWithMedia,
} from "./hooks/useBoard";
import {
  type CreateSourceWithUploadInput,
  useCreateSourceWithUpload,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the security-hardening pass.
//
// The pass intentionally changes three things:
//   1. Board / Messaging membership authorization (backend): the board and
//      messaging member gates move from "any signed-in #user" to Norwood family
//      membership (Steward or approved claim).
//   2. Upload validation (backend): addPhoto, submitArchiveItem,
//      createSourceWithUpload, and createBoardPostWithMedia gain size / MIME /
//      filename / input-length validation.
//   3. Document preview safety (frontend): the Archive Detail PDF preview is
//      rendered in-app by PDF.js into canvases, with no iframe at all.
//
// This file deliberately does NOT freeze the behavior the pass removes (the
// permissive membership gate, the absence of upload validation, the unsandboxed
// iframe). What it protects is the adjacent behavior that must survive:
//
//   A. The Archive Detail preview still renders a PDF in-app through an iframe
//      that points at the original artifact URL and carries the filename title,
//      and still renders an image preview as an <img>. Sandboxing is additive:
//      the preview must keep working, not merely gain an attribute.
//   B. The frontend upload hooks keep calling the backend methods with the same
//      argument shapes (the API-consumer contract the validation change must
//      not alter).
//   C. The approved-member board and messaging journeys still work end to end.
//
// The role checks themselves live in the PocketIC lane, because the frontend
// suite mocks the actor and has no principals at all.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const MY_PERSON_ID = "julia";

// A typed local actor mock standing in for the generated `_SERVICE`. Each
// method records its arguments so the tests can assert the exact call the hook
// makes, and returns a deterministic value.
const { mockActor, calls, resetCalls, setAuthenticated, getAuthenticated } =
  vi.hoisted(() => {
    const calls: {
      submitArchiveItem: unknown[][];
      createSourceWithUpload: unknown[][];
      createBoardPostWithMedia: unknown[][];
    } = {
      submitArchiveItem: [],
      createSourceWithUpload: [],
      createBoardPostWithMedia: [],
    };

    let isAuthenticated = false;

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
      async getMyProfile() {
        return isAuthenticated
          ? {
              personId: MY_PERSON_ID,
              name: "Julia Norwood",
              claimStatus: "Claimed",
              livingStatus: "Living",
            }
          : null;
      },
      async getPersonProfile(personId: string) {
        return {
          personId,
          name: "Family Member",
          claimStatus: "Unclaimed",
          livingStatus: "Living",
        };
      },
      async getProfilePhoto() {
        return null;
      },
      async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
        return [];
      },
      async listPendingArchiveItems(): Promise<ArchiveItem[]> {
        return [];
      },
      async listBoardPosts(): Promise<Post[]> {
        return [];
      },
      async listNotifications() {
        return [];
      },
      async markNotificationRead() {},
      async canMessagePerson() {
        return false;
      },
      async submitArchiveItem(...args: unknown[]): Promise<unknown> {
        calls.submitArchiveItem.push(args);
        return null;
      },
      async createSourceWithUpload(...args: unknown[]): Promise<unknown> {
        calls.createSourceWithUpload.push(args);
        return { ok: {} };
      },
      async createBoardPostWithMedia(...args: unknown[]): Promise<unknown> {
        calls.createBoardPostWithMedia.push(args);
        return null;
      },
    };

    return {
      mockActor,
      calls,
      resetCalls: () => {
        calls.submitArchiveItem.length = 0;
        calls.createSourceWithUpload.length = 0;
        calls.createBoardPostWithMedia.length = 0;
      },
      setAuthenticated: (v: boolean) => {
        isAuthenticated = v;
      },
      getAuthenticated: () => isAuthenticated,
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
beforeEach(() => {
  resetCalls();
  setAuthenticated(false);
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a blob is constructed. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// A. Archive Detail document preview keeps working (now via PDF.js canvases).
// ---------------------------------------------------------------------------

describe("Archive Detail preview survives the PDF renderer change", () => {
  it("renders a PDF preview in-app without an iframe", async () => {
    // The preview stage is reached through the real Archive Detail page. The
    // PDF is rasterized in-app by PDF.js, so this asserts the renderer mounts
    // and no iframe is introduced anywhere in the preview path.
    const { ArchiveDetailPage } = await import("./pages/ArchiveDetailPage");
    const item: ArchiveItem = {
      familyId: "norwood",
      id: 1n,
      title: "Deed scan",
      description: "A scanned deed.",
      itemType: ArchiveItemType.Document,
      blob: ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "application/pdf",
        "deed.pdf",
      ),
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

    // Drive the page through its real data hook by mocking the actor's approved
    // list for this render.
    mockActor.listApprovedArchiveItems = vi.fn(async () => [item]);

    const user = userEvent.setup();
    renderWithQueryClient(
      <ArchiveDetailPage
        itemId={1n}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(stage).toBeInTheDocument();
    // The renderer mounts its own loading or error state; either way no
    // iframe is used anywhere in the preview path.
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

  it("renders an image preview as an <img> rather than an iframe", async () => {
    const { ArchiveDetailPage } = await import("./pages/ArchiveDetailPage");
    const item: ArchiveItem = {
      familyId: "norwood",
      id: 2n,
      title: "Portrait scan",
      description: "A scanned portrait.",
      itemType: ArchiveItemType.Document,
      blob: ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "image/png",
        "portrait.png",
      ),
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

    mockActor.listApprovedArchiveItems = vi.fn(async () => [item]);

    const user = userEvent.setup();
    renderWithQueryClient(
      <ArchiveDetailPage
        itemId={2n}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const stage = document.querySelector(
      '[data-ocid="archive_detail.preview_stage"]',
    ) as HTMLElement;
    expect(stage).toBeInTheDocument();
    expect(
      within(stage).getByRole("img", { name: "Portrait scan" }),
    ).toBeInTheDocument();
    expect(within(stage).queryByTitle("portrait.png")).not.toBeInTheDocument();
  });

  it("offers Download Original only for a non-previewable Word document", async () => {
    const { ArchiveDetailPage } = await import("./pages/ArchiveDetailPage");
    const item: ArchiveItem = {
      familyId: "norwood",
      id: 3n,
      title: "Family notes",
      description: "Word notes.",
      itemType: ArchiveItemType.Document,
      blob: ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "application/msword",
        "notes.docx",
      ),
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

    mockActor.listApprovedArchiveItems = vi.fn(async () => [item]);

    renderWithQueryClient(
      <ArchiveDetailPage
        itemId={3n}
        onBack={() => {}}
        onOpenProfile={() => {}}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Download Original" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. Frontend upload hooks keep the same backend call contract.
// ---------------------------------------------------------------------------

describe("Upload hooks: backend call contract (characterization)", () => {
  it("useSubmitArchiveItem calls submitArchiveItem with the exact argument order", async () => {
    const blob = ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "image/png",
      "wedding.png",
    );

    let mutateAsync: (input: SubmitArchiveItemInput) => Promise<unknown> =
      async () => null;

    function Probe() {
      mutateAsync = useSubmitArchiveItem().mutateAsync;
      return <div data-ocid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    await mutateAsync({
      title: "Wedding portrait",
      description: "The couple on their wedding day.",
      itemType: ArchiveItemType.Photo,
      mimeType: "image/png",
      blob,
      filename: "wedding.png",
      era: "circa 1920s",
      year: null,
      tags: ["wedding"],
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
    });

    expect(calls.submitArchiveItem).toEqual([
      [
        "Wedding portrait",
        "The couple on their wedding day.",
        ArchiveItemType.Photo,
        "image/png",
        blob,
        "circa 1920s",
        null,
        ["wedding"],
        ["julia"],
        null,
        SourceStatus.Original,
        PrivacyLevel.FamilyOnly,
        ArchiveItemClassification.Standard,
        null,
        "wedding.png",
      ],
    ]);
  });

  it("useCreateSourceWithUpload calls createSourceWithUpload with the exact argument order", async () => {
    const blob = ExternalBlob.fromBytes(
      new Uint8Array([4, 5, 6]),
      "application/pdf",
      "census.pdf",
    );

    let mutateAsync: (input: CreateSourceWithUploadInput) => Promise<unknown> =
      async () => ({ ok: {} });

    function Probe() {
      mutateAsync = useCreateSourceWithUpload().mutateAsync;
      return <div data-ocid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    await mutateAsync({
      title: "1900 census",
      sourceType: SourceType.CensusCitation,
      description: "Census record.",
      mimeType: "image/png",
      blob,
      filename: "census.pdf",
      tags: ["census"],
      era: "1900",
      year: 1900n,
      relatedMemberIds: ["julia"],
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
    });

    expect(calls.createSourceWithUpload).toEqual([
      [
        "1900 census",
        SourceType.CensusCitation,
        "Census record.",
        "image/png",
        blob,
        ["census"],
        "1900",
        1900n,
        ["julia"],
        PrivacyLevel.FamilyOnly,
        ArchiveItemClassification.Standard,
        null,
        "census.pdf",
      ],
    ]);
  });

  it("useCreateBoardPostWithMedia calls createBoardPostWithMedia with the exact argument order", async () => {
    const blob = ExternalBlob.fromBytes(
      new Uint8Array([7, 8, 9]),
      "image/png",
      "reunion.png",
    );
    const upload: BoardMediaUpload = {
      title: "Reunion photo",
      description: "A photo from the reunion.",
      itemType: ArchiveItemType.Photo,
      mimeType: "image/png",
      blob,
      filename: "reunion.png",
      era: "2024",
      year: 2024n,
      tags: ["reunion"],
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
      // The hook reads the active family from the centralized FamilyContext;
      // with no provider mounted the context falls back to the default family.
      familyId: "norwood",
    };

    let mutateAsync: (
      input: CreateBoardPostWithMediaInput,
    ) => Promise<unknown> = async () => null;

    function Probe() {
      mutateAsync = useCreateBoardPostWithMedia().mutateAsync;
      return <div data-ocid="probe.value">ready</div>;
    }

    renderWithQueryClient(<Probe />);
    await screen.findByTestId("probe.value");

    await mutateAsync({
      postType: PostType.General,
      title: "Reunion photos",
      body: "Here are the reunion photos.",
      relatedPersonIds: ["julia"],
      existingArchiveItemIds: [42n],
      newUploads: [upload],
      tags: ["reunion"],
    });

    // The hook maps the upload to the backend's BoardMediaUpload shape: the
    // optional year/branch/speaker become `undefined` (the generated wrapper's
    // optional representation), and the existing item id is passed through.
    expect(calls.createBoardPostWithMedia).toEqual([
      [
        PostType.General,
        "Reunion photos",
        "Here are the reunion photos.",
        ["julia"],
        [42n],
        [
          {
            title: "Reunion photo",
            description: "A photo from the reunion.",
            itemType: ArchiveItemType.Photo,
            mimeType: "image/png",
            blob,
            filename: "reunion.png",
            era: "2024",
            year: 2024n,
            tags: ["reunion"],
            relatedMemberIds: ["julia"],
            familyId: "norwood",
            relatedBranchId: undefined,
            sourceStatus: SourceStatus.Original,
            privacyLevel: PrivacyLevel.FamilyOnly,
            classification: ArchiveItemClassification.Standard,
            primarySpeaker: undefined,
          },
        ],
        ["reunion"],
      ],
    ]);
  });
});

// ---------------------------------------------------------------------------
// C. Approved-member board and messaging journeys still work end to end.
// ---------------------------------------------------------------------------

describe("Approved-member board and messaging journeys survive the membership change", () => {
  it("lets an approved member open the board and see the empty state", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Message Board" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Family Message Board/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Family Message Board" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No posts yet" }),
    ).toBeInTheDocument();
  });

  it("lets an approved member reach the private messaging inbox", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Message Board" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Private Messages/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Private Messages" }),
    ).toBeInTheDocument();
  });

  it("keeps the board and messaging entry points hidden from a guest", () => {
    renderApp();

    expect(
      screen.queryByRole("button", { name: "Message Board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Private Messages" }),
    ).not.toBeInTheDocument();
  });
});
