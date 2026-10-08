import "@testing-library/jest-dom/vitest";
import {
  type ExportEnvelope,
  type ExportFamilyArchiveResult,
  ExportFormat,
  type ExportMetadata,
  ExportScope,
  type Result_41,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
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
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";

// ---------------------------------------------------------------------------
// Phase 5D-H1 — Family Archive bundle retrieval classification (hook + page).
//
// `retrieveBundleMedia` now returns a structured `BundleRetrievalOutcome`
// (success with items+skipped / denied / failed) instead of a bare array. This
// file drives the real FamilyStewardHubPage and the real
// useArchiveBundleDownload hook through a typed local actor mock to prove the
// accepted observable behavior:
//
//   - `MediaUnavailable` and `MediaNotFound` each skip ONE asset and the bundle
//     still succeeds (a ZIP is produced and downloaded);
//   - `NotSteward`, `NotSignedIn`, `ExportInstanceExpired`, and
//     `ExportInstanceNotFound` each STOP retrieval and create no ZIP;
//   - a fatal (thrown) retrieval error stops later media retrieval and creates
//     no ZIP;
//   - the backend error tag is never shown to the user (only neutral copy);
//   - no partial ZIP is generated after an authorization/export-instance
//     failure.
//
// This is component/integration coverage, not deployed browser E2E and not
// real backend behavior: the actor is mocked, so no canister runs. That limit
// is recorded in the episode's coverageLimits.
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  calls,
  resetCalls,
  setSteward,
  getSteward,
  setExportResult,
  setMediaHandler,
} = vi.hoisted(() => {
  let steward = false;
  let exportResult: unknown = { __kind__: "err", err: "ExportFailed" };
  let mediaHandler: (mediaRef: string) => unknown = () => ({
    __kind__: "ok",
    ok: { bytes: new Uint8Array([1]) },
  });

  const calls: {
    exportFamilyArchive: unknown[][];
    retrieveFamilyArchiveMedia: unknown[][];
  } = {
    exportFamilyArchive: [],
    retrieveFamilyArchiveMedia: [],
  };

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return steward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return steward;
    },
    async listProfileClaims(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listReports(): Promise<unknown[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue() {
      return { pending: 0n, needsResearch: 0n, conflicting: 0n };
    },
    async listMembershipConfirmationReviewsForSteward() {
      return { __kind__: "ok", ok: [] };
    },
    async listRecoveryRequestsForFamily() {
      return { __kind__: "ok", ok: [] };
    },
    async exportFamilyArchive(...args: unknown[]): Promise<unknown> {
      calls.exportFamilyArchive.push(args);
      return exportResult;
    },
    async retrieveFamilyArchiveMedia(...args: unknown[]): Promise<unknown> {
      calls.retrieveFamilyArchiveMedia.push(args);
      return mediaHandler(args[1] as string);
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.exportFamilyArchive.length = 0;
      calls.retrieveFamilyArchiveMedia.length = 0;
    },
    setSteward: (value: boolean) => {
      steward = value;
    },
    getSteward: () => steward,
    setExportResult: (result: unknown) => {
      exportResult = result;
    },
    setMediaHandler: (handler: (mediaRef: string) => unknown) => {
      mediaHandler = handler;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => Principal.fromText(OWNER) },
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

vi.mock("./hooks/useStewardAuthority", () => ({
  useIsSteward: () => ({ data: getSteward(), isLoading: false }),
  useHasActiveSteward: () => ({ data: getSteward(), isLoading: false }),
  useClaimSteward: () => ({ mutate: () => {}, isPending: false }),
}));

function makeEnvelope(payload: unknown): ExportEnvelope {
  const metadata: ExportMetadata = {
    generatedAt: 1_700_000_000_000_000_000n,
    scope: ExportScope.FamilyArchive,
    sourceAppName: "Norwood",
    schemaVersion: 1n,
    sourceAppVersion: "1.0.0",
    familyRef: "Norwood",
    format: ExportFormat.JSON,
  };
  return { metadata, payloadJson: JSON.stringify(payload) };
}

/** A successful FamilyArchive export result carrying a media manifest. */
function okArchiveResult(entries: unknown[]): Result_41 {
  const result: ExportFamilyArchiveResult = {
    envelope: makeEnvelope({
      persons: [{ name: "Clayton Norwood" }],
      mediaManifest: entries,
      mediaManifestSummary: {
        assetCount: entries.length,
        knownTotalBytes: 0,
        unavailableCount: 0,
      },
    }),
    exportInstanceRef: "export-1",
  };
  return { __kind__: "ok", ok: result };
}

/** A manifest entry for the given media-N token, marked Available. */
function availableEntry(mediaRef: string): unknown {
  return {
    ref: { portableId: mediaRef },
    mediaKind: "ArchiveItem",
    availability: "Available",
    byteSize: 1,
    filename: `${mediaRef}.bin`,
    title: mediaRef,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function renderHub(): void {
  renderWithClient(
    <FamilyStewardHubPage
      onBack={vi.fn()}
      onOpenReview={vi.fn()}
      onOpenPendingContributions={vi.fn()}
      onOpenGovernance={vi.fn()}
      onOpenResearchIntake={vi.fn()}
      onOpenHiddenPosts={vi.fn()}
      onOpenMembershipReviews={vi.fn()}
      onOpenRecoveryReviews={vi.fn()}
    />,
  );
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeAll(() => {
  let counter = 0;
  createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
  revokeObjectURL = vi.fn();
  URL.createObjectURL =
    createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL =
    revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

afterEach(cleanup);
beforeEach(() => {
  setSteward(true);
  setExportResult({ __kind__: "err", err: "ExportFailed" });
  setMediaHandler(() => ({
    __kind__: "ok",
    ok: { bytes: new Uint8Array([1]) },
  }));
  resetCalls();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Accepted per-item skips: one asset skipped, bundle still succeeds.
// ---------------------------------------------------------------------------

describe("per-item skips still produce a bundle", () => {
  it("skips a MediaUnavailable asset and still downloads a ZIP with the rest", async () => {
    const user = userEvent.setup();
    setExportResult(
      okArchiveResult([availableEntry("media-1"), availableEntry("media-2")]),
    );
    setMediaHandler((mediaRef) =>
      mediaRef === "media-2"
        ? { __kind__: "err", err: "MediaUnavailable" }
        : { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } },
    );
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("steward_hub.download_bundle_success_state"),
      ).toBeInTheDocument(),
    );
    // Both assets were attempted; the unavailable one was skipped, not fatal.
    expect(calls.retrieveFamilyArchiveMedia).toEqual([
      ["export-1", "media-1"],
      ["export-1", "media-2"],
    ]);
    // A ZIP was still produced and downloaded.
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
  });

  it("skips a MediaNotFound asset and still downloads a ZIP with the rest", async () => {
    const user = userEvent.setup();
    setExportResult(
      okArchiveResult([availableEntry("media-1"), availableEntry("media-2")]),
    );
    setMediaHandler((mediaRef) =>
      mediaRef === "media-1"
        ? { __kind__: "err", err: "MediaNotFound" }
        : { __kind__: "ok", ok: { bytes: new Uint8Array([2]) } },
    );
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("steward_hub.download_bundle_success_state"),
      ).toBeInTheDocument(),
    );
    expect(calls.retrieveFamilyArchiveMedia).toEqual([
      ["export-1", "media-1"],
      ["export-1", "media-2"],
    ]);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// Authorization / export-instance rejections: stop retrieval, no ZIP.
// ---------------------------------------------------------------------------

describe("authorization / export-instance rejection stops the bundle", () => {
  const tags = [
    "NotSteward",
    "NotSignedIn",
    "ExportInstanceExpired",
    "ExportInstanceNotFound",
  ];

  for (const tag of tags) {
    it(`stops retrieval and creates no ZIP on ${tag}`, async () => {
      const user = userEvent.setup();
      setExportResult(
        okArchiveResult([
          availableEntry("media-1"),
          availableEntry("media-2"),
          availableEntry("media-3"),
        ]),
      );
      // The FIRST retrieval is rejected with the authorization/export-instance
      // tag; retrieval must stop immediately, so later media is never fetched.
      setMediaHandler(() => ({ __kind__: "err", err: tag }));
      renderHub();

      await user.click(
        await screen.findByTestId("steward_hub.download_bundle_button"),
      );

      const errorState = await screen.findByTestId(
        "steward_hub.download_bundle_error_state",
      );
      // Neutral copy only — the backend tag never reaches the user.
      expect(errorState).toHaveTextContent("Archive could not be created.");
      expect(errorState.textContent).not.toContain(tag);
      // Retrieval stopped after the first rejection: later media never fetched.
      expect(calls.retrieveFamilyArchiveMedia).toEqual([
        ["export-1", "media-1"],
      ]);
      // No partial ZIP was generated and no download was triggered.
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// Fatal retrieval failure: stop later retrieval, no ZIP.
// ---------------------------------------------------------------------------

describe("fatal retrieval failure stops the bundle", () => {
  it("stops later media retrieval and creates no ZIP when a retrieval throws", async () => {
    const user = userEvent.setup();
    setExportResult(
      okArchiveResult([
        availableEntry("media-1"),
        availableEntry("media-2"),
        availableEntry("media-3"),
      ]),
    );
    setMediaHandler((mediaRef) => {
      if (mediaRef === "media-1") throw new Error("transport down");
      return { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } };
    });
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    const errorState = await screen.findByTestId(
      "steward_hub.download_bundle_error_state",
    );
    expect(errorState).toHaveTextContent("Archive could not be created.");
    // A thrown transport error is fatal: retrieval stops at the first item.
    expect(calls.retrieveFamilyArchiveMedia).toEqual([["export-1", "media-1"]]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("does not surface an unrecognized backend error tag to the user", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult([availableEntry("media-1")]));
    setMediaHandler(() => ({ __kind__: "err", err: "SomeInternalTag" }));
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    const errorState = await screen.findByTestId(
      "steward_hub.download_bundle_error_state",
    );
    expect(errorState).toHaveTextContent("Archive could not be created.");
    expect(errorState.textContent).not.toContain("SomeInternalTag");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
