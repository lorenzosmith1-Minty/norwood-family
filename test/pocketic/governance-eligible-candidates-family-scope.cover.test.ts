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
// Tenancy 1C governance family-scope cover (real-canister) — eligible-Steward
// candidate read.
//
// The accepted change adds a canonical
// `listEligibleStewardCandidatesForFamily(familyId)` query that is gated on
// active Steward authority for `familyId` and returns only the profiles whose
// `familyId` equals the requested family, and reduces the legacy
// `listEligibleStewardCandidates()` to a thin DEFAULT_FAMILY_ID wrapper.
//
// The frontend suite mocks the actor and has no principals, so the per-caller
// authorization and the family-qualified filtering can only be asserted here.
// This file installs the app's own compiled wasm and drives the real public
// API. It asserts:
//
//   1. `listEligibleStewardCandidatesForFamily` rejects a caller who is not an
//      active Steward of the supplied familyId, and the Norwood Steward is
//      denied on a non-default family.
//   2. `listEligibleStewardCandidatesForFamily(NORWOOD)` returns only profiles
//      whose familyId equals the requested family, and excludes an account that
//      is an active Steward of that family.
//   3. The legacy `listEligibleStewardCandidates()` wrapper still returns the
//      default-family candidate list, agreeing with the canonical default read.
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
//     "an active Steward of Family A is excluded from Family A candidates but
//     remains eligible in Family B" direction cannot be driven here; the
//     exclusion direction is driven on Norwood instead. The internal
//     family-scoped predicate is covered by the sibling
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

  // `createMyselfForFamily` creates a minimal living, claimed profile owned by
  // the caller and writes an APPROVED claim for it in that family, which makes
  // the caller an eligible candidate in Family A.
  actor.setIdentity(memberAIdentity);
  await actor._initialize_access_control();
  const createdA = await actor.createMyselfForFamily(FAMILY_A, "Family A Member");
  expect("ok" in createdA).toBe(true);

  return { actor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// listEligibleStewardCandidatesForFamily authorization
// ---------------------------------------------------------------------------

it("listEligibleStewardCandidatesForFamily rejects a caller who is not an active Steward of the supplied family", async () => {
  const { actor } = await setupFamilies();

  // CONTRIBUTOR is an approved Norwood member but not a Steward. The canonical
  // endpoint gates on active Steward authority for the requested family.
  actor.setIdentity(contributorIdentity);
  await expect(
    actor.listEligibleStewardCandidatesForFamily(NORWOOD),
  ).rejects.toThrow();

  // The Norwood Steward is not a Steward of Family A, so the same read against
  // Family A is denied even though the caller is a Steward somewhere.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.listEligibleStewardCandidatesForFamily(FAMILY_A),
  ).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// listEligibleStewardCandidatesForFamily filtering and shape
// ---------------------------------------------------------------------------

it("listEligibleStewardCandidatesForFamily returns only profiles of the requested family", async () => {
  const { actor } = await setupFamilies();

  // The Norwood Steward reads the Norwood candidate list. CONTRIBUTOR's claimed
  // `clayton` profile is eligible; MEMBER_A's Family A profile must not appear.
  actor.setIdentity(adminIdentity);
  const candidates = await actor.listEligibleStewardCandidatesForFamily(NORWOOD);

  // Every returned identity is a Norwood profile. The Family A member is absent.
  expect(candidates).toContainEqual(
    expect.objectContaining({
      personId: "clayton",
      accountId: contributorIdentity.getPrincipal(),
    }),
  );
  expect(
    candidates.some(
      (c) => c.accountId.toText() === memberAIdentity.getPrincipal().toText(),
    ),
  ).toBe(false);
});

it("excludes an account that is an active Steward of the requested family", async () => {
  const { actor } = await setupFamilies();

  // ADMIN is the active Norwood Steward, so ADMIN's own profile is not an
  // eligible candidate in Norwood. Promote CONTRIBUTOR's `clayton` profile so
  // its account becomes an active Norwood Steward too, and confirm it drops out
  // of the Norwood candidate list.
  actor.setIdentity(adminIdentity);
  const before = await actor.listEligibleStewardCandidatesForFamily(NORWOOD);
  expect(before).toContainEqual(
    expect.objectContaining({
      personId: "clayton",
      accountId: contributorIdentity.getPrincipal(),
    }),
  );

  const promoted = await actor.promoteToStewardForFamily(NORWOOD, "clayton");
  expect("ok" in promoted).toBe(true);

  const after = await actor.listEligibleStewardCandidatesForFamily(NORWOOD);
  expect(
    after.some(
      (c) =>
        c.accountId.toText() === contributorIdentity.getPrincipal().toText(),
    ),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// Legacy listEligibleStewardCandidates wrapper
// ---------------------------------------------------------------------------

it("the legacy listEligibleStewardCandidates wrapper still returns the default-family candidate list", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const legacy = await actor.listEligibleStewardCandidates();
  expect(legacy).toContainEqual(
    expect.objectContaining({
      personId: "clayton",
      accountId: contributorIdentity.getPrincipal(),
    }),
  );

  // The wrapper and the canonical default-family read agree.
  const canonical = await actor.listEligibleStewardCandidatesForFamily(NORWOOD);
  expect(legacy).toEqual(canonical);
});
