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
// Tenancy 1C — legacy default-family wrappers (real-canister cover).
//
// The accepted change makes the `*ForFamily` methods canonical and reduces the
// legacy no-familyId methods to thin `DEFAULT_FAMILY_ID` ("norwood") wrappers.
// This file installs the app's own compiled wasm and asserts that each legacy
// method is observationally equivalent to its `*ForFamily(NORWOOD, ...)`
// counterpart, so existing callers keep working unchanged.
//
// Read methods are compared on one canister. Mutation methods are compared
// across two freshly seeded canisters (one driven through the legacy method,
// one through the ForFamily method) so the comparison is not confounded by the
// first mutation changing the state the second observes.
//
// Coverage limit this file cannot close: it asserts equivalence against the
// Norwood family only. It does not exercise a non-default family through the
// legacy methods (by definition they always target Norwood), and it does not
// assert the deployed frontend actually calls these wrappers — the frontend
// suite covers the call shape with a mocked actor.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const NORWOOD = "norwood";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

const requesterIdentity = createIdentity("legacy-wrapper-requester-seed");

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
  /** The personId of the requester's own Norwood profile. */
  requesterPersonId: string;
}

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved Norwood
 * contributor, and a requester who owns a Norwood profile (so a removal request
 * can be filed against it).
 */
async function setupNorwood(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  actor.setIdentity(requesterIdentity);
  await actor._initialize_access_control();
  const created = await actor.createMyselfForFamily(NORWOOD, "Legacy Requester");
  if (!("ok" in created)) {
    throw new Error("createMyselfForFamily did not create a Norwood profile");
  }

  return {
    actor,
    canisterId: setup.canisterId,
    requesterPersonId: created.ok.personId,
  };
}

/**
 * Strips the wall-clock fields from a removal-request result so two runs on
 * separate canisters can be compared on their meaningful content. The
 * timestamps are expected to differ between canisters and are not part of the
 * wrapper contract.
 */
function withoutTimestamps(
  result: [] | [Record<string, unknown>],
): [] | [Record<string, unknown>] {
  return result.map((request) => {
    const { submittedDate: _submitted, reviewedDate: _reviewed, ...rest } =
      request;
    return rest;
  });
}

/** Files a removal request against the requester's own Norwood profile. */
async function fileRemovalRequest(actor: _SERVICE, personId: string) {
  actor.setIdentity(requesterIdentity);
  const filed = await actor.requestProfileRemovalForFamily(
    NORWOOD,
    personId,
    "Duplicate of another record",
  );
  if (!("ok" in filed)) {
    throw new Error("requestProfileRemovalForFamily did not file a request");
  }
  return filed.ok.id;
}

// ---------------------------------------------------------------------------
// Read wrappers.
// ---------------------------------------------------------------------------

it("listProfileRemovalRequests matches listProfileRemovalRequestsForFamily(NORWOOD)", async () => {
  const { actor, requesterPersonId } = await setupNorwood();
  await fileRemovalRequest(actor, requesterPersonId);

  actor.setIdentity(adminIdentity);
  const legacy = await actor.listProfileRemovalRequests();
  const scoped = await actor.listProfileRemovalRequestsForFamily(NORWOOD);
  expect(legacy).toEqual(scoped);
  expect(legacy).toHaveLength(1);
  expect(legacy[0]).toMatchObject({ familyId: NORWOOD });
});

it("listArchivedProfiles and listArchivedProfileIds match their ForFamily(NORWOOD) counterparts", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(adminIdentity);
  await actor.archiveProfileForFamily(NORWOOD, "clayton");

  expect(await actor.listArchivedProfiles()).toEqual(
    await actor.listArchivedProfilesForFamily(NORWOOD),
  );
  expect(await actor.listArchivedProfileIds()).toEqual(
    await actor.listArchivedProfileIdsForFamily(NORWOOD),
  );
  expect(await actor.listArchivedProfileIds()).toContain("clayton");
});

it("listDuplicateCandidates matches listDuplicateCandidatesForFamily(NORWOOD)", async () => {
  const { actor } = await setupNorwood();

  actor.setIdentity(adminIdentity);
  expect(await actor.listDuplicateCandidates()).toEqual(
    await actor.listDuplicateCandidatesForFamily(NORWOOD),
  );
});

// ---------------------------------------------------------------------------
// Mutation wrappers.
// ---------------------------------------------------------------------------

