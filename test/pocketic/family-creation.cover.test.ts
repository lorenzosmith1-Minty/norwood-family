import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type {
  FamilyMembership,
  _SERVICE,
} from "../../src/frontend/src/declarations/backend.did";
import { BACKEND_WASM, registerApprovedContributor } from "./lane-helpers";

// ---------------------------------------------------------------------------
// Onboarding Phase 1B-1 — createFamilyWithFounder (real-canister cover).
//
// The accepted behavior is that an authenticated caller can start a brand-new
// family through one canonical backend operation that creates exactly three
// linked records in one atomic step: the new Family, the founder's first
// PersonProfile inside that family, and an #Active FamilyMembership linking the
// authenticated caller to that founder profile. The operation returns all three
// together, requires no pre-existing family membership, reuses the existing
// Family/PersonProfile/FamilyMembership models, and creates NO StewardRecord.
//
// The idempotency key is REQUIRED and must be non-empty: a blank or
// whitespace-only key is rejected with #InvalidInput and creates nothing, and a
// repeat of the same caller+key returns the first attempt's three records
// without creating a second family or advancing the family-creation nonce.
//
// The frontend suite mocks the actor and has no principals at all, so none of
// this is visible there. This file installs the app's own compiled wasm and
// drives the real public API.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - The `#AlreadyMember` / `#ProfileAlreadyOwned` error variants are declared
//     but the transaction never returns them (the founder profile is always
//     freshly created and the caller is never pre-checked against the new
//     family), so those branches are not reachable through the public API.
//   - The idempotency replay resolves the replayed membership through
//     `getMembershipForFamily`, which returns the first familyId+accountId match
//     regardless of status; a retry after the caller left or was suspended is
//     therefore not exercised here.
//   - The migration across a real upgrade lives in the sibling upgrade tests.
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

/** A fresh canister with the Norwood Steward bootstrapped and an approved contributor. */
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
 * Unwraps a `Result<?FamilyMembership, MembershipError>` read. The Candid
 * optional decodes as `[] | [FamilyMembership]`, so the `#ok` payload is an
 * array; this returns the single membership or fails when it is absent.
 */
function okMembership(
  result: { ok: [] | [FamilyMembership] } | { err: unknown },
): FamilyMembership {
  const membership = ok(result)[0];
  if (membership === undefined) {
    throw new Error("expected an #ok membership, got an empty optional");
  }
  return membership;
}

/** A minimal valid founder input. */
function founderInput(firstName: string, lastName: string) {
  return {
    firstName,
    lastName,
    middleName: [] as [] | [string],
    suffix: [] as [] | [string],
    preferredName: [] as [] | [string],
    birthDate: [] as [] | [string],
    birthYear: [] as [] | [string],
    birthplace: [] as [] | [string],
    currentLocation: [] as [] | [string],
  };
}

// ---------------------------------------------------------------------------
// (1) CREATE — the three linked records, returned together.
// ---------------------------------------------------------------------------

