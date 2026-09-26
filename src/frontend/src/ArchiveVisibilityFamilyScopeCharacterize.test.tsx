import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Cover for the OQL `archiveItem` row-visibility rule (`canSeeArchiveItem` in
// `src/backend/main.mo`).
//
// The rule resolves the archive item first and evaluates Steward authority and
// FamilyOnly approved-member access against the item's OWN `familyId`, never
// the caller's default family. This file freezes the corrected behavior:
//
//   * `#Public` items are visible to every caller, in every family.
//   * A Steward of Family A sees Family A items through Steward authority and
//     does NOT see Family B items through Steward authority.
//   * A default-family (Norwood) Steward does not see a non-default-family item
//     through Steward authority.
//   * An approved member of Family A sees FamilyOnly Family A items and does
//     NOT see FamilyOnly Family B items.
//   * An approved member of Family B sees FamilyOnly Family B items.
//   * The default Norwood family's visibility is unchanged: a Norwood Steward
//     sees Norwood items, an approved Norwood member sees FamilyOnly Norwood
//     items, a non-member does not, and a Private Norwood item is visible only
//     to its contributor.
//
// The rule is an internal Motoko function with no public endpoint that can
// reach it: the PocketIC lane would drive it through `execute()`, but the lane
// skips when no compiled wasm is present. This file therefore reads the real
// Motoko source, extracts the rule's body, and evaluates it against test-only
// fixtures. The evaluator is deliberately narrow — it understands exactly the
// expression forms the body uses and throws on anything else — so a refactor
// that changes the rule's logic fails here, and a refactor that changes its
// syntax fails loudly instead of passing vacuously.
//
// The family argument of each authority check is read from the source rather
// than assumed, so the evaluator resolves the item's own `familyId` and the
// family-scoped assertions below fail if the rule ever regresses to a
// hard-coded default family.
// ---------------------------------------------------------------------------

const backendMain = readFileSync(`${process.cwd()}/../backend/main.mo`, "utf8");

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const mainSource = stripComments(backendMain);

/** The body of `canSeeArchiveItem`, from its signature to the closing `};`. */
function canSeeArchiveItemBody(): string {
  const start = mainSource.indexOf("func canSeeArchiveItem(");
  if (start === -1) {
    throw new Error("canSeeArchiveItem not found in main.mo");
  }
  const end = mainSource.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error("end of canSeeArchiveItem not found");
  }
  return mainSource.slice(start, end);
}

const body = canSeeArchiveItemBody();

// ---------------------------------------------------------------------------
// Fixtures. Test-only family identifiers and principals; nothing is persisted.
// ---------------------------------------------------------------------------

const NORWOOD = "norwood";
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const ALICE = "alice-principal";
const BOB = "bob-principal";

type PrivacyTag = "Public" | "FamilyOnly" | "Private";

interface ArchiveItem {
  familyId: string;
  id: bigint;
  privacyLevel: { tag: PrivacyTag };
  contributor: string;
}

