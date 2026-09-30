import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuditActionType,
  type AuditEntry,
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  type PersonProfile,
  type ProfileClaim,
  type ProposedFinding,
  type RelationshipRequest,
  type Report,
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  type StewardAuditEntry,
  StewardAuditKind,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useGetStewardAuditHistory } from "./hooks/useGovernance";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Steward Audit History change.
//
// The accepted change makes `getStewardAuditHistoryForFamily(familyId)` the
// canonical backend read, reduces the legacy `getStewardAuditHistory()` to a
// thin DEFAULT_FAMILY_ID wrapper, filters the merge helper by familyId, and
// forks the frontend `useGetStewardAuditHistory()` hook on the active family
// (legacy no-argument call + legacy key for the default family; the
// `*ForFamily` call + a family-qualified key for a non-default family).
//
// This baseline deliberately does NOT freeze the behavior the change
// intentionally alters: it does not assert that `getStewardAuditHistory()` is
// the only read, that the merge is unfiltered, or that the hook has no family
// fork. What it protects is the adjacent behavior that must survive:
//
//   1. DEFAULT-FAMILY HOOK CALL SHAPE — with the default family active (no
//      provider, or the default provider), `useGetStewardAuditHistory()` still
//      calls `actor.getStewardAuditHistory()` with NO arguments and registers
//      the legacy key ['governance','stewardAuditHistory']. This is the
//      "Default Norwood audit history behavior is unchanged" criterion: the
//      change adds a non-default branch, it must not move the default branch
//      onto a `*ForFamily` endpoint or a family-qualified key.
//
//   2. AUDIT HISTORY TAB CONSUMER CONTRACT — the tab still renders each entry
//      the hook returns with its existing item shape and labels: a governance
//      entry shows its friendly action label and summary; a conflict-resolution
//      entry shows its action label, kind pill, and conflict details; and the
//      empty state still renders when the hook returns no entries.
//
//   3. BACKEND MERGED-VIEW SHAPE AND ORDERING — the real Motoko merge helper
//      still maps a governance `AuditEntry` to a `#Governance` entry carrying
//      the action tag text, maps a `ConflictResolved` research entry to a
//      `#ConflictResolution` entry enriched from the linked Conflict Review
//      item, and sorts the merged list newest-first. The change adds a family
//      filter; it must not alter the item shapes, labels, or ordering.
//
// The frontend half is component/integration coverage over a typed local actor
// mock; the backend half is a static read of the real Motoko source. Neither
// exercises the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = Principal.fromText(ACCOUNT);

