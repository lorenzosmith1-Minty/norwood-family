import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  memberAIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Tenancy 1C governance family-scope cover (real-canister) — Steward roster read.
//
// The accepted change adds a canonical `listStewardsForFamily(familyId)` query
// that is gated on active Steward authority for `familyId` and returns only the
// `StewardRecord` entries whose `familyId` equals the requested family, and
// reduces the legacy `listStewards()` to a thin DEFAULT_FAMILY_ID wrapper.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified filtering can only be asserted here.
// This file installs the app's own compiled wasm and drives the real public
// API. It asserts:
//
//   1. `listStewardsForFamily` rejects a caller who is not an active Steward of
//      the supplied familyId, and the Norwood Steward is denied on a
//      non-default family.
//   2. `listStewardsForFamily(NORWOOD)` returns only records whose familyId
//      equals the requested family, preserving the record shape.
//   3. The legacy `listStewards()` wrapper still returns the default-family
//      roster.
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
//     "Family A Steward reads Family A's roster" direction cannot be driven
//     here; the denial direction is driven instead. The internal family-scoped
//     predicate is covered by the sibling
//     `family-scoped-authorization.behavior.test.ts`, which executes the real
//     Motoko source.
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

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

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
// listStewardsForFamily authorization
// ---------------------------------------------------------------------------

it("listStewardsForFamily rejects a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  // CONTRIBUTOR is an approved Norwood member but not a Steward. The canonical
  // endpoint gates on active Steward authority for the requested family.
  actor.setIdentity(contributorIdentity);
  await expect(actor.listStewardsForFamily(NORWOOD)).rejects.toThrow();

  // The Norwood Steward is not a Steward of Family A, so the same read against
  // Family A is denied even though the caller is a Steward somewhere.
  actor.setIdentity(adminIdentity);
  await expect(actor.listStewardsForFamily(FAMILY_A)).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// listStewardsForFamily filtering and shape
// ---------------------------------------------------------------------------

it("listStewardsForFamily returns only records whose familyId equals the requested family", async () => {
  const { actor } = await setupFamilies();

  // Promote `clayton` (a claimed Norwood profile owned by CONTRIBUTOR) so the
  // Norwood roster has a second active Steward.
  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  const roster = await actor.listStewardsForFamily(NORWOOD);
  expect(roster.length).toBeGreaterThanOrEqual(2);
  // Every returned record belongs to the requested family and keeps the
  // StewardRecord shape.
  expect(roster.every((s) => s.familyId === NORWOOD)).toBe(true);
  expect(roster).toContainEqual(
    expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
    }),
  );
});

// ---------------------------------------------------------------------------
// Legacy listStewards wrapper
// ---------------------------------------------------------------------------

it("the legacy listStewards wrapper still returns the default-family roster", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.promoteToStewardForFamily(NORWOOD, "clayton");

  const legacy = await actor.listStewards();
  expect(legacy.length).toBeGreaterThanOrEqual(2);
  expect(legacy.every((s) => s.familyId === NORWOOD)).toBe(true);

  // The wrapper and the canonical default-family read agree.
  const canonical = await actor.listStewardsForFamily(NORWOOD);
  expect(legacy).toEqual(canonical);
});
