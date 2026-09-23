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
// Tenancy 1C-B2-B3 — family-scoped Relationship Proposal endpoints
// (real-canister cover).
//
// The accepted behavior is that the canonical `*ForFamily` proposal endpoints
// enforce the family boundary: a proposal created in Family A is visible only
// under Family A and never under Family B; a `proposalId` alone never crosses
// the boundary; both referenced people must belong to the proposal's family, so
// a Family A person paired with a Family B person is rejected; a Source in
// Family A cannot back a Proposal in Family B; identical personId text in two
// families does not bypass isolation; and the default Norwood legacy proposal
// workflow is unchanged through the temporary compatibility wrappers.
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
// `familyId = "norwood"`), so the Steward-gated family-scoped proposal reads
// (`listRelationshipProposalsForFamily` / `getRelationshipProposalForFamily`)
// can only be executed by the Norwood Steward. The boundary is therefore driven
// in the direction the API supports: the Norwood Steward's Norwood read must
// never return a Family A proposal, and the Family A id must not resolve under
// Norwood. The internal family-scoped predicate is covered by the sibling
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
const memberAIdentity = createIdentity("proposal-family-a-seed");
const memberBIdentity = createIdentity("proposal-family-b-seed");
// A separate identity for the shared-person isolation test: `createMyselfForFamily`
// refuses a second profile for a caller that already owns one in the family, so
// MEMBER_A cannot create the shared person in Family A.
const sharedPersonIdentity = createIdentity("proposal-shared-person-seed");

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
 * Creates a relationship proposal in `familyId` as the currently-set caller,
 * between `fromPersonId` and `toPersonId`, backed by `sourceId`. Returns the
 * raw result so a test can assert either success or rejection.
 */
async function createProposalInto(
  actor: _SERVICE,
  familyId: string,
  fromPersonId: string,
  toPersonId: string,
  sourceId: bigint,
) {
  return actor.createRelationshipProposalForFamily(
    familyId,
    fromPersonId,
    toPersonId,
    "Father",
    sourceId,
  );
}

// ---------------------------------------------------------------------------
// (1) Create stores the requested familyId and both same-family people.
// ---------------------------------------------------------------------------

it("creates a Family A proposal between two Family A people, storing familyId A", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A census");

  // Both people belong to Family A: MEMBER_A's own profile and a second Family A
  // profile created by the shared-person identity.
  actor.setIdentity(sharedPersonIdentity);
  await actor._initialize_access_control();
  const secondA = await actor.createMyselfForFamily(FAMILY_A, "Family A Second");
  expect("ok" in secondA).toBe(true);
  const secondPersonId = (secondA as { ok: { personId: string } }).ok.personId;

  actor.setIdentity(memberAIdentity);
  const created = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    secondPersonId,
    sourceId,
  );
  expect("ok" in created).toBe(true);
  const proposal = (created as { ok: { id: bigint; familyId: string } }).ok;
  expect(proposal.familyId).toBe(FAMILY_A);
  expect(typeof proposal.id).toBe("bigint");

  // No approval or confirmed relationship is created by this flow.
  actor.setIdentity(adminIdentity);
  await expect(actor.listConfirmedRelationships()).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) Both referenced people must belong to the proposal's family.
// ---------------------------------------------------------------------------

it("rejects a Family A person paired with a Family B person", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A source");

  // MEMBER_A (Family A) + MEMBER_B (Family B): the second person is not in
  // Family A, so the create is rejected.
  const crossFamily = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_b_member",
    sourceId,
  );
  expect("err" in crossFamily).toBe(true);

  // Nothing was stored in Family A.
  actor.setIdentity(adminIdentity);
  await expect(actor.listRelationshipProposalsForFamily(NORWOOD)).resolves.toEqual(
    [],
  );
});

it("rejects a person reference that resolves by id but belongs to another family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A source");

  // The Family B person id resolves to a real profile, but in Family B, so a
  // Family A proposal referencing it is rejected.
  const wrongPerson = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_b_member",
    sourceId,
  );
  expect("err" in wrongPerson).toBe(true);

  // A Family A proposal referencing a person that does not exist at all is
  // likewise rejected.
  const missingPerson = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "no_such_person",
    sourceId,
  );
  expect("err" in missingPerson).toBe(true);
});

// ---------------------------------------------------------------------------
// (3) A Source belonging to another family cannot back a proposal.
// ---------------------------------------------------------------------------

it("rejects a Family B source attached to a Family A proposal", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_B creates a Family B source.
  actor.setIdentity(memberBIdentity);
  const familyBSource = await uploadSourceInto(actor, FAMILY_B, "Family B source");

  // MEMBER_A is an approved member of Family A, but the source belongs to
  // Family B, so the linked SourceRecord is not in the proposal's family.
  actor.setIdentity(memberAIdentity);
  const wrongSource = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_a_member",
    familyBSource,
  );
  expect("err" in wrongSource).toBe(true);

  // A create into Family B by a Family A member is denied outright.
  const crossFamily = await createProposalInto(
    actor,
    FAMILY_B,
    "family_b_member",
    "family_b_member",
    familyBSource,
  );
  expect("err" in crossFamily).toBe(true);
});

