import { PocketIc, createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";
import {
  BACKEND_WASM,
  adminIdentity,
  blob,
  contributorIdentity,
  registerApprovedContributor,
} from "./lane-helpers";

// ---------------------------------------------------------------------------
// Cover for the accepted "optional Era + Research/WorkBusiness/Other file
// uploads + family-membership-required message" change, driven against the real
// canister.
//
// The frontend suite mocks the actor, so the backend era rules, the item-type
// upload-surface mapping, and the per-caller authorization can only be asserted
// here. This file covers:
//
//   A. Era is optional: an empty or whitespace-only era is accepted and stored
//      as ""; a non-empty era is trimmed and stored; an era over 150 characters
//      is rejected and never silently truncated.
//   B. Research, WorkBusiness, and Other item types accept a PDF (document
//      surface); a JPEG on Document/Research is rejected, a Word document is
//      rejected, and SVG is rejected.
//   C. A signed-in but UNAPPROVED account is denied contribution: submitArchiveItem
//      traps with the family-membership-required message, and
//      createSourceWithUpload returns #err(#notAuthorized).
//
// The canister is seeded once per test: ADMIN is the first caller to
// _initialize_access_control and claims the Steward role; CONTRIBUTOR is an
// approved family member via an approved claim; UNAPPROVED is registered but
// never approved.
// ---------------------------------------------------------------------------

const PIC_URL = process.env.POCKET_IC_URL ?? "";

let pic: PocketIc | undefined;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
});

afterAll(async () => {
  await pic?.tearDown();
});

const unapprovedIdentity = createIdentity("era-membership-unapproved-seed");

// The stable, non-technical message the backend traps with for a signed-in but
// unapproved caller (family-authorization.mo: FAMILY_MEMBERSHIP_REQUIRED_MESSAGE).
// The frontend isFamilyMembershipDenial helper matches this marker, so the
// contribution pages can show the definitive membership message. Matched as a
// substring so the test does not depend on the exact wrapper text.
const MEMBERSHIP_MARKER =
  "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";

// A fresh canister with ADMIN as Steward, CONTRIBUTOR as an approved family
// member, and UNAPPROVED registered but never approved.
async function setupRoles(): Promise<{
  actor: _SERVICE;
  canisterId: ReturnType<typeof createIdentity>["getPrincipal"];
}> {
  const setup = await pic!.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM });
  const actor = setup.actor;

  await registerApprovedContributor(actor);

  actor.setIdentity(unapprovedIdentity);
  await actor._initialize_access_control();

  return { actor, canisterId: setup.canisterId };
}

// ---------------------------------------------------------------------------
// A. Optional Era rules.
// ---------------------------------------------------------------------------

it("accepts a blank era on submitArchiveItem and stores it as an empty string", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  const item = await actor.submitArchiveItem(
    "Blank era letter",
    "A letter with no era.",
    { Document: null },
    "application/pdf",
    blob,
    "",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "blank-era-letter.pdf",
  );
  expect(item).toMatchObject({ title: "Blank era letter", era: "" });

  // The stored item carries the empty era, not a rejection.
  actor.setIdentity(adminIdentity);
  const pending = await actor.listPendingArchiveItems();
  expect(pending.find((i) => i.id === item.id)?.era).toBe("");
});

it("accepts a whitespace-only era and normalizes it to an empty string", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  const item = await actor.submitArchiveItem(
    "Whitespace era letter",
    "A letter with a whitespace era.",
    { Document: null },
    "application/pdf",
    blob,
    "   ",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "whitespace-era-letter.pdf",
  );
  expect(item.era).toBe("");
});

it("trims a non-empty era within the limit and stores the trimmed value", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  const item = await actor.submitArchiveItem(
    "Trimmed era letter",
    "A letter with a padded era.",
    { Document: null },
    "application/pdf",
    blob,
    "  circa 1920s  ",
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "trimmed-era-letter.pdf",
  );
  expect(item.era).toBe("circa 1920s");
});

it("accepts an era of exactly 150 characters", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  const era = "e".repeat(150);
  const item = await actor.submitArchiveItem(
    "Max era letter",
    "A letter at the era ceiling.",
    { Document: null },
    "application/pdf",
    blob,
    era,
    [],
    [],
    [],
    [],
    { Original: null },
    { FamilyOnly: null },
    { Standard: null },
    [],
    "max-era-letter.pdf",
  );
  expect(item.era).toBe(era);
});

