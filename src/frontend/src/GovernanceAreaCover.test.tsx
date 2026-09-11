import "@testing-library/jest-dom/vitest";
import {
  AuditActionType,
  type AuditEntry,
  ClaimStatus,
  type DuplicatePair,
  LivingStatus,
  type MergeResult,
  type PersonProfile,
  type ProfileClaim,
  type ProfileRemovalRequest,
  type Relationship,
  type RelationshipRequest,
  RelationshipStatus,
  RelationshipType,
  type StewardIdentity,
  type StewardRecord,
  StewardRoleStatus,
  type SuccessorDesignation,
  SuccessorStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const STEWARD_ACCOUNT = "2vxsx-fae";
const OTHER_ACCOUNT = "aaaaa-aa";

// A stateful in-memory actor standing in for the real backend so the Family
// Governance & Safety Controls area can be exercised end to end without a
// canister. It implements the governance methods the app's hooks call and
// records every governance action into an audit log, mirroring the backend's
// "every governance action creates an audit entry" contract.
const {
  mockActor,
  resetGovernance,
  setAdmin,
  setAuthenticated,
  getAuthenticated,
  setStewards,
  setStewardIdentities,
  setEligibleCandidates,
  setSuccessors,
  setWarning,
  setDuplicatePairs,
  setRelationships,
  setArchivedProfiles,
  setAuditEntries,
  getAuditEntries,
} = vi.hoisted(() => {
  let isAdmin = false;
  let isAuthenticated = false;
  let stewards: StewardRecord[] = [];
  let successors: SuccessorDesignation[] = [];
  let warning: string | null = null;
  let stewardIdentities: StewardIdentity[] = [];
  let eligibleCandidates: StewardIdentity[] = [];
  let claims: ProfileClaim[] = [];
  let duplicatePairs: DuplicatePair[] = [];
  let relationships: Relationship[] = [];
  let archivedProfiles: PersonProfile[] = [];
  let auditEntries: AuditEntry[] = [];
  let removalRequests: ProfileRemovalRequest[] = [];
  let nextAuditId = 1n;

  const recordAudit = (
    actionType: AuditActionType,
    summary: string,
    affectedPersonIds: string[] = [],
  ) => {
    auditEntries = [
      ...auditEntries,
      {
        id: nextAuditId++,
        actionType,
        summary,
        affectedPersonIds,
        timestamp: 1_700_000_000_000_000_000n,
        actorAccountId: Principal.fromText(STEWARD_ACCOUNT),
      },
    ];
  };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async listStewards(): Promise<StewardRecord[]> {
      return stewards;
    },
    async listStewardIdentities(): Promise<StewardIdentity[]> {
      return stewardIdentities;
    },
    async listEligibleStewardCandidates(): Promise<StewardIdentity[]> {
      return eligibleCandidates;
    },
    async promoteToSteward(personId: string) {
      const record: StewardRecord = {
        stewardAccountId: Principal.fromText(OTHER_ACCOUNT),
        assignedAt: 1_700_000_000_000_000_000n,
        assignedBy: Principal.fromText(STEWARD_ACCOUNT),
        roleStatus: StewardRoleStatus.Active,
      };
      stewards = [...stewards, record];
      recordAudit(AuditActionType.StewardPromoted, `Promoted ${personId}`);
      return { __kind__: "ok" as const, ok: record };
    },
    async removeSteward(stewardAccountId: Principal) {
      if (stewards.length <= 1) {
        return { __kind__: "err" as const, err: "LastSteward" };
      }
      stewards = stewards.filter(
        (s) => s.stewardAccountId.toText() !== stewardAccountId.toText(),
      );
      recordAudit(
        AuditActionType.StewardRemoved,
        `Removed steward ${stewardAccountId.toText()}`,
      );
      return { __kind__: "ok" as const, ok: null };
    },
    async listSuccessors(): Promise<SuccessorDesignation[]> {
      return successors;
    },
    async designateSuccessor(personId: string, priority: bigint) {
      const designation: SuccessorDesignation = {
        personId,
        priority,
        status: SuccessorStatus.Designated,
        assignedAt: 1_700_000_000_000_000_000n,
        assignedBy: Principal.fromText(STEWARD_ACCOUNT),
      };
      successors = [...successors, designation];
      recordAudit(
        AuditActionType.SuccessorDesignated,
        `Designated ${personId} as successor`,
        [personId],
      );
      return { __kind__: "ok" as const, ok: designation };
    },
    async activateSuccessor(personId: string) {
      successors = successors.map((s) =>
        s.personId === personId
          ? { ...s, status: SuccessorStatus.Activated }
          : s,
      );
      const record: StewardRecord = {
        stewardAccountId: Principal.fromText(OTHER_ACCOUNT),
        assignedAt: 1_700_000_000_000_000_000n,
        assignedBy: Principal.fromText(STEWARD_ACCOUNT),
        roleStatus: StewardRoleStatus.Active,
      };
      stewards = [...stewards, record];
      recordAudit(
        AuditActionType.SuccessorActivated,
        `Activated successor ${personId}`,
        [personId],
      );
      return { __kind__: "ok" as const, ok: record };
    },
    async getSingleStewardWarning(): Promise<string | null> {
      return warning;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return claims;
    },
    async listDuplicateCandidates(): Promise<DuplicatePair[]> {
      return duplicatePairs;
    },
    async notDuplicate(personIdA: string, personIdB: string) {
      duplicatePairs = duplicatePairs.filter(
        (p) =>
          !(
            (p.candidateA.personId === personIdA &&
              p.candidateB.personId === personIdB) ||
            (p.candidateA.personId === personIdB &&
              p.candidateB.personId === personIdA)
          ),
      );
      return { __kind__: "ok" as const, ok: null };
    },
    async mergeProfiles(canonicalPersonId: string, mergedAwayPersonId: string) {
      const result: MergeResult = {
        canonicalPersonId,
        archivedPersonId: mergedAwayPersonId,
        conflicts: [],
      };
      duplicatePairs = duplicatePairs.filter(
        (p) =>
          !(
            p.candidateA.personId === canonicalPersonId ||
            p.candidateB.personId === canonicalPersonId
          ),
      );
      recordAudit(
        AuditActionType.DuplicateMerged,
        `Merged ${mergedAwayPersonId} into ${canonicalPersonId}`,
        [canonicalPersonId, mergedAwayPersonId],
      );
      return { __kind__: "ok" as const, ok: result };
    },
    async listPersonRelationships(personId: string): Promise<Relationship[]> {
      return relationships.filter((r) => r.fromPersonId === personId);
    },
    async addRelationship(
      fromPersonId: string,
      toPersonId: string,
      relationshipType: RelationshipType,
    ) {
      const relationship: Relationship = {
        id: 1n,
        fromPersonId,
        toPersonId,
        relationshipType,
        status: RelationshipStatus.Confirmed,
      };
      relationships = [...relationships, relationship];
      recordAudit(
        AuditActionType.RelationshipAdded,
        `Added ${relationshipType} from ${fromPersonId} to ${toPersonId}`,
        [fromPersonId, toPersonId],
      );
      return { __kind__: "ok" as const, ok: relationship };
    },
    async removeRelationship(relationshipId: bigint) {
      relationships = relationships.filter((r) => r.id !== relationshipId);
      recordAudit(
        AuditActionType.RelationshipRemoved,
        `Removed relationship ${relationshipId}`,
      );
      return { __kind__: "ok" as const, ok: null };
    },
    async correctRelationshipType(
      relationshipId: bigint,
      relationshipType: RelationshipType,
    ) {
      const found = relationships.find((r) => r.id === relationshipId);
      if (!found) {
        return { __kind__: "err" as const, err: "RelationshipNotFound" };
      }
      relationships = relationships.map((r) =>
        r.id === relationshipId ? { ...r, relationshipType } : r,
      );
      recordAudit(
        AuditActionType.RelationshipTypeCorrected,
        `Corrected relationship ${relationshipId} to ${relationshipType}`,
      );
      return { __kind__: "ok" as const, ok: { ...found, relationshipType } };
    },
    async listAuditHistory(): Promise<AuditEntry[]> {
      return auditEntries;
    },
    async listArchivedProfiles(): Promise<PersonProfile[]> {
      return archivedProfiles;
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return archivedProfiles.map((p) => p.personId);
    },
    async restoreProfile(personId: string) {
      archivedProfiles = archivedProfiles.filter(
        (p) => p.personId !== personId,
      );
      recordAudit(
        AuditActionType.ProfileRestored,
        `Restored profile ${personId}`,
        [personId],
      );
      return { __kind__: "ok" as const, ok: null };
    },
    async permanentlyDeleteProfile(personId: string, confirmation: boolean) {
      if (!confirmation) {
        return { __kind__: "err" as const, err: "ConfirmationRequired" };
      }
      archivedProfiles = archivedProfiles.filter(
        (p) => p.personId !== personId,
      );
      recordAudit(
        AuditActionType.ProfilePermanentlyDeleted,
        `Permanently deleted profile ${personId}`,
        [personId],
      );
      return { __kind__: "ok" as const, ok: null };
    },
    async listProfileRemovalRequests(): Promise<ProfileRemovalRequest[]> {
      return removalRequests;
    },
    async requestProfileRemoval(personId: string, reason: string) {
      const request: ProfileRemovalRequest = {
        id: 1n,
        personId,
        reason,
        status: "Pending",
        submittedDate: 1_700_000_000_000_000_000n,
        requestingUserId: Principal.fromText(OTHER_ACCOUNT),
      };
      removalRequests = [...removalRequests, request];
      recordAudit(
        AuditActionType.ProfileRemovalRequested,
        `Removal requested for ${personId}`,
        [personId],
      );
      return { __kind__: "ok" as const, ok: request };
    },
    async approveProfileRemoval(requestId: bigint) {
      const found = removalRequests.find((r) => r.id === requestId);
      if (!found) return null;
      const updated = { ...found, status: "Approved" as const };
      removalRequests = removalRequests.map((r) =>
        r.id === requestId ? updated : r,
      );
      recordAudit(
        AuditActionType.ProfileRemovalReviewed,
        `Approved removal request ${requestId}`,
        [found.personId],
      );
      return updated;
    },
    async rejectProfileRemoval(requestId: bigint) {
      const found = removalRequests.find((r) => r.id === requestId);
      if (!found) return null;
      const updated = { ...found, status: "Rejected" as const };
      removalRequests = removalRequests.map((r) =>
        r.id === requestId ? updated : r,
      );
      recordAudit(
        AuditActionType.ProfileRemovalReviewed,
        `Rejected removal request ${requestId}`,
        [found.personId],
      );
      return updated;
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetGovernance: () => {
      isAdmin = false;
      isAuthenticated = false;
      stewards = [];
      successors = [];
      warning = null;
      stewardIdentities = [];
      eligibleCandidates = [];
      claims = [];
      duplicatePairs = [];
      relationships = [];
      archivedProfiles = [];
      auditEntries = [];
      removalRequests = [];
      nextAuditId = 1n;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    getAuthenticated: () => isAuthenticated,
    setStewards: (v: StewardRecord[]) => {
      stewards = v;
    },
    setStewardIdentities: (v: StewardIdentity[]) => {
      stewardIdentities = v;
    },
    setEligibleCandidates: (v: StewardIdentity[]) => {
      eligibleCandidates = v;
    },
    setSuccessors: (v: SuccessorDesignation[]) => {
      successors = v;
    },
    setWarning: (v: string | null) => {
      warning = v;
    },
    setClaims: (v: ProfileClaim[]) => {
      claims = v;
    },
    setDuplicatePairs: (v: DuplicatePair[]) => {
      duplicatePairs = v;
    },
    setRelationships: (v: Relationship[]) => {
      relationships = v;
    },
    setArchivedProfiles: (v: PersonProfile[]) => {
      archivedProfiles = v;
    },
    setAuditEntries: (v: AuditEntry[]) => {
      auditEntries = v;
    },
    setRemovalRequests: (v: ProfileRemovalRequest[]) => {
      removalRequests = v;
    },
    getAuditEntries: () => auditEntries,
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// authentication state.
vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(STEWARD_ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetGovernance);

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

async function openGovernance(user: ReturnType<typeof userEvent.setup>) {
  // Family Governance is no longer a top-level pill — it is reached through
  // the Family Steward hub.
  await user.click(
    await screen.findByRole("button", { name: "Family Steward" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Governance/ }),
  );
}

function stewardRecord(account: string): StewardRecord {
  return {
    stewardAccountId: Principal.fromText(account),
    assignedAt: 1_700_000_000_000_000_000n,
    assignedBy: Principal.fromText(STEWARD_ACCOUNT),
    roleStatus: StewardRoleStatus.Active,
  };
}

function stewardIdentity(
  personId: string,
  account: string,
  displayName: string,
  canonicalName: string,
): StewardIdentity {
  return {
    personId,
    accountId: Principal.fromText(account),
    displayName,
    canonicalName,
  };
}

function duplicatePair(): DuplicatePair {
  return {
    candidateA: {
      personId: "julia",
      name: "Julia Norwood",
      claimStatus: "Claimed",
      birthDate: "1860",
      deathDate: "1936",
      parents: ["isaiah"],
      spouses: [],
      children: [],
      photoCount: 2n,
      timelineCount: 3n,
      sourceCount: 1n,
      archiveLinks: ["a1"],
      ownerAccount: Principal.fromText(OTHER_ACCOUNT),
    },
    candidateB: {
      personId: "julia-dup",
      name: "Julia Norwood",
      claimStatus: "Unclaimed",
      birthDate: "1860",
      deathDate: "1936",
      parents: [],
      spouses: [],
      children: [],
      photoCount: 0n,
      timelineCount: 0n,
      sourceCount: 0n,
      archiveLinks: [],
    },
  };
}

function archivedProfile(personId: string): PersonProfile {
  return {
    personId,
    name: "Archived Person",
    claimStatus: ClaimStatus.Unclaimed,
    livingStatus: LivingStatus.Deceased,
  };
}

function auditEntry(actionType: AuditActionType, summary: string): AuditEntry {
  return {
    id: 1n,
    actionType,
    summary,
    affectedPersonIds: ["julia"],
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: Principal.fromText(STEWARD_ACCOUNT),
  };
}

describe("Family Governance area: steward gating", () => {
  it("shows the governance entry point only to an authenticated steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();
    // The Family Steward nav button is the single steward entry point.
    const steward = await screen.findByRole("button", {
      name: "Family Steward",
    });
    expect(steward).toBeInTheDocument();
    // Family Governance is reached through the Family Steward hub, not a
    // top-level pill.
    expect(
      screen.queryByRole("button", { name: "Family Governance" }),
    ).not.toBeInTheDocument();
    await user.click(steward);
    expect(
      await screen.findByRole("button", { name: /Family Governance/ }),
    ).toBeInTheDocument();
  });

  it("hides the governance entry point from a normal member", async () => {
    setAuthenticated(true);
    setAdmin(false);
    renderApp();
    expect(
      screen.queryByRole("button", { name: "Family Governance" }),
    ).not.toBeInTheDocument();
  });

  it("hides the governance entry point from an unauthenticated caller", async () => {
    setAuthenticated(false);
    setAdmin(false);
    renderApp();
    expect(
      screen.queryByRole("button", { name: "Family Governance" }),
    ).not.toBeInTheDocument();
  });
});

describe("Family Governance area: six tabs", () => {
  it("renders all six governance tabs for a steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    for (const tab of [
      "Review Requests",
      "Steward Management",
      "Duplicate Profiles",
      "Relationship Management",
      "Archived Profiles",
      "Audit History",
    ]) {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    }
  });
});

describe("Steward Management tab", () => {
  it("promotes an eligible approved claimed member to steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setEligibleCandidates([
      stewardIdentity("julia", OTHER_ACCOUNT, "Julia Norwood", "Julia Norwood"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    // The eligible approved claimed member is offered in the promote select.
    const promoteSelect = screen.getByTestId(
      "governance.stewards.promote_select",
    );
    await user.selectOptions(promoteSelect, "julia");
    await user.click(screen.getByTestId("governance.stewards.promote_button"));

    // The promotion is recorded in the audit history.
    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.StewardPromoted,
      ),
    ).toBe(true);
  });

  it("disables removing the last remaining steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setStewards([stewardRecord(STEWARD_ACCOUNT)]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    const removeButton = screen.getByTestId(
      "governance.stewards.remove_button.1",
    );
    expect(removeButton).toBeDisabled();
    expect(removeButton).toHaveAttribute(
      "title",
      "The last steward cannot be removed",
    );
  });

  it("allows removing a steward when more than one remains", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setStewards([stewardRecord(STEWARD_ACCOUNT), stewardRecord(OTHER_ACCOUNT)]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    const removeButton = screen.getByTestId(
      "governance.stewards.remove_button.1",
    );
    expect(removeButton).not.toBeDisabled();
    await user.click(removeButton);

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.StewardRemoved,
      ),
    ).toBe(true);
  });

  it("shows the linked Person's preferred/display name on the steward card, not the raw account id", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setStewards([stewardRecord(OTHER_ACCOUNT)]);
    setStewardIdentities([
      stewardIdentity("julia", OTHER_ACCOUNT, "Waxx Minty", "Julia Norwood"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    // The steward card's primary name is the linked Person's preferred/display
    // name, never the raw account id.
    expect(screen.getByText("Waxx Minty")).toBeInTheDocument();
    expect(screen.queryByText(OTHER_ACCOUNT)).not.toBeInTheDocument();
  });

  it("shows the linked Person's preferred/display name in the successor list", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setSuccessors([
      {
        personId: "julia",
        priority: 1n,
        status: SuccessorStatus.Designated,
        assignedAt: 1_700_000_000_000_000_000n,
        assignedBy: Principal.fromText(STEWARD_ACCOUNT),
      },
    ]);
    setStewardIdentities([
      stewardIdentity("julia", OTHER_ACCOUNT, "Waxx Minty", "Julia Norwood"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    // The successor list renders the linked Person's preferred/display name.
    expect(screen.getByText("Waxx Minty")).toBeInTheDocument();
  });

  it("designates a successor who is not yet an active steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setEligibleCandidates([
      stewardIdentity("julia", OTHER_ACCOUNT, "Julia Norwood", "Julia Norwood"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    const successorSelect = screen.getByTestId(
      "governance.stewards.successor_select",
    );
    await user.selectOptions(successorSelect, "julia");
    await user.click(
      screen.getByTestId("governance.stewards.designate_button"),
    );

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.SuccessorDesignated,
      ),
    ).toBe(true);
  });

  it("activates a designated successor into the active steward role", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setSuccessors([
      {
        personId: "julia",
        priority: 1n,
        status: SuccessorStatus.Designated,
        assignedAt: 1_700_000_000_000_000_000n,
        assignedBy: Principal.fromText(STEWARD_ACCOUNT),
      },
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    const activateButton = screen.getByTestId(
      "governance.stewards.activate_button.1",
    );
    await user.click(activateButton);

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.SuccessorActivated,
      ),
    ).toBe(true);
  });

  it("shows a warning encouraging successor designation when only one steward remains", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setStewards([stewardRecord(STEWARD_ACCOUNT)]);
    setWarning(
      "Designate a successor so the family tree is never left without a steward.",
    );
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Steward Management" }),
    );

    expect(
      screen.getByTestId("governance.stewards.single_warning"),
    ).toBeInTheDocument();
    expect(screen.getByText("Only one steward remains")).toBeInTheDocument();
  });
});

