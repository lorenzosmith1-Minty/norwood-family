import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  ADMIN,
  BACKEND_WASM,
  CONTRIBUTOR,
  adminIdentity,
  contributorIdentity,
  createAndEditProfile,
  createSharedCanister,
  registerApprovedContributor,
  routeConflictingFindingToReview,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Steward audit history, Needs Research actionability, and duplicate-candidate
// detection.
//
// These tests were split out of backend.test.ts. That file installed ~26
// canisters into a single PocketIC instance, which exhausted the shared
// sidecar's pid ceiling partway through and cascaded into `fetch failed` /
// `Test timed out` failures for every test after the ceiling was hit. Each test
// file gets its own instance and tears it down in `afterAll`, so splitting the
// suite releases the canisters and threads of one file before the next starts.
//
// The assertions are unchanged from the original file; only the canister
// lifecycle and the shared helpers' location changed.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// ---------------------------------------------------------------------------
// Merged Family Steward Audit History (cover for the audit-and-workload change).
// getStewardAuditHistory merges the governance audit log with the research
// audit log's ConflictResolved actions into one chronological list, newest
// first, without duplicating records. Each conflict-resolution entry is
// enriched from the linked ConflictReviewItem: person, field, existing value,
// proposed value, resolution, steward notes, and provenance/source refs. It is
// Family-Steward-gated.
// ---------------------------------------------------------------------------

it("merges governance and conflict-resolution entries into getStewardAuditHistory without duplicates", async () => {
  const auditSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const auditActor = auditSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(auditActor);

  // Create a governance audit entry: a profile claim approved by the steward
  // records a #ClaimApproved governance AuditEntry.
  auditActor.setIdentity(contributorIdentity);
  const requested = (await auditActor.requestProfileClaim("lorenzoSmithJr")) as {
    ok: { id: bigint };
  };
  auditActor.setIdentity(adminIdentity);
  await auditActor.approveProfileClaim(requested.ok.id);

  // Create a conflict-resolution research audit entry: route a #Conflicting
  // finding to Conflict Review and resolve it with Keep Existing.
  const { conflictId } = await routeConflictingFindingToReview(auditActor);
  auditActor.setIdentity(adminIdentity);
  await auditActor.resolveConflict(
    conflictId,
    { KeepExisting: null },
    "Canonical record is authoritative",
  );

  // The merged view contains BOTH the governance entry and the conflict
  // resolution entry, each exactly once (no duplication).
  const merged = await auditActor.getStewardAuditHistory();
  const governanceEntries = merged.filter((e) => "Governance" in e.kind);
  const conflictEntries = merged.filter((e) => "ConflictResolution" in e.kind);
  expect(governanceEntries.length).toBeGreaterThanOrEqual(1);
  expect(conflictEntries).toHaveLength(1);

  // The governance entry maps to a #Governance StewardAuditEntry with its
  // action type and summary.
  const claimApproved = governanceEntries.find(
    (e) => e.actionType === "ClaimApproved",
  );
  expect(claimApproved).toBeDefined();
  expect(claimApproved!.summary).toContain("lorenzoSmithJr");

  // The conflict-resolution entry is enriched from the linked ConflictReviewItem:
  // person, field, existing/proposed values, resolution, steward notes, and
  // provenance/source refs.
  const conflictEntry = conflictEntries[0];
  expect(conflictEntry).toMatchObject({
    actionType: "ConflictResolved",
    resolution: ["KeepExisting"],
    personId: ["lorenzoSmithJr"],
    // `field` is an optional string in the StewardAuditEntry contract.
    field: ["preferredName"],
    existingValue: ["Waxx Minty"],
    proposedValue: ["Lorenzo Smith Jr."],
    stewardNotes: ["Canonical record is authoritative"],
    proposedSourceId: [expect.any(BigInt)],
  });
  expect(conflictEntry.actorAccountId).toEqual(ADMIN);
  expect(conflictEntry.timestamp).toEqual(expect.any(BigInt));

  // The merged list is sorted newest first by timestamp.
  const timestamps = merged.map((e) => e.timestamp);
  const sorted = [...timestamps].sort((a, b) => Number(b - a));
  expect(timestamps).toEqual(sorted);
});

