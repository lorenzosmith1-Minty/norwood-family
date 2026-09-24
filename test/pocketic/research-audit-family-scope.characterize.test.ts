import { PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  CONTRIBUTOR,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Characterization for the Research audit log, ahead of the family-scoping
// change.
//
// The accepted change intentionally alters three things, and this file
// deliberately does NOT freeze any of them:
//
//   * `ResearchAuditEntry` gains a `familyId` field;
//   * the canonical audit read becomes family-scoped
//     (`getResearchAuditLogForFamily`), with the legacy `getResearchAuditLog`
//     kept as a thin temporary DEFAULT_FAMILY_ID wrapper;
//   * the frontend Audit/History hook forks on the active family.
//
// What this file protects is the adjacent behavior that must survive that
// change:
//
//   1. The legacy `getResearchAuditLog` still returns the audit entries written
//      by the existing default-family review actions — i.e. existing Norwood
//      audit history remains readable after the migration.
//   2. Each review action (SourceCreated, FindingSubmitted, FindingApproved,
//      FindingNeedsResearch, NewPersonCandidateSubmitted/Approved/Rejected,
//      RelationshipProposalSubmitted, ConflictResolved) writes exactly one
//      audit entry through the single canonical creation helper, carrying the
//      action, summary, actor, and a unique monotonic id.
//   3. The audit log is append-only: ids are unique and strictly increasing.
//   4. `getResearchAuditLog` remains Steward-gated (non-steward and anonymous
//      callers are rejected).
//
// The canister is seeded per test: ADMIN is the first caller to
// _initialize_access_control and claims the Steward role; CONTRIBUTOR is an
// approved family member via an approved claim.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

/** A fresh canister with the Norwood Steward and an approved contributor. */
async function setup(): Promise<_SERVICE> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  await registerApprovedContributor(actor);
  return actor;
}