it("rejects an era over 150 characters instead of truncating it", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  // MAX_LOCATION_CHARS is 150; 151 characters must be rejected.
  const overlongEra = "e".repeat(151);
  await expect(
    actor.submitArchiveItem(
      "Overlong era letter",
      "A letter with an overlong era.",
      { Document: null },
      "application/pdf",
      blob,
      overlongEra,
      [],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "overlong-era-letter.pdf",
    ),
  ).rejects.toThrow(/era/i);

  // Nothing was stored: no pending item exists.
  actor.setIdentity(adminIdentity);
  await expect(actor.listPendingArchiveItems()).resolves.toEqual([]);
});

it("accepts a blank era on createSourceWithUpload and rejects an overlong era", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  // A blank era is accepted and the upload succeeds.
  const blank = await actor.createSourceWithUpload(
    "Blank era source",
    { CensusCitation: null },
    "A source with no era.",
    "application/pdf",
    blob,
    [],
    "",
    [],
    [],
    { FamilyOnly: null },
    { Standard: null },
    [],
    "blank-era-source.pdf",
  );
  expect(blank).toEqual({
    ok: expect.objectContaining({
      source: expect.objectContaining({ title: "Blank era source" }),
      archiveItem: expect.objectContaining({ era: "" }),
    }),
  });

  // An overlong era is rejected with a validation trap, not truncated.
  await expect(
    actor.createSourceWithUpload(
      "Overlong era source",
      { CensusCitation: null },
      "A source with an overlong era.",
      "application/pdf",
      blob,
      [],
      "e".repeat(151),
      [],
      [],
      { FamilyOnly: null },
      { Standard: null },
      [],
      "overlong-era-source.pdf",
    ),
  ).rejects.toThrow(/era must be at most 150 characters/i);
});

// ---------------------------------------------------------------------------
// B. Research / WorkBusiness / Other accept a PDF; other types stay rejected.
// ---------------------------------------------------------------------------

it("accepts a PDF for Research, WorkBusiness, and Other item types", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  for (const itemType of [
    { Research: null },
    { WorkBusiness: null },
    { Other: null },
  ] as const) {
    const item = await actor.submitArchiveItem(
      `Document for ${Object.keys(itemType)[0]}`,
      "A document-style contribution.",
      itemType,
      "application/pdf",
      blob,
      "",
      [],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      `document-${Object.keys(itemType)[0]}.pdf`,
    );
    expect(item.itemType).toEqual(itemType);
  }
});

it("rejects a JPEG on the Document and Research surfaces", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  for (const itemType of [{ Document: null }, { Research: null }] as const) {
    await expect(
      actor.submitArchiveItem(
        "JPEG on a document surface",
        "A JPEG where a document is required.",
        itemType,
        "image/jpeg",
        blob,
        "",
        [],
        [],
        [],
        [],
        { Original: null },
        { FamilyOnly: null },
        { Standard: null },
        [],
        "jpeg-on-document.jpg",
      ),
    ).rejects.toThrow(/unsupported file type/i);
  }
});

it("rejects a Word document and an SVG on the document surface", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(contributorIdentity);

  await expect(
    actor.submitArchiveItem(
      "Word document",
      "A Word document is not an allowed document type.",
      { Research: null },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      blob,
      "",
      [],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "word-document.docx",
    ),
  ).rejects.toThrow(/unsupported file type/i);

  await expect(
    actor.submitArchiveItem(
      "SVG document",
      "SVG is never permitted.",
      { Research: null },
      "image/svg+xml",
      blob,
      "",
      [],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "svg-document.svg",
    ),
  ).rejects.toThrow(/not permitted/i);
});

// ---------------------------------------------------------------------------
// C. A signed-in but unapproved account is denied contribution.
// ---------------------------------------------------------------------------

it("denies an unapproved account submitArchiveItem with the family-membership message", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(unapprovedIdentity);

  await expect(
    actor.submitArchiveItem(
      "Unapproved item",
      "An unapproved account must not contribute.",
      { Document: null },
      "application/pdf",
      blob,
      "",
      [],
      [],
      [],
      [],
      { Original: null },
      { FamilyOnly: null },
      { Standard: null },
      [],
      "unapproved-item.pdf",
    ),
  ).rejects.toThrow(new RegExp(MEMBERSHIP_MARKER, "i"));
});

it("denies an unapproved account createSourceWithUpload with #err(#notAuthorized)", async () => {
  const { actor } = await setupRoles();
  actor.setIdentity(unapprovedIdentity);

  await expect(
    actor.createSourceWithUpload(
      "Unapproved upload",
      { CensusCitation: null },
      "An unapproved account must not contribute.",
      "application/pdf",
      blob,
      [],
      "",
      [],
      [],
      { FamilyOnly: null },
      { Standard: null },
      [],
      "unapproved-upload.pdf",
    ),
  ).resolves.toEqual({ err: { notAuthorized: null } });
});