it("gates getStewardAuditHistory to Family Stewards", async () => {
  const auditSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const auditActor = auditSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(auditActor);

  // A signed-in non-steward cannot read the merged audit history.
  auditActor.setIdentity(contributorIdentity);
  await expect(auditActor.getStewardAuditHistory()).rejects.toThrow();

  // An anonymous caller is also rejected.
  const anonymousActor = pic!.createActor<_SERVICE>(idlFactory, auditSetup.canisterId);
  await expect(anonymousActor.getStewardAuditHistory()).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// Needs Research actionability (cover for the review-queue change). A finding
// marked Needs Research remains actionable in the review queue — it carries
// [#Approve, #Reject] actions so it can be resolved or rejected and never
// becomes stranded.
// ---------------------------------------------------------------------------

it("keeps a Needs Research finding actionable with Approve and Reject actions in the queue", async () => {
  const researchSetup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const researchActor = researchSetup.actor;

  // ADMIN becomes the Family Steward; CONTRIBUTOR registers as an approved
  // family member so they may create research sources and findings.
  await registerApprovedContributor(researchActor);

  // A contributor creates a source and a pending finding linked to it.
  researchActor.setIdentity(contributorIdentity);
  const sourceCreated = await researchActor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await researchActor.createFinding(
    "Birth date of Julia Norwood",
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
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;

  // The steward marks the finding as Needs Research.
  researchActor.setIdentity(adminIdentity);
  await researchActor.needsResearchFinding(findingId);

  // The queue item for the Needs Research finding stays visible and carries
  // [#Approve, #Reject] actions, and the queue's needs-research tally counts it.
  //
  // NOTE: the backend advertises these actions but `approveFinding` /
  // `rejectFinding` both guard on `status == #Pending`, so neither action
  // actually resolves a `#NeedsResearch` finding (both return null). That
  // contradiction between the queue's advertised actions and the endpoints'
  // behavior is a pre-existing backend defect, reported separately; this test
  // covers only the queue-side contract that is implemented.
  const queue = await researchActor.getReviewQueue();
  const findingItem = queue.items.find((i) => i.kind.Finding !== undefined);
  expect(findingItem).toMatchObject({
    id: findingId,
    status: { NeedsResearch: null },
  });
  expect(findingItem!.actions).toEqual([{ Approve: null }, { Reject: null }]);
  expect(queue.needsResearch).toBe(1n);
});

// ---------------------------------------------------------------------------
// Duplicate candidate generation (cover for the duplicate-candidate change).
// listDuplicateCandidates flags a pair only when the two profiles share
// meaningful name similarity AND have at least one corroborating signal beyond
// name. Shared emptiness (both fields blank) never counts as evidence, and
// sparse profiles (few populated fields) require stronger confidence (two
// signals) to be flagged, not weaker. These run against a shared canister so
// the created profiles never leak into the other canisters.
// ---------------------------------------------------------------------------

const dupAIdentity = createIdentity("dup-a-seed");
const dupBIdentity = createIdentity("dup-b-seed");
const dupCIdentity = createIdentity("dup-c-seed");
const dupDIdentity = createIdentity("dup-d-seed");
// The sparse-pair test needs its own identities: `createMyself` is not
// idempotent (each call creates a new minimal profile), so reusing dupA/dupB
// here would add extra profiles for the same callers and change what
// listDuplicateCandidates observes.
const dupEIdentity = createIdentity("dup-e-seed");
const dupFIdentity = createIdentity("dup-f-seed");

// A lazily-created canister shared by the three duplicate-candidate tests. Each
// test creates its own profiles and asserts on a specific name pair (or the
// absence of one), so they are mutually compatible; sharing removes two canister
// installs from a file whose install count is what exhausts the shared sidecar.
const sharedDupActor = createSharedCanister(() => pic);

it("flags a pair with meaningful name similarity and a corroborating signal as a duplicate candidate", async () => {
  const dupActor = await sharedDupActor();

  // ADMIN becomes the Family Steward (listDuplicateCandidates is steward-gated).
  dupActor.setIdentity(adminIdentity);
  await dupActor._initialize_access_control();

  // Two non-sparse profiles sharing the name tokens 'julia'/'norwood' and the
  // same currentLocation 'Mississippi' (a corroborating signal beyond name).
  await createAndEditProfile(dupActor, dupAIdentity, "Julia Norwood", {
    firstName: "Julia",
    lastName: "Norwood",
    currentLocation: "Mississippi",
    occupation: "Teacher",
  });
  await createAndEditProfile(dupActor, dupBIdentity, "Julia Norwood-Smith", {
    firstName: "Julia",
    lastName: "Norwood-Smith",
    currentLocation: "Mississippi",
    occupation: "Nurse",
  });

  // The pair is flagged: meaningful name similarity + one corroborating signal.
  dupActor.setIdentity(adminIdentity);
  const candidates = await dupActor.listDuplicateCandidates();
  expect(candidates.length).toBeGreaterThanOrEqual(1);
  const pair = candidates.find(
    (p) =>
      (p.candidateA.name === "Julia Norwood" &&
        p.candidateB.name === "Julia Norwood-Smith") ||
      (p.candidateA.name === "Julia Norwood-Smith" &&
        p.candidateB.name === "Julia Norwood"),
  );
  expect(pair).toBeDefined();
});

it("does not flag a pair sharing only emptiness (no name similarity, no corroborating signal)", async () => {
  const dupActor = await sharedDupActor();

  dupActor.setIdentity(adminIdentity);
  await dupActor._initialize_access_control();

  // Two profiles with identical names but NO populated fields: no corroborating
  // signal beyond name, so shared emptiness is never used as duplicate evidence.
  await createAndEditProfile(dupActor, dupCIdentity, "John Doe", {});
  await createAndEditProfile(dupActor, dupDIdentity, "John Doe", {});

  dupActor.setIdentity(adminIdentity);
  const candidates = await dupActor.listDuplicateCandidates();
  // No pair involving the two 'John Doe' profiles is flagged.
  const johnPair = candidates.filter(
    (p) =>
      p.candidateA.name === "John Doe" && p.candidateB.name === "John Doe",
  );
  expect(johnPair).toHaveLength(0);
});

it("does not flag a sparse pair with only one corroborating signal (requires stronger confidence)", async () => {
  const dupActor = await sharedDupActor();

  dupActor.setIdentity(adminIdentity);
  await dupActor._initialize_access_control();

  // Two sparse profiles (only currentLocation populated -> 1 field each) sharing
  // the name token 'jane' and one corroborating signal (same location). Sparse
  // profiles require TWO signals, so this pair is NOT flagged. Distinct
  // identities from the other duplicate tests, because createMyself is not
  // idempotent and a reused caller would add extra profiles.
  await createAndEditProfile(dupActor, dupEIdentity, "Jane Smith", {
    currentLocation: "Chicago",
  });
  await createAndEditProfile(dupActor, dupFIdentity, "Jane Smith-Jones", {
    currentLocation: "Chicago",
  });

  dupActor.setIdentity(adminIdentity);
  const candidates = await dupActor.listDuplicateCandidates();
  const janePair = candidates.filter(
    (p) =>
      (p.candidateA.name === "Jane Smith" &&
        p.candidateB.name === "Jane Smith-Jones") ||
      (p.candidateA.name === "Jane Smith-Jones" &&
        p.candidateB.name === "Jane Smith"),
  );
  expect(janePair).toHaveLength(0);
});
