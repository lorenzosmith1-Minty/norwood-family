import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  type ProposedFinding,
  type RelationshipRequest,
  type Report,
  type Result_3,
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the Conflict Review resolution flow before the
// Person Fact field-mapping fix.
//
// The upcoming build normalizes common human field labels (e.g. 'Birth Place')
// to canonical internal keys ('birthplace') in both canonicalValueFor and
// applyPersonFact, and returns a clear unsupported-field error for unmappable
// fields. It also replaces the Research Intake Person Fact form's free-text
// field input with a dropdown of canonical fields.
//
// This baseline deliberately does NOT freeze the free-text field input behavior
// (that is intentionally replaced by the dropdown) or the current silent
// no-op for unmappable fields (that is the bug the change fixes).
//
// Instead it freezes the adjacent working behavior the change must not break:
// resolving a conflict with Replace Existing resolves the conflict AND writes
// the proposed Person Fact value into the canonical PersonProfile field. This
// is the observable contract the field-mapping change must preserve for a
// canonical field key.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = Principal.fromText(ACCOUNT);

// The canonical Person Fact field keys the backend maps human labels onto. An
// unmappable field (one not in this set) is rejected on Replace Existing with a
// clear unsupported-field error instead of silently resolving.
const CANONICAL_PERSON_FACT_FIELDS = new Set([
  "birthDate",
  "birthplace",
  "currentLocation",
  "occupation",
  "preferredName",
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "nickname",
  "shortBio",
  "longerStory",
]);

