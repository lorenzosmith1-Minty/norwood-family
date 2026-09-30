import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type {
  FamilyInvitation,
  FamilyInvitationCreateOutcome,
  FamilyInvitationPreview,
  PersonProfile,
  _SERVICE,
} from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Onboarding Phase 1C-1 — FamilyInvitation secure onboarding transport
// (real-canister cover).
//
// The accepted behavior is a persistent invitation record that carries a
// one-time invite token (persisted only as a hash) and drives a family-scoped
// onboarding flow:
//
//   - `createFamilyInvitation` is callable by an approved member or active
//     Steward of the family; the target profile must belong to that family and
//     be unclaimed with no active membership owner. A target that already has
//     an active membership owner returns `#AlreadyMember` and creates nothing.
//   - The raw token is returned exactly once from create; the stored record
//     carries only `tokenHash`. A wrong, cancelled, declined, or accepted token
//     fails validation and acceptance.
//   - `validateFamilyInvitationToken` returns only the minimal safe preview
//     context (no token hash, no other member identities, no relationship
//     labels).
//   - `acceptFamilyInvitation` creates or reuses a `#Pending` membership in the
//     correct family/profile and marks the invitation `#Accepted` only on
//     success. A Family A invitation can never create a Family B membership.
//   - `declineFamilyInvitation` and `cancelFamilyInvitation` enforce authority
//     and transition rules.
//   - A repeat create for the same family + person + type reuses the existing
//     `#Pending` invitation instead of duplicating it; `resendFamilyInvitation`
//     rotates the token and the old token stops resolving.
//   - `createFoundingStewardInvitation` links to the existing Phase 1B-2
//     nomination and grants no Steward authority at creation.
//
// The frontend suite mocks the actor and has no principals at all, so none of
// this is visible there. This file installs the app's own compiled wasm and
// drives the real public API.
//
// Each test installs its own canister. The duplicate-pending rule means a
// second create for the same family + person + type reuses the first
// invitation, so tests that need a fresh deliverable token cannot share a
// canister without interfering. Installing is the lane's most expensive
// operation, but correctness here is worth the cost.
//
// Coverage limits this file cannot close (recorded in the episode):
//
//   - The 30-day expiry is a source-level constant; this lane has no time
//     control, so an actually-expired invitation is not driven here. The
//     expiry branch is pinned at the source level by the sibling
//     `family-invitation.static.test.ts`.
//   - The `#RelationshipNotificationRequired` variant is declared but the
//     create path returns `#AlreadyMember` for a target with an active
//     membership owner; the variant is not reachable through the public API.
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

/**
 * Renders a Candid value for an error message without tripping over `bigint`
 * fields (`JSON.stringify` throws on a bigint).
 */
function describe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Unwraps a `Result` read, failing the test on an unexpected `#err`. */
function ok<T>(result: { ok: T } | { err: unknown }): T {
  if (!("ok" in result)) {
    throw new Error(`expected #ok, got ${describe(result)}`);
  }
  return result.ok;
}