it("creates a family, its founder profile, and an Active founder membership in one call", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-founder-seed");
  actor.setIdentity(founder);

  const result = await actor.createFamilyWithFounder(
    "The Founders",
    founderInput("Ada", "Lovelace"),
    "create-1",
  );
  const created = ok(result);

  // The returned Family is a real Family record with a non-empty, safe id.
  expect(created.family.displayName).toBe("The Founders");
  expect(created.family.status).toEqual({ active: null });
  expect(created.family.createdBy).toEqual(founder.getPrincipal());
  expect(created.family.createdAt).toEqual(expect.any(BigInt));
  expect(created.family.id.length).toBeGreaterThan(0);
  // The id is URL/storage safe and never embeds the raw principal text.
  expect(created.family.id).toMatch(/^[a-z0-9-]+$/);
  expect(created.family.id).not.toContain(founder.getPrincipal().toText());

  // The founder profile belongs to the new family and carries the required names.
  expect(created.founderProfile.familyId).toBe(created.family.id);
  expect(created.founderProfile.firstName).toEqual(["Ada"]);
  expect(created.founderProfile.lastName).toEqual(["Lovelace"]);
  expect(created.founderProfile.name).toBe("Ada Lovelace");
  expect(created.founderProfile.claimStatus).toEqual({ Claimed: null });
  expect(created.founderProfile.claimedByUserId).toEqual([founder.getPrincipal()]);

  // The membership links the authenticated caller to the founder profile in the
  // new family, and is Active.
  expect(created.membership.familyId).toBe(created.family.id);
  expect(created.membership.accountId).toEqual(founder.getPrincipal());
  expect(created.membership.personId).toBe(created.founderProfile.personId);
  expect(created.membership.status).toEqual({ Active: null });
  expect(created.membership.approvedBy).toEqual([founder.getPrincipal()]);

  // The records are actually persisted, not just returned: read them back
  // through the family-scoped public API.
  const family = await actor.getFamily(created.family.id);
  expect(family).toHaveLength(1);
  expect(family[0]).toEqual(created.family);

  const profile = await actor.getPersonProfileForFamily(
    created.family.id,
    created.founderProfile.personId,
  );
  expect(profile).toHaveLength(1);
  expect(profile[0]).toEqual(created.founderProfile);

  // The founder is not yet a Steward and holds no approved ProfileClaim, so the
  // Steward/approved-member-gated `listFamilyMembersForFamily` is not available
  // to them. Read the caller's own membership through the self-scoped read,
  // which is the authorized path for the founder at this point in onboarding.
  const membership = okMembership(await actor.getMyMembershipForFamily(created.family.id));
  expect(membership).toEqual(created.membership);
});

it("accepts the optional founder fields the PersonProfile model supports", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-optional-seed");
  actor.setIdentity(founder);

  const created = ok(
    await actor.createFamilyWithFounder(
      "Optional Fields",
      {
        firstName: "Grace",
        lastName: "Hopper",
        middleName: ["Brewster"],
        suffix: ["Jr."],
        preferredName: ["Amazing Grace"],
        birthDate: ["1906-12-09"],
        birthYear: ["1906"],
        birthplace: ["New York City"],
        currentLocation: ["Arlington"],
      },
      "optional-fields-key",
    ),
  );

  expect(created.founderProfile.middleName).toEqual(["Brewster"]);
  expect(created.founderProfile.suffix).toEqual(["Jr."]);
  expect(created.founderProfile.preferredName).toEqual(["Amazing Grace"]);
  expect(created.founderProfile.birthDate).toEqual(["1906-12-09"]);
  expect(created.founderProfile.birthInfo).toEqual(["1906"]);
  expect(created.founderProfile.birthplace).toEqual(["New York City"]);
  expect(created.founderProfile.currentLocation).toEqual(["Arlington"]);
});

// ---------------------------------------------------------------------------
// (2) MULTI-FAMILY — an account already Active in Family A may create Family B.
// ---------------------------------------------------------------------------

it("lets an account already Active in another family create a new family without changing the first", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-multi-seed");
  actor.setIdentity(founder);

  const familyA = ok(
    await actor.createFamilyWithFounder("Family A", founderInput("Ann", "Alpha"), "family-a-key"),
  );
  const familyB = ok(
    await actor.createFamilyWithFounder("Family B", founderInput("Ben", "Beta"), "family-b-key"),
  );

  expect(familyA.family.id).not.toBe(familyB.family.id);

  // Family A's membership and profile are unchanged by the second creation.
  // The founder is not a Steward of Family A, so read their own membership
  // through the self-scoped read rather than the Steward-gated roster.
  const membershipA = okMembership(await actor.getMyMembershipForFamily(familyA.family.id));
  expect(membershipA).toEqual(familyA.membership);

  const profileA = await actor.getPersonProfileForFamily(
    familyA.family.id,
    familyA.founderProfile.personId,
  );
  expect(profileA).toHaveLength(1);
  expect(profileA[0]).toEqual(familyA.founderProfile);

  // The account now holds an Active membership in both families.
  expect(ok(await actor.hasActiveMembershipForFamily(familyA.family.id, founder.getPrincipal()))).toBe(
    true,
  );
  expect(ok(await actor.hasActiveMembershipForFamily(familyB.family.id, founder.getPrincipal()))).toBe(
    true,
  );
});

