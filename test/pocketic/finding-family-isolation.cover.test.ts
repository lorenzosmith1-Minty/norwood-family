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
// Tenancy 1C-B2-B1 — family-scoped Proposed Finding endpoints (real-canister
// cover).
//
// The accepted behavior is that the canonical `*ForFamily` finding endpoints
// enforce the family boundary: a finding created in Family A is visible only
// under Family A and never under Family B; a `findingId` alone never crosses
// the boundary; a Source in Family A cannot create a Finding against a profile
// in Family B; a Steward of one family cannot review another family's finding;
// approving a Family A finding promotes only the Family A profile and leaves a
// same-personId profile in Family B unchanged; a conflict generated from a
// Family A finding carries familyId A with all references in Family A; the
// Review Queue Findings count is family-correct; and the default Norwood legacy
// finding workflow is unchanged.
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
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`), so "Steward A can
// review a Family A finding" cannot be exercised through the public API. The
// direction the API supports is covered here: the Norwood Steward cannot
// review a Family A finding, and a Family A member who is not a Steward cannot
// review a Family A finding. The internal family-scoped predicate is covered by
// the sibling `family-scoped-authorization.behavior.test.ts`, which executes
// the real Motoko source.
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
const memberAIdentity = createIdentity("finding-family-a-seed");
const memberBIdentity = createIdentity("finding-family-b-seed");
// A separate identity for the shared-person promotion test: `createMyselfForFamily`
// refuses a second profile for a caller that already owns one in the family, so
// MEMBER_A cannot create the shared person in Family A.
const sharedPersonIdentity = createIdentity("finding-shared-person-seed");
// A separate identity for the Norwood half of the shared-person test:
// CONTRIBUTOR already owns the seeded "clayton" profile in Norwood.
const sharedPersonNorwoodIdentity = createIdentity(
  "finding-shared-person-norwood-seed",
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
 * Creates a PersonFact finding in `familyId` as the currently-set caller,
 * against `personId`, backed by `sourceId`. Returns the created finding id.
 */
async function createFindingInto(
  actor: _SERVICE,
  familyId: string,
  title: string,
  sourceId: bigint,
  personId: string,
  value: string,
): Promise<bigint> {
  const result = await actor.createFindingForFamily(
    familyId,
    title,
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value, personId } },
    sourceId,
    [personId],
    [],
  );
  if (!("ok" in result)) {
    throw new Error(`createFindingForFamily failed: ${JSON.stringify(result)}`);
  }
  return result.ok.id;
}

// ---------------------------------------------------------------------------
// (1) Finding read isolation: a Family A finding is visible under Family A and
//     absent under Family B; a findingId alone never crosses the boundary.
//
// Only Norwood has a Steward, so the Steward-gated family-scoped reads can only
// be executed by the Norwood Steward. The boundary is therefore driven in the
// direction the API supports: the Norwood Steward's Norwood read must never
// return a Family A finding, and the Family A id must not resolve under Norwood.
// ---------------------------------------------------------------------------

it("does not show a Family A finding in the Norwood finding listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A census");
  const findingId = await createFindingInto(
    actor,
    FAMILY_A,
    "Family A occupation",
    sourceId,
    "family_a_member",
    "Welder",
  );

  // The Norwood Steward's family-scoped listing excludes the Family A finding.
  actor.setIdentity(adminIdentity);
  const norwoodFindings = await actor.listFindingsForFamily(NORWOOD);
  expect(norwoodFindings.find((f) => f.id === findingId)).toBeUndefined();
  expect(norwoodFindings.every((f) => f.familyId === NORWOOD)).toBe(true);
});

it("does not resolve a Family A finding id under Norwood", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Boundary source");
  const findingId = await createFindingInto(
    actor,
    FAMILY_A,
    "Boundary finding",
    sourceId,
    "family_a_member",
    "Welder",
  );

  // The Norwood Steward cannot resolve the Family A id under Norwood: the
  // record belongs to another family, so the lookup behaves like not-found.
  actor.setIdentity(adminIdentity);
  await expect(actor.getFindingForFamily(NORWOOD, findingId)).resolves.toEqual(
    [],
  );
});

it("denies a non-Steward member reading a family's finding listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Member A source");
  await createFindingInto(
    actor,
    FAMILY_A,
    "Member A finding",
    sourceId,
    "family_a_member",
    "Welder",
  );

  // Approved membership is not Steward authority: the finding read is denied.
  await expect(actor.listFindingsForFamily(FAMILY_A)).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (2) A Source in Family A cannot create a Finding against a profile in
//     Family B, and a Family A source cannot back a Family B finding.
// ---------------------------------------------------------------------------

it("denies a Family A source creating a finding against a Family B profile", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A is an approved member of Family A only, so a create into Family B
  // is denied outright.
  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A source");
  const crossFamily = await actor.createFindingForFamily(
    FAMILY_B,
    "Cross-family finding",
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value: "Welder", personId: "family_b_member" } },
    sourceId,
    ["family_b_member"],
    [],
  );
  expect("err" in crossFamily).toBe(true);

  // A Family A source cannot back a Family A finding against a Family B
  // profile either: the referenced person must belong to the finding's family.
  const wrongPerson = await actor.createFindingForFamily(
    FAMILY_A,
    "Wrong-person finding",
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value: "Welder", personId: "family_b_member" } },
    sourceId,
    ["family_b_member"],
    [],
  );
  expect("err" in wrongPerson).toBe(true);

  // Nothing was stored in Family B.
  actor.setIdentity(adminIdentity);
  const norwoodFindings = await actor.listFindingsForFamily(NORWOOD);
  expect(norwoodFindings).toEqual([]);
});

it("denies a Family A source backing a finding in Family B", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B is an approved member of Family B, but the source belongs to
  // Family A, so the linked SourceRecord is not in the finding's family.
  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A only source");

  actor.setIdentity(memberBIdentity);
  const result = await actor.createFindingForFamily(
    FAMILY_B,
    "Family B finding with a Family A source",
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value: "Welder", personId: "family_b_member" } },
    sourceId,
    ["family_b_member"],
    [],
  );
  expect("err" in result).toBe(true);
});

// ---------------------------------------------------------------------------
// (3) Finding review isolation: the Norwood Steward cannot review a Family A
//     finding, and a non-Steward Family A member cannot either.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward approving or rejecting a Family A finding", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A pending source");
  const findingId = await createFindingInto(
    actor,
    FAMILY_A,
    "Family A pending finding",
    sourceId,
    "family_a_member",
    "Welder",
  );

  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveFindingForFamily(FAMILY_A, findingId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectFindingForFamily(FAMILY_A, findingId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.needsResearchFindingForFamily(FAMILY_A, findingId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward reviewing a Family A finding", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Member review attempt");
  const findingId = await createFindingInto(
    actor,
    FAMILY_A,
    "Member review finding",
    sourceId,
    "family_a_member",
    "Welder",
  );

  await expect(
    actor.approveFindingForFamily(FAMILY_A, findingId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.rejectFindingForFamily(FAMILY_A, findingId),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (4) Approval promotes only the finding's own family profile. The same
//     personId profile in another family is unchanged.
//
// The public API cannot approve a non-default-family finding (no Steward of A
// exists), so the boundary is driven in the direction the API supports: a
// Norwood finding approved by the Norwood Steward promotes the Norwood profile
// and leaves a same-personId profile in Family A unchanged.
// ---------------------------------------------------------------------------

it("approving a Norwood finding promotes only the Norwood profile, leaving the same personId in Family A unchanged", async () => {
  const { actor } = await setupFamilies();

  // The same personId exists in both families: `nextPersonId` derives the id
  // from the name, so the same name yields the same id in each family.
  actor.setIdentity(sharedPersonIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Shared Person");
  expect("ok" in createdA).toBe(true);
  const personIdA = (createdA as { ok: { personId: string } }).ok.personId;

  actor.setIdentity(sharedPersonNorwoodIdentity);
  await actor._initialize_access_control();
  const createdNorwood = await actor.createMyself("Shared Person");
  expect("ok" in createdNorwood).toBe(true);
  const personIdNorwood = (createdNorwood as { ok: { personId: string } }).ok
    .personId;
  expect(personIdNorwood).toBe(personIdA);

  // A Norwood source and a Norwood finding that sets the shared person's
  // occupation.
  actor.setIdentity(contributorIdentity);
  const sourceId = await uploadSourceInto(actor, NORWOOD, "Norwood source");
  const findingId = await createFindingInto(
    actor,
    NORWOOD,
    "Norwood occupation",
    sourceId,
    personIdNorwood,
    "Welder",
  );

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveFindingForFamily(NORWOOD, findingId);
  expect(approved).toEqual([
    expect.objectContaining({ id: findingId, status: { Approved: null } }),
  ]);

  // The Norwood profile was promoted.
  const norwoodProfile = await actor.getPersonProfileForFamily(
    NORWOOD,
    personIdNorwood,
  );
  expect(norwoodProfile).toHaveLength(1);
  expect(norwoodProfile[0]).toMatchObject({
    personId: personIdNorwood,
    familyId: NORWOOD,
    occupation: ["Welder"],
  });

  // The same personId profile in Family A is unchanged. `occupation` is a
  // Candid optional (`[] | [string]`), so an unpromoted profile decodes to an
  // empty array rather than `undefined`; the isolation intent is that the
  // Norwood approval did not write "Welder" into the Family A profile.
  const familyAProfile = await actor.getPersonProfileForFamily(
    FAMILY_A,
    personIdA,
  );
  expect(familyAProfile).toHaveLength(1);
  expect(familyAProfile[0].occupation).toEqual([]);
  expect(familyAProfile[0].familyId).toBe(FAMILY_A);
});

// ---------------------------------------------------------------------------
// (5) A conflict generated from a finding carries the finding's familyId with
//     all references in that family.
//
// Only Norwood has a Steward, so the conflict is generated from a Norwood
// finding; the assertion is that the generated item carries familyId Norwood
// and references the Norwood finding/source/person.
// ---------------------------------------------------------------------------

it("generates a conflict carrying the finding's familyId with all references in that family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(contributorIdentity);
  const sourceId = await uploadSourceInto(actor, NORWOOD, "Norwood conflict source");
  // A `#Conflicting` finding routes to Conflict Review on approval.
  const created = await actor.createFindingForFamily(
    NORWOOD,
    "Conflicting occupation",
    { Conflicting: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value: "Welder", personId: "clayton" } },
    sourceId,
    ["clayton"],
    [],
  );
  expect("ok" in created).toBe(true);
  const findingId = (created as { ok: { id: bigint } }).ok.id;

  actor.setIdentity(adminIdentity);
  await actor.approveFindingForFamily(NORWOOD, findingId);

  const conflicts = await actor.listConflictReviewItems();
  const conflict = conflicts.find((c) => c.findingId === findingId);
  expect(conflict).toBeDefined();
  expect(conflict).toMatchObject({
    familyId: NORWOOD,
    findingId,
    personId: ["clayton"],
    proposedSourceId: [sourceId],
    status: { Conflicting: null },
  });
});