/** Unwraps a `#Created` create outcome, failing on any other variant. */
function created(outcome: FamilyInvitationCreateOutcome): {
  invitation: FamilyInvitation;
  rawToken: string;
  created: boolean;
} {
  if (!("Created" in outcome)) {
    throw new Error(`expected #Created, got ${describe(outcome)}`);
  }
  return outcome.Created;
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

/** Creates a family as `founder` and returns the created family id. */
async function createFamily(
  actor: _SERVICE,
  founder: ReturnType<typeof createIdentity>,
  displayName: string,
  key: string,
): Promise<string> {
  actor.setIdentity(founder);
  const result = ok(
    await actor.createFamilyWithFounder(displayName, founderInput("Fam", "Founder"), key),
  );
  return result.family.id;
}

/**
 * The first unclaimed profile in `familyId`, discovered at runtime rather than
 * hard-coded so the test does not depend on a specific seed id. Fails when the
 * family has no unclaimed profile, which would make the invitation target
 * invalid.
 */
async function firstUnclaimedProfile(
  actor: _SERVICE,
  familyId: string,
): Promise<PersonProfile> {
  const profiles = await actor.listProfilesForFamily(familyId);
  const unclaimed = profiles.find((p) => "Unclaimed" in p.claimStatus);
  if (unclaimed === undefined) {
    throw new Error(`no unclaimed profile found in family ${familyId}`);
  }
  return unclaimed;
}

/**
 * Creates a claimed profile in `familyId` owned by `owner` with NO membership,
 * via `createMyselfForFamily`. The profile belongs to the family but has no
 * active membership owner.
 *
 * Under the accepted secure-token change this profile is ALSO owned through the
 * legacy claim path (`PersonProfile.claimedByUserId` is set), so it is treated
 * as already claimed: no join invitation — including a founding-Steward
 * invitation — is created for it. The tests below assert that rejection.
 */
async function createClaimedProfileWithoutMembership(
  actor: _SERVICE,
  owner: ReturnType<typeof createIdentity>,
  familyId: string,
  name: string,
): Promise<PersonProfile> {
  actor.setIdentity(owner);
  await actor._initialize_access_control();
  return ok(await actor.createMyselfForFamily(familyId, name));
}

// ---------------------------------------------------------------------------
// (1) CREATE — the raw token is returned once and only the hash is persisted.
// ---------------------------------------------------------------------------

it("creates a #Pending invitation, returns the raw token once, and persists only its hash", async () => {
  const { actor } = await setup();

  // The approved contributor is an approved Norwood member; the target is a
  // seeded unclaimed Norwood profile.
  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);

  const outcome = ok(
    await actor.createFamilyInvitation(NORWOOD, target.personId, ["invitee@example.com"]),
  );
  const result = created(outcome);

  // The raw token is returned exactly once, is non-empty, and is URL-safe.
  expect(result.created).toBe(true);
  expect(result.rawToken.length).toBeGreaterThan(0);
  expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);

  // The persisted record carries the hash, never the raw token.
  expect(result.invitation.familyId).toBe(NORWOOD);
  expect(result.invitation.personId).toBe(target.personId);
  expect(result.invitation.status).toEqual({ Pending: null });
  expect(result.invitation.invitationType).toEqual({ FamilyMember: null });
  expect(result.invitation.tokenHash).not.toBe(result.rawToken);
  expect(result.invitation.tokenHash.length).toBeGreaterThan(0);
  expect(result.invitation.invitedEmail).toEqual(["invitee@example.com"]);
  expect(result.invitation.invitedByAccountId).toEqual(contributorIdentity.getPrincipal());
  expect(result.invitation.acceptedAt).toEqual([]);
  expect(result.invitation.acceptedByAccountId).toEqual([]);
  expect(result.invitation.cancelledAt).toEqual([]);
  // The 30-day expiry is in the future relative to creation.
  expect(result.invitation.expiresAt).toBeGreaterThan(result.invitation.createdAt);

  // The raw token is not stored anywhere the public API can read back: the
  // invitation record's only token-shaped field is the hash, and the hash is
  // not the raw token.
  expect(result.invitation.tokenHash).not.toContain(result.rawToken);
});

it("rejects an anonymous caller from creating an invitation", async () => {
  const { actor, canisterId } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  const result = await anonymous.createFamilyInvitation(NORWOOD, target.personId, []);
  expect(result).toEqual({ err: { NotSignedIn: null } });
});

it("rejects a caller who is not an approved member or Steward of the family", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);

  // A signed-in identity with no membership and no Steward role anywhere.
  const outsider = createIdentity("invitation-outsider-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();
  const result = await actor.createFamilyInvitation(NORWOOD, target.personId, []);
  expect(result).toEqual({ err: { NotAuthorized: null } });
});

it("rejects a target profile that belongs to another family", async () => {
  const { actor } = await setup();

  // A Family A member: `createMyselfForFamily` writes an APPROVED claim for the
  // caller in that family, which is the public path to non-default-family
  // membership and makes the caller an approved member (authorized to invite).
  const memberA = createIdentity("invitation-cross-family-member-seed");
  const familyA = await createFamily(
    actor,
    createIdentity("invitation-cross-family-founder-seed"),
    "Invitation Cross A",
    "inv-cross-a-key",
  );
  await createClaimedProfileWithoutMembership(actor, memberA, familyA, "Family A Member");

  // The target is an unclaimed Norwood profile, not a Family A profile.
  actor.setIdentity(contributorIdentity);
  const norwoodTarget = await firstUnclaimedProfile(actor, NORWOOD);

  actor.setIdentity(memberA);
  const result = await actor.createFamilyInvitation(familyA, norwoodTarget.personId, []);
  expect(result).toEqual({ err: { PersonNotInFamily: null } });
});

