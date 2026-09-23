import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C-B2-B3 — Relationship Proposal default-family characterization.
//
// This file freezes the OBSERVABLE default-family (Norwood) behavior of the
// legacy Relationship Proposal create/list endpoints, which the upcoming
// family-scoping change must preserve through its temporary compatibility
// wrappers. It deliberately does NOT freeze:
//
//   * the absence of a `familyId` field on RelationshipProposal — the change
//     adds one, so asserting its absence would freeze the very thing being
//     changed;
//   * the legacy endpoints as the only implementation — the change makes them
//     thin wrappers over canonical `*ForFamily` methods, and this file must
//     keep passing across that refactor.
//
// What it does freeze is the behavior a default-family user observes today and
// must keep observing: a proposal created through the legacy endpoint is
// persisted with the submitted fields and `#Pending` status, is returned by the
// legacy listing, is visible in the Review Queue, and the legacy endpoints keep
// their existing authorization and validation gates.
//
// The frontend suite mocks the actor, so none of this is visible there. This
// file installs the app's own compiled wasm and drives the real public API.
//
// Coverage limit this file cannot close: the legacy `listRelationshipProposals`
// is Steward-gated and there is no legacy `getRelationshipProposal` endpoint, so
// the "get" half of the requirement is exercised only once the canonical
// `getRelationshipProposalForFamily` exists. The family-boundary behavior of the
// canonical `*ForFamily` endpoints is likewise not exercisable here because
// those endpoints do not exist yet; this file is the baseline the cover lane
// builds on.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

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

// A separate identity for the "not an approved member" case: it is registered
// (so it is a signed-in #user) but never claims a profile, so it is not an
// approved family member.
const unapprovedIdentity = createIdentity(
  "relationship-proposal-unapproved-seed",
);

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped and an approved
 * Norwood contributor. Each test seeds its own canister so no test depends on
 * the order another ran in.
 */
async function setupNorwood(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;
  await registerApprovedContributor(actor);
  return { actor, canisterId: setup.canisterId };
}

/**
 * Creates a Norwood source as the currently-set caller and returns its id. The
 * legacy proposal endpoint requires an existing source.
 */
async function createNorwoodSource(
  actor: _SERVICE,
  title: string,
): Promise<bigint> {
  const created = await actor.createSource(
    title,
    { CensusCitation: null },
    "A Norwood source for a relationship proposal.",
    [],
  );
  if (!("ok" in created)) {
    throw new Error(`createSource failed: ${JSON.stringify(created)}`);
  }
  return created.ok.id;
}

// ---------------------------------------------------------------------------
// (1) Legacy create persists the submitted fields with #Pending status.
//
// The assertion is on the observable fields the caller supplies and the
// lifecycle status — not on the full record shape, so a new `familyId` field
// added by the change does not break it.
// ---------------------------------------------------------------------------

it("persists a legacy Norwood proposal with the submitted fields and #Pending status", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  const sourceId = await createNorwoodSource(actor, "Norwood census");

  const created = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  expect(created).toEqual({
    ok: expect.objectContaining({
      fromPersonId: "clayton",
      toPersonId: "julia",
      relationshipType: "Father",
      sourceId,
      status: { Pending: null },
    }),
  });
  const proposal = (created as { ok: { id: bigint } }).ok;
  expect(typeof proposal.id).toBe("bigint");
});

// ---------------------------------------------------------------------------
// (2) Legacy list returns the created proposal to the Steward.
// ---------------------------------------------------------------------------

it("returns the created proposal from the legacy Steward listing", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  const sourceId = await createNorwoodSource(actor, "Norwood listing source");
  const created = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  const proposalId = (created as { ok: { id: bigint } }).ok.id;

  actor.setIdentity(adminIdentity);
  const listed = await actor.listRelationshipProposals();
  const found = listed.find((p) => p.id === proposalId);
  expect(found).toBeDefined();
  expect(found).toMatchObject({
    id: proposalId,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId,
    status: { Pending: null },
  });
});