describe("Duplicate Review tab", () => {
  it("lists two suspected records without creating a new Person record", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setDuplicatePairs([duplicatePair()]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Duplicate Profiles" }),
    );

    // Both candidate names are shown for comparison.
    expect(screen.getAllByText("Julia Norwood").length).toBeGreaterThanOrEqual(
      2,
    );
    // The comparison shows the differing facts (photos, timeline, sources).
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });

  it("dismisses a pair as not a duplicate", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setDuplicatePairs([duplicatePair()]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Duplicate Profiles" }),
    );

    await user.click(
      screen.getByTestId("governance.duplicates.not_duplicate_button.1"),
    );

    // The pair is dismissed and the empty state appears.
    expect(
      await screen.findByTestId("governance.duplicates.empty_state"),
    ).toBeInTheDocument();
  });

  it("merges two duplicates into one canonical record", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setDuplicatePairs([duplicatePair()]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Duplicate Profiles" }),
    );

    await user.click(
      screen.getByTestId("governance.duplicates.merge_button.1"),
    );

    // The merge is recorded in the audit history.
    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.DuplicateMerged,
      ),
    ).toBe(true);
  });
});

describe("Relationship Management tab", () => {
  it("adds a relationship between two people", async () => {
    setAuthenticated(true);
    setAdmin(true);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Relationship Management" }),
    );

    const addPersonSelect = screen.getByTestId(
      "governance.relationships.add_person_select",
    );
    await user.selectOptions(addPersonSelect, "isaiah");
    await user.click(screen.getByTestId("governance.relationships.add_button"));

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.RelationshipAdded,
      ),
    ).toBe(true);
  });

  it("removes a relationship", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setRelationships([
      {
        id: 1n,
        fromPersonId: "julia",
        toPersonId: "isaiah",
        relationshipType: RelationshipType.SpousePartner,
        status: RelationshipStatus.Confirmed,
      },
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Relationship Management" }),
    );

    await user.click(
      screen.getByTestId("governance.relationships.remove_button.1"),
    );

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.RelationshipRemoved,
      ),
    ).toBe(true);
  });

  it("corrects a relationship type", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setRelationships([
      {
        id: 1n,
        fromPersonId: "julia",
        toPersonId: "isaiah",
        relationshipType: RelationshipType.SpousePartner,
        status: RelationshipStatus.Confirmed,
      },
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(
      screen.getByRole("button", { name: "Relationship Management" }),
    );

    const typeSelect = screen.getByTestId(
      "governance.relationships.type_select.1",
    );
    await user.selectOptions(typeSelect, RelationshipType.Sibling);

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.RelationshipTypeCorrected,
      ),
    ).toBe(true);
  });
});