/** Creates a pending source as CONTRIBUTOR and returns its id. */
async function createSource(actor: _SERVICE, title: string): Promise<bigint> {
  actor.setIdentity(contributorIdentity);
  const created = await actor.createSource(
    title,
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  if (!("ok" in created)) {
    throw new Error(`createSource failed: ${JSON.stringify(created)}`);
  }
  return created.ok.id;
}

/** Creates a pending finding linked to `sourceId` as CONTRIBUTOR. */
async function createFinding(
  actor: _SERVICE,
  title: string,
  sourceId: bigint,
): Promise<bigint> {
  actor.setIdentity(contributorIdentity);
  const created = await actor.createFinding(
    title,
    { Documented: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "birthDate",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId,
    ["julia"],
    [],
  );
  if (!("ok" in created)) {
    throw new Error(`createFinding failed: ${JSON.stringify(created)}`);
  }
  return created.ok.id;
}

// ---------------------------------------------------------------------------
// 1. Existing default-family audit history remains readable through the legacy
//    read, and each review action appends exactly one entry.
// ---------------------------------------------------------------------------

it("keeps the default-family audit history readable through the legacy read", async () => {
  const actor = await setup();

  // A contributor creates a source and a finding; a steward approves the
  // finding. Each action appends one audit entry.
  const sourceId = await createSource(actor, "1900 census, Norwood household");
  const findingId = await createFinding(actor, "Birth date of Julia Norwood", sourceId);

  actor.setIdentity(adminIdentity);
  await actor.approveFinding(findingId);

  // The legacy read returns the full default-family audit history.
  const audit = await actor.getResearchAuditLog();
  const actions = audit.map((e) => e.action);
  expect(actions).toContain("SourceCreated");
  expect(actions).toContain("FindingSubmitted");
  expect(actions).toContain("FindingApproved");

  // Each entry carries its action, summary, actor, and timestamp.
  const sourceEntry = audit.find((e) => e.action === "SourceCreated");
  expect(sourceEntry).toMatchObject({
    action: "SourceCreated",
    actorId: CONTRIBUTOR,
    summary: "Source '1900 census, Norwood household' created",
  });
  expect(sourceEntry?.sourceId).toEqual([sourceId]);
  expect(typeof sourceEntry?.timestamp).toBe("bigint");

  const approvedEntry = audit.find((e) => e.action === "FindingApproved");
  expect(approvedEntry).toMatchObject({
    action: "FindingApproved",
    actorId: adminIdentity.getPrincipal(),
    summary: "Finding 'Birth date of Julia Norwood' approved and routed to Profile",
  });
  expect(approvedEntry?.findingId).toEqual([findingId]);
});

it("appends exactly one audit entry per review action", async () => {
  const actor = await setup();

  const sourceId = await createSource(actor, "One entry per action");
  const findingId = await createFinding(actor, "One entry finding", sourceId);

  actor.setIdentity(adminIdentity);
  await actor.needsResearchFinding(findingId);

  const audit = await actor.getResearchAuditLog();
  const countOf = (action: string) => audit.filter((e) => e.action === action).length;

  // Exactly one entry for each action taken, and no duplicates.
  expect(countOf("SourceCreated")).toBe(1);
  expect(countOf("FindingSubmitted")).toBe(1);
  expect(countOf("FindingNeedsResearch")).toBe(1);
  expect(audit).toHaveLength(3);
});

// ---------------------------------------------------------------------------
// 2. The audit log is append-only: ids are unique and strictly increasing.
// ---------------------------------------------------------------------------

it("assigns unique, strictly increasing audit ids across actions", async () => {
  const actor = await setup();

  const sourceId = await createSource(actor, "Monotonic ids");
  const findingId = await createFinding(actor, "Monotonic finding", sourceId);

  actor.setIdentity(adminIdentity);
  await actor.rejectFinding(findingId);

  const audit = await actor.getResearchAuditLog();
  const ids = audit.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (let i = 1; i < ids.length; i += 1) {
    expect(ids[i] > ids[i - 1]).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// 3. The legacy audit read remains Steward-gated.
// ---------------------------------------------------------------------------

it("keeps getResearchAuditLog gated to Family Stewards", async () => {
  const setupResult = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setupResult.actor;
  await registerApprovedContributor(actor);

  // A signed-in non-steward cannot read the audit log.
  actor.setIdentity(contributorIdentity);
  await expect(actor.getResearchAuditLog()).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, setupResult.canisterId);
  await expect(anonymousActor.getResearchAuditLog()).rejects.toThrow();

  // The steward can.
  actor.setIdentity(adminIdentity);
  await expect(actor.getResearchAuditLog()).resolves.toBeInstanceOf(Array);
});

// ---------------------------------------------------------------------------
// 4. The candidate and relationship-proposal review actions also append their
//    audit entries to the same default-family log.
// ---------------------------------------------------------------------------

it("records candidate and relationship-proposal actions in the same audit log", async () => {
  const actor = await setup();

  const sourceId = await createSource(actor, "Candidate and proposal source");

  actor.setIdentity(contributorIdentity);
  const candidateCreated = await actor.createNewPersonCandidate(
    "Unknown Norwood",
    "A previously unrecorded family member.",
    sourceId,
  );
  if (!("ok" in candidateCreated)) {
    throw new Error(`createNewPersonCandidate failed: ${JSON.stringify(candidateCreated)}`);
  }
  const candidateId = candidateCreated.ok.id;

  const proposalCreated = await actor.createRelationshipProposal(
    "julia",
    "Sibling",
    "lorenzoSmithJr",
    sourceId,
  );
  if (!("ok" in proposalCreated)) {
    throw new Error(`createRelationshipProposal failed: ${JSON.stringify(proposalCreated)}`);
  }

  actor.setIdentity(adminIdentity);
  await actor.approveNewPersonCandidate(candidateId);

  const audit = await actor.getResearchAuditLog();
  const actions = audit.map((e) => e.action);
  expect(actions).toContain("NewPersonCandidateSubmitted");
  expect(actions).toContain("NewPersonCandidateApproved");
  expect(actions).toContain("RelationshipProposalSubmitted");

  // The candidate approval summary names the created canonical Person.
  const approved = audit.find((e) => e.action === "NewPersonCandidateApproved");
  expect(approved?.summary).toBe(
    "New Person Candidate 'Unknown Norwood' approved and created as a canonical Person",
  );
});