const {
  mockActor,
  calls,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setStewardAudit,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let stewardAudit: StewardAuditEntry[] = [];
  const calls: { getStewardAuditHistory: unknown[][] } = {
    getStewardAuditHistory: [],
  };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    // Family Steward authority is the canonical gate; the platform admin role
    // is a separate concern. This mock drives both from the same flag.
    async isCallerSteward(): Promise<boolean> {
      return isAdmin;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
    async listSources(): Promise<SourceRecord[]> {
      return [];
    },
    async getSource(_id: bigint): Promise<SourceRecord | null> {
      return null;
    },
    async listFindings(): Promise<ProposedFinding[]> {
      return [];
    },
    async getFinding(_id: bigint): Promise<ProposedFinding | null> {
      return null;
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
      return [];
    },
    async listConflictsForPerson(
      _personId: string,
    ): Promise<ConflictReviewItem[]> {
      return [];
    },
    async getResearchAuditLog(): Promise<unknown[]> {
      return [];
    },
    async listAuditHistory(): Promise<AuditEntry[]> {
      return [];
    },
    async getStewardAuditHistory(
      ...args: unknown[]
    ): Promise<StewardAuditEntry[]> {
      calls.getStewardAuditHistory.push(args);
      return stewardAudit;
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      stewardAudit = [];
      calls.getStewardAuditHistory.length = 0;
    },
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    setStewardAudit: (v: StewardAuditEntry[]) => {
      stewardAudit = v;
    },
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

function queryWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  return queryClient;
}

function claimedProfile(personId: string, name: string): PersonProfile {
  return {
    familyId: "norwood",
    personId,
    name,
    livingStatus: "Living",
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  } as PersonProfile;
}

function governanceAuditEntry(
  id: bigint,
  actionType: AuditActionType,
  summary: string,
): StewardAuditEntry {
  return {
    id,
    kind: StewardAuditKind.Governance,
    actionType,
    summary,
    affectedPersonIds: ["julia"],
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: STEWARD,
  };
}

function conflictAuditEntry(
  id: bigint,
  overrides: Partial<StewardAuditEntry> = {},
): StewardAuditEntry {
  return {
    id,
    kind: StewardAuditKind.ConflictResolution,
    actionType: "ConflictResolved",
    resolution: "KeepExisting",
    field: "Birth date",
    existingValue: "1899",
    proposedValue: "1898",
    stewardNotes: "Census record is authoritative.",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 2n,
    affectedPersonIds: ["julia"],
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: STEWARD,
    summary: "Resolved conflict on Birth date",
    ...overrides,
  };
}

async function openGovernanceAudit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Governance/ }),
  );
  await screen.findByRole("heading", { name: "Steward Controls" });
  await user.click(screen.getByRole("button", { name: "Audit History" }));
}

// ---------------------------------------------------------------------------
// (1) Default-family hook call shape — the branch the change must not move.
// ---------------------------------------------------------------------------