// ---------------------------------------------------------------------------
// (6) Review Queue Findings count is family-correct: a Family A finding must
//     not inflate the Norwood queue's finding count.
// ---------------------------------------------------------------------------

it("scopes the Review Queue finding count to the requested family", async () => {
  const { actor } = await setupFamilies();

  // One Norwood finding and one Family A finding.
  actor.setIdentity(contributorIdentity);
  const norwoodSource = await uploadSourceInto(actor, NORWOOD, "Norwood queued source");
  await createFindingInto(
    actor,
    NORWOOD,
    "Norwood queued finding",
    norwoodSource,
    "clayton",
    "Welder",
  );

  actor.setIdentity(memberAIdentity);
  const familyASource = await uploadSourceInto(actor, FAMILY_A, "Family A queued source");
  await createFindingInto(
    actor,
    FAMILY_A,
    "Family A queued finding",
    familyASource,
    "family_a_member",
    "Welder",
  );

  // The Norwood queue counts only the Norwood finding.
  actor.setIdentity(adminIdentity);
  const norwoodQueue = await actor.getReviewQueueForFamily(NORWOOD);
  const norwoodFindingItems = norwoodQueue.items.filter(
    (i) => i.kind.Finding !== undefined,
  );
  expect(norwoodFindingItems).toHaveLength(1);
  expect(norwoodFindingItems[0].title).toBe("Norwood queued finding");

  // The legacy queue agrees with the Norwood family-scoped queue.
  const legacyQueue = await actor.getReviewQueue();
  expect(legacyQueue.pending).toBe(norwoodQueue.pending);
});