it("returns #AlreadyMember for a target that already has an active membership owner", async () => {
  const { actor } = await setup();

  // Give a seeded unclaimed profile an ACTIVE membership owner: the Steward
  // creates a pending membership for a fresh account and activates it.
  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const owner = createIdentity("invitation-already-member-owner-seed");
  actor.setIdentity(adminIdentity);
  const pending = ok(
    await actor.createPendingMembershipForFamily(NORWOOD, owner.getPrincipal(), target.personId),
  );
  ok(await actor.activateMembershipForFamily(NORWOOD, pending.id));

  // The approved contributor now tries to invite the now-claimed target.
  actor.setIdentity(contributorIdentity);
  const result = await actor.createFamilyInvitation(NORWOOD, target.personId, []);
  expect(result).toEqual({ ok: { AlreadyMember: null } });
});

// ---------------------------------------------------------------------------
// (2) DUPLICATE-PENDING SAFETY — a repeat create reuses, resend rotates.
// ---------------------------------------------------------------------------

it("reuses the existing #Pending invitation on a repeat create instead of duplicating", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);

  const first = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );
  const second = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  // The second create reuses the same invitation identity and reports
  // `created = false`; because only the hash is stored, the reused result
  // carries no recoverable raw token.
  expect(second.created).toBe(false);
  expect(second.invitation.id).toBe(first.invitation.id);
  expect(second.invitation.tokenHash).toBe(first.invitation.tokenHash);
  expect(second.rawToken).toBe("");
});

it("rotates the token on resend and stops resolving the old token", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);

  const first = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const resent = ok(
    await actor.resendFamilyInvitation(NORWOOD, target.personId, { FamilyMember: null }),
  );
  expect(resent.created).toBe(false);
  expect(resent.invitation.id).toBe(first.invitation.id);
  expect(resent.rawToken.length).toBeGreaterThan(0);
  expect(resent.rawToken).not.toBe(first.rawToken);
  expect(resent.invitation.tokenHash).not.toBe(first.invitation.tokenHash);

  // The old token no longer resolves; the new one does.
  expect(await actor.validateFamilyInvitationToken(first.rawToken)).toEqual({
    err: { InvalidToken: null },
  });
  const preview = ok(await actor.validateFamilyInvitationToken(resent.rawToken));
  expect(preview.invitationId).toBe(first.invitation.id);
});

// ---------------------------------------------------------------------------
// (3) VALIDATE — minimal safe preview only.
// ---------------------------------------------------------------------------

it("validates a pending token and returns only the minimal safe preview", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const preview: FamilyInvitationPreview = ok(
    await actor.validateFamilyInvitationToken(result.rawToken),
  );

  expect(preview.invitationId).toBe(result.invitation.id);
  expect(preview.familyId).toBe(NORWOOD);
  expect(preview.familyDisplayName.length).toBeGreaterThan(0);
  expect(preview.targetPersonId).toBe(target.personId);
  expect(preview.targetDisplayName).toBe(target.name);
  expect(preview.invitationType).toEqual({ FamilyMember: null });
  expect(preview.status).toEqual({ Pending: null });
  expect(preview.expiresAt).toBe(result.invitation.expiresAt);

  // The preview carries no token hash and no other member identities.
  expect(preview).not.toHaveProperty("tokenHash");
  expect(describe(preview)).not.toContain(result.rawToken);
  expect(describe(preview)).not.toContain(result.invitation.tokenHash);
});

it("fails validation for a wrong or unknown token", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  expect(await actor.validateFamilyInvitationToken("not-a-real-token")).toEqual({
    err: { InvalidToken: null },
  });
  expect(await actor.validateFamilyInvitationToken("")).toEqual({
    err: { InvalidToken: null },
  });
});

// ---------------------------------------------------------------------------
// (4) ACCEPT — creates a #Pending membership in the correct family/profile.
// ---------------------------------------------------------------------------