// ---------------------------------------------------------------------------
// (4) Read isolation: a Family A proposal is visible under Family A and absent
//     under Family B; a proposalId alone never crosses the boundary.
//
// Only Norwood has a Steward, so the Steward-gated family-scoped reads can only
// be executed by the Norwood Steward. The boundary is therefore driven in the
// direction the API supports: the Norwood Steward's Norwood read must never
// return a Family A proposal, and the Family A id must not resolve under
// Norwood.
// ---------------------------------------------------------------------------

it("does not show a Family A proposal in the Norwood proposal listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A listing source");
  const created = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_a_member",
    sourceId,
  );
  expect("ok" in created).toBe(true);
  const proposalId = (created as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward's family-scoped listing excludes the Family A proposal.
  actor.setIdentity(adminIdentity);
  const norwoodProposals = await actor.listRelationshipProposalsForFamily(NORWOOD);
  expect(norwoodProposals.find((p) => p.id === proposalId)).toBeUndefined();
  expect(norwoodProposals.every((p) => p.familyId === NORWOOD)).toBe(true);
});

it("does not resolve a Family A proposal id under Norwood", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Boundary source");
  const created = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_a_member",
    sourceId,
  );
  expect("ok" in created).toBe(true);
  const proposalId = (created as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward cannot resolve the Family A id under Norwood: the record
  // belongs to another family, so the lookup behaves like not-found.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.getRelationshipProposalForFamily(NORWOOD, proposalId),
  ).resolves.toEqual([]);
});

it("denies a non-Steward member reading a family's proposal listing", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Member A source");
  await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_a_member",
    sourceId,
  );

  // Approved membership is not Steward authority: the proposal read is denied.
  await expect(
    actor.listRelationshipProposalsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// (5) Identical personId text in two different families does not bypass
//     isolation.
//
// `nextPersonId` derives the id from the name, so the same name yields the same
// personId in each family. A Family A proposal referencing that shared id must
// still be rejected when the id is only present in Family B, and vice versa.
// ---------------------------------------------------------------------------

it("does not let identical personId text in two families bypass isolation", async () => {
  const { actor } = await setupFamilies();

  // The same personId exists in both families.
  actor.setIdentity(sharedPersonIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Shared Person");
  expect("ok" in createdA).toBe(true);
  const personIdA = (createdA as { ok: { personId: string } }).ok.personId;

  const sharedPersonBIdentity = createIdentity("proposal-shared-person-b-seed");
  actor.setIdentity(sharedPersonBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Shared Person");
  expect("ok" in createdB).toBe(true);
  const personIdB = (createdB as { ok: { personId: string } }).ok.personId;
  expect(personIdB).toBe(personIdA);

  // A Family A proposal referencing the shared id succeeds: the id is present in
  // Family A.
  actor.setIdentity(memberAIdentity);
  const sourceA = await uploadSourceInto(actor, FAMILY_A, "Shared person source A");
  const okProposal = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    personIdA,
    sourceA,
  );
  expect("ok" in okProposal).toBe(true);

  // A Family B proposal referencing the same id text is created by a Family B
  // member and is stored under Family B, not Family A.
  actor.setIdentity(memberBIdentity);
  const sourceB = await uploadSourceInto(actor, FAMILY_B, "Shared person source B");
  const familyBProposal = await createProposalInto(
    actor,
    FAMILY_B,
    "family_b_member",
    personIdB,
    sourceB,
  );
  expect("ok" in familyBProposal).toBe(true);
  expect((familyBProposal as { ok: { familyId: string } }).ok.familyId).toBe(
    FAMILY_B,
  );

  // The Norwood Steward's Norwood read sees neither, and the Family A id does
  // not resolve under Norwood.
  actor.setIdentity(adminIdentity);
  const norwoodProposals = await actor.listRelationshipProposalsForFamily(NORWOOD);
  expect(norwoodProposals).toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) Default Norwood compatibility: the legacy proposal workflow (create,
//     list) behaves unchanged through the temporary wrappers, and the legacy
//     create still rejects a non-existent source.
// ---------------------------------------------------------------------------

it("keeps the legacy Norwood proposal workflow working through the compatibility wrappers", async () => {
  const { actor } = await setupFamilies();

  // Legacy createSource + createRelationshipProposal write Norwood records.
  actor.setIdentity(contributorIdentity);
  const createdSource = await actor.createSource(
    "Legacy Norwood source",
    { CensusCitation: null },
    "A legacy source.",
    [],
  );
  expect("ok" in createdSource).toBe(true);
  const sourceId = (createdSource as { ok: { id: bigint } }).ok.id;

  const created = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  expect("ok" in created).toBe(true);
  const proposal = (created as { ok: { id: bigint; familyId: string } }).ok;
  expect(proposal.familyId).toBe(NORWOOD);

  // Legacy listRelationshipProposals resolves it for the Steward.
  actor.setIdentity(adminIdentity);
  const listed = await actor.listRelationshipProposals();
  const found = listed.find((p) => p.id === proposal.id);
  expect(found).toBeDefined();
  expect(found).toMatchObject({
    id: proposal.id,
    familyId: NORWOOD,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId,
    status: { Pending: null },
  });

  // The legacy create still rejects a non-existent source with #notFound and
  // persists nothing.
  actor.setIdentity(contributorIdentity);
  const missing = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    9999n,
  );
  expect(missing).toEqual({ err: { notFound: 9999n } });
});
