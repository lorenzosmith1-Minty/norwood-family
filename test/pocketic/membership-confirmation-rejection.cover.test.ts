import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM, adminIdentity, registerApprovedContributor } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Onboarding Phase 1D-A — MembershipConfirmation rejection representation
// (real-canister cover), closing the two gaps the sibling
// `membership-confirmation.cover.test.ts` leaves open:
//
//   (1) ACTIVATION PRESERVES THE OWNERSHIP LINK. When a qualifying trusted
//       relative confirms a `#Pending` membership and it activates, the
//       membership is updated IN PLACE: the same record id still binds the same
//       account to the same person profile, and no second membership is created
//       for that person in the family. The sibling file asserts the status
//       transition but never the identity of the record or the absence of a
//       duplicate, which is exactly the "does not create a second membership"
//       acceptance criterion.
//
//   (2) OQL QUERYABILITY AND PER-TABLE AUTHORIZATION. The accepted change adds
//       `rejectedByAccountId` / `rejectedAt` to the `membershipConfirmation`
//       OQL entity. This file drives the real `schema()` / `execute()` surface:
//       the catalogue advertises the entity with the new fields, the platform
//       controller reads the persisted `#Disputed` row and sees the explicit
//       rejection representation, and a non-controller caller is denied by the
//       entity's `.controllerOnly()` rule.
//
// The frontend suite mocks the actor and has no principals, so neither the
// ownership link nor the OQL authorization is visible there. This file installs
// the app's own compiled wasm and drives the real public API.
//
// Coverage limits (recorded in the episode):
//   - The migration across a real upgrade is not exercised here; it lives in the
//     sibling `*.upgrade.test.*` files, which the lane only runs when a previous
//     revision is available.
//   - The OQL `execute` query is the minimal `{ start: "<entity>" }` form; the
//     richer filter/projection grammar is not exercised.
//   - The controller identity is the one `setupCanister` installs; the test
//     never re-identifies the controller actor, so the controller read is the
//     default-identity read.
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

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${JSON.stringify(result)}`);
  }
  return result.ok;
}

interface Seeded {
  actor: _SERVICE;
  /**
   * A second actor bound to the same canister that is NEVER re-identified, so
   * it keeps the default identity `setupCanister` installs — the canister
   * controller. The shared `actor` is re-identified by every test, so it cannot
   * serve as the controller.
   */
  controllerActor: _SERVICE;
}

// Installing a canister replays the whole migration chain and is the lane's most
// expensive operation, so this file shares ONE canister across its tests. Every
// test creates its own profiles and its own deterministic identities, and every
// read is family-scoped, so the tests do not interfere.
let shared: Seeded | undefined;

/** The shared canister, installed once on first use. */
async function setup(): Promise<Seeded> {
  if (shared === undefined) {
    const setupResult = await pic!.setupCanister<_SERVICE>({
      idlFactory,
      wasm: BACKEND_WASM,
    });
    // A dedicated controller actor: created before any `setIdentity` and never
    // re-identified, so it retains the default (controller) identity.
    const controllerActor = pic!.createActor<_SERVICE>(idlFactory, setupResult.canisterId);
    shared = { actor: setupResult.actor, controllerActor };
    // ADMIN becomes the Norwood Family Steward; CONTRIBUTOR becomes an approved
    // claimed Norwood member. The tests below use their own fresh identities.
    await registerApprovedContributor(shared.actor);
  }
  return shared;
}

/** Creates a fresh profile in `familyId` for `identity` and returns its personId. */
async function createProfile(
  actor: _SERVICE,
  identity: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<string> {
  actor.setIdentity(identity);
  const created = ok(await actor.createMyselfForFamily(familyId, name));
  return created.personId;
}

interface ConfirmationCase {
  confirmer: ReturnType<typeof createIdentity>;
  pendingAccount: ReturnType<typeof createIdentity>;
  membershipId: bigint;
  confirmerPersonId: string;
  pendingPersonId: string;
}

/**
 * Seeds a confirmation case in `familyId`: a `#Pending` membership for a fresh
 * account linked to a fresh pending profile, an `#Active` membership for a
 * fresh confirmer linked to a fresh confirmer profile, and a `#Confirmed`
 * relationship between the two people. All writes go through the family Steward
 * (ADMIN for Norwood). Every test passes a distinct `seed`.
 */
