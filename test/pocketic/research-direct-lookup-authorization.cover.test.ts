import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

// ---------------------------------------------------------------------------
// Cover for the Research Intake direct-object-lookup authorization change,
// driven against the real canister.
//
// The accepted behavior this file asserts:
//
//   1. An active Norwood Family Steward can read a research source and a
//      proposed finding by id (`getSource` / `getFinding` return the record).
//   2. An approved non-Steward family member is denied (traps).
//   3. A signed-in unapproved account is denied (traps).
//   4. An anonymous caller is denied (traps).
//
// The authorization uses the canonical Norwood Steward authority
// (`StewardAuthorityLib.isActiveSteward`), so the platform-admin role alone is
// not sufficient: ADMIN is registered as #admin but only becomes a Steward via
// the explicit `claimSteward` bootstrap.
//
// The frontend suite mocks the actor and has no principals, so these per-caller
// rules can only be asserted here, against the real canister.
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

// Deterministic identities. STEWARD is the first caller to
// _initialize_access_control (so it holds the platform admin role) and then
// claims the canonical Steward role. MEMBER is a signed-in account that becomes
// an APPROVED family member by claiming a seeded profile and having the Steward
// approve the claim. UNAPPROVED is a signed-in account that never holds an
// approved claim.
const stewardIdentity = createIdentity("direct-lookup-steward-seed");
const memberIdentity = createIdentity("direct-lookup-member-seed");
const unapprovedIdentity = createIdentity("direct-lookup-unapproved-seed");

type CanisterId = ReturnType<ReturnType<typeof createIdentity>["getPrincipal"]>;

/**
 * A fresh canister with STEWARD holding the canonical Steward role, MEMBER an
 * approved family member, and UNAPPROVED merely signed in. Returns the actor
 * plus the canister id so a caller can create an anonymous actor against the
 * same canister.
 */
async function setupRoles(): Promise<{ actor: _SERVICE; canisterId: CanisterId }> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  // STEWARD is the first caller (platform admin) and claims the canonical
  // Steward role. Steward authority is a separate, explicit bootstrap.
  actor.setIdentity(stewardIdentity);
  await actor._initialize_access_control();
  await actor.claimSteward();

  // MEMBER registers as a signed-in user, claims a seeded profile, and the
  // Steward approves the claim, making MEMBER an approved family member.
  actor.setIdentity(memberIdentity);
  await actor._initialize_access_control();
  const claim = (await actor.requestProfileClaim("clayton")) as {
    ok: { id: bigint };
  };
  actor.setIdentity(stewardIdentity);
  await actor.approveProfileClaim(claim.ok.id);

  // UNAPPROVED registers as a signed-in user but never claims a profile.
  actor.setIdentity(unapprovedIdentity);
  await actor._initialize_access_control();

  return { actor, canisterId: setup.canisterId };
}

/**
 * Seeds one source and one finding through the approved-member path, returning
 * their ids. The Steward reads them back in the allowed-path test.
 */
async function seedSourceAndFinding(
  actor: _SERVICE,
): Promise<{ sourceId: bigint; findingId: bigint }> {
  actor.setIdentity(memberIdentity);
  const sourceCreated = await actor.createSource(
    "1900 census, Norwood household",
    { CensusCitation: null },
    "Census record listing the Norwood family.",
    [],
  );
  const sourceId = (sourceCreated as { ok: { id: bigint } }).ok.id;
  const findingCreated = await actor.createFinding(
    "Birth date of Julia Norwood",
    { Documented: null },
    { PersonFact: null },
    {
      PersonFact: {
        field: "birthDate",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId,
    ["julia"],
    [],
  );
  const findingId = (findingCreated as { ok: { id: bigint } }).ok.id;
  return { sourceId, findingId };
}

it("lets an active Steward read a research source and a proposed finding by id", async () => {
  const { actor } = await setupRoles();
  const { sourceId, findingId } = await seedSourceAndFinding(actor);

  actor.setIdentity(stewardIdentity);
  const source = await actor.getSource(sourceId);
  expect(source).toEqual([
    expect.objectContaining({
      id: sourceId,
      title: "1900 census, Norwood household",
      status: { Pending: null },
    }),
  ]);

  const finding = await actor.getFinding(findingId);
  expect(finding).toEqual([
    expect.objectContaining({
      id: findingId,
      title: "Birth date of Julia Norwood",
      status: { Pending: null },
    }),
  ]);
});

it("denies an approved non-Steward family member the direct lookups", async () => {
  const { actor } = await setupRoles();
  const { sourceId, findingId } = await seedSourceAndFinding(actor);

  // MEMBER is an approved family member but holds no Steward record.
  actor.setIdentity(memberIdentity);
  await expect(actor.getSource(sourceId)).rejects.toThrow();
  await expect(actor.getFinding(findingId)).rejects.toThrow();
});

it("denies a signed-in unapproved account the direct lookups", async () => {
  const { actor } = await setupRoles();
  const { sourceId, findingId } = await seedSourceAndFinding(actor);

  actor.setIdentity(unapprovedIdentity);
  await expect(actor.getSource(sourceId)).rejects.toThrow();
  await expect(actor.getFinding(findingId)).rejects.toThrow();
});

it("denies an anonymous caller the direct lookups", async () => {
  const { actor, canisterId } = await setupRoles();
  const { sourceId, findingId } = await seedSourceAndFinding(actor);

  // A fresh actor defaults to the anonymous caller.
  const anonymous = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(anonymous.getSource(sourceId)).rejects.toThrow();
  await expect(anonymous.getFinding(findingId)).rejects.toThrow();
});

it("preserves the Steward listSources and listFindings reads alongside the direct lookups", async () => {
  const { actor } = await setupRoles();
  const { sourceId, findingId } = await seedSourceAndFinding(actor);

  // The list reads are Steward-only and must keep working for the Steward.
  actor.setIdentity(stewardIdentity);
  const sources = await actor.listSources();
  expect(sources.map((s) => s.id)).toContain(sourceId);
  const findings = await actor.listFindings();
  expect(findings.map((f) => f.id)).toContain(findingId);

  // A non-Steward is still denied the list reads (unchanged behavior).
  actor.setIdentity(memberIdentity);
  await expect(actor.listSources()).rejects.toThrow();
  await expect(actor.listFindings()).rejects.toThrow();
});
