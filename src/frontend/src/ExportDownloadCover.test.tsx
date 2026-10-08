import "@testing-library/jest-dom/vitest";
import {
  type PersonProfile as BackendPersonProfile,
  ClaimStatus,
  type ExportEnvelope,
  ExportError,
  type ExportFamilyArchiveResult,
  ExportFormat,
  type ExportMetadata,
  ExportScope,
  type FamilyMembership,
  LivingStatus,
  MembershipStatus,
  type Result_40,
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
import {
  buildExportFilename,
  downloadJsonFile,
  mapExportError,
  serializeExportEnvelope,
} from "./lib/exportDownload";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";
import { PersonProfilePage, claytonProfile } from "./pages/PersonProfilePage";

// ---------------------------------------------------------------------------
// Phase 5B — "Download my data" / "Download family archive" (cover).
//
// Accepted behavior asserted here:
//   1. An authenticated profile owner sees the "Download my data" action in the
//      My Profile ownership/claim card; a non-owner does not.
//   2. An active Family Steward sees the "Download family archive" card in the
//      Family Steward hub; a non-Steward does not.
//   3. Clicking a download action produces a valid-JSON file that preserves the
//      existing Phase 5A export schema/version envelope unchanged.
//   4. A backend authorization failure produces no file and shows neutral
//      permission/error feedback.
//   5. Repeated clicks are prevented while an export request is in flight.
//   6. The temporary client-side download state (object URL) is released after
//      download.
//   7. No export payload is persisted to localStorage or sessionStorage.
//   8. Filenames contain no private names, account IDs, principals, or internal
//      IDs.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend rendering and consumer contract. It does NOT
// exercise the real canister; the PocketIC lane is the only place backend
// runtime behavior is observed (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const OTHER_USER = "rno2w-sqaaa-aaaaa-aaacq-cai";

const {
  mockActor,
  calls,
  resetCalls,
  setBackendProfile,
  setSteward,
  setMembershipResult,
  setExportResult,
  setExportGate,
  releaseExportGate,
} = vi.hoisted(() => {
  let backendProfile: unknown = null;
  let steward = false;
  let membershipResult: unknown = { __kind__: "ok", ok: null };
  // The generated wrapper returns a tagged `Result_40` variant keyed by
  // `__kind__` (double trailing underscores); the hook branches on exactly that
  // key. The mock must match the real consumer contract or the error path is
  // never exercised.
  let exportResult: unknown = { __kind__: "err", err: "ExportFailed" };
  // When set, the export call awaits this promise before resolving, so a test
  // can hold a request "in flight" and assert duplicate-click prevention.
  let exportGate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;

  const calls: {
    exportMyData: unknown[][];
    exportFamilyArchive: unknown[][];
  } = {
    exportMyData: [],
    exportFamilyArchive: [],
  };

  const mockActor = {
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
    async getPersonProfile(): Promise<unknown> {
      return backendProfile;
    },
    async getPersonProfileForFamily(): Promise<unknown> {
      return backendProfile;
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getMyProfileClaimForFamily(): Promise<null> {
      return null;
    },
    async canMessagePerson(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return steward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return steward;
    },
    async getMyMembershipForFamily(): Promise<unknown> {
      return membershipResult;
    },
    async getMyRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return [];
    },
    async listConflictsForPerson(): Promise<unknown[]> {
      return [];
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
    async exportMyData(...args: unknown[]): Promise<unknown> {
      calls.exportMyData.push(args);
      if (exportGate) await exportGate;
      return exportResult;
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
      calls.exportMyData.length = 0;
      calls.exportFamilyArchive.length = 0;
    },
    setBackendProfile: (profile: unknown) => {
      backendProfile = profile;
    },
    setSteward: (value: boolean) => {
      steward = value;
    },
    setMembershipResult: (result: unknown) => {
      membershipResult = result;
    },
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
    getExportGate: () => exportGate,
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

function makeBackendProfile(
  overrides: Partial<BackendPersonProfile> = {},
): BackendPersonProfile {
  return {
    familyId: "norwood",
    personId: "clayton",
    name: "Clayton Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
    ...overrides,
  };
}

function makeMembership(): FamilyMembership {
  return {
    id: 7n,
    status: MembershipStatus.Active,
    accountId: Principal.fromText(OWNER),
    approvedAt: 1_700_000_000_000_000_000n,
    approvedBy: Principal.fromText(OWNER),
    createdAt: 1_700_000_000_000_000_000n,
    joinedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    personId: "clayton",
    familyId: "norwood",
  };
}

/** A valid Phase 5A envelope with a self-describing, versioned metadata block. */
function makeEnvelope(scope: ExportScope = ExportScope.MyData): ExportEnvelope {
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

function okEnvelope(scope: ExportScope): Result_40 {
  return { __kind__: "ok", ok: makeEnvelope(scope) };
}

/**
 * A successful FamilyArchive export result. Phase 5C-H1 changed
 * `exportFamilyArchive` to return the versioned envelope PLUS an opaque
 * export-instance reference, so the consumer contract is `Result_41` whose `ok`
 * is an `ExportFamilyArchiveResult`, not a bare envelope.
 */
function okArchiveResult(scope: ExportScope): Result_41 {
  const result: ExportFamilyArchiveResult = {
    envelope: makeEnvelope(scope),
    exportInstanceRef: "export-1",
  };
  return { __kind__: "ok", ok: result };
}

/**
 * Reads a Blob's text through FileReader.
 *
 * jsdom's Blob does not implement `.text()` / `.arrayBuffer()`, so the blob
 * contents are read through the FileReader API jsdom does provide.
 */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function renderProfile() {
  return renderWithClient(
    <PersonProfilePage
      person={claytonProfile}
      onBack={() => {}}
      onProfilePhotoChange={() => {}}
    />,
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
  setBackendProfile(null);
  setSteward(false);
  setMembershipResult({ __kind__: "ok", ok: makeMembership() });
  setExportResult({ __kind__: "err", err: ExportError.ExportFailed });
  releaseExportGate();
  resetCalls();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// A. Pure helper contract: filename privacy, envelope preservation, error
//    mapping, and the ephemeral object-URL lifecycle.
// ---------------------------------------------------------------------------

describe("export download helpers (cover)", () => {
  it("builds scope-specific filenames with no private names, IDs, or principals", () => {
    const now = new Date(2026, 9, 8); // 2026-10-08 local
    const myData = buildExportFilename(ExportScope.MyData, now);
    const archive = buildExportFilename(ExportScope.FamilyArchive, now);

    expect(myData).toBe("norwood-my-data-2026-10-08.json");
    expect(archive).toBe("norwood-family-archive-2026-10-08.json");

    for (const name of [myData, archive]) {
      expect(name).not.toContain(OWNER);
      expect(name).not.toContain(OTHER_USER);
      expect(name).not.toContain("Clayton");
      expect(name).not.toContain("clayton");
      expect(name).not.toContain("norwood::");
    }
  });

  it("serializes the versioned envelope unchanged and as valid JSON", () => {
    const envelope = makeEnvelope(ExportScope.MyData);
    const serialized = serializeExportEnvelope(envelope);
    const parsed = JSON.parse(serialized) as {
      metadata: Record<string, unknown>;
      payloadJson: string;
    };

    // The metadata is emitted as-is and the payload is embedded verbatim, so
    // the frontend never rebuilds or mutates the export schema. BigInt fields
    // are serialized as decimal strings (JSON has no bigint), which is the
    // only transformation applied — every other field is preserved exactly.
    expect(parsed.metadata).toEqual({
      ...envelope.metadata,
      generatedAt: envelope.metadata.generatedAt.toString(),
      schemaVersion: envelope.metadata.schemaVersion.toString(),
    });
    expect(parsed.payloadJson).toBe(envelope.payloadJson);
    expect(parsed.metadata.schemaVersion).toBe("1");
    expect(parsed.metadata.scope).toBe(ExportScope.MyData);
    expect(parsed.metadata.format).toBe(ExportFormat.JSON);
  });

  it("maps authorization errors to denied and other failures to failed", () => {
    for (const denied of [
      ExportError.NotAuthorized,
      ExportError.NotSteward,
      ExportError.NotSignedIn,
      ExportError.FamilyNotFound,
      ExportError.UnsupportedScope,
    ]) {
      expect(mapExportError(denied)).toEqual({ kind: "denied" });
    }
    expect(mapExportError(ExportError.ExportFailed)).toEqual({
      kind: "failed",
    });
    expect(mapExportError(ExportError.UnsupportedFormat)).toEqual({
      kind: "failed",
    });
  });

  it("downloads through an ephemeral object URL that is released afterwards", () => {
    downloadJsonFile('{"a":1}', "norwood-my-data-2026-10-08.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    // The same URL that was created is the one revoked, so nothing leaks.
    expect(revokeObjectURL).toHaveBeenCalledWith(
      createObjectURL.mock.results[0]?.value,
    );
    // The anchor is removed from the document after the click.
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. Profile ownership/claim card: owner-only visibility and the download
//    journey.
// ---------------------------------------------------------------------------

describe("Download my data — owner gating (cover)", () => {
  it("shows the action to the signed-in owner of the profile", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    renderProfile();

    const claimSection = await screen.findByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByTestId(
        "profile.download_my_data_button",
      ),
    ).toBeInTheDocument();
  });

  it("hides the action from a non-owner viewing a claimed profile", async () => {
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OTHER_USER),
      }),
    );
    renderProfile();

    await screen.findByTestId("profile.claim_section");
    await waitFor(() =>
      expect(
        screen.queryByTestId("profile.download_my_data_button"),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("Download my data — journey (cover)", () => {
  it("requests the caller's own MyData export and downloads a valid-JSON file preserving the envelope", async () => {
    const user = userEvent.setup();
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    setExportResult(okEnvelope(ExportScope.MyData));
    renderProfile();

    await user.click(
      await screen.findByTestId("profile.download_my_data_button"),
    );

    await waitFor(() => expect(calls.exportMyData).toEqual([["norwood"]]));

    // The download is ephemeral and released.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    // The blob contents are valid JSON preserving the versioned envelope.
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    const text = await readBlobText(blob);
    const parsed = JSON.parse(text) as {
      metadata: Record<string, unknown>;
      payloadJson: string;
    };
    expect(parsed.metadata.schemaVersion).toBe("1");
    expect(parsed.metadata.scope).toBe(ExportScope.MyData);
    expect(parsed.payloadJson).toBe(makeEnvelope().payloadJson);

    // Success feedback is shown.
    expect(
      await screen.findByTestId("profile.download_my_data.success_state"),
    ).toBeInTheDocument();

    // Nothing is persisted to web storage.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("shows neutral permission feedback and produces no file on an authorization failure", async () => {
    const user = userEvent.setup();
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    setExportResult({ __kind__: "err", err: ExportError.NotAuthorized });
    renderProfile();

    await user.click(
      await screen.findByTestId("profile.download_my_data_button"),
    );

    const denied = await screen.findByTestId(
      "profile.download_my_data.denied_state",
    );
    expect(denied).toHaveTextContent(
      "You do not have permission to download this data.",
    );
    // No technical error tag leaks to the user.
    expect(denied.textContent).not.toContain("NotAuthorized");
    // No download was created.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("prevents repeated clicks while an export request is in flight", async () => {
    const user = userEvent.setup();
    setBackendProfile(
      makeBackendProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    setExportResult(okEnvelope(ExportScope.MyData));
    setExportGate();
    renderProfile();

    const button = await screen.findByTestId("profile.download_my_data_button");
    await user.click(button);

    // While the request is in flight the control is disabled and busy.
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");

    // A second click cannot start an overlapping export.
    await user.click(button);
    expect(calls.exportMyData).toHaveLength(1);

    releaseExportGate();
    await waitFor(() =>
      expect(
        screen.getByTestId("profile.download_my_data.success_state"),
      ).toBeInTheDocument(),
    );
    expect(calls.exportMyData).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// C. Family Steward hub: Steward-only visibility and the archive journey.
// ---------------------------------------------------------------------------

describe("Download family archive — Steward gating (cover)", () => {
  it("shows the card to an active Family Steward", async () => {
    setSteward(true);
    renderHub();

    expect(
      await screen.findByTestId("steward_hub.download_archive_card"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("steward_hub.download_archive_button"),
    ).toBeInTheDocument();
  });

  it("hides the card from a non-Steward", async () => {
    setSteward(false);
    renderHub();

    await screen.findByTestId("steward_hub.unauthorized_state");
    expect(
      screen.queryByTestId("steward_hub.download_archive_card"),
    ).not.toBeInTheDocument();
  });
});

describe("Download family archive — journey (cover)", () => {
  it("requests the FamilyArchive export and downloads a valid-JSON file preserving the envelope", async () => {
    const user = userEvent.setup();
    setSteward(true);
    setExportResult(okArchiveResult(ExportScope.FamilyArchive));
    renderHub();

    await user.click(
      await screen.findByTestId("steward_hub.download_archive_button"),
    );

    await waitFor(() =>
      expect(calls.exportFamilyArchive).toEqual([["norwood"]]),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    const parsed = JSON.parse(await readBlobText(blob)) as {
      metadata: Record<string, unknown>;
      payloadJson: string;
    };
    expect(parsed.metadata.schemaVersion).toBe("1");
    expect(parsed.metadata.scope).toBe(ExportScope.FamilyArchive);
    expect(parsed.payloadJson).toBe(
      makeEnvelope(ExportScope.FamilyArchive).payloadJson,
    );

    expect(
      await screen.findByTestId("steward_hub.download_archive_success_state"),
    ).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("shows neutral permission feedback and produces no file when the backend refuses the archive export", async () => {
    const user = userEvent.setup();
    setSteward(true);
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
    expect(errorState.textContent).not.toContain("NotSteward");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
