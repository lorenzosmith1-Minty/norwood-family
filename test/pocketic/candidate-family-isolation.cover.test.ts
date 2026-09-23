import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B2 — family-scoped New Person Candidate endpoints
// (real-canister cover).
//
// The accepted behavior is that the canonical `*ForFamily` candidate endpoints
// enforce the family boundary: a candidate created in Family A is visible only
// under Family A and never under Family B; a `candidateId` alone never crosses
// the boundary; a Source in Family A cannot back a Candidate in Family B; a
// Steward of one family cannot review another family's candidate; approving a
// Family A candidate creates a profile in Family A only and leaves a
// same-personId profile in Family B unchanged; a same name/details in Family B
// does not block approval of a Family A candidate; the Review Queue Candidates
// count is family-correct; and the default Norwood legacy candidate workflow is
// unchanged.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Test-only families: `test-family-a` and `test-family-b`. There is no
// family-creation endpoint, and the family-scoped endpoints accept an arbitrary
// familyId, so a caller becomes an approved member of a family by creating a
// profile in it (`createMyselfForFamily` writes an APPROVED claim for the
// caller in that family). That is the only public path to non-default-family
// membership.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` writes
// `familyId = "norwood"`), so "Steward A can approve a Family A candidate"
// cannot be exercised through the public API. The direction the API supports is
// covered here: the Norwood Steward cannot review a Family A candidate, and a
// Family A member who is not a Steward cannot review a Family A candidate. The
// internal family-scoped predicate is covered by the sibling
// `family-scoped-authorization.behavior.test.ts`, which executes the real
// Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can perform this action";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control and claims the Norwood Steward role; CONTRIBUTOR
// is an approved Norwood member. MEMBER_A and MEMBER_B become approved members
// of the two test-only families.
const memberAIdentity = createIdentity("candidate-family-a-seed");
const memberBIdentity = createIdentity("candidate-family-b-seed");
// A separate identity for the shared-person approval test: `createMyselfForFamily`
// refuses a second profile for a caller that already owns one in the family, so
// MEMBER_A cannot create the shared person in Family A.
const sharedPersonIdentity = createIdentity("candidate-shared-person-seed");
// A separate identity for the Norwood half of the shared-person test:
// CONTRIBUTOR already owns the seeded "clayton" profile in Norwood.
const sharedPersonNorwoodIdentity = createIdentity(
  "candidate-shared-person-norwood-seed",
);

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and MEMBER_A / MEMBER_B approved in their respective test-only
 * families. Each test seeds its own canister so no test depends on the order
 * another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  // `createMyselfForFamily` creates a minimal profile owned by the caller and
  // writes an APPROVED claim for it in that family, which is what makes the
  // caller an approved member of the family.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

/**
 * Uploads a research source file into `familyId` as the currently-set caller
 * and returns the created Source id.
 */
async function uploadSourceInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
): Promise<bigint> {
  const result = await actor.createSourceWithUploadForFamily(
    familyId,
    title,
    { CensusCitation: null },
    `A research source in ${familyId}.`,
    "application/pdf",
    blob,
    ["census"],
    "",
    [],
    [],
    { FamilyOnly: null },
    { Standard: null },
    [],
    `${title.replace(/\s+/gu, "-").toLowerCase()}.pdf`,
  );
  if (!("ok" in result)) {
    throw new Error(
      `createSourceWithUploadForFamily failed: ${JSON.stringify(result)}`,
    );
  }
  return result.ok.source.id;
}

/**
 * Creates a New Person candidate in `familyId` as the currently-set caller,
 * backed by `sourceId`. Returns the created candidate id.
 */
async function createCandidateInto(
  actor: _SERVICE,
  familyId: string,
  name: string,
  details: string,
  sourceId: bigint,
): Promise<bigint> {
  const result = await actor.createNewPersonCandidateForFamily(
    familyId,
    name,
    details,
    sourceId,
  );
  if (!("ok" in result)) {
    throw new Error(
      `createNewPersonCandidateForFamily failed: ${JSON.stringify(result)}`,
    );
  }
  return result.ok.id;
}

// ---------------------------------------------------------------------------
// (1) Candidate read isolation: a Family A candidate is visible under Family A
//     and absent under Family B; a candidateId alone never crosses the boundary.
//
// Only Norwood has a Steward, so the Steward-gated family-scoped reads can only
// be executed by the Norwood Steward. The boundary is therefore driven in the
// direction the API supports: the Norwood Steward's Norwood read must never
// return a Family A candidate, and the Family A id must not resolve under
// Norwood.
// ---------------------------------------------------------------------------

it("does not show a Family A candidate in the Norwood candidate listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A census");
  const candidateId = await createCandidateInto(
    actor,
    FAMILY_A,
    "Family A Unknown",
    "A previously unrecorded Family A member.",
    sourceId,
  );

  // The Norwood Steward's family-scoped listing excludes the Family A candidate.
  actor.setIdentity(adminIdentity);
  const norwoodCandidates = await actor.listNewPersonCandidatesForFamily(NORWOOD);
  expect(norwoodCandidates.find((c) => c.id === candidateId)).toBeUndefined();
  expect(norwoodCandidates.every((c) => c.familyId === NORWOOD)).toBe(true);
});