describe("Archived Profiles tab", () => {
  it("lists archived profiles and restores one", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setArchivedProfiles([archivedProfile("julia")]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(screen.getByRole("button", { name: "Archived Profiles" }));

    expect(screen.getByText("Archived Person")).toBeInTheDocument();
    await user.click(
      screen.getByTestId("governance.archived.restore_button.1"),
    );

    expect(
      getAuditEntries().some(
        (e) => e.actionType === AuditActionType.ProfileRestored,
      ),
    ).toBe(true);
  });

  it("requires confirmation before permanent deletion", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setArchivedProfiles([archivedProfile("julia")]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(screen.getByRole("button", { name: "Archived Profiles" }));

    // The permanent-delete confirmation is not shown until requested.
    expect(
      screen.queryByTestId("governance.archived.delete_confirm"),
    ).not.toBeInTheDocument();
  });
});

describe("Audit History tab", () => {
  it("lists governance audit entries for a steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setAuditEntries([
      auditEntry(AuditActionType.StewardPromoted, "Promoted julia"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openGovernance(user);

    await user.click(screen.getByRole("button", { name: "Audit History" }));

    expect(screen.getByText("Steward promoted")).toBeInTheDocument();
    expect(screen.getByText("Promoted julia")).toBeInTheDocument();
    expect(
      screen.getByText("Visible to Family Stewards only."),
    ).toBeInTheDocument();
  });
});
