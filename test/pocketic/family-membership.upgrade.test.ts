import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Onboarding Phase 1A-H — FamilyMembership migration across a real upgrade.
//
// This is the highest-value assertion for this phase and nothing else in the
// build can see it. The previous revision already carries the Phase 1A
// `memberships` collection and its `20261001_000000.mo` backfill, so this build
// runs exactly one new migration on upgrade:
//
//   20261002_000000.mo enforces the uniqueness invariants, dropping duplicate
//   `#Active` memberships so at most one exists per (familyId, accountId) and
//   per (familyId, personId), while preserving every other record.
//
// The test installs the previous revision, creates memberships through its OWN
// public API (the previous revision's `createPendingMembershipForFamily` /
// `activateMembershipForFamily`), captures the pre-upgrade membership / claim /
// Steward / profile / relationship records, upgrades to this build (running the
// dedup migration), and asserts:
//
//   1. every membership survives with its original `id` and every field
//      unchanged, and at most one `#Active` membership exists per
//      (familyId, accountId) and per (familyId, personId);
//   2. a repeated read is idempotent — the migration neither duplicates nor
//      rewrites the memberships;
//   3. ProfileClaim, Steward, profile, and relationship records are unchanged.
//
// COVERAGE LIMIT (recorded in the episode): the previous revision's public API
// already enforces the uniqueness invariants (`AlreadyMember` on create,
// `ProfileAlreadyOwned` on activate), so duplicate `#Active` memberships cannot
// be seeded through it. The dedup migration's *drop* branch is therefore not
// reachable from the available previous revision; the deterministic conflict
// rule it implements is pinned at source level by
// `family-membership.static.test.ts`. This file proves the migration's
// preservation and idempotence paths against the real canister.
//
// The pre-upgrade writes go through the previous revision's own declarations
// (`.old/`), because this build's codec requires the new membership types and
// cannot encode a call against the previous revision's pre-migration types.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";
const PREVIOUS_WASM = process.env.BACKEND_WASM_PREVIOUS ?? "";
const PREVIOUS_DECLARATIONS = process.env.BACKEND_DECLARATIONS_PREVIOUS ?? "";

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

