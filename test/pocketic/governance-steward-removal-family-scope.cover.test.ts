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
// Tenancy 1C governance family-scope cover (real-canister) — Steward removal.
//
// The accepted change makes `removeStewardForFamily(familyId,
// stewardAccountId)` the canonical removal path: the caller must be an active
// Steward of `familyId`, the target `StewardRecord` is matched on both
// `stewardAccountId` and `familyId`, the last-Steward guard counts only active
// Stewards of `familyId`, and the removal audit entry is stamped with the
// target `familyId`. The legacy `removeSteward(stewardAccountId)` is a thin
// `DEFAULT_FAMILY_ID` wrapper.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified target lookup can only be asserted
// here. This file installs the app's own compiled wasm and drives the real
// public API. It asserts:
//
//   1. `removeStewardForFamily` rejects a caller who is not an active Steward
//      of the supplied familyId, and the Norwood Steward is denied on a
//      non-default family.
//   2. A steward account id alone never crosses the family boundary: the
//      Norwood Steward's account id passed against a non-default family is
//      denied, and the Norwood roster is unchanged.
//   3. The last-Steward guard blocks removing the only active Steward of a
//      family (`#LastSteward`).
//   4. A successful Norwood removal marks the record `#Removed` and the legacy
//      `removeSteward` wrapper is observationally equivalent to
//      `removeStewardForFamily(NORWOOD, ...)`.
//
// The split from the sibling governance files is deliberate: each test installs
// its own canister, and a single file that installs ~26 canisters exhausts the
// shared sidecar's pid ceiling, after which the replica stops accepting
// connections and every later test fails with `fetch failed`. This file keeps
// its install count small.
//
// Coverage limits this file cannot close, stated plainly:
//
//   * There is no public endpoint that creates a Steward of a non-default
//     family: `claimSteward` and the legacy `promoteToSteward` both write
//     `familyId = "norwood"`, and `promoteToStewardForFamily` requires the
//     caller to already be an active Steward of the supplied family. A Family A
//     Steward therefore cannot be bootstrapped through the public API, so the
//     "Family A Steward removes a Family A Steward" direction cannot be driven
//     here; the denial direction is driven instead. The internal family-scoped
//     predicate is covered by the sibling
//     `family-scoped-authorization.behavior.test.ts`, which executes the real
//     Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const NORWOOD = "norwood";

const STEWARD_MARKER = "Unauthorized: Only Family Stewards can remove stewards";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

const memberAIdentity = createIdentity("removal-family-a-member-seed");

/**
 * A fresh canister with the Norwood Steward bootstrapped, an approved claimed
 * Norwood member (`clayton`, owned by CONTRIBUTOR), and MEMBER_A approved in
 * the test-only Family A. Each test seeds its own canister so no test depends
 * on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  // ADMIN becomes the Norwood Family Steward and CONTRIBUTOR becomes an
  // approved claimed Norwood member (owner of the `clayton` profile).
  await registerApprovedContributor(actor);

  // `createMyselfForFamily` creates a minimal profile owned by the caller and
  // writes an APPROVED claim for it in that family, which is what makes the
  // caller an approved member of Family A.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// removeStewardForFamily authorization
// ---------------------------------------------------------------------------

it("removeStewardForFamily rejects a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  // CONTRIBUTOR is an approved Norwood member but not a Steward. The canonical
  // endpoint gates on active Steward authority for the requested family.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.removeStewardForFamily(NORWOOD, contributorIdentity.getPrincipal()),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // The Norwood Steward is not a Steward of Family A, so the same removal
  // against Family A is denied even though the caller is a Steward somewhere.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.removeStewardForFamily(FAMILY_A, contributorIdentity.getPrincipal()),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward removing a Family A Steward", async () => {
  const { actor } = await setupFamilies();

  // Approved membership is not Steward authority.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.removeStewardForFamily(FAMILY_A, memberAIdentity.getPrincipal()),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// A steward account id alone never crosses the family boundary
// ---------------------------------------------------------------------------

it("does not let a steward account id alone affect another family", async () => {
  const { actor } = await setupFamilies();

  // Promote `clayton` so the Norwood roster has a second active Steward (the
  // guard would otherwise block the removal below).
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  const norwoodBefore = await actor.listStewardsForFamily(NORWOOD);

  // The Norwood Steward's own account id, passed against Family A, is denied by
  // the family-scoped gate: the account id alone carries no authority in A.
  await expect(
    actor.removeStewardForFamily(FAMILY_A, adminIdentity.getPrincipal()),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // The Norwood roster is unchanged: no record was removed by the cross-family
  // attempt.
  const norwoodAfter = await actor.listStewardsForFamily(NORWOOD);
  expect(norwoodAfter).toEqual(norwoodBefore);
  expect(
    norwoodAfter.filter((s) => "Active" in s.roleStatus),
  ).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// Last-Steward guard is family-scoped
// ---------------------------------------------------------------------------

it("blocks removing the only active Steward of a family with #LastSteward", async () => {
  const { actor } = await setupFamilies();

  // The Norwood family has exactly one active Steward (ADMIN).
  actor.setIdentity(adminIdentity);
  const roster = await actor.listStewardsForFamily(NORWOOD);
  expect(roster).toHaveLength(1);

  await expect(
    actor.removeStewardForFamily(NORWOOD, adminIdentity.getPrincipal()),
  ).resolves.toEqual({ err: { LastSteward: null } });

  // The Steward is still active.
  const after = await actor.listStewardsForFamily(NORWOOD);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ roleStatus: { Active: null } });
});

// ---------------------------------------------------------------------------
// Successful removal and the legacy wrapper
// ---------------------------------------------------------------------------

it("removes a Norwood Steward and the legacy wrapper matches the canonical call", async () => {
  const { actor } = await setupFamilies();

  // Promote `clayton` so the Norwood roster has two active Stewards.
  actor.setIdentity(adminIdentity);
  await actor.promoteToStewardForFamily(NORWOOD, "clayton");

  // The canonical removal marks the target record #Removed.
  const removed = await actor.removeStewardForFamily(
    NORWOOD,
    contributorIdentity.getPrincipal(),
  );
  expect(removed).toEqual({ ok: null });

  const roster = await actor.listStewardsForFamily(NORWOOD);
  expect(
    roster.find(
      (s) => s.stewardAccountId.toText() === contributorIdentity.getPrincipal().toText(),
    ),
  ).toMatchObject({ roleStatus: { Removed: null } });

  // The legacy wrapper is observationally equivalent to the canonical
  // default-family call: on a second canister, removing the same account
  // through `removeSteward` yields the same result and roster shape.
  const legacyRun = await setupFamilies();
  legacyRun.actor.setIdentity(adminIdentity);
  await legacyRun.actor.promoteToStewardForFamily(NORWOOD, "clayton");
  const legacyRemoved = await legacyRun.actor.removeSteward(
    contributorIdentity.getPrincipal(),
  );
  expect(legacyRemoved).toEqual({ ok: null });

  const legacyRoster = await legacyRun.actor.listStewardsForFamily(NORWOOD);
  expect(
    legacyRoster.find(
      (s) => s.stewardAccountId.toText() === contributorIdentity.getPrincipal().toText(),
    ),
  ).toMatchObject({ roleStatus: { Removed: null } });
});
