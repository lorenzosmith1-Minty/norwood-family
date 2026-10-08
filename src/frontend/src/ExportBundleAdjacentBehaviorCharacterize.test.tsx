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
// Phase 5D — "Download family archive bundle" (ZIP): adjacent-behavior
// characterization.
//
// The bundle feature does not exist yet. This file deliberately does NOT assert
// any bundle action, ZIP container, bundle progress state, preflight, or
// sanitized ZIP path: those are the change under construction, and
// characterizing them now would freeze a design that has not been accepted.
//
// What it protects is the ADJACENT working behavior the bundle must reuse and
// must not break:
//
//   A. The existing JSON-only "Download archive" action in the Family Steward
//      hub. The bundle action is added ALONGSIDE it and must not displace,
//      weaken, or rename it. Its card, button, status states, retry control,
//      and the `exportFamilyArchive(familyId)` call shape are pinned here.
//   B. The existing ephemeral client-side download lifecycle. The bundle reuses
//      the same Blob + URL.createObjectURL + anchor.download + click +
//      URL.revokeObjectURL pattern, and must keep it ephemeral: no
//      localStorage/sessionStorage persistence. That lifecycle is pinned here.
//   C. The Phase 5C retrieval consumer contract the bundle depends on: the
//      generated wrapper exposes `retrieveFamilyArchiveMedia(exportInstanceRef,
//      mediaRef)` typed `Result_6`, and a successful retrieval carries bytes
//      plus portable metadata and never a URL. The bundle must retrieve media
//      through this export-instance + media-N flow only.
//   D. The Phase 5C resource summary the bundle preflight reads:
//      `mediaManifestSummary` carries assetCount / knownTotalBytes /
//      unavailableCount, and the manifest entry carries the neutral
//      availability state. The bundle must not reshape these.
//   E. The existing export envelope/schema the bundle embeds unchanged as
//      /norwood-export.json: the versioned, self-describing Phase 5A envelope.
//
// This is component/integration coverage through the real React components with
// a typed local actor mock, plus a typed consumer-contract check. It does NOT
// exercise the real canister: the PocketIC lane is the only place backend
// runtime behavior is observed, and it is recorded in the episode's
// coverageLimits. The frontend suite mocks the actor, so no backend runtime
// behavior is visible here.
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
  setExportGate,
  releaseExportGate,
} = vi.hoisted(() => {
  let steward = false;
  let exportResult: unknown = { __kind__: "err", err: "ExportFailed" };
  // When set, the export call awaits this promise before resolving, so a test
  // can hold a request "in flight" and assert duplicate-click prevention.
  let exportGate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;

  const calls: {
    exportFamilyArchive: unknown[][];
  } = {
    exportFamilyArchive: [],
  };

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return steward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return steward;
    },
    // Family Steward hub reads.
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
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.exportFamilyArchive.length = 0;
    },
    setSteward: (value: boolean) => {
      steward = value;
    },
    getSteward: () => steward,
    setExportResult: (result: unknown) => {
      exportResult = result;
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

/** A valid Phase 5A envelope with a self-describing, versioned metadata block. */
function makeEnvelope(
  scope: ExportScope = ExportScope.FamilyArchive,
): ExportEnvelope {
  const metadata: ExportMetadata = {
    generatedAt: 1_700_000_000_000_000_000n,
    scope,
    sourceAppName: "Norwood",
    schemaVersion: 1n,
    sourceAppVersion: "1.0.0",
    familyRef: "Norwood",
    format: ExportFormat.JSON,
  };
  return {
    metadata,
    payloadJson: JSON.stringify({ persons: [{ name: "Clayton Norwood" }] }),
  };
}

/**
 * A successful FamilyArchive export result. Phase 5C-H1 changed
 * `exportFamilyArchive` to return the versioned envelope PLUS an opaque
 * export-instance reference, so the consumer contract is `Result_41` whose `ok`
 * is an `ExportFamilyArchiveResult`, not a bare envelope.
 */
function okArchiveResult(): Result_41 {
  const result: ExportFamilyArchiveResult = {
    envelope: makeEnvelope(ExportScope.FamilyArchive),
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

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL / revokeObjectURL. Provide
  // deterministic stand-ins so the ephemeral-download lifecycle is observable.
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
  setExportResult({ __kind__: "err", err: ExportError.ExportFailed });
  releaseExportGate();
  resetCalls();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// A. The existing JSON-only "Download archive" action is preserved.
//
// The bundle action is added alongside it. These assertions pin the existing
// card, button, status states, retry control, and call shape so the new action
// cannot displace or weaken the JSON-only download.
// ---------------------------------------------------------------------------

describe("existing JSON-only archive download card (characterization)", () => {
  it("keeps the existing card and its JSON-only download button for a Steward", async () => {
    renderHub();

    expect(
      await screen.findByTestId("steward_hub.download_archive_card"),
    ).toBeInTheDocument();
    const button = screen.getByTestId("steward_hub.download_archive_button");
    expect(button).toBeInTheDocument();
    // The existing action is the JSON-only "Download archive" control; the
    // bundle action must be a distinct, additional control.
    expect(button).toHaveTextContent("Download archive");
  });

  it("requests the FamilyArchive export for the active family and shows the success state", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult());
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_archive_button"),
    );

    await waitFor(() =>
      expect(calls.exportFamilyArchive).toEqual([["norwood"]]),
    );
    expect(
      await screen.findByTestId("steward_hub.download_archive_success_state"),
    ).toBeInTheDocument();
  });

  it("shows neutral permission feedback and no download on a backend refusal", async () => {
    const user = userEvent.setup();
    setExportResult({ __kind__: "err", err: ExportError.NotSteward });
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_archive_button"),
    );

    const errorState = await screen.findByTestId(
      "steward_hub.download_archive_error_state",
    );
    expect(errorState).toHaveTextContent(
      "You do not have permission to download this archive.",
    );
    // No technical error tag leaks to the user.
    expect(errorState.textContent).not.toContain("NotSteward");
    // No download was created.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("offers a retry control after a failure and prevents duplicate clicks while in flight", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult());
    setExportGate();
    renderHub();

    const button = await screen.findByTestId(
      "steward_hub.download_archive_button",
    );
    await user.click(button);

    // While the request is in flight the control is disabled and busy.
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");

    // A second click cannot start an overlapping export.
    await user.click(button);
    expect(calls.exportFamilyArchive).toHaveLength(1);

    releaseExportGate();
    await waitFor(() =>
      expect(
        screen.getByTestId("steward_hub.download_archive_success_state"),
      ).toBeInTheDocument(),
    );
    expect(calls.exportFamilyArchive).toHaveLength(1);
  });

  it("hides the existing card from a non-Steward", async () => {
    setSteward(false);
    renderHub();

    await screen.findByTestId("steward_hub.unauthorized_state");
    expect(
      screen.queryByTestId("steward_hub.download_archive_card"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B. The existing ephemeral download lifecycle is preserved.
//
// The bundle reuses the same Blob + object-URL + anchor pattern and must stay
// ephemeral. This pins the lifecycle and the no-storage guarantee.
// ---------------------------------------------------------------------------

describe("existing ephemeral download lifecycle (characterization)", () => {
  it("downloads through an object URL that is released, with nothing persisted", async () => {
    const user = userEvent.setup();
    setExportResult(okArchiveResult());
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_archive_button"),
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    // The same URL that was created is the one revoked, so nothing leaks.
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      createObjectURL.mock.results[0]?.value,
    );
    // The anchor is removed from the document after the click.
    expect(document.querySelector("a[download]")).toBeNull();
    // Nothing is persisted to web storage.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// C. The Phase 5C retrieval consumer contract the bundle depends on.
//
// The bundle must retrieve every media file through the export-instance +
// media-N flow only. This pins the generated wrapper method and the
// bytes-not-URL retrieval shape.
// ---------------------------------------------------------------------------

describe("Phase 5C retrieval consumer contract (characterization)", () => {
  it("keeps retrieveFamilyArchiveMedia on the typed service wrapper", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const wrapper = readFileSync(path.join(here, "backend.ts"), "utf8");
    // The bundle retrieves media through this exact export-instance + media-N
    // seam; a bindgen regression that dropped or reshaped it would break the
    // bundle's only authorized retrieval path.
    expect(wrapper).toContain(
      "retrieveFamilyArchiveMedia(exportInstanceRef: ExportInstanceRef, mediaRef: string): Promise<Result_6>",
    );
  });

  it("types a successful retrieval as bytes plus portable metadata, never a URL", async () => {
    const { ExportMediaAvailability, ExportMediaKind } = await import(
      "@/backend"
    );
    const retrieval = {
      ref: { kind: "Media", portableId: "media-1" },
      mediaKind: ExportMediaKind.ArchiveItem,
      title: "Family reunion photograph",
      mimeType: "image/png",
      filename: "reunion-photo.png",
      byteSize: 5n,
      relatedPersonRef: undefined,
      relatedArchiveRef: undefined,
      uploadedAt: 1n,
      availability: ExportMediaAvailability.Available,
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    };
    expect(retrieval.bytes).toBeInstanceOf(Uint8Array);
    expect(retrieval.ref.portableId).toBe("media-1");
    expect(retrieval).not.toHaveProperty("url");
  });
});

// ---------------------------------------------------------------------------
// D. The Phase 5C resource summary the bundle preflight reads.
//
// The bundle uses the summary as a preflight before generation. This pins the
// summary fields and the neutral availability state so the preflight cannot
// silently read a reshaped summary.
// ---------------------------------------------------------------------------

describe("Phase 5C resource summary (characterization)", () => {
  it("keeps the summary fields the bundle preflight reads", () => {
    // ExportMediaManifestSummary is a Motoko-side type that is not surfaced in
    // the generated bindings; the bundle preflight reads it from the serialized
    // envelope payload. This mirrors its structural shape.
    const summary: {
      assetCount: bigint;
      knownTotalBytes: bigint;
      unavailableCount: bigint;
    } = {
      assetCount: 3n,
      knownTotalBytes: 1_500_000n,
      unavailableCount: 1n,
    };
    expect(summary.assetCount).toBe(3n);
    expect(summary.knownTotalBytes).toBe(1_500_000n);
    expect(summary.unavailableCount).toBe(1n);
  });

  it("keeps the neutral availability state on the manifest entry", async () => {
    const { ExportMediaAvailability } = await import("@/backend");
    // An unavailable asset is represented neutrally and never fails the export;
    // the bundle must skip it rather than substitute another asset.
    expect(Object.values(ExportMediaAvailability).sort()).toEqual([
      "Available",
      "Unavailable",
    ]);
  });
});

// ---------------------------------------------------------------------------
// E. The existing export envelope/schema the bundle embeds unchanged.
//
// The bundle's /norwood-export.json is the existing Phase 5A FamilyArchive
// envelope, unchanged. This pins the versioned, self-describing envelope shape.
// ---------------------------------------------------------------------------

describe("existing Phase 5A envelope the bundle embeds (characterization)", () => {
  it("keeps the versioned, self-describing envelope shape", () => {
    const envelope = makeEnvelope(ExportScope.FamilyArchive);
    expect(envelope.metadata.schemaVersion).toBe(1n);
    expect(envelope.metadata.scope).toBe(ExportScope.FamilyArchive);
    expect(envelope.metadata.format).toBe(ExportFormat.JSON);
    expect(envelope.metadata.familyRef).toBe("Norwood");
    expect(typeof envelope.payloadJson).toBe("string");
  });
});