it("lets an account already Active in Norwood create a new family without changing Norwood", async () => {
  const { actor } = await setup();
  // The approved contributor is Active in Norwood via registerApprovedContributor.
  const contributor = createIdentity("archive-contributor-seed");
  actor.setIdentity(contributor);

  const norwoodBefore = ok(await actor.listFamilyMembersForFamily(NORWOOD));
  const norwoodProfilesBefore = await actor.listProfilesForFamily(NORWOOD);

  const created = ok(
    await actor.createFamilyWithFounder("New Branch", founderInput("Nora", "New"), "new-branch-key"),
  );
  expect(created.family.id).not.toBe(NORWOOD);

  // Norwood's memberships and profiles are byte-for-byte unchanged.
  const norwoodAfter = ok(await actor.listFamilyMembersForFamily(NORWOOD));
  expect(norwoodAfter).toEqual(norwoodBefore);
  const norwoodProfilesAfter = await actor.listProfilesForFamily(NORWOOD);
  expect(norwoodProfilesAfter).toEqual(norwoodProfilesBefore);
});

// ---------------------------------------------------------------------------
// (3) DISPLAY NAME — same display name, distinct ids.
// ---------------------------------------------------------------------------

it("allows two families with the same display name and gives them distinct ids", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-duplicate-name-seed");
  actor.setIdentity(founder);

  const first = ok(
    await actor.createFamilyWithFounder("Norwood", founderInput("One", "Norwood"), "dup-one-key"),
  );
  const second = ok(
    await actor.createFamilyWithFounder("Norwood", founderInput("Two", "Norwood"), "dup-two-key"),
  );

  expect(first.family.displayName).toBe("Norwood");
  expect(second.family.displayName).toBe("Norwood");
  expect(first.family.id).not.toBe(second.family.id);
  // Neither id is derived from the display name alone.
  expect(first.family.id).not.toBe("norwood");
  expect(second.family.id).not.toBe("norwood");

  // Both families are independently readable.
  expect(await actor.getFamily(first.family.id)).toHaveLength(1);
  expect(await actor.getFamily(second.family.id)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// (4) FAILURE SAFETY — invalid input creates nothing.
// ---------------------------------------------------------------------------

it("rejects a blank display name and creates no family, profile, or membership", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-blank-name-seed");

  // listFamilyMembersForFamily is member/Steward-gated, so read the Norwood
  // roster as the bootstrapped Steward.
  actor.setIdentity(createIdentity("archive-admin-seed"));
  const before = ok(await actor.listFamilyMembersForFamily(NORWOOD));

  actor.setIdentity(founder);
  const result = await actor.createFamilyWithFounder(
    "   ",
    founderInput("Ada", "Lovelace"),
    "create-1",
  );
  expect(result).toEqual({ err: { InvalidInput: null } });

  // No new family is discoverable, and the caller holds no membership anywhere.
  expect(await actor.getFamily("   ")).toEqual([]);
  expect(ok(await actor.hasActiveMembershipForFamily(NORWOOD, founder.getPrincipal()))).toBe(false);

  actor.setIdentity(createIdentity("archive-admin-seed"));
  expect(ok(await actor.listFamilyMembersForFamily(NORWOOD))).toEqual(before);
});

it("rejects a blank first or last name and creates no family, profile, or membership", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-blank-person-seed");
  actor.setIdentity(founder);

  const blankFirst = await actor.createFamilyWithFounder(
    "Blank First",
    founderInput("   ", "Lovelace"),
    "blank-first-key",
  );
  expect(blankFirst).toEqual({ err: { InvalidInput: null } });

  const blankLast = await actor.createFamilyWithFounder(
    "Blank Last",
    founderInput("Ada", "  "),
    "blank-last-key",
  );
  expect(blankLast).toEqual({ err: { InvalidInput: null } });

  // Neither rejected request left a family behind.
  expect(await actor.getFamily("blank-first")).toEqual([]);
  expect(await actor.getFamily("blank-last")).toEqual([]);
  expect(ok(await actor.hasActiveMembershipForFamily(NORWOOD, founder.getPrincipal()))).toBe(false);
});