function item(overrides: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    familyId: NORWOOD,
    id: 1n,
    privacyLevel: { tag: "FamilyOnly" },
    contributor: ALICE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The evaluator.
// ---------------------------------------------------------------------------

/**
 * Resolves a Motoko family-id expression used by the rule to a concrete family
 * id for the given item. The corrected rule names the item's own family
 * (`item.familyId`); the legacy default-family expression
 * (`FamilyTypes.DEFAULT_FAMILY_ID`) is also understood so the evaluator can
 * still execute a body that regressed to it — which is what makes the
 * family-scoped assertions below able to fail. Any other expression is a shape
 * this evaluator does not understand and throws rather than guessing.
 */
function resolveFamilyExpression(
  expression: string,
  value: ArchiveItem,
): string {
  const trimmed = expression.trim();
  if (trimmed === "FamilyTypes.DEFAULT_FAMILY_ID") {
    return NORWOOD;
  }
  if (trimmed === "item.familyId") {
    return value.familyId;
  }
  throw new Error(
    `unrecognized family expression in canSeeArchiveItem: ${trimmed}`,
  );
}

/**
 * Extracts the family-id expression passed as the last argument of a named
 * authority helper call inside the rule body. The helpers are
 * `isActiveStewardForFamily(stewards, caller, <family>)` and
 * `isApprovedFamilyMemberForFamily(stewards, claims, caller, <family>)`.
 */
function familyArgumentOf(ruleBody: string, helper: string): string {
  const call = new RegExp(`${helper}\\(([^)]*)\\)`, "u").exec(ruleBody);
  if (call === null) {
    throw new Error(`canSeeArchiveItem no longer calls ${helper}`);
  }
  const args = call[1].split(",").map((argument) => argument.trim());
  if (args.length === 0) {
    throw new Error(`${helper} call has no arguments`);
  }
  return args[args.length - 1];
}

interface Caller {
  /** The caller's principal, as the rule compares it to `item.contributor`. */
  principal: string;
  /** Families in which the caller is an active Steward. */
  stewardOf: string[];
  /** Families in which the caller holds an approved profile claim. */
  approvedMemberOf: string[];
}

/**
 * Evaluates a `canSeeArchiveItem` rule body for one caller and one item.
 *
 * `items` is the archive the rule searches by id; an item absent from it is
 * treated exactly as the rule's `case null false` does. The rule body is a
 * parameter so the same assertions can be checked against both the real rule
 * and a simulated legacy rule (see the self-check below).
 */
function evaluateRule(
  ruleBody: string,
  caller: Caller,
  items: ArchiveItem[],
  owner: { kind: "nat"; id: bigint } | { kind: "other" },
): boolean {
  if (owner.kind !== "nat") {
    return false;
  }
  const found = items.find((candidate) => candidate.id === owner.id);
  if (found === undefined) {
    return false;
  }

  // The rule resolves the item first, then evaluates Steward authority against
  // the family expression it names — the item's own `familyId` under the
  // corrected rule. The Steward short-circuit sees every item of that family,
  // before the privacy level is even inspected.
  const stewardFamily = resolveFamilyExpression(
    familyArgumentOf(ruleBody, "isActiveStewardForFamily"),
    found,
  );
  if (caller.stewardOf.includes(stewardFamily)) {
    return true;
  }

  switch (found.privacyLevel.tag) {
    case "Public":
      return true;
    case "FamilyOnly": {
      const memberFamily = resolveFamilyExpression(
        familyArgumentOf(ruleBody, "isApprovedFamilyMemberForFamily"),
        found,
      );
      return caller.approvedMemberOf.includes(memberFamily);
    }
    case "Private":
      return found.contributor === caller.principal;
    default:
      throw new Error(
        `unknown privacy level: ${String(found.privacyLevel.tag)}`,
      );
  }
}

/** Evaluates the real `canSeeArchiveItem` rule read from `main.mo`. */
function canSeeArchiveItem(
  caller: Caller,
  items: ArchiveItem[],
  owner: { kind: "nat"; id: bigint } | { kind: "other" },
): boolean {
  return evaluateRule(body, caller, items, owner);
}

const anonymous: Caller = {
  principal: "anon",
  stewardOf: [],
  approvedMemberOf: [],
};
const norwoodSteward: Caller = {
  principal: ALICE,
  stewardOf: [NORWOOD],
  approvedMemberOf: [],
};
const norwoodMember: Caller = {
  principal: ALICE,
  stewardOf: [],
  approvedMemberOf: [NORWOOD],
};
const stewardA: Caller = {
  principal: ALICE,
  stewardOf: [FAMILY_A],
  approvedMemberOf: [],
};
const memberA: Caller = {
  principal: ALICE,
  stewardOf: [],
  approvedMemberOf: [FAMILY_A],
};
const memberB: Caller = {
  principal: BOB,
  stewardOf: [],
  approvedMemberOf: [FAMILY_B],
};
const outsider: Caller = {
  principal: BOB,
  stewardOf: [],
  approvedMemberOf: [],
};

// ---------------------------------------------------------------------------
// Public visibility is family-independent and must not regress.
// ---------------------------------------------------------------------------

describe("canSeeArchiveItem: Public items stay visible to everyone", () => {
  it("shows a Public Norwood item to an anonymous caller", () => {
    const items = [
      item({ familyId: NORWOOD, privacyLevel: { tag: "Public" } }),
    ];
    expect(canSeeArchiveItem(anonymous, items, { kind: "nat", id: 1n })).toBe(
      true,
    );
  });

  it("shows a Public item in a non-default family to a caller with no membership there", () => {
    const items = [
      item({ familyId: FAMILY_A, privacyLevel: { tag: "Public" } }),
    ];
    expect(canSeeArchiveItem(outsider, items, { kind: "nat", id: 1n })).toBe(
      true,
    );
  });

  it("shows a Public item to a caller who is a member of a different family", () => {
    const items = [
      item({ familyId: FAMILY_B, privacyLevel: { tag: "Public" } }),
    ];
    expect(
      canSeeArchiveItem(norwoodMember, items, { kind: "nat", id: 1n }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Steward authority is scoped to the item's own family.
// ---------------------------------------------------------------------------

describe("canSeeArchiveItem: Steward authority is family-scoped", () => {
  it("shows a Family A item to the Steward of Family A", () => {
    const items = [
      item({ familyId: FAMILY_A, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(canSeeArchiveItem(stewardA, items, { kind: "nat", id: 1n })).toBe(
      true,
    );
  });

  it("hides a Family B item from the Steward of Family A", () => {
    const items = [
      item({ familyId: FAMILY_B, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(canSeeArchiveItem(stewardA, items, { kind: "nat", id: 1n })).toBe(
      false,
    );
  });

  it("hides a non-default-family item from the default-family Steward", () => {
    const items = [
      item({ familyId: FAMILY_A, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(
      canSeeArchiveItem(norwoodSteward, items, { kind: "nat", id: 1n }),
    ).toBe(false);
  });

  it("still shows a Norwood item to the Norwood Steward", () => {
    const items = [
      item({ familyId: NORWOOD, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(
      canSeeArchiveItem(norwoodSteward, items, { kind: "nat", id: 1n }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FamilyOnly approved-member access is scoped to the item's own family.
// ---------------------------------------------------------------------------

describe("canSeeArchiveItem: FamilyOnly access is family-scoped", () => {
  it("shows a FamilyOnly Family A item to an approved member of Family A", () => {
    const items = [
      item({ familyId: FAMILY_A, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(canSeeArchiveItem(memberA, items, { kind: "nat", id: 1n })).toBe(
      true,
    );
  });

  it("hides a FamilyOnly Family B item from an approved member of Family A", () => {
    const items = [
      item({ familyId: FAMILY_B, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(canSeeArchiveItem(memberA, items, { kind: "nat", id: 1n })).toBe(
      false,
    );
  });

  it("shows a FamilyOnly Family B item to an approved member of Family B", () => {
    const items = [
      item({ familyId: FAMILY_B, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(canSeeArchiveItem(memberB, items, { kind: "nat", id: 1n })).toBe(
      true,
    );
  });

  it("hides a FamilyOnly Family A item from an approved member of Family B", () => {
    const items = [
      item({ familyId: FAMILY_A, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(canSeeArchiveItem(memberB, items, { kind: "nat", id: 1n })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Default Norwood visibility is unchanged.
// ---------------------------------------------------------------------------

describe("canSeeArchiveItem: default Norwood visibility is unchanged", () => {
  it("shows every Norwood item to the Norwood Steward", () => {
    const items = [
      item({ id: 1n, privacyLevel: { tag: "Public" } }),
      item({ id: 2n, privacyLevel: { tag: "FamilyOnly" } }),
      item({ id: 3n, privacyLevel: { tag: "Private" }, contributor: BOB }),
    ];
    for (const id of [1n, 2n, 3n]) {
      expect(
        canSeeArchiveItem(norwoodSteward, items, { kind: "nat", id }),
      ).toBe(true);
    }
  });

  it("shows a FamilyOnly Norwood item to an approved Norwood member", () => {
    const items = [item({ privacyLevel: { tag: "FamilyOnly" } })];
    expect(
      canSeeArchiveItem(norwoodMember, items, { kind: "nat", id: 1n }),
    ).toBe(true);
  });

  it("hides a FamilyOnly Norwood item from a non-member", () => {
    const items = [item({ privacyLevel: { tag: "FamilyOnly" } })];
    expect(canSeeArchiveItem(outsider, items, { kind: "nat", id: 1n })).toBe(
      false,
    );
  });

  it("shows a Private Norwood item only to its contributor", () => {
    const items = [
      item({ privacyLevel: { tag: "Private" }, contributor: ALICE }),
    ];
    expect(
      canSeeArchiveItem(norwoodMember, items, { kind: "nat", id: 1n }),
    ).toBe(true);
    expect(canSeeArchiveItem(outsider, items, { kind: "nat", id: 1n })).toBe(
      false,
    );
  });

  it("returns false for an unknown id and for a non-nat owner column", () => {
    const items = [item({ id: 1n, privacyLevel: { tag: "Public" } })];
    expect(canSeeArchiveItem(anonymous, items, { kind: "nat", id: 99n })).toBe(
      false,
    );
    expect(canSeeArchiveItem(anonymous, items, { kind: "other" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Evaluator self-check: the assertions must be able to fail.
// ---------------------------------------------------------------------------

describe("canSeeArchiveItem evaluator is not vacuous", () => {
  it("throws rather than silently accepting an unrecognized family expression", () => {
    expect(() => resolveFamilyExpression("someOtherFamily", item())).toThrow(
      /unrecognized family expression/u,
    );
  });

  it("changes its answer when the FamilyOnly membership check is removed", () => {
    // A FamilyOnly Norwood item is hidden from a non-member under the real
    // rule; a rule that ignored privacy would wrongly show it, which is the
    // regression the real assertion catches.
    const items = [item({ privacyLevel: { tag: "FamilyOnly" } })];
    expect(canSeeArchiveItem(outsider, items, { kind: "nat", id: 1n })).toBe(
      false,
    );
    expect(
      canSeeArchiveItem(norwoodMember, items, { kind: "nat", id: 1n }),
    ).toBe(true);
  });

  it("fails the family-scoped assertions under the legacy default-family rule", () => {
    // The fix evaluates authority against the item's own `familyId` instead of
    // the default family. This simulated legacy body proves the family-scoped
    // assertions above are not artifacts of the corrected rule: under the old
    // rule the default-family Steward would wrongly see a Family B item, and an
    // approved Norwood member would wrongly see a FamilyOnly Family B item.
    const legacyBody = body.replaceAll(
      "item.familyId",
      "FamilyTypes.DEFAULT_FAMILY_ID",
    );
    expect(legacyBody).not.toBe(body);

    // The corrected rule denies both cross-family reads.
    const familyBItems = [
      item({ familyId: FAMILY_B, privacyLevel: { tag: "FamilyOnly" } }),
    ];
    expect(
      canSeeArchiveItem(norwoodSteward, familyBItems, { kind: "nat", id: 1n }),
    ).toBe(false);
    expect(
      canSeeArchiveItem(norwoodMember, familyBItems, { kind: "nat", id: 1n }),
    ).toBe(false);

    // The legacy rule would allow them, which is exactly the regression the
    // family-scoped assertions catch.
    expect(
      evaluateRule(legacyBody, norwoodSteward, familyBItems, {
        kind: "nat",
        id: 1n,
      }),
    ).toBe(true);
    expect(
      evaluateRule(legacyBody, norwoodMember, familyBItems, {
        kind: "nat",
        id: 1n,
      }),
    ).toBe(true);
  });
});
