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
// Phase 4D-H1 — public recovery-audit read privacy (real-canister cover).
//
// The accepted behavior this file asserts, driven against the app's own
// compiled wasm through the real public API:
//
//   1. `listAuthorizedRecoveryAuditForFamily` returns ONLY the family-facing
//      projection (`actionLabel`, `actorDisplayLabel`, `affectedDisplayNames`,
//      `timestamp`). It carries no raw account principal (`actorAccountId`), no
//      raw person ids (`affectedPersonIds`), no recovery request id, no internal
//      audit id, no family id, and no free-text summary.
//   2. The backend resolves the display labels: the actor is labelled relative
//      to the caller ("You" when the caller performed the action, else "Family
//      Steward" for an active Steward, else "Family member"), and each affected
//      person id is resolved to its family-scoped display name.
//   3. The requester (a party to the request) sees their own safe audit history.
//   4. An active Steward sees the safe family audit history.
//   5. An unauthorized caller receives no audit history (`#NotAuthorized`), and
//      a request id from another family is never returned.
//   6. Anonymous callers are rejected (`#NotSignedIn`).
//
// The frontend suite mocks the actor and has no principals, so none of this is
// visible there. This file installs the app's own compiled wasm and drives the
// real public API.
//
// The lane shares one PocketIC sidecar across every file, and installing a
// canister replays the whole migration chain — the single most expensive
// operation in the lane. This file keeps its canister installs to one per test
// and only the tests the Phase 4D-H1 acceptance criteria require.
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
 * contributor. After this: ADMIN is the active Norwood Steward, and CONTRIBUTOR
 * is an approved family member who owns the seeded "clayton" profile.
 */
async function setup(): Promise<Seeded> {
  const setupResult = await pic!.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  });
  const actor = setupResult.actor;
  await registerApprovedContributor(actor);
  return { actor, canisterId: setupResult.canisterId };
}

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

/**
 * Registers `identity` as an approved member of `familyId` by creating a
 * profile for them via `createMyselfForFamily`, which writes an `#Approved`
 * profile claim for the caller. Returns the created personId.
 */
async function makeApprovedMember(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<string> {
  actor.setIdentity(identity);
  await actor._initialize_access_control();
  const created = await actor.createMyselfForFamily(familyId, name);
  if (!("ok" in created)) {
    throw new Error(`createMyselfForFamily failed: ${JSON.stringify(created)}`);
  }
  return created.ok.personId;
}

/**
 * Creates a brand-new family with `founder` as its only member. The new family
 * has NO StewardRecord, so a recovery request in it is a `#StewardRecovery`.
 * Returns the new family id and the founder's personId.
 */
async function makeStewardlessFamily(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  key: string,
): Promise<{ familyId: string; founderPersonId: string }> {
  actor.setIdentity(founder);
  const created = await actor.createFamilyWithFounder(
    "Audit Privacy Family",
    {
      firstName: "Quinn",
      lastName: "Quorum",
      middleName: [],
      suffix: [],
      preferredName: [],
      birthDate: [],
      birthYear: [],
      birthplace: [],
      currentLocation: [],
    },
    key,
  );
  if (!("ok" in created)) {
    throw new Error(`createFamilyWithFounder failed: ${JSON.stringify(created)}`);
  }
  return {
    familyId: created.ok.family.id,
    founderPersonId: created.ok.founderProfile.personId,
  };
}

// ---------------------------------------------------------------------------
// (1) The authorized read returns only the safe projection.
// ---------------------------------------------------------------------------

it("returns only the family-facing audit projection with no raw identifiers", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-replacement-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // The requester is a party to the request, so the authorized read is allowed.
  const audit = ok(
    await actor.listAuthorizedRecoveryAuditForFamily(NORWOOD, created.id),
  );
  expect(audit.length).toBeGreaterThan(0);

  for (const entry of audit) {
    // EXACTLY the four family-facing fields. A raw principal, raw person id,
    // recovery id, audit id, family id, or summary would leak private data.
    expect(Object.keys(entry).sort()).toEqual([
      "actionLabel",
      "actorDisplayLabel",
      "affectedDisplayNames",
      "timestamp",
    ]);
    expect(entry).not.toHaveProperty("actorAccountId");
    expect(entry).not.toHaveProperty("affectedPersonIds");
    expect(entry).not.toHaveProperty("recoveryId");
    expect(entry).not.toHaveProperty("id");
    expect(entry).not.toHaveProperty("familyId");
    expect(entry).not.toHaveProperty("summary");
    expect(entry).not.toHaveProperty("actionType");
    expect(entry.timestamp).toEqual(expect.any(BigInt));
    expect(entry.actionLabel).toEqual(expect.any(String));
    expect(entry.actorDisplayLabel).toEqual(expect.any(String));
    expect(Array.isArray(entry.affectedDisplayNames)).toBe(true);
  }

  // The backend resolved the display labels: the requester performed the
  // creation, so the actor reads as "You", and the affected person is resolved
  // to its display name, never the raw person id.
  const createdEntry = audit.find((e) => e.actionLabel === "Recovery requested");
  expect(createdEntry).toBeDefined();
  expect(createdEntry?.actorDisplayLabel).toBe("You");
  expect(createdEntry?.affectedDisplayNames).toContain("Clayton Norwood");
  expect(createdEntry?.affectedDisplayNames).not.toContain("clayton");
});