it("accepts a pending token, creating a #Pending membership and marking the invitation #Accepted", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  // A fresh invitee accepts the token.
  const invitee = createIdentity("invitation-accept-invitee-seed");
  actor.setIdentity(invitee);
  await actor._initialize_access_control();
  const accepted = ok(await actor.acceptFamilyInvitation(result.rawToken));

  expect(accepted.status).toEqual({ Accepted: null });
  expect(accepted.id).toBe(result.invitation.id);
  expect(accepted.acceptedByAccountId).toEqual([invitee.getPrincipal()]);
  expect(accepted.acceptedAt).toHaveLength(1);

  // The invitee now holds a #Pending membership in the correct family/profile.
  const membership = ok(await actor.getMyMembershipForFamily(NORWOOD));
  expect(membership).toHaveLength(1);
  const record = membership[0];
  expect(record.familyId).toBe(NORWOOD);
  expect(record.personId).toBe(target.personId);
  expect(record.accountId).toEqual(invitee.getPrincipal());
  expect(record.status).toEqual({ Pending: null });

  // Acceptance never auto-activates the membership.
  expect(ok(await actor.hasActiveMembershipForFamily(NORWOOD, invitee.getPrincipal()))).toBe(
    false,
  );

  // The accepted token can never be reused.
  expect(await actor.validateFamilyInvitationToken(result.rawToken)).toEqual({
    err: { InvalidToken: null },
  });
  expect(await actor.acceptFamilyInvitation(result.rawToken)).toEqual({
    err: { InvalidTransition: null },
  });
});

it("rejects an anonymous caller from accepting an invitation", async () => {
  const { actor, canisterId } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  expect(await anonymous.acceptFamilyInvitation(result.rawToken)).toEqual({
    err: { NotSignedIn: null },
  });
});

it("rejects acceptance of a wrong token", async () => {
  const { actor } = await setup();

  const invitee = createIdentity("invitation-accept-wrong-seed");
  actor.setIdentity(invitee);
  await actor._initialize_access_control();
  expect(await actor.acceptFamilyInvitation("not-a-real-token")).toEqual({
    err: { InvalidToken: null },
  });
});

// ---------------------------------------------------------------------------
// (5) DECLINE / CANCEL — authority and transition rules.
// ---------------------------------------------------------------------------

it("declines a pending token and blocks later acceptance", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const invitee = createIdentity("invitation-decline-seed");
  actor.setIdentity(invitee);
  await actor._initialize_access_control();
  const declined = ok(await actor.declineFamilyInvitation(result.rawToken));
  expect(declined.status).toEqual({ Declined: null });

  // A declined invitation fails validation and acceptance.
  expect(await actor.validateFamilyInvitationToken(result.rawToken)).toEqual({
    err: { InvalidToken: null },
  });
  expect(await actor.acceptFamilyInvitation(result.rawToken)).toEqual({
    err: { InvalidTransition: null },
  });
});

it("lets the inviter cancel a pending invitation and blocks later acceptance", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const cancelled = ok(
    await actor.cancelFamilyInvitation(NORWOOD, result.invitation.id),
  );
  expect(cancelled.status).toEqual({ Cancelled: null });
  expect(cancelled.cancelledAt).toHaveLength(1);

  expect(await actor.validateFamilyInvitationToken(result.rawToken)).toEqual({
    err: { InvalidToken: null },
  });
  expect(await actor.acceptFamilyInvitation(result.rawToken)).toEqual({
    err: { InvalidTransition: null },
  });
});

it("rejects cancellation by a caller who is neither the inviter nor a Steward", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const outsider = createIdentity("invitation-cancel-outsider-seed");
  actor.setIdentity(outsider);
  await actor._initialize_access_control();
  expect(await actor.cancelFamilyInvitation(NORWOOD, result.invitation.id)).toEqual({
    err: { NotAuthorized: null },
  });

  // The invitation is still pending and still resolvable.
  const preview = ok(await actor.validateFamilyInvitationToken(result.rawToken));
  expect(preview.status).toEqual({ Pending: null });
});