// ---------------------------------------------------------------------------
// (3) The created proposal appears in the Review Queue as a pending
//     RelationshipProposal item with the three steward actions.
// ---------------------------------------------------------------------------

it("shows the created proposal in the Review Queue with the steward actions", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  const sourceId = await createNorwoodSource(actor, "Norwood queue source");
  const created = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  const proposalId = (created as { ok: { id: bigint } }).ok.id;

  actor.setIdentity(adminIdentity);
  const queue = await actor.getReviewQueue();
  const item = queue.items.find(
    (i) => i.kind.RelationshipProposal !== undefined && i.id === proposalId,
  );
  expect(item).toBeDefined();
  expect(item).toMatchObject({
    id: proposalId,
    title: "clayton - Father - julia",
    status: { Pending: null },
  });
  expect(item!.actions).toEqual([
    { Approve: null },
    { Reject: null },
    { NeedsResearch: null },
  ]);
});

// ---------------------------------------------------------------------------
// (4) Legacy authorization is unchanged: an anonymous caller and a signed-in
//     non-member are both rejected with #notAuthorized, and the Steward-gated
//     listing rejects a non-Steward.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller creating a proposal", async () => {
  const { canisterId } = await setupNorwood();

  // A freshly created actor calls as the anonymous principal until an identity
  // is set.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  const result = await guest.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    0n,
  );
  expect(result).toEqual({ err: { notAuthorized: null } });
});

it("rejects a signed-in non-member creating a proposal", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(unapprovedIdentity);
  await actor._initialize_access_control();
  const result = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    0n,
  );
  expect(result).toEqual({ err: { notAuthorized: null } });
});

it("denies a non-Steward reading the legacy proposal listing", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  await expect(actor.listRelationshipProposals()).rejects.toThrow(
    new RegExp(STEWARD_MARKER, "i"),
  );
});

// ---------------------------------------------------------------------------
// (5) Legacy validation is unchanged: a proposal backed by a non-existent
//     source is rejected with #notFound and is not persisted.
// ---------------------------------------------------------------------------

it("rejects a proposal backed by a non-existent source without persisting it", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  const result = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    9999n,
  );
  expect(result).toEqual({ err: { notFound: 9999n } });

  // Nothing was stored.
  actor.setIdentity(adminIdentity);
  await expect(actor.listRelationshipProposals()).resolves.toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) Legacy review actions on a default-family proposal are unchanged:
//     approving adds the canonical relationship exactly once, and rejecting
//     leaves the graph unchanged.
// ---------------------------------------------------------------------------

it("approves a legacy Norwood proposal, adding the canonical relationship exactly once", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  const sourceId = await createNorwoodSource(actor, "Norwood approval source");
  const created = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  const proposalId = (created as { ok: { id: bigint } }).ok.id;

  actor.setIdentity(adminIdentity);
  const approved = await actor.approveRelationshipProposal(proposalId);
  expect(approved).toEqual([
    expect.objectContaining({ id: proposalId, status: { Approved: null } }),
  ]);

  // "Father" maps to the #Parent relationship type and is added exactly once.
  const relationships = await actor.listConfirmedRelationships();
  const matching = relationships.filter(
    (r) =>
      r.fromPersonId === "clayton" &&
      r.toPersonId === "julia" &&
      "Parent" in r.relationshipType,
  );
  expect(matching).toHaveLength(1);
});

it("rejects a legacy Norwood proposal, leaving the family graph unchanged", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(contributorIdentity);
  const sourceId = await createNorwoodSource(actor, "Norwood rejection source");
  const created = await actor.createRelationshipProposal(
    "clayton",
    "julia",
    "Father",
    sourceId,
  );
  const proposalId = (created as { ok: { id: bigint } }).ok.id;

  actor.setIdentity(adminIdentity);
  const rejected = await actor.rejectRelationshipProposal(proposalId);
  expect(rejected).toEqual([
    expect.objectContaining({ id: proposalId, status: { Rejected: null } }),
  ]);
  await expect(actor.listConfirmedRelationships()).resolves.toEqual([]);
});
