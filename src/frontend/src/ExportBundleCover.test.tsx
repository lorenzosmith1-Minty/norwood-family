import "@testing-library/jest-dom/vitest";
import {
  type ExportEnvelope,
  ExportError,
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
import { unzipSync } from "fflate";
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
// Phase 5D — "Download family archive bundle" (ZIP): hook + page integration.
//
// These tests drive the real FamilyStewardHubPage and the real
// useArchiveBundleDownload hook through a typed local actor mock. They cover
// the accepted observable behavior:
//
//   - a non-Steward sees no bundle action;
//   - an active Steward can initiate the bundle and receives a ZIP download
//     whose /norwood-export.json is the unchanged Phase 5A envelope;
//   - media is retrieved through the export-instance + media-N flow only;
//   - a duplicate click while a request is active does not start a second
//     generation;
//   - progress copy is shown;
//   - an oversized archive is stopped before generation with a neutral message
//     and no partial ZIP, while the JSON-only download stays available;
//   - the download is ephemeral (object URL created and revoked, nothing in
//     localStorage/sessionStorage).
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
  setMediaResult,
  setExportGate,
  releaseExportGate,
} = vi.hoisted(() => {
  let steward = false;
  let exportResult: unknown = { __kind__: "err", err: "ExportFailed" };
  let mediaResult: unknown = {
    __kind__: "ok",
    ok: { bytes: new Uint8Array([1]) },
  };
  let exportGate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;

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
      if (exportGate) await exportGate;
      return exportResult;
    },
    async retrieveFamilyArchiveMedia(...args: unknown[]): Promise<unknown> {
      calls.retrieveFamilyArchiveMedia.push(args);
      return mediaResult;
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
    setMediaResult: (result: unknown) => {
      mediaResult = result;
    },
    setExportGate: () => {
      exportGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    },
    releaseExportGate: () => {
      releaseGate?.();
      exportGate = null;
      releaseGate = null;
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
function okArchiveResult(
  payload: unknown = { persons: [{ name: "Clayton Norwood" }] },
): Result_41 {
  const result: ExportFamilyArchiveResult = {
    envelope: makeEnvelope(payload),
    exportInstanceRef: "export-1",
  };
  return { __kind__: "ok", ok: result };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

interface HubHandlers {
  onBack: ReturnType<typeof vi.fn>;
  onOpenReview: ReturnType<typeof vi.fn>;
  onOpenPendingContributions: ReturnType<typeof vi.fn>;
  onOpenGovernance: ReturnType<typeof vi.fn>;
  onOpenResearchIntake: ReturnType<typeof vi.fn>;
  onOpenHiddenPosts: ReturnType<typeof vi.fn>;
  onOpenMembershipReviews: ReturnType<typeof vi.fn>;
  onOpenRecoveryReviews: ReturnType<typeof vi.fn>;
}

function renderHub(): HubHandlers {
  const handlers: HubHandlers = {
    onBack: vi.fn(),
    onOpenReview: vi.fn(),
    onOpenPendingContributions: vi.fn(),
    onOpenGovernance: vi.fn(),
    onOpenResearchIntake: vi.fn(),
    onOpenHiddenPosts: vi.fn(),
    onOpenMembershipReviews: vi.fn(),
    onOpenRecoveryReviews: vi.fn(),
  };
  renderWithClient(<FamilyStewardHubPage {...handlers} />);
  return handlers;
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let lastBlob: Blob | null;

/** jsdom's Blob has no `arrayBuffer`; read it through FileReader instead. */
function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeAll(() => {
  let counter = 0;
  createObjectURL = vi.fn((blob: Blob) => {
    lastBlob = blob;
    return `blob:mock-${counter++}`;
  });
  revokeObjectURL = vi.fn();
  URL.createObjectURL =
    createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL =
    revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

afterEach(cleanup);
beforeEach(() => {
  setSteward(true);
  setExportResult({ __kind__: "err", err: ExportError.ExportFailed });
  setMediaResult({ __kind__: "ok", ok: { bytes: new Uint8Array([1, 2, 3]) } });
  releaseExportGate();
  resetCalls();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  lastBlob = null;
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Visibility / authorization guard
// ---------------------------------------------------------------------------

describe("bundle action visibility", () => {
  it("shows the bundle action to an active Steward, distinct from the JSON-only action", async () => {
    renderHub();

    const bundleButton = await screen.findByTestId(
      "steward_hub.download_bundle_button",
    );
    expect(bundleButton).toHaveTextContent("Download family archive bundle");
    // The JSON-only action remains a separate control.
    expect(
      screen.getByTestId("steward_hub.download_archive_button"),
    ).toHaveTextContent("Download archive");
  });

  it("does not show the bundle action to a non-Steward", async () => {
    setSteward(false);
    renderHub();

    await screen.findByTestId("steward_hub.unauthorized_state");
    expect(
      screen.queryByTestId("steward_hub.download_bundle_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("steward_hub.download_archive_card"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Successful bundle journey
// ---------------------------------------------------------------------------

describe("bundle generation journey", () => {
  it("initiates the bundle, retrieves media via export-instance + media-N, and downloads a ZIP", async () => {
    const user = userEvent.setup();
    setExportResult(
      okArchiveResult({
        persons: [{ name: "Clayton Norwood" }],
        mediaManifest: [
          {
            ref: { portableId: "media-1" },
            mediaKind: "ProfilePhoto",
            availability: "Available",
            byteSize: 3,
            filename: "portrait.jpg",
            title: "Portrait",
          },
        ],
        mediaManifestSummary: {
          assetCount: 1,
          knownTotalBytes: 3,
          unavailableCount: 0,
        },
      }),
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

    // The export was requested for the active family.
    expect(calls.exportFamilyArchive).toEqual([["norwood"]]);
    // Media was retrieved through the export-instance + media-N flow only.
    expect(calls.retrieveFamilyArchiveMedia).toEqual([["export-1", "media-1"]]);

    // A ZIP was produced and downloaded.
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(lastBlob).not.toBeNull();
    const bytes = await readBlobBytes(lastBlob!);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain("norwood-export.json");
    expect(Object.keys(files)).toContain("media/portrait.jpg");
  });

  it("embeds the unchanged Phase 5A envelope as /norwood-export.json", async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ persons: [{ name: "Clayton Norwood" }] });
    setExportResult({
      __kind__: "ok",
      ok: { envelope, exportInstanceRef: "export-1" },
    } as Result_41);
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const bytes = await readBlobBytes(lastBlob!);
    const files = unzipSync(bytes);
    const decoder = new TextDecoder();
    const embedded = JSON.parse(decoder.decode(files["norwood-export.json"]));

    expect(embedded.metadata.schemaVersion).toBe("1");
    expect(embedded.metadata.scope).toBe(ExportScope.FamilyArchive);
    expect(embedded.metadata.format).toBe(ExportFormat.JSON);
    expect(embedded.metadata.familyRef).toBe("Norwood");
    expect(embedded.payloadJson).toBe(envelope.payloadJson);
  });

  it("shows the 'Download started' success copy", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult());
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    const success = await screen.findByTestId(
      "steward_hub.download_bundle_success_state",
    );
    expect(success).toHaveTextContent("Download started");
  });

  it("keeps the download ephemeral: object URL revoked and nothing persisted", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult());
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      createObjectURL.mock.results[0]?.value,
    );
    expect(document.querySelector("a[download]")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate-click prevention
// ---------------------------------------------------------------------------

describe("duplicate-click prevention", () => {
  it("disables the bundle action and prevents a second generation while active", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult());
    setExportGate();
    renderHub();

    const button = await screen.findByTestId(
      "steward_hub.download_bundle_button",
    );
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);
    expect(calls.exportFamilyArchive).toHaveLength(1);

    releaseExportGate();
    await waitFor(() =>
      expect(
        screen.getByTestId("steward_hub.download_bundle_success_state"),
      ).toBeInTheDocument(),
    );
    expect(calls.exportFamilyArchive).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Oversized archive preflight
// ---------------------------------------------------------------------------

describe("oversized archive preflight", () => {
  it("stops before generation with a neutral message and no partial ZIP, keeping the JSON-only download", async () => {
    const user = userEvent.setup();
    setExportResult(
      okArchiveResult({
        persons: [],
        mediaManifest: [],
        mediaManifestSummary: {
          assetCount: 100_000,
          knownTotalBytes: 0,
          unavailableCount: 0,
        },
      }),
    );
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    const tooLarge = await screen.findByTestId(
      "steward_hub.download_bundle_too_large_state",
    );
    expect(tooLarge).toHaveTextContent("too large for one bundle");
    // No media was retrieved and no ZIP was created.
    expect(calls.retrieveFamilyArchiveMedia).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
    // The JSON-only download remains available.
    expect(
      screen.getByTestId("steward_hub.download_archive_button"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Authorization failure
// ---------------------------------------------------------------------------

describe("authorization failure", () => {
  it("shows neutral failure feedback and no download when the export is rejected", async () => {
    const user = userEvent.setup();
    setExportResult({ __kind__: "err", err: ExportError.NotSteward });
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_bundle_button"),
    );

    const errorState = await screen.findByTestId(
      "steward_hub.download_bundle_error_state",
    );
    expect(errorState).toHaveTextContent("Archive could not be created.");
    expect(errorState.textContent).not.toContain("NotSteward");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(calls.retrieveFamilyArchiveMedia).toHaveLength(0);
  });
});