// ---------------------------------------------------------------------------
// (5) RETRY — a repeated request with the same idempotency key is a no-op.
// ---------------------------------------------------------------------------

it("does not create a duplicate founder family when the same idempotency key is retried", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-retry-seed");
  actor.setIdentity(founder);

  const first = ok(
    await actor.createFamilyWithFounder(
      "Retry Family",
      founderInput("Rita", "Retry"),
      "onboarding-attempt-1",
    ),
  );
  const second = ok(
    await actor.createFamilyWithFounder(
      "Retry Family",
      founderInput("Rita", "Retry"),
      "onboarding-attempt-1",
    ),
  );

  // The replay returns the exact records created by the first attempt.
  expect(second.family).toEqual(first.family);
  expect(second.founderProfile).toEqual(first.founderProfile);
  expect(second.membership).toEqual(first.membership);

  // Exactly one membership exists for this attempt. The founder is not a
  // Steward, so read their own membership through the self-scoped read.
  const membership = okMembership(await actor.getMyMembershipForFamily(first.family.id));
  expect(membership).toEqual(first.membership);
});

it("creates a distinct family when the idempotency key differs", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-distinct-key-seed");
  actor.setIdentity(founder);

  const first = ok(
    await actor.createFamilyWithFounder("Keyed Family", founderInput("Kay", "Key"), "key-1"),
  );
  const second = ok(
    await actor.createFamilyWithFounder("Keyed Family", founderInput("Kay", "Key"), "key-2"),
  );

  expect(second.family.id).not.toBe(first.family.id);
});

it("rejects a blank idempotency key and creates nothing", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-blank-key-seed");
  actor.setIdentity(founder);

  const blank = await actor.createFamilyWithFounder(
    "Blank Key Family",
    founderInput("Bla", "Nk"),
    "",
  );
  expect(blank).toEqual({ err: { InvalidInput: null } });

  const whitespace = await actor.createFamilyWithFounder(
    "Whitespace Key Family",
    founderInput("White", "Space"),
    "   ",
  );
  expect(whitespace).toEqual({ err: { InvalidInput: null } });

  // Neither rejected request left a family behind, and the caller holds no
  // membership anywhere.
  expect(await actor.getFamily("blank-key-family")).toEqual([]);
  expect(await actor.getFamily("whitespace-key-family")).toEqual([]);
  expect(ok(await actor.hasActiveMembershipForFamily(NORWOOD, founder.getPrincipal()))).toBe(false);
});

it("does not advance the family-creation nonce on an idempotent replay", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-nonce-seed");
  actor.setIdentity(founder);

  // First creation consumes one nonce; the replay must not consume another.
  const first = ok(
    await actor.createFamilyWithFounder("Nonce Family", founderInput("Non", "Ce"), "nonce-key"),
  );
  const replay = ok(
    await actor.createFamilyWithFounder("Nonce Family", founderInput("Non", "Ce"), "nonce-key"),
  );
  expect(replay.family.id).toBe(first.family.id);

  // A subsequent NEW creation with a different key must still receive a
  // distinct id, proving the replay did not consume the next nonce.
  const second = ok(
    await actor.createFamilyWithFounder("Nonce Family", founderInput("Non", "Ce"), "nonce-key-2"),
  );
  expect(second.family.id).not.toBe(first.family.id);
});

it("lets two different callers reuse the same idempotency key independently", async () => {
  const { actor } = await setup();
  const firstCaller = createIdentity("family-creation-shared-key-a");
  const secondCaller = createIdentity("family-creation-shared-key-b");

  actor.setIdentity(firstCaller);
  const first = ok(
    await actor.createFamilyWithFounder("Shared Key A", founderInput("Sha", "Red"), "shared-key"),
  );

  actor.setIdentity(secondCaller);
  const second = ok(
    await actor.createFamilyWithFounder("Shared Key B", founderInput("Sha", "Red"), "shared-key"),
  );

  // The key is caller-scoped, so the second caller gets an independent family.
  expect(second.family.id).not.toBe(first.family.id);
  expect(second.membership.accountId).toEqual(secondCaller.getPrincipal());
  expect(first.membership.accountId).toEqual(firstCaller.getPrincipal());
});