async function seedConfirmationCase(
  actor: _SERVICE,
  familyId: string,
  seed: string,
): Promise<ConfirmationCase> {
  const confirmer = createIdentity(`rejection-confirmer-${seed}`);
  const pendingAccount = createIdentity(`rejection-pending-${seed}`);

  const confirmerPersonId = await createProfile(
    actor,
    confirmer,
    familyId,
    `Rejection Confirmer ${seed}`,
  );
  const pendingPersonId = await createProfile(
    actor,
    pendingAccount,
    familyId,
    `Rejection Pending ${seed}`,
  );

  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      pendingAccount.getPrincipal(),
      pendingPersonId,
    ),
  );
  const confirmerMembership = ok(
    await actor.createPendingMembershipForFamily(
      familyId,
      confirmer.getPrincipal(),
      confirmerPersonId,
    ),
  );
  ok(await actor.activateMembershipForFamily(familyId, confirmerMembership.id));

  const relationship = await actor.addRelationshipForFamily(
    familyId,
    confirmerPersonId,
    pendingPersonId,
    { Sibling: null },
  );
  expect("ok" in relationship).toBe(true);

  return {
    confirmer,
    pendingAccount,
    membershipId: pending.id,
    confirmerPersonId,
    pendingPersonId,
  };
}

/** The memberships for `familyId`, read as the Steward. */
async function membershipsForFamily(
  actor: _SERVICE,
  familyId: string,
): Promise<Array<{ id: bigint; accountId: ReturnType<typeof createIdentity>["getPrincipal"]; personId: string; status: unknown }>> {
  actor.setIdentity(adminIdentity);
  return ok(await actor.listFamilyMembersForFamily(familyId));
}

// ---------------------------------------------------------------------------
// (1) ACTIVATION PRESERVES THE OWNERSHIP LINK AND CREATES NO SECOND MEMBERSHIP.
// ---------------------------------------------------------------------------

it("activates the pending membership in place, preserving the account/person link and creating no duplicate", async () => {
  const { actor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "ownership-link");

  // Capture the pending record before confirmation.
  const before = (await membershipsForFamily(actor, NORWOOD)).find(
    (m) => m.id === seeded.membershipId,
  );
  expect(before).toBeDefined();
  expect(before!.status).toEqual({ Pending: null });
  expect(before!.accountId).toEqual(seeded.pendingAccount.getPrincipal());
  expect(before!.personId).toBe(seeded.pendingPersonId);

  // A qualifying trusted relative confirms; the membership activates.
  actor.setIdentity(seeded.confirmer);
  ok(await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Confirmed: null }));

  const after = (await membershipsForFamily(actor, NORWOOD)).find(
    (m) => m.id === seeded.membershipId,
  );
  expect(after).toBeDefined();

  // The SAME record id still binds the SAME account to the SAME person: the
  // ownership link is preserved, not re-created under a new id.
  expect(after!.id).toBe(before!.id);
  expect(after!.accountId).toEqual(before!.accountId);
  expect(after!.personId).toBe(before!.personId);
  expect(after!.status).toEqual({ Active: null });

  // No second membership exists for that person in the family: exactly one
  // record carries the pending person's id, and it is the activated one.
  const forPerson = (await membershipsForFamily(actor, NORWOOD)).filter(
    (m) => m.personId === seeded.pendingPersonId,
  );
  expect(forPerson).toHaveLength(1);
  expect(forPerson[0].id).toBe(seeded.membershipId);
  expect(forPerson[0].status).toEqual({ Active: null });

  // The person's profile is still owned by exactly one account: the pending
  // account, not the confirmer.
  const owners = (await membershipsForFamily(actor, NORWOOD)).filter(
    (m) => m.personId === seeded.pendingPersonId && "Active" in (m.status as object),
  );
  expect(owners).toHaveLength(1);
  expect(owners[0].accountId).toEqual(seeded.pendingAccount.getPrincipal());
});