it("does not resolve a Family A candidate id under Norwood", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Boundary source");
  const candidateId = await createCandidateInto(
    actor,
    FAMILY_A,
    "Boundary Candidate",
    "A boundary candidate.",
    sourceId,
  );

  // The Norwood Steward cannot resolve the Family A id under Norwood: the
  // record belongs to another family, so the lookup behaves like not-found.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.getNewPersonCandidateForFamily(NORWOOD, candidateId),
  ).resolves.toEqual([]);
});

it("denies a non-Steward member reading a family's candidate listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Member A source");
  await createCandidateInto(
    actor,
    FAMILY_A,
    "Member A Candidate",
    "A member candidate.",
    sourceId,
  );

  // Approved membership is not Steward authority: the candidate read is denied.
  await expect(
    actor.listNewPersonCandidatesForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (2) A Source in Family A cannot back a Candidate in Family B.
// ---------------------------------------------------------------------------

it("denies a Family A source backing a candidate in Family B", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A is an approved member of Family A only, so a create into Family B
  // is denied outright.
  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A source");
  const crossFamily = await actor.createNewPersonCandidateForFamily(
    FAMILY_B,
    "Cross-family candidate",
    "A candidate in the wrong family.",
    sourceId,
  );
  expect("err" in crossFamily).toBe(true);

  // MEMBER_B is an approved member of Family B, but the source belongs to
  // Family A, so the linked SourceRecord is not in the candidate's family.
  actor.setIdentity(memberBIdentity);
  const wrongSource = await actor.createNewPersonCandidateForFamily(
    FAMILY_B,
    "Family B candidate with a Family A source",
    "A candidate with a foreign source.",
    sourceId,
  );
  expect("err" in wrongSource).toBe(true);

  // Nothing was stored in Family B.
  actor.setIdentity(adminIdentity);
  const norwoodCandidates = await actor.listNewPersonCandidatesForFamily(NORWOOD);
  expect(norwoodCandidates).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) Candidate review isolation: the Norwood Steward cannot review a Family A
//     candidate, and a non-Steward Family A member cannot either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward approving or rejecting a Family A candidate", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A pending source");
  const candidateId = await createCandidateInto(
    actor,
    FAMILY_A,
    "Family A Pending",
    "A pending Family A candidate.",
    sourceId,
  );

  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveNewPersonCandidateForFamily(FAMILY_A, candidateId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectNewPersonCandidateForFamily(FAMILY_A, candidateId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.needsResearchNewPersonCandidateForFamily(FAMILY_A, candidateId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward reviewing a Family A candidate", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Member review attempt");
  const candidateId = await createCandidateInto(
    actor,
    FAMILY_A,
    "Member Review Candidate",
    "A member review candidate.",
    sourceId,
  );

  await expect(
    actor.approveNewPersonCandidateForFamily(FAMILY_A, candidateId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectNewPersonCandidateForFamily(FAMILY_A, candidateId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (4) Approval creates a profile in the candidate's own family only. The same
//     personId profile in another family is unchanged, and a same name/details
//     in another family does not block approval.
//
// The public API cannot approve a non-default-family candidate (no Steward of A
// exists), so the boundary is driven in the direction the API supports: a
// Norwood candidate approved by the Norwood Steward creates the Norwood profile
// and leaves a same-personId profile in Family A unchanged.
// ---------------------------------------------------------------------------

it("approving a Norwood candidate creates only the Norwood profile, leaving the same personId in Family A unchanged", async () => {
  const { actor } = await setupFamilies();

  // The same personId exists in both families: the personId is derived from the
  // name, so the same name yields the same id in each family.
  actor.setIdentity(sharedPersonIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Shared Candidate");
  expect("ok" in createdA).toBe(true);
  const personIdA = (createdA as { ok: { personId: string } }).ok.personId;

  actor.setIdentity(sharedPersonNorwoodIdentity);
  await actor._initialize_access_control();
  const createdNorwood = await actor.createMyself("Shared Candidate");
  expect("ok" in createdNorwood).toBe(true);
  const personIdNorwood = (createdNorwood as { ok: { personId: string } }).ok
    .personId;
  expect(personIdNorwood).toBe(personIdA);

  // A Norwood source and a Norwood candidate whose name derives the shared
  // personId. The same name/details already exists in Family A, which must NOT
  // block the Norwood approval (duplicate detection is family-scoped).
  actor.setIdentity(contributorIdentity);
  const sourceId = await uploadSourceInto(actor, NORWOOD, "Norwood source");
  const candidateId = await createCandidateInto(
    actor,
    NORWOOD,
    "Shared Candidate",
    "A previously unrecorded family member.",
    sourceId,
  );

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveNewPersonCandidateForFamily(
    NORWOOD,
    candidateId,
  );
  expect(approved).toEqual([
    expect.objectContaining({ id: candidateId, status: { Approved: null } }),
  ]);

  // The Norwood profile exists. It is the pre-existing profile the shared-person
  // identity created via `createMyself` (claimed), not a second profile: the
  // approval reused the same personId rather than creating a duplicate.
  const norwoodProfile = await actor.getPersonProfileForFamily(
    NORWOOD,
    personIdNorwood,
  );
  expect(norwoodProfile).toHaveLength(1);
  expect(norwoodProfile[0]).toMatchObject({
    personId: personIdNorwood,
    familyId: NORWOOD,
  });

  // The same personId profile in Family A is unchanged: it is still the
  // claimed profile the shared-person identity created, not a second unclaimed
  // profile from the Norwood approval.
  const familyAProfile = await actor.getPersonProfileForFamily(
    FAMILY_A,
    personIdA,
  );
  expect(familyAProfile).toHaveLength(1);
  expect(familyAProfile[0].familyId).toBe(FAMILY_A);
  expect(familyAProfile[0].claimStatus).toEqual({ Claimed: null });
});

// ---------------------------------------------------------------------------
// (5) Review Queue Candidates count is family-correct: a Family A candidate
//     must not inflate the Norwood queue's candidate count.
// ---------------------------------------------------------------------------

it("scopes the Review Queue candidate count to the requested family", async () => {
  const { actor } = await setupFamilies();

  // One Norwood candidate and one Family A candidate.
  actor.setIdentity(contributorIdentity);
  const norwoodSource = await uploadSourceInto(actor, NORWOOD, "Norwood queued source");
  await createCandidateInto(
    actor,
    NORWOOD,
    "Norwood Queued Candidate",
    "A queued Norwood candidate.",
    norwoodSource,
  );

  actor.setIdentity(memberAIdentity);
  const familyASource = await uploadSourceInto(actor, FAMILY_A, "Family A queued source");
  await createCandidateInto(
    actor,
    FAMILY_A,
    "Family A Queued Candidate",
    "A queued Family A candidate.",
    familyASource,
  );

  // The Norwood queue counts only the Norwood candidate.
  actor.setIdentity(adminIdentity);
  const norwoodQueue = await actor.getReviewQueueForFamily(NORWOOD);
  const norwoodCandidateItems = norwoodQueue.items.filter(
    (i) => i.kind.NewPersonCandidate !== undefined,
  );
  expect(norwoodCandidateItems).toHaveLength(1);
  expect(norwoodCandidateItems[0].title).toBe("Norwood Queued Candidate");

  // The legacy queue agrees with the Norwood family-scoped queue.
  const legacyQueue = await actor.getReviewQueue();
  expect(legacyQueue.pending).toBe(norwoodQueue.pending);
});

// ---------------------------------------------------------------------------
// (6) Default Norwood compatibility: the legacy candidate workflow (create,
//     list, get, approve, reject) behaves unchanged.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood candidate workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // Legacy createSource + createNewPersonCandidate write Norwood records.
  actor.setIdentity(contributorIdentity);
  const createdSource = await actor.createSource(
    "Legacy Norwood source",
    { CensusCitation: null },
    "A legacy source.",
    [],
  );
  expect("ok" in createdSource).toBe(true);
  const sourceId = (createdSource as { ok: { id: bigint } }).ok.id;

  const createdCandidate = await actor.createNewPersonCandidate(
    "Legacy Norwood Candidate",
    "A legacy candidate.",
    sourceId,
  );
  expect("ok" in createdCandidate).toBe(true);
  const candidate = (
    createdCandidate as { ok: { id: bigint; familyId: string } }
  ).ok;
  expect(candidate.familyId).toBe(NORWOOD);

  // Legacy listNewPersonCandidates resolves it.
  actor.setIdentity(adminIdentity);
  const listed = await actor.listNewPersonCandidates();
  expect(listed.find((c) => c.id === candidate.id)).toBeDefined();

  // Legacy approveNewPersonCandidate resolves it and creates the Norwood
  // profile.
  const approved = await actor.approveNewPersonCandidate(candidate.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: candidate.id, status: { Approved: null } }),
  ]);
  const profile = await actor.getPersonProfile("legacynorwoodcandidate");
  expect(profile).toHaveLength(1);
  expect(profile[0]).toMatchObject({
    personId: "legacynorwoodcandidate",
    familyId: NORWOOD,
  });

  // A second legacy candidate rejects through the legacy endpoint.
  actor.setIdentity(contributorIdentity);
  const createdCandidate2 = await actor.createNewPersonCandidate(
    "Legacy Norwood Candidate 2",
    "A second legacy candidate.",
    sourceId,
  );
  const candidate2 = (createdCandidate2 as { ok: { id: bigint } }).ok;
  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectNewPersonCandidate(candidate2.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: candidate2.id, status: { Rejected: null } }),
  ]);
});
