import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Cover for the canonical Norwood Family Steward authority change, driven
// against the real canister.
//
// The accepted behavior this file asserts:
//
//   1. `isCallerSteward` is the canonical check: it returns false for an
//      anonymous caller and for an account that holds only the platform admin
//      role, and true only for an account with an ACTIVE persisted Steward
//      record.
//   2. `hasActiveSteward` reports whether any active Steward exists.
//   3. `claimSteward` is a one-time bootstrap: any signed-in account may claim
//      while no active Steward exists; once one exists the claim permanently
//      refuses with `StewardAlreadyExists` (and `AlreadySteward` for the
//      incumbent).
//   4. A Steward-only endpoint (`listStewards`) authorizes via the canonical
//      check: a platform-admin-only account is denied, an active Steward is
//      allowed.
//   5. Existing Steward records remain valid: after a claim the Steward keeps
//      authority and can still reach the Steward-only endpoint.
//
// The frontend suite mocks the actor and has no principals, so these
// per-caller rules can only be asserted here.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

// Deterministic identities. ADMIN is the first caller to
// _initialize_access_control, so ADMIN holds the platform admin role. CLAIMER
// is a separate signed-in account that performs the one-time Steward claim.
const adminIdentity = createIdentity("steward-authority-admin-seed");
const claimerIdentity = createIdentity("steward-authority-claimer-seed");
const otherIdentity = createIdentity("steward-authority-other-seed");

// A fresh canister with ADMIN registered as the platform admin (but NOT a
// Steward) and CLAIMER registered as a signed-in non-admin account.
async function setupAdminOnly(): Promise<{
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;
  actor.setIdentity(adminIdentity);
  await actor._initialize_access_control();
  actor.setIdentity(claimerIdentity);
  await actor._initialize_access_control();
  return { actor, canisterId: setup.canisterId };
}

it("reports the platform admin role does not confer Steward authority", async () => {
  const { actor } = await setupAdminOnly();

  // ADMIN is the platform admin but has not claimed the Steward role.
  actor.setIdentity(adminIdentity);
  await expect(actor.isCallerAdmin()).resolves.toBe(true);
  await expect(actor.isCallerSteward()).resolves.toBe(false);

  // No active Steward exists yet.
  await expect(actor.hasActiveSteward()).resolves.toBe(false);

  // A Steward-only endpoint denies the platform-admin-only account.
  await expect(actor.listStewards()).rejects.toThrow();
});

it("reports an anonymous caller is not a Steward and cannot claim", async () => {
  const { canisterId } = await setupAdminOnly();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(anonymous.isCallerSteward()).resolves.toBe(false);
  await expect(anonymous.hasActiveSteward()).resolves.toBe(false);
  await expect(anonymous.claimSteward()).resolves.toEqual({
    err: { NotSignedIn: null },
  });
});

it("lets a signed-in account claim the Steward role once while none exists", async () => {
  const { actor } = await setupAdminOnly();

  // CLAIMER is a signed-in non-admin account. The one-time claim succeeds
  // without any approved family profile.
  actor.setIdentity(claimerIdentity);
  const claimed = await actor.claimSteward();
  expect(claimed).toEqual({
    ok: expect.objectContaining({
      stewardAccountId: claimerIdentity.getPrincipal(),
      claimedBy: claimerIdentity.getPrincipal(),
      claimedAt: expect.any(BigInt),
    }),
  });

  // The canonical check now reports CLAIMER as an active Steward, and an active
  // Steward exists.
  await expect(actor.isCallerSteward()).resolves.toBe(true);
  await expect(actor.hasActiveSteward()).resolves.toBe(true);

  // The Steward can reach the Steward-only endpoint.
  const stewards = await actor.listStewards();
  expect(stewards).toHaveLength(1);
  expect(stewards[0]).toMatchObject({
    stewardAccountId: claimerIdentity.getPrincipal(),
    roleStatus: { Active: null },
  });
});

it("permanently refuses the claim once an active Steward exists", async () => {
  const { actor } = await setupAdminOnly();

  // CLAIMER claims first.
  actor.setIdentity(claimerIdentity);
  await actor.claimSteward();

  // A different signed-in account is refused: a Steward already exists.
  actor.setIdentity(otherIdentity);
  await actor._initialize_access_control();
  await expect(actor.claimSteward()).resolves.toEqual({
    err: { StewardAlreadyExists: null },
  });
  await expect(actor.isCallerSteward()).resolves.toBe(false);

  // The incumbent's re-claim is refused as AlreadySteward.
  actor.setIdentity(claimerIdentity);
  await expect(actor.claimSteward()).resolves.toEqual({
    err: { AlreadySteward: null },
  });

  // The roster is unchanged: exactly one active Steward.
  const stewards = await actor.listStewards();
  expect(stewards).toHaveLength(1);
  expect(stewards[0].stewardAccountId).toEqual(claimerIdentity.getPrincipal());
});

it("keeps an existing Steward record valid and authorized after the claim", async () => {
  const { actor } = await setupAdminOnly();

  actor.setIdentity(claimerIdentity);
  await actor.claimSteward();

  // The Steward record persists across subsequent calls and keeps authority:
  // the canonical check stays true and the Steward-only endpoint stays
  // reachable. No roster reset or data migration is involved.
  await expect(actor.isCallerSteward()).resolves.toBe(true);
  const before = await actor.listStewards();
  await expect(actor.isCallerSteward()).resolves.toBe(true);
  const after = await actor.listStewards();
  expect(after).toEqual(before);
  expect(after[0]).toMatchObject({
    stewardAccountId: claimerIdentity.getPrincipal(),
    roleStatus: { Active: null },
  });
});