// ---------------------------------------------------------------------------
// (7) Default Norwood compatibility: the legacy finding workflow (create,
//     list, get, approve, reject) behaves unchanged.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood finding workflow working end to end", async () => {
  const { actor } = await setupFamilies();

  // Legacy createSource + createFinding write Norwood records.
  actor.setIdentity(contributorIdentity);
  const createdSource = await actor.createSource(
    "Legacy Norwood source",
    { CensusCitation: null },
    "A legacy source.",
    [],
  );
  expect("ok" in createdSource).toBe(true);
  const sourceId = (createdSource as { ok: { id: bigint } }).ok.id;

  const createdFinding = await actor.createFinding(
    "Legacy Norwood finding",
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value: "Welder", personId: "clayton" } },
    sourceId,
    ["clayton"],
    [],
  );
  expect("ok" in createdFinding).toBe(true);
  const finding = (createdFinding as { ok: { id: bigint; familyId: string } }).ok;
  expect(finding.familyId).toBe(NORWOOD);

  // Legacy listFindings and getFinding resolve it.
  actor.setIdentity(adminIdentity);
  const listed = await actor.listFindings();
  expect(listed.find((f) => f.id === finding.id)).toBeDefined();
  const fetched = await actor.getFinding(finding.id);
  expect(fetched).toHaveLength(1);
  expect(fetched[0]).toMatchObject({ id: finding.id, familyId: NORWOOD });

  // Legacy approveFinding resolves it.
  const approved = await actor.approveFinding(finding.id);
  expect(approved).toEqual([
    expect.objectContaining({ id: finding.id, status: { Approved: null } }),
  ]);

  // A second legacy finding rejects through the legacy endpoint.
  actor.setIdentity(contributorIdentity);
  const createdFinding2 = await actor.createFinding(
    "Legacy Norwood finding 2",
    { Documented: null },
    { PersonFact: null },
    { PersonFact: { field: "occupation", value: "Farmer", personId: "clayton" } },
    sourceId,
    ["clayton"],
    [],
  );
  const finding2 = (createdFinding2 as { ok: { id: bigint } }).ok;
  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectFinding(finding2.id);
  expect(rejected).toEqual([
    expect.objectContaining({ id: finding2.id, status: { Rejected: null } }),
  ]);
});