it("approveProfileRemoval matches approveProfileRemovalForFamily(NORWOOD)", async () => {
  const legacyRun = await setupNorwood();
  const legacyRequestId = await fileRemovalRequest(
    legacyRun.actor,
    legacyRun.requesterPersonId,
  );
  legacyRun.actor.setIdentity(adminIdentity);
  const legacyResult = await legacyRun.actor.approveProfileRemoval(
    legacyRequestId,
  );

  const scopedRun = await setupNorwood();
  const scopedRequestId = await fileRemovalRequest(
    scopedRun.actor,
    scopedRun.requesterPersonId,
  );
  scopedRun.actor.setIdentity(adminIdentity);
  const scopedResult = await scopedRun.actor.approveProfileRemovalForFamily(
    NORWOOD,
    scopedRequestId,
  );

  expect(withoutTimestamps(legacyResult)).toEqual(
    withoutTimestamps(scopedResult),
  );
  expect(legacyResult).toHaveLength(1);
  expect(legacyResult[0]).toMatchObject({ status: { Approved: null } });
});

it("rejectProfileRemoval matches rejectProfileRemovalForFamily(NORWOOD)", async () => {
  const legacyRun = await setupNorwood();
  const legacyRequestId = await fileRemovalRequest(
    legacyRun.actor,
    legacyRun.requesterPersonId,
  );
  legacyRun.actor.setIdentity(adminIdentity);
  const legacyResult = await legacyRun.actor.rejectProfileRemoval(
    legacyRequestId,
  );

  const scopedRun = await setupNorwood();
  const scopedRequestId = await fileRemovalRequest(
    scopedRun.actor,
    scopedRun.requesterPersonId,
  );
  scopedRun.actor.setIdentity(adminIdentity);
  const scopedResult = await scopedRun.actor.rejectProfileRemovalForFamily(
    NORWOOD,
    scopedRequestId,
  );

  expect(withoutTimestamps(legacyResult)).toEqual(
    withoutTimestamps(scopedResult),
  );
  expect(legacyResult).toHaveLength(1);
  expect(legacyResult[0]).toMatchObject({ status: { Rejected: null } });
});

it("archiveProfile and restoreProfile match their ForFamily(NORWOOD) counterparts", async () => {
  const legacyRun = await setupNorwood();
  legacyRun.actor.setIdentity(adminIdentity);
  const legacyArchive = await legacyRun.actor.archiveProfile("clayton");
  const legacyRestore = await legacyRun.actor.restoreProfile("clayton");

  const scopedRun = await setupNorwood();
  scopedRun.actor.setIdentity(adminIdentity);
  const scopedArchive = await scopedRun.actor.archiveProfileForFamily(
    NORWOOD,
    "clayton",
  );
  const scopedRestore = await scopedRun.actor.restoreProfileForFamily(
    NORWOOD,
    "clayton",
  );

  expect(legacyArchive).toEqual(scopedArchive);
  expect(legacyRestore).toEqual(scopedRestore);
  expect(legacyArchive).toEqual({ ok: null });
  expect(legacyRestore).toEqual({ ok: null });
});

it("mergeProfiles matches mergeProfilesForFamily(NORWOOD)", async () => {
  const legacyRun = await setupNorwood();
  legacyRun.actor.setIdentity(adminIdentity);
  const legacyResult = await legacyRun.actor.mergeProfiles(
    "clayton",
    "legacy_requester",
  );

  const scopedRun = await setupNorwood();
  scopedRun.actor.setIdentity(adminIdentity);
  const scopedResult = await scopedRun.actor.mergeProfilesForFamily(
    NORWOOD,
    "clayton",
    "legacy_requester",
  );

  expect(legacyResult).toEqual(scopedResult);
  expect(legacyResult).toEqual({
    ok: expect.objectContaining({
      canonicalPersonId: "clayton",
      archivedPersonId: "legacy_requester",
    }),
  });
});

it("notDuplicate matches notDuplicateForFamily(NORWOOD)", async () => {
  const legacyRun = await setupNorwood();
  legacyRun.actor.setIdentity(adminIdentity);
  const legacyResult = await legacyRun.actor.notDuplicate(
    "clayton",
    "legacy_requester",
  );

  const scopedRun = await setupNorwood();
  scopedRun.actor.setIdentity(adminIdentity);
  const scopedResult = await scopedRun.actor.notDuplicateForFamily(
    NORWOOD,
    "clayton",
    "legacy_requester",
  );

  expect(legacyResult).toEqual(scopedResult);
  expect(legacyResult).toEqual({ ok: null });
});
