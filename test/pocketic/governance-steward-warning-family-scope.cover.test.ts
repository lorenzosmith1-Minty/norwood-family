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
// Tenancy 1C governance family-scope cover (real-canister) — single-Steward
// continuity warning.
//
// The accepted change makes the single-Steward warning family-scoped: the
// canonical `getSingleStewardWarningForFamily(familyId)` counts only
// `StewardRecord` entries whose `familyId` equals the requested family and whose
// `roleStatus == #Active`, and it is gated on active Steward authority for that
// family. The legacy `getSingleStewardWarning()` is a thin `DEFAULT_FAMILY_ID`
// wrapper.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified counting can only be asserted here.
// This file installs the app's own compiled wasm and drives the real public
// API. It asserts:
//
//   1. `getSingleStewardWarningForFamily` rejects a caller who is not an active
//      Steward of the supplied familyId, and the Norwood Steward is denied on a
//      non-default family.
//   2. The default-family warning counts only active Norwood Stewards: exactly
//      one active Steward yields the warning, a second active Steward yields
//      null, and a removed Steward does not count.
//   3. The legacy `getSingleStewardWarning()` wrapper is observationally
//      equivalent to `getSingleStewardWarningForFamily(NORWOOD)`.
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
//     "Family A holds one active Steward and gets its own warning" direction
//     cannot be driven here; the denial direction is driven instead. The
//     internal family-scoped counting predicate is covered by the sibling
//     `family-scoped-authorization.behavior.test.ts`, which executes the real
//     Motoko source.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

const FAMILY_A = "test-family-a";
const NORWOOD = "norwood";

const WARNING =
  "Only one Family Steward remains. Designate a successor steward to ensure continuity.";
const STEWARD_MARKER =
  "Unauthorized: Only Family Stewards can view steward warnings";

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

const memberAIdentity = createIdentity("warning-family-a-member-seed");

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
// getSingleStewardWarningForFamily authorization
// ---------------------------------------------------------------------------

it("getSingleStewardWarningForFamily rejects a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  // CONTRIBUTOR is an approved Norwood member but not a Steward. The canonical
  // endpoint gates on active Steward authority for the requested family.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.getSingleStewardWarningForFamily(NORWOOD),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));

  // The Norwood Steward is not a Steward of Family A, so the same read against
  // Family A is denied even though the caller is a Steward somewhere.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.getSingleStewardWarningForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

it("denies an approved Family A member who is not a Steward reading the Family A warning", async () => {
  const { actor } = await setupFamilies();

  // Approved membership is not Steward authority.
  actor.setIdentity(memberAIdentity);
  await expect(
    actor.getSingleStewardWarningForFamily(FAMILY_A),
  ).rejects.toThrow(new RegExp(STEWARD_MARKER, "i"));
});

// ---------------------------------------------------------------------------
// Default-family warning counts only active Norwood Stewards
// ---------------------------------------------------------------------------

it("returns the warning for exactly one active Steward and null once a second is promoted", async () => {
  const { actor } = await setupFamilies();

  // The Norwood family has exactly one active Steward (ADMIN).
  actor.setIdentity(adminIdentity);
  const single = await actor.getSingleStewardWarningForFamily(NORWOOD);
  expect(single).toEqual([WARNING]);

  // Promote `clayton` so the Norwood roster has a second active Steward; the
  // warning must disappear.
  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);
  const multiple = await actor.getSingleStewardWarningForFamily(NORWOOD);
  expect(multiple).toEqual([]);

  // Removing the second Steward returns the family to a single active Steward,
  // so the warning reappears — a removed record does not count.
  const removed = await actor.removeStewardForFamily(
    NORWOOD,
    contributorIdentity.getPrincipal(),
  );
  expect(removed).toEqual({ ok: null });
  const afterRemoval = await actor.getSingleStewardWarningForFamily(NORWOOD);
  expect(afterRemoval).toEqual([WARNING]);
});

// ---------------------------------------------------------------------------
// Legacy getSingleStewardWarning wrapper
// ---------------------------------------------------------------------------

it("the legacy getSingleStewardWarning wrapper matches the canonical default-family call", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const legacySingle = await actor.getSingleStewardWarning();
  const canonicalSingle = await actor.getSingleStewardWarningForFamily(NORWOOD);
  expect(legacySingle).toEqual(canonicalSingle);
  expect(legacySingle).toEqual([WARNING]);

  // With a second active Steward both reads agree on the null result.
  await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  const legacyMultiple = await actor.getSingleStewardWarning();
  const canonicalMultiple =
    await actor.getSingleStewardWarningForFamily(NORWOOD);
  expect(legacyMultiple).toEqual(canonicalMultiple);
  expect(legacyMultiple).toEqual([]);
});