const {
  mockActor,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setSources,
  setFindings,
  setConflicts,
  setReviewQueue,
  setProfiles,
  getResolvedConflictActions,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let conflicts: ConflictReviewItem[] = [];
  let profiles: Record<string, PersonProfile> = {};
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  let resolvedConflictActions: Array<{
    id: bigint;
    action: string;
    notes: string;
  }> = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
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
      return sources;
    },
    async getSource(id: bigint): Promise<SourceRecord | null> {
      return sources.find((s) => s.id === id) ?? null;
    },
    async listFindings(): Promise<ProposedFinding[]> {
      return findings;
    },
    async getFinding(id: bigint): Promise<ProposedFinding | null> {
      return findings.find((f) => f.id === id) ?? null;
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
      return conflicts;
    },
    async listConflictsForPerson(
      personId: string,
    ): Promise<ConflictReviewItem[]> {
      return conflicts.filter(
        (c) =>
          c.personId === personId &&
          (c.status === ReviewStatus.Conflicting ||
            c.status === ReviewStatus.NeedsResearch),
      );
    },
    async resolveConflict(
      id: bigint,
      action: string,
      notes: string,
    ): Promise<Result_3> {
      const found = conflicts.find((c) => c.id === id);
      if (!found)
        return { __kind__: "err", err: { __kind__: "notFound", notFound: id } };
      // Mirrors the backend: Replace Existing writes the proposed Person Fact
      // value into the canonical PersonProfile field (via applyPersonFact), then
      // resolves the conflict. An unmappable Person Fact field returns a clear
      // unsupported-field error and leaves the conflict unresolved without
      // altering canonical data. Keep Existing / Preserve Both / Needs Research
      // leave canonical data unchanged.
      if (action === "ReplaceExisting") {
        const finding = findings.find((f) => f.id === found.findingId);
        if (finding && finding.content.__kind__ === "PersonFact") {
          const pf = finding.content.PersonFact;
          if (!CANONICAL_PERSON_FACT_FIELDS.has(pf.field)) {
            return {
              __kind__: "err",
              err: {
                __kind__: "invalidState",
                invalidState: `Unsupported Person Fact field: '${pf.field}'`,
              },
            };
          }
          const profile = profiles[pf.personId];
          if (profile) {
            profiles[pf.personId] = { ...profile, [pf.field]: pf.value };
          }
        }
      }
      const newStatus =
        action === "PreserveBoth"
          ? ReviewStatus.Conflicting
          : action === "NeedsResearch"
            ? ReviewStatus.NeedsResearch
            : ReviewStatus.Approved;
      conflicts = conflicts.map((c) =>
        c.id === id ? { ...c, status: newStatus, stewardNotes: notes } : c,
      );
      resolvedConflictActions = [
        ...resolvedConflictActions,
        { id, action, notes },
      ];
      const updated = conflicts.find((c) => c.id === id);
      return updated
        ? { __kind__: "ok", ok: updated }
        : { __kind__: "err", err: { __kind__: "notFound", notFound: id } };
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async getResearchAuditLog(): Promise<unknown[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      findings = [];
      conflicts = [];
      profiles = {};
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      resolvedConflictActions = [];
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
    setSources: (v: SourceRecord[]) => {
      sources = v;
    },
    setFindings: (v: ProposedFinding[]) => {
      findings = v;
    },
    setConflicts: (v: ConflictReviewItem[]) => {
      conflicts = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    setProfiles: (v: Record<string, PersonProfile>) => {
      profiles = v;
    },
    getResolvedConflictActions: () => resolvedConflictActions,
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
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  };
}

function sourceRecord(id: bigint, title: string): SourceRecord {
  return {
    id,
    title,
    sourceType: SourceType.CensusCitation,
    description: "1900 census, Norwood household",
    contributor: STEWARD,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function personFactFinding(
  id: bigint,
  field: string,
  value: string,
  personId: string,
): ProposedFinding {
  return {
    id,
    title: `${field} of Julia Norwood`,
    evidenceLabel: EvidenceLabel.Documented,
    findingType: FindingType.PersonFact,
    content: {
      __kind__: "PersonFact",
      PersonFact: { field, value, personId },
    },
    sourceId: 1n,
    personId,
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function conflictItem(
  id: bigint,
  findingId: bigint,
  field: string,
  canonicalValue: string,
  proposedValue: string,
): ConflictReviewItem {
  return {
    id,
    findingId,
    field,
    canonicalValue,
    proposedValue,
    status: ReviewStatus.Conflicting,
    evidenceLabel: EvidenceLabel.Documented,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 1n,
  };
}

async function openConflictReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.open_conflict_review"));
  await screen.findByRole("heading", { name: "Conflict Review" });
}

describe("Conflict Review resolution flow (characterization)", () => {
  it("resolves a conflict with Replace Existing and writes the proposed Person Fact value into the canonical profile field", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // The canonical Julia profile currently records birthplace 'Chicago, IL'.
    setProfiles({
      julia: {
        ...claimedProfile("julia", "Julia Norwood"),
        birthplace: "Chicago, IL",
      },
    });
    // A Person Fact finding proposes a new birthplace value.
    setFindings([
      personFactFinding(1n, "birthplace", "Springfield, IL", "julia"),
    ]);
    setConflicts([
      conflictItem(1n, 1n, "birthplace", "Chicago, IL", "Springfield, IL"),
    ]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // The disputed values are shown side by side.
    expect(screen.getByText("Chicago, IL")).toBeInTheDocument();
    expect(screen.getByText("Springfield, IL")).toBeInTheDocument();

    // Replace Existing is an explicit, confirmed action.
    await user.click(
      screen.getByTestId("research_conflict.action_button.1.ReplaceExisting"),
    );
    await user.click(
      screen.getByTestId("research_conflict.confirm_button.1.ReplaceExisting"),
    );

    // The action was recorded.
    expect(getResolvedConflictActions()).toEqual([
      { id: 1n, action: "ReplaceExisting", notes: "" },
    ]);

    // The conflict is resolved (no longer Conflicting).
    const remaining = await mockActor.listConflictReviewItems();
    expect(remaining[0].status).toBe(ReviewStatus.Approved);

    // The proposed value was written into the canonical PersonProfile field.
    const profile = await mockActor.getPersonProfile("julia");
    expect(profile?.birthplace).toBe("Springfield, IL");
  });

  it("leaves the canonical profile field unchanged when a conflict is resolved with Keep Existing", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProfiles({
      julia: {
        ...claimedProfile("julia", "Julia Norwood"),
        birthplace: "Chicago, IL",
      },
    });
    setFindings([
      personFactFinding(1n, "birthplace", "Springfield, IL", "julia"),
    ]);
    setConflicts([
      conflictItem(1n, 1n, "birthplace", "Chicago, IL", "Springfield, IL"),
    ]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    await user.click(
      screen.getByTestId("research_conflict.action_button.1.KeepExisting"),
    );
    await user.click(
      screen.getByTestId("research_conflict.confirm_button.1.KeepExisting"),
    );

    // Keep Existing resolves the conflict but leaves canonical data unchanged.
    const remaining = await mockActor.listConflictReviewItems();
    expect(remaining[0].status).toBe(ReviewStatus.Approved);
    const profile = await mockActor.getPersonProfile("julia");
    expect(profile?.birthplace).toBe("Chicago, IL");
  });

  it("returns a clear unsupported-field error on Replace Existing for an unmappable Person Fact field, leaving the conflict unresolved and canonical data unchanged", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProfiles({
      julia: {
        ...claimedProfile("julia", "Julia Norwood"),
        birthplace: "Chicago, IL",
      },
    });
    // A Person Fact finding proposes a value for an unmappable field.
    setFindings([personFactFinding(1n, "Favorite Color", "Blue", "julia")]);
    setConflicts([conflictItem(1n, 1n, "Favorite Color", "Unknown", "Blue")]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // Replace Existing on the unmappable field.
    await user.click(
      screen.getByTestId("research_conflict.action_button.1.ReplaceExisting"),
    );
    await user.click(
      screen.getByTestId("research_conflict.confirm_button.1.ReplaceExisting"),
    );

    // A clear unsupported-field error is surfaced in the dialog, and the
    // conflict is left unresolved with no canonical data changed.
    const dialogError = await screen.findByTestId(
      "research_conflict.dialog_error.1.ReplaceExisting",
    );
    expect(dialogError).toHaveTextContent(
      "Unsupported Person Fact field: 'Favorite Color'",
    );
    expect(dialogError).toHaveTextContent(
      "The conflict was left unresolved and no canonical data was changed.",
    );

    // The conflict is NOT resolved (still Conflicting) and no resolution action
    // was recorded.
    expect(getResolvedConflictActions()).toEqual([]);
    const remaining = await mockActor.listConflictReviewItems();
    expect(remaining[0].status).toBe(ReviewStatus.Conflicting);

    // Canonical data is unchanged.
    const profile = await mockActor.getPersonProfile("julia");
    expect(profile?.birthplace).toBe("Chicago, IL");
  });
});
