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
// Tenancy 1C — family-scoped profile-removal requests (real-canister cover).
//
// The accepted change makes `requestProfileRemovalForFamily`,
// `listProfileRemovalRequestsForFamily`, `approveProfileRemovalForFamily`, and
// `rejectProfileRemovalForFamily` the canonical paths, each taking an explicit
// `familyId` and filtering every request lookup by it, and reduces the legacy
// no-familyId methods to thin DEFAULT_FAMILY_ID wrappers.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified request lookups can only be asserted
// here. This file installs the app's own compiled wasm and drives the real
// public API. It asserts:
//
//   1. A removal request created in Family A is stamped with `familyId = A` and
//      is never returned by the Norwood Steward's Norwood listing.
//   2. The Norwood Steward cannot list or approve a Family A request: the
//      family-scoped Steward gate denies it, and the request id alone resolves
//      to nothing under Norwood.
//   3. An approved Family A member who is not a Steward cannot list or approve
//      a Family A request.
//   4. A Norwood removal request is visible in Norwood's listing and not in
//      Family A's; approving it archives only the Norwood profile and leaves the
//      Family A profile untouched.
//
// Coverage limit this file cannot close: there is no public endpoint that
// creates a Steward of a non-default family (`claimSteward` and
// `promoteToSteward` both write `familyId = "norwood"`), so "a Steward of
// Family A cannot review a Family B request" is exercised in the direction the
// API supports: the Norwood Steward cannot review a Family A request, and an
// approved Family A member who is not a Steward cannot review a Family A
// request. The internal `isActiveStewardForFamily` predicate is covered by the
// sibling `family-scoped-authorization.behavior.test.ts`.
//
// The legacy default-family wrappers are covered by the sibling
// `governance-removal-archive-duplicate-legacy-wrapper.cover.test.ts`.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can list profile removal requests";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// MEMBER_A and MEMBER_B become approved members of the two test-only families
// by creating their own profile in each family.
const memberAIdentity = createIdentity("removal-family-a-member-seed");
const memberBIdentity = createIdentity("removal-family-b-member-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
  /** The personId of MEMBER_A's profile in Family A. */
  familyAPersonId: string;
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

  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  if (!("ok" in createdA)) {
    throw new Error("createMyselfForFamily did not create a Family A profile");
  }
  const familyAPersonId = createdA.ok.personId;

  actor.setIdentity(memberBIdentity);
  await actor._initialize_access_control();
  const createdB = await actor.createMyselfForFamily(FAMILY_B, "Family B Member");
  expect("ok" in createdB).toBe(true);

  return { actor, canisterId: setup.canisterId, familyAPersonId };
}

// ---------------------------------------------------------------------------
// (1) A Family A request is stamped with familyId A and never appears in the
//     Norwood listing.
// ---------------------------------------------------------------------------