it("rejects cancelling an already-cancelled invitation as an invalid transition", async () => {
  const { actor } = await setup();

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  ok(await actor.cancelFamilyInvitation(NORWOOD, result.invitation.id));
  expect(await actor.cancelFamilyInvitation(NORWOOD, result.invitation.id)).toEqual({
    err: { InvalidTransition: null },
  });
});

// ---------------------------------------------------------------------------
// (6) CROSS-FAMILY — a Family A invitation never creates a Family B membership.
// ---------------------------------------------------------------------------

it("accepts a Norwood invitation into Norwood and never into another family", async () => {
  const { actor } = await setup();

  // A second family exists so the negative half of the assertion is meaningful.
  const founderA = createIdentity("invitation-cross-accept-founder-seed");
  const familyA = await createFamily(actor, founderA, "Invitation Cross Accept A", "inv-ca-key");

  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );

  const invitee = createIdentity("invitation-cross-accept-invitee-seed");
  actor.setIdentity(invitee);
  await actor._initialize_access_control();
  ok(await actor.acceptFamilyInvitation(result.rawToken));

  // The membership is in Norwood, the invitation's family, and not in Family A.
  const norwoodMembership = ok(await actor.getMyMembershipForFamily(NORWOOD));
  expect(norwoodMembership).toHaveLength(1);
  expect(norwoodMembership[0].familyId).toBe(NORWOOD);
  expect(norwoodMembership[0].personId).toBe(target.personId);

  const familyAMembership = ok(await actor.getMyMembershipForFamily(familyA));
  expect(familyAMembership).toEqual([]);
});

// ---------------------------------------------------------------------------
// (7) FOUNDING-STEWARD — the invitation links to the existing nomination and
//     grants no Steward authority at creation.
// ---------------------------------------------------------------------------

it("rejects a #FoundingSteward invitation for a legacy-claimed profile and grants no Steward authority", async () => {
  const { actor } = await setup();

  // A fresh family with a founder who accepts founding Stewardship.
  const founder = createIdentity("invitation-founding-founder-seed");
  const familyId = await createFamily(actor, founder, "Invitation Founding", "inv-founding-key");
  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));

  // The nominee is a profile in the family with NO active membership, but it is
  // owned through the legacy claim path (`createMyselfForFamily` sets
  // `claimedByUserId`). Under the accepted secure-token change such a profile is
  // treated as already claimed, so no join invitation — including a
  // founding-Steward invitation — is created for it.
  const nominee = createIdentity("invitation-founding-nominee-seed");
  const nomineeProfile = await createClaimedProfileWithoutMembership(
    actor,
    nominee,
    familyId,
    "Founding Nominee",
  );

  // The founder nominates the nominee. The nomination itself is unaffected by
  // the claimed-profile rule.
  actor.setIdentity(founder);
  const status = ok(
    await actor.nominateFoundingSteward(familyId, nomineeProfile.personId, []),
  );
  expect(status.state).toEqual({ NominationPending: null });

  // The founding-Steward invitation for the legacy-claimed profile is rejected
  // with #AlreadyMember, and no invitation record is created.
  const outcome = await actor.createFoundingStewardInvitation(
    familyId,
    nomineeProfile.personId,
    [],
  );
  expect(outcome).toEqual({ ok: { AlreadyMember: null } });

  // No Steward authority was granted to the nominee by the rejected create.
  const stewards = await actor.listStewardsForFamily(familyId);
  expect(
    stewards.some(
      (s) =>
        "Active" in s.roleStatus &&
        s.stewardAccountId.toText() === nominee.getPrincipal().toText(),
    ),
  ).toBe(false);
});

it("rejects a founding-Steward invitation when no pending nomination exists", async () => {
  const { actor } = await setup();

  const founder = createIdentity("invitation-founding-nonom-founder-seed");
  const familyId = await createFamily(actor, founder, "Invitation No Nom", "inv-nonom-key");

  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));

  // The founder's own profile has no pending nomination.
  const profiles = await actor.listProfilesForFamily(familyId);
  const founderProfile = profiles[0];
  const result = await actor.createFoundingStewardInvitation(
    familyId,
    founderProfile.personId,
    [],
  );
  expect(result).toEqual({ err: { NominationNotFound: null } });
});