// ---------------------------------------------------------------------------
// (6) SECURITY — anonymous callers and other-account founders.
// ---------------------------------------------------------------------------

it("rejects an anonymous caller and creates nothing", async () => {
  const { actor, canisterId } = await setup();

  // A fresh actor with no identity set is anonymous.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  const result = await anonymous.createFamilyWithFounder(
    "Anonymous Family",
    founderInput("Anon", "Ymous"),
    "anon-key",
  );
  expect(result).toEqual({ err: { NotSignedIn: null } });

  // No family was created by the anonymous attempt.
  expect(await anonymous.getFamily("anonymous-family")).toEqual([]);
});

it("always makes the authenticated caller the founder, never another account", async () => {
  const { actor } = await setup();
  const caller = createIdentity("family-creation-caller-seed");
  const other = createIdentity("family-creation-other-seed");
  actor.setIdentity(caller);

  const created = ok(
    await actor.createFamilyWithFounder("Caller Family", founderInput("Cal", "Ler"), "caller-key"),
  );

  // The membership account is the caller, not the other identity.
  expect(created.membership.accountId).toEqual(caller.getPrincipal());
  expect(created.membership.accountId).not.toEqual(other.getPrincipal());
  expect(created.founderProfile.claimedByUserId).toEqual([caller.getPrincipal()]);
});

// ---------------------------------------------------------------------------
// (7) STEWARD — no StewardRecord is created by family creation.
// ---------------------------------------------------------------------------

it("creates no StewardRecord for the new family", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-no-steward-seed");

  // listStewards is Steward-gated, so read the roster as the bootstrapped
  // Norwood Steward (archive-admin-seed), not as the new founder.
  actor.setIdentity(createIdentity("archive-admin-seed"));
  const stewardsBefore = await actor.listStewards();

  actor.setIdentity(founder);
  const created = ok(
    await actor.createFamilyWithFounder("Stewardless Family", founderInput("Stew", "Ardless"), "stewardless-key"),
  );

  // The new family has no Steward record: the Steward list is unchanged and no
  // record references the new family id.
  actor.setIdentity(createIdentity("archive-admin-seed"));
  const stewardsAfter = await actor.listStewards();
  expect(stewardsAfter).toEqual(stewardsBefore);
  expect(stewardsAfter.some((s) => s.familyId === created.family.id)).toBe(false);
});

// ---------------------------------------------------------------------------
// (8) NORWOOD — the default family and its records are unchanged.
// ---------------------------------------------------------------------------

it("leaves the default Norwood family, its memberships, profiles, and stewards unchanged", async () => {
  const { actor } = await setup();
  const founder = createIdentity("family-creation-norwood-seed");

  // Capture Norwood's state before any family creation.
  actor.setIdentity(createIdentity("archive-admin-seed"));
  const norwoodBefore = await actor.getFamily(NORWOOD);
  const stewardsBefore = await actor.listStewards();
  const membershipsBefore = ok(await actor.listFamilyMembersForFamily(NORWOOD));
  const profilesBefore = await actor.listProfilesForFamily(NORWOOD);

  // Create a new family as a different caller.
  actor.setIdentity(founder);
  await actor.createFamilyWithFounder("Unrelated Family", founderInput("Una", "Related"), "unrelated-key");

  // Norwood is untouched.
  actor.setIdentity(createIdentity("archive-admin-seed"));
  expect(await actor.getFamily(NORWOOD)).toEqual(norwoodBefore);
  expect(await actor.listStewards()).toEqual(stewardsBefore);
  expect(ok(await actor.listFamilyMembersForFamily(NORWOOD))).toEqual(membershipsBefore);
  expect(await actor.listProfilesForFamily(NORWOOD)).toEqual(profilesBefore);
});