// ---------------------------------------------------------------------------
// (2) OQL — the membershipConfirmation entity is queryable by the controller
//     with the new rejection fields, and denied to a non-controller.
// ---------------------------------------------------------------------------

interface SchemaEntity {
  name: string;
  primaryKey: string;
  fields: Array<{ name: string; typeName: string }>;
}

interface OqlCell {
  name: string;
  value: { text?: string; int?: bigint; nat?: bigint; bool?: boolean; null?: null };
}

/** Reads a text cell from an OQL row by column name. */
function textCell(row: OqlCell[], name: string): string | undefined {
  return row.find((cell) => cell.name === name)?.value.text;
}

/** Reads an int cell from an OQL row by column name. */
function intCell(row: OqlCell[], name: string): bigint | undefined {
  return row.find((cell) => cell.name === name)?.value.int;
}

it("advertises the membershipConfirmation OQL entity with the new rejection fields", async () => {
  const { controllerActor } = await setup();

  const schema = JSON.parse(await controllerActor.schema()) as { entities: SchemaEntity[] };
  const entity = schema.entities.find((e) => e.name === "membershipConfirmation");
  expect(entity).toBeDefined();
  expect(entity!.primaryKey).toBe("id");

  const fieldNames = entity!.fields.map((f) => f.name);
  // The accepted change adds the explicit standalone-rejection representation.
  expect(fieldNames).toContain("rejectedByAccountId");
  expect(fieldNames).toContain("rejectedAt");
  // The pre-existing confirmation columns are still advertised.
  for (const field of [
    "familyId",
    "id",
    "membershipId",
    "pendingPersonId",
    "confirmerAccountId",
    "confirmerPersonId",
    "decision",
    "relationshipId",
    "createdAt",
    "updatedAt",
  ]) {
    expect(fieldNames).toContain(field);
  }
});

it("lets the controller read the persisted #Disputed row with its explicit rejection representation", async () => {
  const { actor, controllerActor } = await setup();
  const seeded = await seedConfirmationCase(actor, NORWOOD, "oql-controller-read");

  // A standalone trusted-relative rejection/dispute.
  actor.setIdentity(seeded.confirmer);
  const record = ok(
    await actor.confirmPendingMembership(NORWOOD, seeded.membershipId, { Disputed: null }),
  );

  // The controller actor keeps the default identity `setupCanister` installs;
  // it is never re-identified, so this read is the controller read.
  const result = await controllerActor.execute(
    JSON.stringify({ start: "membershipConfirmation" }),
  );
  expect(result.hasMore).toBe(false);

  const row = (result.rows as OqlCell[][]).find(
    (cells) => intCell(cells, "membershipId") === seeded.membershipId,
  );
  expect(row).toBeDefined();

  // The row carries the explicit rejection representation, distinct from the
  // Steward-resolution entity: the rejecting account and a non-zero timestamp.
  expect(textCell(row!, "decision")).toBe("Disputed");
  expect(textCell(row!, "rejectedByAccountId")).toBe(
    seeded.confirmer.getPrincipal().toText(),
  );
  expect(intCell(row!, "rejectedAt")).toBeGreaterThan(0n);
  expect(textCell(row!, "familyId")).toBe(NORWOOD);
  expect(textCell(row!, "pendingPersonId")).toBe(seeded.pendingPersonId);
  expect(textCell(row!, "confirmerPersonId")).toBe(seeded.confirmerPersonId);
  expect(intCell(row!, "id")).toBe(record.id);
});

it("denies a non-controller caller the membershipConfirmation OQL read", async () => {
  const { actor } = await setup();
  await seedConfirmationCase(actor, NORWOOD, "oql-denied");

  // The Steward is an approved family member but not the canister controller.
  actor.setIdentity(adminIdentity);
  await expect(
    actor.execute(JSON.stringify({ start: "membershipConfirmation" })),
  ).rejects.toThrow(/caller not allowed to read 'membershipConfirmation'/);

  // A signed-in outsider with no membership is denied the same way.
  const outsider = createIdentity("rejection-oql-outsider");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();
  await expect(
    actor.execute(JSON.stringify({ start: "membershipConfirmation" })),
  ).rejects.toThrow(/caller not allowed to read 'membershipConfirmation'/);
});