it("a rejected founding-Steward invitation cannot be accepted and does not bypass the founding-Steward acceptance rule", async () => {
  const { actor } = await setup();

  // A fresh family whose founder accepts founding Stewardship.
  const founder = createIdentity("invitation-founding-accept-founder-seed");
  const familyId = await createFamily(actor, founder, "Invitation Founding Accept", "inv-fa-key");
  actor.setIdentity(founder);
  ok(await actor.acceptFoundingStewardship(familyId));

  // The nominee is a profile in the family with NO active membership, but it is
  // owned through the legacy claim path, so the founding-Steward invitation is
  // rejected with #AlreadyMember.
  const nominee = createIdentity("invitation-founding-accept-nominee-seed");
  const nomineeProfile = await createClaimedProfileWithoutMembership(
    actor,
    nominee,
    familyId,
    "Founding Accept Nominee",
  );

  // The founder nominates the nominee; the nomination succeeds.
  actor.setIdentity(founder);
  const nominated = ok(
    await actor.nominateFoundingSteward(familyId, nomineeProfile.personId, []),
  );
  expect(nominated.state).toEqual({ NominationPending: null });
  const nominationId = nominated.activeNomination[0].id;

  // The linked founding-Steward invitation is rejected for the claimed profile,
  // so there is no raw token for the nominee to accept.
  const rejected = await actor.createFoundingStewardInvitation(
    familyId,
    nomineeProfile.personId,
    [],
  );
  expect(rejected).toEqual({ ok: { AlreadyMember: null } });

  // The nominee holds no membership and no Steward authority.
  actor.setIdentity(nominee);
  await actor._initialize_access_control();
  expect(ok(await actor.getMyMembershipForFamily(familyId))).toEqual([]);

  actor.setIdentity(founder);
  const stewardsAfterReject = await actor.listStewardsForFamily(familyId);
  expect(
    stewardsAfterReject.some(
      (s) =>
        "Active" in s.roleStatus &&
        s.stewardAccountId.toText() === nominee.getPrincipal().toText(),
    ),
  ).toBe(false);

  // The founding-Steward acceptance rule still governs: the nominee cannot
  // accept the nomination without an #Active membership, and the rejected
  // invitation never produced one.
  actor.setIdentity(nominee);
  const premature = await actor.acceptFoundingStewardNomination(familyId, nominationId);
  expect(premature).toEqual({ err: { NomineeNotActiveMember: null } });

  // The nomination remains pending and no Steward authority was granted.
  actor.setIdentity(founder);
  const status = ok(await actor.getFoundingStewardStatusForFamily(familyId));
  expect(status.state).toEqual({ NominationPending: null });
  const stewardsAfter = await actor.listStewardsForFamily(familyId);
  expect(
    stewardsAfter.some(
      (s) =>
        "Active" in s.roleStatus &&
        s.stewardAccountId.toText() === nominee.getPrincipal().toText(),
    ),
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// (8) NORWOOD — the default family and its records are unchanged by invitation
//     activity.
// ---------------------------------------------------------------------------

it("leaves the default Norwood family and its stewards unchanged", async () => {
  const { actor } = await setup();

  // Capture Norwood's state before any invitation activity.
  actor.setIdentity(adminIdentity);
  const norwoodBefore = await actor.getFamily(NORWOOD);
  const stewardsBefore = await actor.listStewards();

  // Create and accept an invitation as a fresh invitee.
  actor.setIdentity(contributorIdentity);
  const target = await firstUnclaimedProfile(actor, NORWOOD);
  const result = created(
    ok(await actor.createFamilyInvitation(NORWOOD, target.personId, [])),
  );
  const invitee = createIdentity("invitation-norwood-invitee-seed");
  actor.setIdentity(invitee);
  await actor._initialize_access_control();
  ok(await actor.acceptFamilyInvitation(result.rawToken));

  // Norwood's family record and Steward roster are untouched. (The membership
  // list gains the invitee's new #Pending membership, which is the intended
  // effect, so only the family and Steward roster are compared byte-for-byte.)
  actor.setIdentity(adminIdentity);
  expect(await actor.getFamily(NORWOOD)).toEqual(norwoodBefore);
  expect(await actor.listStewards()).toEqual(stewardsBefore);
});
