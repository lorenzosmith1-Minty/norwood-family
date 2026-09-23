import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B3-A2 — family-scoped Relationship Proposal review actions
// (real-canister cover).
//
// The accepted behavior is that the canonical review endpoints
// `approveRelationshipProposalForFamily` / `rejectRelationshipProposalForFamily`
// enforce the family boundary and the Review Queue Relationships count is
// family-filtered:
//
//   1. Approving a pending proposal in a family transitions it to `#Approved`
//      and creates exactly one confirmed relationship inside that family only.
//   2. Rejecting a pending proposal transitions it to `#Rejected` and creates no
//      confirmed relationship.
//   3. A `proposalId` alone never crosses the family boundary: a proposal that
//      belongs to another family is treated as not found, and no graph edge is
//      created.
//   4. `getReviewQueueForFamily(familyId)` counts only that family's proposals,
//      so a proposal in another family never inflates the count.
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
// `familyId = "norwood"`), so the Steward-gated family-scoped review actions
// can only be executed by the Norwood Steward. The boundary is therefore driven
// in the direction the API supports: the Norwood Steward's Norwood review must
// never touch a Family A proposal, and the Family A id must not resolve under
// Norwood. The internal family-scoped predicate is covered by the sibling
// `family-scoped-authorization.behavior.test.ts`, which executes the real
// Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const NORWOOD = "norwood";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control and claims the Norwood Steward role; MEMBER_A
// becomes an approved member of the test-only Family A.
const memberAIdentity = createIdentity("proposal-review-family-a-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped and MEMBER_A approved
 * in the test-only Family A. Each test seeds its own canister so no test depends
 * on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

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
 * created proposal id.
 */
async function createProposalInto(
  actor: _SERVICE,
  familyId: string,
  fromPersonId: string,
  toPersonId: string,
  sourceId: bigint,
): Promise<bigint> {
  const created = await actor.createRelationshipProposalForFamily(
    familyId,
    fromPersonId,
    toPersonId,
    "Father",
    sourceId,
  );
  if (!("ok" in created)) {
    throw new Error(
      `createRelationshipProposalForFamily failed: ${JSON.stringify(created)}`,
    );
  }
  return created.ok.id;
}

// ---------------------------------------------------------------------------
// (1) Approve creates exactly one confirmed relationship in the family.
// ---------------------------------------------------------------------------

it("approves a Norwood proposal and creates exactly one confirmed Norwood relationship", async () => {
  const { actor } = await setupFamilies();

  // The Norwood Steward creates a Norwood source and proposal between two
  // canonical Norwood people.
  actor.setIdentity(adminIdentity);
  const sourceId = await uploadSourceInto(actor, NORWOOD, "Norwood census");
  const proposalId = await createProposalInto(
    actor,
    NORWOOD,
    "clayton",
    "julia",
    sourceId,
  );

  // Approving through the family-scoped endpoint transitions the proposal and
  // creates the graph edge.
  const approved = await actor.approveRelationshipProposalForFamily(
    NORWOOD,
    proposalId,
  );
  expect(approved).toHaveLength(1);
  expect(approved[0]).toMatchObject({
    id: proposalId,
    familyId: NORWOOD,
    status: { Approved: null },
  });

  // Exactly one confirmed relationship exists, and it belongs to Norwood.
  const confirmed = await actor.listConfirmedRelationshipsForFamily(NORWOOD);
  expect(confirmed).toHaveLength(1);
  expect(confirmed[0]).toMatchObject({
    familyId: NORWOOD,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: { Parent: null },
    status: { Confirmed: null },
  });

  // No other family gained a graph edge.
  await expect(
    actor.listConfirmedRelationshipsForFamily(FAMILY_A),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) Reject creates no confirmed relationship.
// ---------------------------------------------------------------------------

it("rejects a Norwood proposal and creates no confirmed relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const sourceId = await uploadSourceInto(actor, NORWOOD, "Norwood census");
  const proposalId = await createProposalInto(
    actor,
    NORWOOD,
    "clayton",
    "julia",
    sourceId,
  );

  const rejected = await actor.rejectRelationshipProposalForFamily(
    NORWOOD,
    proposalId,
  );
  expect(rejected).toHaveLength(1);
  expect(rejected[0]).toMatchObject({
    id: proposalId,
    familyId: NORWOOD,
    status: { Rejected: null },
  });

  // Rejection leaves the family graph unchanged.
  await expect(
    actor.listConfirmedRelationshipsForFamily(NORWOOD),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) A proposalId alone never crosses the family boundary.
// ---------------------------------------------------------------------------

it("treats a Family A proposal id as not found under Norwood and creates no edge", async () => {
  const { actor } = await setupFamilies();

  // MEMBER_A creates a Family A proposal.
  actor.setIdentity(memberAIdentity);
  const sourceId = await uploadSourceInto(actor, FAMILY_A, "Family A source");
  const familyAProposalId = await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_a_member",
    sourceId,
  );

  // The Norwood Steward cannot approve or reject the Family A id under Norwood:
  // the record belongs to another family, so the lookup behaves like not-found.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveRelationshipProposalForFamily(NORWOOD, familyAProposalId),
  ).resolves.toEqual([]);
  await expect(
    actor.rejectRelationshipProposalForFamily(NORWOOD, familyAProposalId),
  ).resolves.toEqual([]);

  // No confirmed relationship was created in Norwood.
  await expect(
    actor.listConfirmedRelationshipsForFamily(NORWOOD),
  ).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (4) The Review Queue Relationships count is family-filtered.
// ---------------------------------------------------------------------------

it("counts only the family's own proposals in getReviewQueueForFamily", async () => {
  const { actor } = await setupFamilies();

  // One pending Norwood proposal.
  actor.setIdentity(adminIdentity);
  const norwoodSource = await uploadSourceInto(actor, NORWOOD, "Norwood census");
  await createProposalInto(actor, NORWOOD, "clayton", "julia", norwoodSource);

  // One pending Family A proposal, created by MEMBER_A.
  actor.setIdentity(memberAIdentity);
  const familyASource = await uploadSourceInto(actor, FAMILY_A, "Family A source");
  await createProposalInto(
    actor,
    FAMILY_A,
    "family_a_member",
    "family_a_member",
    familyASource,
  );

  // The Norwood queue contains exactly one RelationshipProposal item — the
  // Norwood one. The Family A proposal never appears in the Norwood queue, so it
  // cannot inflate the Norwood Relationships count.
  actor.setIdentity(adminIdentity);
  const norwoodQueue = await actor.getReviewQueueForFamily(NORWOOD);
  const norwoodRelationshipItems = norwoodQueue.items.filter(
    (item) => "RelationshipProposal" in item.kind,
  );
  expect(norwoodRelationshipItems).toHaveLength(1);
  expect(norwoodRelationshipItems[0].id).toBe(0n);
  expect(norwoodRelationshipItems[0].title).toBe("clayton - Father - julia");

  // The pending count is derived from the family-filtered items, so it equals
  // the number of pending items the Norwood queue actually returned (the
  // Norwood source and the Norwood proposal) and never counts the Family A
  // proposal.
  const pendingItems = norwoodQueue.items.filter(
    (item) => "Pending" in item.status,
  );
  expect(norwoodQueue.pending).toBe(BigInt(pendingItems.length));
  expect(pendingItems).toHaveLength(2);
});