it("labels a Steward actor as 'Family Steward' and never the raw principal", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-steward-actor-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // ADMIN (an active Steward) approves, recording Steward-decision and transfer
  // audit entries whose actor is the Steward.
  actor.setIdentity(adminIdentity);
  await actor.approveAccountRecoveryForFamily(NORWOOD, created.id);

  // Read as the requester: the Steward's entries must be labelled "Family
  // Steward", never the Steward's principal.
  actor.setIdentity(replacement);
  const audit = ok(
    await actor.listAuthorizedRecoveryAuditForFamily(NORWOOD, created.id),
  );
  const stewardEntries = audit.filter(
    (e) => e.actionLabel === "Steward decision recorded",
  );
  expect(stewardEntries.length).toBeGreaterThan(0);
  for (const entry of stewardEntries) {
    expect(entry.actorDisplayLabel).toBe("Family Steward");
  }
  // No entry anywhere carries the Steward's principal text. (The projection
  // contains BigInt timestamps, so serialize with a BigInt-aware replacer.)
  const serialized = JSON.stringify(audit, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  expect(serialized).not.toContain(adminIdentity.getPrincipal().toText());
});

// ---------------------------------------------------------------------------
// (2) The requester sees their own safe history.
// ---------------------------------------------------------------------------

it("lets the requester read their own safe audit history", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-requester-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  const audit = ok(
    await actor.listAuthorizedRecoveryAuditForFamily(NORWOOD, created.id),
  );
  expect(audit.map((e) => e.actionLabel)).toContain("Recovery requested");
});

// ---------------------------------------------------------------------------
// (3) An authorized Steward sees safe family history.
// ---------------------------------------------------------------------------

it("lets an active Steward read the safe family audit history", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-steward-read-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // ADMIN is an active Steward of Norwood and may read the request's history.
  actor.setIdentity(adminIdentity);
  const audit = ok(
    await actor.listAuthorizedRecoveryAuditForFamily(NORWOOD, created.id),
  );
  expect(audit.length).toBeGreaterThan(0);
  for (const entry of audit) {
    expect(Object.keys(entry).sort()).toEqual([
      "actionLabel",
      "actorDisplayLabel",
      "affectedDisplayNames",
      "timestamp",
    ]);
  }
});

// ---------------------------------------------------------------------------
// (4) An unauthorized caller receives no audit history.
// ---------------------------------------------------------------------------

it("denies an unauthorized caller the audit history", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-owner-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // An unrelated approved member who is neither the requester, the owner, the
  // replacement, nor a Steward is not authorized to view this request.
  const outsider = createIdentity("recovery-audit-privacy-outsider-seed");
  await makeApprovedMember(actor, outsider, NORWOOD, "Owen Outsider");
  actor.setIdentity(outsider);
  await expect(
    actor.listAuthorizedRecoveryAuditForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
});

it("never returns a request id from another family", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-cross-family-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Norwood");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // A different family's Steward cannot read the Norwood request: the request
  // id does not resolve under the other family, so existence is never leaked.
  const otherFounder = createIdentity("recovery-audit-privacy-family-b-seed");
  const { familyId: familyB } = await makeStewardlessFamily(
    actor,
    otherFounder,
    "audit-privacy-family-b-key",
  );
  actor.setIdentity(otherFounder);
  await expect(
    actor.listAuthorizedRecoveryAuditForFamily(familyB, created.id),
  ).resolves.toEqual({ err: { RequestNotFound: null } });
});

// ---------------------------------------------------------------------------
// (5) Anonymous callers are rejected.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller on the authorized audit read", async () => {
  const { actor, canisterId } = await setup();
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);

  await expect(
    anonymous.listAuthorizedRecoveryAuditForFamily(NORWOOD, 0n),
  ).resolves.toEqual({ err: { NotSignedIn: null } });
});

// ---------------------------------------------------------------------------
// (6) The raw audit read is unchanged and still carries the internal fields;
//     the public projection is the family-facing read.
// ---------------------------------------------------------------------------

it("keeps the raw audit read separate from the safe projection", async () => {
  const { actor } = await setup();
  const replacement = createIdentity("recovery-audit-privacy-raw-seed");
  await makeApprovedMember(actor, replacement, NORWOOD, "Rhea Replacement");

  actor.setIdentity(replacement);
  const created = ok(
    await actor.requestRecoveryForFamily(
      NORWOOD,
      "clayton",
      replacement.getPrincipal(),
    ),
  );

  // The raw read is authorized for the same parties as the safe read, but it
  // still exposes the internal fields (actor principal, raw person ids,
  // recovery id, summary) — which is exactly why the public projection exists.
  const raw = ok(await actor.listRecoveryAuditForFamily(NORWOOD, created.id));
  expect(raw.length).toBeGreaterThan(0);
  expect(raw[0]).toHaveProperty("actorAccountId");
  expect(raw[0]).toHaveProperty("affectedPersonIds");
  expect(raw[0]).toHaveProperty("recoveryId");
  expect(raw[0]).toHaveProperty("summary");

  // An unrelated approved member is denied the raw read too.
  const outsider = createIdentity("recovery-audit-privacy-raw-outsider-seed");
  await makeApprovedMember(actor, outsider, NORWOOD, "Owen Outsider");
  actor.setIdentity(outsider);
  await expect(
    actor.listRecoveryAuditForFamily(NORWOOD, created.id),
  ).resolves.toEqual({ err: { NotAuthorized: null } });
});