it("carries the previous revision's memberships through the upgrade, preserving every other record and the uniqueness invariants", async () => {
  const previousDeclarations = await import(
    /* @vite-ignore */ PREVIOUS_DECLARATIONS
  );
  const previousIdlFactory = previousDeclarations.idlFactory;

  // 1. Install the version the user is actually running.
  const previous = await pic!.setupCanister({
    idlFactory: previousIdlFactory,
    wasm: PREVIOUS_WASM,
  });

  // 2. Write state through the OLD public API. The Steward bootstraps itself
  //    (the one-time claimSteward) and creates/activates the memberships below.
  const steward = createIdentity("membership-upgrade-steward-seed");
  previous.actor.setIdentity(steward);
  await previous.actor._initialize_access_control();
  await previous.actor.claimSteward();

  const accountA = createIdentity("membership-upgrade-account-a-seed");
  const accountB = createIdentity("membership-upgrade-account-b-seed");
  const accountC = createIdentity("membership-upgrade-account-c-seed");

  // A claim, so the migration's preservation of ProfileClaim records can be
  // checked after the upgrade.
  previous.actor.setIdentity(accountA);
  await previous.actor._initialize_access_control();
  const claim = await previous.actor.requestProfileClaim("clayton");
  expect("ok" in claim).toBe(true);
  const claimId = (claim as { ok: { id: bigint } }).ok.id;
  previous.actor.setIdentity(steward);
  await previous.actor.approveProfileClaim(claimId);

  // Two #Active memberships and one #Pending membership, created through the
  // previous revision's own API. The previous revision's `activateMembershipForFamily`
  // is the canonical two-arg form `(familyId, membershipId)`: the mixin passes
  // the authenticated caller into the lib as `approvedBy`, so there is no
  // caller-supplied approver argument.
  const createdA = await previous.actor.createPendingMembershipForFamily(
    NORWOOD,
    accountA.getPrincipal(),
    "clayton",
  );
  expect("ok" in createdA).toBe(true);
  const membershipAId = (createdA as { ok: { id: bigint } }).ok.id;
  const activatedA = await previous.actor.activateMembershipForFamily(
    NORWOOD,
    membershipAId,
  );
  expect("ok" in activatedA).toBe(true);

  const createdB = await previous.actor.createPendingMembershipForFamily(
    NORWOOD,
    accountB.getPrincipal(),
    "hudson",
  );
  expect("ok" in createdB).toBe(true);
  const membershipBId = (createdB as { ok: { id: bigint } }).ok.id;
  const activatedB = await previous.actor.activateMembershipForFamily(
    NORWOOD,
    membershipBId,
  );
  expect("ok" in activatedB).toBe(true);

  const createdC = await previous.actor.createPendingMembershipForFamily(
    NORWOOD,
    accountC.getPrincipal(),
    "wellman",
  );
  expect("ok" in createdC).toBe(true);
  const membershipCId = (createdC as { ok: { id: bigint } }).ok.id;

  // A confirmed relationship, so the migration's preservation of relationship
  // records can be checked after the upgrade. The proposal is made by the
  // account that owns 'clayton' (accountA), then approved by the Steward.
  previous.actor.setIdentity(accountA);
  const proposed = await previous.actor.proposeRelationship(
    "clayton",
    "erma",
    { SpousePartner: null },
  );
  expect("ok" in proposed).toBe(true);
  const requests = await previous.actor.getMyRelationshipRequests();
  const request = requests.find((r) => r.relatedPersonId === "erma");
  expect(request).toBeDefined();
  previous.actor.setIdentity(steward);
  await previous.actor.approveRelationshipRequest(request!.id);

  // Capture the pre-upgrade records through the previous revision's own codec.
  const membershipsBefore = ok(
    await previous.actor.listFamilyMembersForFamily(NORWOOD),
  );
  const claimsBefore = await previous.actor.listProfileClaims();
  const stewardsBefore = await previous.actor.listStewards();
  const claytonBefore = await previous.actor.getPersonProfile("clayton");
  const relationshipsBefore = await previous.actor.listConfirmedRelationships();

  expect(membershipsBefore).toHaveLength(3);
  expect(claimsBefore).toHaveLength(1);
  expect(stewardsBefore.length).toBeGreaterThan(0);
  expect(claytonBefore).toHaveLength(1);
  expect(relationshipsBefore.length).toBeGreaterThan(0);

  // 3. Upgrade to the version this build produces. The dedup migration runs here.
  await pic!.upgradeCanister({
    canisterId: previous.canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });

  // 4. Read through the NEW API.
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, previous.canisterId);
  upgraded.setIdentity(steward);

  const memberships = ok(await upgraded.listFamilyMembersForFamily(NORWOOD));

  // Every membership survives the dedup migration with its id and fields
  // unchanged: the input was already unique, so nothing is dropped or rewritten.
  expect(memberships).toHaveLength(3);
  expect(memberships.every((m) => m.familyId === NORWOOD)).toBe(true);
  expect(new Set(memberships.map((m) => m.id.toString())).size).toBe(3);

  const beforeById = new Map(membershipsBefore.map((m) => [m.id.toString(), m]));
  for (const membership of memberships) {
    const original = beforeById.get(membership.id.toString());
    expect(original).toBeDefined();
    expect(membership).toEqual(original);
  }

  // At most one Active membership per (familyId, accountId).
  const accountCounts = new Map<string, number>();
  for (const m of memberships) {
    const key = `${m.familyId}::${m.accountId.toText()}`;
    accountCounts.set(key, (accountCounts.get(key) ?? 0) + 1);
  }
  expect([...accountCounts.values()].every((count) => count === 1)).toBe(true);
  expect(accountCounts.get(`${NORWOOD}::${accountA.getPrincipal().toText()}`)).toBe(1);
  expect(accountCounts.get(`${NORWOOD}::${accountB.getPrincipal().toText()}`)).toBe(1);
  expect(accountCounts.get(`${NORWOOD}::${accountC.getPrincipal().toText()}`)).toBe(1);

  // At most one Active membership per (familyId, personId).
  const personCounts = new Map<string, number>();
  for (const m of memberships) {
    const key = `${m.familyId}::${m.personId}`;
    personCounts.set(key, (personCounts.get(key) ?? 0) + 1);
  }
  expect([...personCounts.values()].every((count) => count === 1)).toBe(true);
  expect(personCounts.get(`${NORWOOD}::clayton`)).toBe(1);
  expect(personCounts.get(`${NORWOOD}::hudson`)).toBe(1);
  expect(personCounts.get(`${NORWOOD}::wellman`)).toBe(1);

  // The two activated memberships are still #Active with their approval fields;
  // the third is still #Pending with no approval fields.
  const byPerson = new Map(memberships.map((m) => [m.personId, m]));
  const claytonMembership = byPerson.get("clayton")!;
  expect(claytonMembership).toMatchObject({
    familyId: NORWOOD,
    accountId: accountA.getPrincipal(),
    personId: "clayton",
    status: { Active: null },
    approvedBy: [steward.getPrincipal()],
  });
  expect(claytonMembership.joinedAt).toHaveLength(1);
  expect(claytonMembership.approvedAt).toHaveLength(1);
  expect(claytonMembership.createdAt).toEqual(expect.any(BigInt));
  expect(claytonMembership.updatedAt).toEqual(expect.any(BigInt));

  const hudsonMembership = byPerson.get("hudson")!;
  expect(hudsonMembership).toMatchObject({
    familyId: NORWOOD,
    accountId: accountB.getPrincipal(),
    personId: "hudson",
    status: { Active: null },
    approvedBy: [steward.getPrincipal()],
  });

  const wellmanMembership = byPerson.get("wellman")!;
  expect(wellmanMembership).toMatchObject({
    familyId: NORWOOD,
    accountId: accountC.getPrincipal(),
    personId: "wellman",
    status: { Pending: null },
    approvedBy: [],
    approvedAt: [],
  });

  // The backfilled memberships satisfy the active-access predicate for their
  // surviving accounts, and not for the pending one.
  expect(
    ok(await upgraded.hasActiveMembershipForFamily(NORWOOD, accountA.getPrincipal())),
  ).toBe(true);
  expect(
    ok(await upgraded.hasActiveMembershipForFamily(NORWOOD, accountB.getPrincipal())),
  ).toBe(true);
  expect(
    ok(await upgraded.hasActiveMembershipForFamily(NORWOOD, accountC.getPrincipal())),
  ).toBe(false);

  // 5. A repeated read is idempotent: the same memberships come back, so the
  //    migration neither duplicates nor rewrites them.
  const membershipsAgain = ok(await upgraded.listFamilyMembersForFamily(NORWOOD));
  expect(membershipsAgain).toHaveLength(3);
  expect(membershipsAgain).toEqual(memberships);

  // 6. ProfileClaim, Steward, profile, and relationship records are unchanged.
  const claimsAfter = await upgraded.listProfileClaims();
  expect(claimsAfter).toHaveLength(claimsBefore.length);
  const claimsBeforeById = new Map(claimsBefore.map((c) => [c.id.toString(), c]));
  for (const claim of claimsAfter) {
    const original = claimsBeforeById.get(claim.id.toString());
    expect(original).toBeDefined();
    expect(claim).toEqual(original);
  }

  // The accepted change adds the `founding : Bool` role-context flag to every
  // StewardRecord. The migration backfills every pre-existing record with
  // `founding = false` while preserving familyId, stewardAccountId, roleStatus,
  // successorPriority, assignedBy, and assignedAt exactly as-is. The previous
  // revision's codec predates the field, so compare on the original fields and
  // assert the new flag separately rather than deep-equalling the two shapes.
  const stewardsAfter = await upgraded.listStewards();
  expect(stewardsAfter).toHaveLength(stewardsBefore.length);
  const stewardsBeforeById = new Map(
    stewardsBefore.map((s) => [s.stewardAccountId.toText(), s]),
  );
  for (const steward of stewardsAfter) {
    const original = stewardsBeforeById.get(steward.stewardAccountId.toText());
    expect(original).toBeDefined();
    expect(steward).toMatchObject({
      familyId: original!.familyId,
      stewardAccountId: original!.stewardAccountId,
      roleStatus: original!.roleStatus,
      successorPriority: original!.successorPriority,
      assignedBy: original!.assignedBy,
      assignedAt: original!.assignedAt,
    });
    // Every pre-existing record migrates to `founding = false`.
    expect(steward.founding).toBe(false);
  }

  const claytonAfter = await upgraded.getPersonProfile("clayton");
  expect(claytonAfter).toEqual(claytonBefore);

  const relationshipsAfter = await upgraded.listConfirmedRelationships();
  expect(relationshipsAfter).toEqual(relationshipsBefore);
});