it("stamps a Family A removal request with familyId A and excludes it from the Norwood listing", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  // MEMBER_A owns the Family A profile, so the request is accepted and stamped
  // with the requested family.
  actor.setIdentity(memberAIdentity);
  const requested = await actor.requestProfileRemovalForFamily(
    FAMILY_A,
    familyAPersonId,
    "Duplicate of another record",
  );
  expect(requested).toEqual({
    ok: expect.objectContaining({
      familyId: FAMILY_A,
      personId: familyAPersonId,
      status: { Pending: null },
    }),
  });
  const requestId = (requested as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward's Norwood listing never returns the Family A request.
  actor.setIdentity(adminIdentity);
  const norwoodRequests = await actor.listProfileRemovalRequestsForFamily(NORWOOD);
  expect(norwoodRequests.find((r) => r.id === requestId)).toBeUndefined();
  expect(norwoodRequests).toEqual([]);

  // The legacy Norwood listing agrees.
  const legacyRequests = await actor.listProfileRemovalRequests();
  expect(legacyRequests.find((r) => r.id === requestId)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// (2) The Norwood Steward cannot list or approve a Family A request.
// ---------------------------------------------------------------------------

it("denies the Norwood Steward listing or approving a Family A request", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const requested = await actor.requestProfileRemovalForFamily(
    FAMILY_A,
    familyAPersonId,
    "Duplicate of another record",
  );
  const requestId = (requested as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward holds no Steward record for Family A, so the
  // family-scoped listing is denied outright.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.listProfileRemovalRequestsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // Approving the Family A request under Family A is denied for the same
  // reason, and approving it under Norwood resolves to nothing: the request id
  // alone never crosses the family boundary.
  await expect(
    actor.approveProfileRemovalForFamily(FAMILY_A, requestId),
  ).rejects.toThrow();
  // The Candid optional decodes to `[]` (absent), not `null`.
  await expect(
    actor.approveProfileRemovalForFamily(NORWOOD, requestId),
  ).resolves.toEqual([]);

  // The request is untouched: still pending, and the Family A profile is not
  // archived.
  actor.setIdentity(memberAIdentity);
  const archivedIdsA = await actor.listArchivedProfileIdsForFamily(FAMILY_A);
  expect(archivedIdsA).not.toContain(familyAPersonId);
});

it("denies an approved Family A member who is not a Steward listing or approving a Family A request", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const requested = await actor.requestProfileRemovalForFamily(
    FAMILY_A,
    familyAPersonId,
    "Duplicate of another record",
  );
  const requestId = (requested as { ok: { id: bigint } }).ok.id;

  // Approved membership is not Steward authority.
  await expect(
    actor.listProfileRemovalRequestsForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
  await expect(
    actor.approveProfileRemovalForFamily(FAMILY_A, requestId),
  ).rejects.toThrow();
  await expect(
    actor.rejectProfileRemovalForFamily(FAMILY_A, requestId),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// (3) A Norwood request is visible in Norwood and not in Family A; approving it
//     archives only the Norwood profile.
// ---------------------------------------------------------------------------

it("keeps a Norwood removal request out of Family A and archives only the Norwood profile", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  // CONTRIBUTOR owns the claimed Norwood `clayton` profile.
  actor.setIdentity(contributorIdentity);
  const requested = await actor.requestProfileRemovalForFamily(
    NORWOOD,
    "clayton",
    "Duplicate of another record",
  );
  expect(requested).toEqual({
    ok: expect.objectContaining({ familyId: NORWOOD, personId: "clayton" }),
  });
  const requestId = (requested as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward sees and approves it.
  actor.setIdentity(adminIdentity);
  const norwoodRequests = await actor.listProfileRemovalRequestsForFamily(NORWOOD);
  expect(norwoodRequests.find((r) => r.id === requestId)).toBeDefined();

  const approved = await actor.approveProfileRemovalForFamily(NORWOOD, requestId);
  expect(approved).toHaveLength(1);
  expect(approved[0]).toMatchObject({ status: { Approved: null } });

  // Only the Norwood profile is archived; the Family A profile is untouched.
  const norwoodArchived = await actor.listArchivedProfileIdsForFamily(NORWOOD);
  expect(norwoodArchived).toContain("clayton");

  const familyAArchived = await actor.listArchivedProfileIdsForFamily(FAMILY_A);
  expect(familyAArchived).not.toContain(familyAPersonId);
  expect(familyAArchived).toEqual([]);

  // The Family A profile still resolves under Family A.
  actor.setIdentity(memberAIdentity);
  const profileA = await actor.getPersonProfileForFamily(FAMILY_A, familyAPersonId);
  expect(profileA).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (4) A request id alone never crosses the boundary in either direction.
// ---------------------------------------------------------------------------

it("does not resolve a Family A request id under Norwood, nor a Norwood id under Family A", async () => {
  const { actor, familyAPersonId } = await setupFamilies();

  actor.setIdentity(memberAIdentity);
  const requestedA = await actor.requestProfileRemovalForFamily(
    FAMILY_A,
    familyAPersonId,
    "Family A request",
  );
  const requestIdA = (requestedA as { ok: { id: bigint } }).ok.id;

  actor.setIdentity(contributorIdentity);
  const requestedNorwood = await actor.requestProfileRemovalForFamily(
    NORWOOD,
    "clayton",
    "Norwood request",
  );
  const requestIdNorwood = (requestedNorwood as { ok: { id: bigint } }).ok.id;

  // The Norwood Steward cannot approve the Family A request under Norwood: the
  // request id alone resolves to nothing (the Candid optional decodes to `[]`).
  actor.setIdentity(adminIdentity);
  await expect(
    actor.approveProfileRemovalForFamily(NORWOOD, requestIdA),
  ).resolves.toEqual([]);

  // The Norwood request is still pending and the Family A request is still
  // pending: neither was reviewed by the cross-family attempt.
  const norwoodRequests = await actor.listProfileRemovalRequestsForFamily(NORWOOD);
  expect(norwoodRequests.find((r) => r.id === requestIdNorwood)).toMatchObject({
    status: { Pending: null },
  });
  expect(norwoodRequests.find((r) => r.id === requestIdA)).toBeUndefined();
});
