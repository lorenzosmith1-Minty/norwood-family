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
// Tenancy 1C governance family-scope cover (real-canister) — legacy wrappers.
//
// The accepted change reduces the legacy `promoteToSteward`,
// `activateSuccessor`, `addRelationship`, `listPersonRelationships`,
// `removeRelationship`, and `correctRelationshipType` to thin
// DEFAULT_FAMILY_ID wrappers that preserve the current Norwood behavior. This
// file installs the app's own compiled wasm and drives the real public API to
// assert that each legacy wrapper still produces the default-family result.
//
// The canonical family-scoped paths are covered by the sibling
// `governance-family-scope.cover.test.ts` (Steward/Successor) and
// `governance-relationship-family-scope.cover.test.ts` (relationships). The
// split is deliberate: each test installs its own canister, and a single file
// that installs ~26 canisters exhausts the shared sidecar's pid ceiling, after
// which the replica stops accepting connections and every later test fails with
// `fetch failed`. Keeping each file's install count well under that ceiling is
// what makes the lane reliable.
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

interface Seeded {
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}

/**
 * A fresh canister with the Norwood Steward bootstrapped and an approved
 * claimed Norwood member (`clayton`, owned by CONTRIBUTOR). Each test seeds its
 * own canister so no test depends on the order another ran in.
 */
async function setupFamilies(): Promise<Seeded> {
  const setup = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  return { actor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// Legacy wrappers keep the default-family behavior
// ---------------------------------------------------------------------------

it("the legacy promoteToSteward wrapper still writes the default-family StewardRecord", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const promoted = await actor.promoteToSteward("clayton");
  expect(promoted).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
    }),
  });
});

it("the legacy activateSuccessor wrapper still activates into the default family", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.designateSuccessor("clayton", 1n);
  const activated = await actor.activateSuccessor("clayton");
  expect(activated).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      stewardAccountId: contributorIdentity.getPrincipal(),
      roleStatus: { Active: null },
    }),
  });
});

it("the legacy addRelationship wrapper still writes the default-family Relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationship("clayton", "erma", {
    SpousePartner: null,
  });
  expect(added).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      fromPersonId: "clayton",
      toPersonId: "erma",
      status: { Confirmed: null },
    }),
  });
});

it("the legacy listPersonRelationships wrapper still reads the default-family relationships", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  await actor.addRelationship("clayton", "erma", { SpousePartner: null });

  const relationships = await actor.listPersonRelationships("clayton");
  expect(relationships).toHaveLength(1);
  expect(relationships[0]).toMatchObject({
    familyId: NORWOOD,
    fromPersonId: "clayton",
    toPersonId: "erma",
  });
});

it("the legacy removeRelationship wrapper still removes the default-family relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationship("clayton", "erma", {
    SpousePartner: null,
  });
  const relationshipId = (added as { ok: { id: bigint } }).ok.id;

  const removed = await actor.removeRelationship(relationshipId);
  expect(removed).toEqual({ ok: null });

  const remaining = await actor.listConfirmedRelationships();
  expect(remaining.some((r) => r.id === relationshipId)).toBe(false);
});

it("the legacy correctRelationshipType wrapper still corrects the default-family relationship", async () => {
  const { actor } = await setupFamilies();

  actor.setIdentity(adminIdentity);
  const added = await actor.addRelationship("clayton", "erma", {
    SpousePartner: null,
  });
  const relationshipId = (added as { ok: { id: bigint } }).ok.id;

  const corrected = await actor.correctRelationshipType(relationshipId, {
    Sibling: null,
  });
  expect(corrected).toEqual({
    ok: expect.objectContaining({
      familyId: NORWOOD,
      id: relationshipId,
      relationshipType: { Sibling: null },
    }),
  });
});