describe("useGetStewardAuditHistory: default-family call shape (characterization)", () => {
  it("calls getStewardAuditHistory() with no arguments when no family provider is mounted", async () => {
    const { result } = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: queryWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.getStewardAuditHistory).toEqual([[]]);
  });

  it("registers the legacy ['governance','stewardAuditHistory'] key for the default family", async () => {
    const { result } = renderHook(
      () => ({ audit: useGetStewardAuditHistory(), client: useQueryClient() }),
      { wrapper: queryWrapper },
    );

    await waitFor(() => expect(result.current.audit.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["governance", "stewardAuditHistory"]);
  });

  it("returns the entries the legacy endpoint resolves", async () => {
    const entry = governanceAuditEntry(
      1n,
      AuditActionType.StewardPromoted,
      "Promoted julia",
    );
    setStewardAudit([entry]);

    const { result } = renderHook(() => useGetStewardAuditHistory(), {
      wrapper: queryWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([entry]);
  });
});

// ---------------------------------------------------------------------------
// (2) Audit History tab consumer contract — item shapes and labels.
// ---------------------------------------------------------------------------

describe("Audit History tab: merged entry rendering (characterization)", () => {
  it("renders a governance entry's friendly action label and summary", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setStewardAudit([
      governanceAuditEntry(
        1n,
        AuditActionType.StewardPromoted,
        "Promoted julia",
      ),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openGovernanceAudit(user);

    // The friendly label for the action type and the stored summary both render.
    expect(await screen.findByText("Steward promoted")).toBeInTheDocument();
    expect(screen.getByText("Promoted julia")).toBeInTheDocument();
    expect(screen.getByText("Governance")).toBeInTheDocument();
  });

  it("renders a conflict-resolution entry's action, kind, and conflict details", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setStewardAudit([conflictAuditEntry(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openGovernanceAudit(user);

    // "Keep Existing" appears as both the action label and the resolution detail.
    expect(
      (await screen.findAllByText("Keep Existing")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Conflict resolution")).toBeInTheDocument();
    expect(screen.getByText("Birth date")).toBeInTheDocument();
    expect(screen.getByText("1899")).toBeInTheDocument();
    expect(screen.getByText("1898")).toBeInTheDocument();
    expect(
      screen.getByText(/Steward notes: Census record is authoritative\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Existing #1 · Proposed #2/)).toBeInTheDocument();
  });

  it("renders the empty state when the hook returns no entries", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setStewardAudit([]);
    const user = userEvent.setup();
    renderApp();
    await openGovernanceAudit(user);

    expect(
      await screen.findByTestId("governance.audit.empty_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("No audit entries yet")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (3) Backend merged-view shape and ordering — static read of the real source.
//
// The merge helper is internal Motoko, and the PocketIC lane cannot run in this
// sandbox (no compiled wasm), so this is the only executable protection for the
// merged-view contract. It asserts the shape mapping and the newest-first sort
// the change must preserve, and deliberately does NOT assert the absence of a
// family filter (that is the change under way).
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const auditWorkloadLib = stripComments(
  readBackend(path.join("lib", "audit-and-workload.mo")),
);

/** The body of a named `func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

describe("mergeAuditHistory: merged-view shape and ordering (characterization)", () => {
  it("maps a governance AuditEntry to a #Governance entry carrying the action tag text", () => {
    const body = functionBody(auditWorkloadLib, "governanceEntry");
    expect(body).toContain("kind = #Governance");
    expect(body).toContain("actionType = auditActionText(e.actionType)");
    // The governance fields are carried through unchanged.
    expect(body).toContain("id = e.id");
    expect(body).toContain("actorAccountId = e.actorAccountId");
    expect(body).toContain("timestamp = e.timestamp");
    expect(body).toContain("summary = e.summary");
    expect(body).toContain("affectedPersonIds = e.affectedPersonIds");
    // Conflict-specific fields are left null for a governance entry.
    expect(body).toContain("personId = null");
    expect(body).toContain("resolution = null");
  });

  it("maps a ConflictResolved research entry to a #ConflictResolution entry enriched from the linked conflict", () => {
    const body = functionBody(auditWorkloadLib, "conflictEntry");
    expect(body).toContain("kind = #ConflictResolution");
    expect(body).toContain('actionType = "ConflictResolved"');
    // The conflict-specific fields come from the linked ConflictReviewItem.
    expect(body).toContain("field = switch (conflict)");
    expect(body).toContain("existingValue = switch (conflict)");
    expect(body).toContain("proposedValue = switch (conflict)");
    expect(body).toContain("existingSourceId = switch (conflict)");
    expect(body).toContain("proposedSourceId = switch (conflict)");
    // The resolution action text is parsed from the research audit summary.
    expect(body).toContain("resolution = resolutionFromSummary(e.summary)");
  });

  it("merges governance and ConflictResolved research entries and sorts newest-first", () => {
    // The merge logic lives in the canonical family-scoped function;
    // `mergeAuditHistory` is a thin default-family wrapper that delegates to it.
    const body = functionBody(auditWorkloadLib, "mergeAuditHistoryForFamily");
    // Governance entries are mapped through the governance mapper.
    expect(body).toContain("merged.add(governanceEntry(e))");
    // Only ConflictResolved research entries are merged, through the conflict
    // mapper enriched from the linked conflict. The canonical function also
    // filters by the requested family.
    expect(body).toContain('e.action == "ConflictResolved"');
    expect(body).toContain("conflictEntry(e, linked)");
    // The merged list is sorted by timestamp descending (newest first).
    expect(body).toContain(
      "merged.toArray().sort(func (a, b) = Int.compare(b.timestamp, a.timestamp))",
    );
  });

  it("keeps the governance action-tag mapping for every action type", () => {
    const body = functionBody(auditWorkloadLib, "auditActionText");
    for (const tag of [
      "ClaimApproved",
      "StewardPromoted",
      "StewardRemoved",
      "SuccessorDesignated",
      "SuccessorActivated",
      "ProfileArchived",
      "ProfileRestored",
      "DuplicateMerged",
      "RelationshipAdded",
      "RelationshipRemoved",
    ]) {
      expect(body).toContain(`#${tag}`);
    }
  });
});
