import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1C-B1 — family-scoped Archive logic (behavioral static cover).
//
// The canonical family-scoped Archive functions in `lib/archive.mo` and the
// family-scoped pending count in `lib/pending-count.mo` are internal Motoko
// library functions. The public `*ForFamily` endpoints are driven against the
// real canister by the sibling `archive-family-isolation.cover.test.ts`, but
// one accepted rule cannot be reached through the public API at all: there is
// no endpoint that creates a Steward of a non-default family (`claimSteward`
// and `promoteToSteward` both write `familyId = "norwood"`), so "a Steward of
// Family A cannot approve or reject a Family B item" can only be exercised
// against the predicate itself.
//
// This file reads the real Motoko sources, extracts each function's body, and
// evaluates the family-boundary predicates against test-only Family A / Family
// B fixtures. The evaluator is deliberately narrow: it understands the exact
// expression forms these bodies use and throws on anything else, so a refactor
// that changes a predicate's logic fails here and a refactor that changes its
// syntax fails loudly instead of passing vacuously.
//
// The default-family compatibility of the public API is covered by the PocketIC
// lane, which drives the real canister.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "src", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const archiveLib = stripComments(readBackend(path.join("lib", "archive.mo")));
const pendingCountLib = stripComments(readBackend(path.join("lib", "pending-count.mo")));

/** The body of a named `public func`, from its signature to the closing `};`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found`);
  }
  return source.slice(start, end);
}

// ---------------------------------------------------------------------------
// Fixtures. Test-only family identifiers and principals; nothing is persisted.
// ---------------------------------------------------------------------------

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const ALICE = "alice-principal";
const BOB = "bob-principal";

interface ArchiveItem {
  familyId: string;
  id: bigint;
  title: string;
  status: { tag: string };
  privacyLevel: { tag: string };
  contributor: string;
  tags: string[];
  itemType: { tag: string };
  relatedMemberIds: string[];
  era: string;
}

function item(overrides: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    familyId: FAMILY_A,
    id: 1n,
    title: "A family letter",
    status: { tag: "Pending" },
    privacyLevel: { tag: "FamilyOnly" },
    contributor: ALICE,
    tags: ["letters"],
    itemType: { tag: "Document" },
    relatedMemberIds: [],
    era: "1924",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A tiny evaluator for the predicate forms the family-scoped functions use.
// ---------------------------------------------------------------------------

type Scalar = string | bigint | boolean | { tag: string };

interface Scope {
  /** Bound lambda variable name -> record. */
  record?: { name: string; value: Record<string, Scalar> };
  /** Free identifiers (familyId, caller, id, isAdmin, isApprovedFamilyMember, ...). */
  vars: Record<string, Scalar>;
  /** Set-valued identifiers for `.contains(...)` (linkedIds). */
  sets: Record<string, Set<bigint>>;
}

function resolveField(token: string, scope: Scope): Scalar {
  const trimmed = token.trim();
  const fieldMatch = /^(\w+)\.(\w+)$/u.exec(trimmed);
  if (fieldMatch !== null) {
    const [, variable, field] = fieldMatch;
    if (scope.record === undefined || scope.record.name !== variable) {
      throw new Error(`unresolved record variable in predicate: ${variable}`);
    }
    if (!Object.prototype.hasOwnProperty.call(scope.record.value, field)) {
      throw new Error(`unresolved field in predicate: ${variable}.${field}`);
    }
    return scope.record.value[field];
  }
  if (trimmed.startsWith("#")) {
    const tag = trimmed.slice(1);
    if (!/^\w+$/u.test(tag)) {
      throw new Error(`unrecognized predicate clause: ${trimmed}`);
    }
    return { tag };
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (/^\d+n$/u.test(trimmed)) {
    return BigInt(trimmed.slice(0, -1));
  }
  if (Object.prototype.hasOwnProperty.call(scope.vars, trimmed)) {
    return scope.vars[trimmed];
  }
  throw new Error(`unresolved operand in predicate: ${trimmed}`);
}

function scalarsEqual(left: Scalar, right: Scalar): boolean {
  if (typeof left === "bigint" || typeof right === "bigint") {
    return left === right;
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return left === right;
  }
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  return left.tag === right.tag;
}

/**
 * Evaluates one clause of an `and`-chain. Handles the three forms the real
 * bodies use: a comparison, a `not <set>.contains(<field>)`, and a call to one
 * of the family predicates.
 */
function evaluateClause(clause: string, scope: Scope): boolean {
  const trimmed = clause.trim();

  const notContains = /^not\s+(\w+)\.contains\((.+)\)$/u.exec(trimmed);
  if (notContains !== null) {
    const [, setName, argument] = notContains;
    const set = scope.sets[setName];
    if (set === undefined) {
      throw new Error(`unresolved set in predicate: ${setName}`);
    }
    const value = resolveField(argument, scope);
    if (typeof value !== "bigint") {
      throw new Error(`set membership requires a bigint id, got ${String(value)}`);
    }
    return !set.has(value);
  }

  const call = /^(\w+)\((.+)\)$/u.exec(trimmed);
  if (call !== null) {
    const [, name, rawArgs] = call;
    const args = rawArgs.split(",").map((a) => a.trim());
    if (name === "belongsToFamily") {
      const [itemArg, familyArg] = args;
      // `belongsToFamily(it, familyId)` takes the bound record itself as its
      // first argument, not a field access.
      if (scope.record === undefined || scope.record.name !== itemArg) {
        throw new Error(`unresolved record argument: ${itemArg}`);
      }
      const familyId = resolveField(familyArg, scope);
      return scope.record.value.familyId === familyId;
    }
    if (name === "isVisibleForFamily") {
      const [itemArg, familyArg, callerArg, adminArg, memberArg] = args;
      if (scope.record === undefined || scope.record.name !== itemArg) {
        throw new Error(`unresolved record argument: ${itemArg}`);
      }
      const familyId = resolveField(familyArg, scope);
      if (scope.record.value.familyId !== familyId) {
        return false;
      }
      const caller = resolveField(callerArg, scope);
      const isAdmin = resolveField(adminArg, scope);
      const isApprovedFamilyMember = resolveField(memberArg, scope);
      const privacy = scope.record.value.privacyLevel;
      if (typeof privacy !== "object" || !("tag" in privacy)) {
        throw new Error("privacyLevel is not a variant");
      }
      switch (privacy.tag) {
        case "Public":
          return true;
        case "FamilyOnly":
          return isAdmin === true || isApprovedFamilyMember === true;
        case "Private":
          return isAdmin === true || scope.record.value.contributor === caller;
        default:
          throw new Error(`unknown privacy level: ${privacy.tag}`);
      }
    }
    throw new Error(`unrecognized predicate call: ${name}`);
  }

  const comparison = /^(.+?)\s*(==|!=)\s*(.+)$/u.exec(trimmed);
  if (comparison === null) {
    throw new Error(`unrecognized predicate clause: ${clause}`);
  }
  const [, rawLeft, operator, rawRight] = comparison;
  const left = resolveField(rawLeft, scope);
  const right = resolveField(rawRight, scope);
  const equal = scalarsEqual(left, right);
  return operator === "==" ? equal : !equal;
}

function evaluateAndChain(expression: string, scope: Scope): boolean {
  return expression
    .split(/\s+and\s+/u)
    .every((clause) => evaluateClause(clause, scope));
}

/**
 * Extracts the predicate of a `items.toArray().filter(func it = <predicate>)`
 * or `items.find(func it = <predicate>)` call and evaluates it per item.
 */
function extractItemPredicate(body: string, method: "filter" | "find"): string {
  // `filter` is called on `items.toArray()`; `find` is called on `items`
  // directly. Both take a `func it = <predicate>` lambda. The lambda is
  // extracted by balancing parentheses from the call's opening `(` rather than
  // by a regex, because the predicate itself contains nested calls
  // (`belongsToFamily(it, familyId)`, `linkedIds.contains(it.id)`) and the
  // enclosing `switch` adds another `)`, so no fixed terminator is correct for
  // every function.
  const callPattern = new RegExp(
    `items(?:\\.toArray\\(\\))?\\.${method}\\(\\s*func it =`,
    "u",
  );
  const call = callPattern.exec(body);
  if (call === null) {
    throw new Error(`no items.${method}(func it = ...) found`);
  }
  const start = call.index + call[0].length;
  let depth = 1;
  for (let index = start; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return body.slice(start, index);
      }
    }
  }
  throw new Error(`unbalanced parentheses in items.${method}(...)`);
}

function filterItems(
  body: string,
  items: ArchiveItem[],
  scope: Scope,
): ArchiveItem[] {
  const predicate = extractItemPredicate(body, "filter");
  return items.filter((value) =>
    evaluateAndChain(predicate, { ...scope, record: { name: "it", value: value as unknown as Record<string, Scalar> } }),
  );
}

function findItem(
  body: string,
  items: ArchiveItem[],
  scope: Scope,
): ArchiveItem | null {
  const predicate = extractItemPredicate(body, "find");
  for (const value of items) {
    if (
      evaluateAndChain(predicate, {
        ...scope,
        record: { name: "it", value: value as unknown as Record<string, Scalar> },
      })
    ) {
      return value;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// belongsToFamily — the single family-boundary predicate.
// ---------------------------------------------------------------------------

describe("belongsToFamily (executed predicate)", () => {
  const body = functionBody(archiveLib, "belongsToFamily");

  function belongsToFamily(value: ArchiveItem, familyId: string): boolean {
    const expression = /item\.familyId\s*==\s*familyId/u.test(body);
    if (!expression) {
      throw new Error("belongsToFamily no longer compares item.familyId to familyId");
    }
    return value.familyId === familyId;
  }

  it("is true only for the item's own family", () => {
    const value = item({ familyId: FAMILY_A });
    expect(belongsToFamily(value, FAMILY_A)).toBe(true);
    expect(belongsToFamily(value, FAMILY_B)).toBe(false);
    expect(belongsToFamily(value, NORWOOD)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getForFamily — an id lookup never crosses the boundary.
// ---------------------------------------------------------------------------

describe("getForFamily (executed predicate)", () => {
  const body = functionBody(archiveLib, "getForFamily");

  function getForFamily(
    items: ArchiveItem[],
    familyId: string,
    id: bigint,
  ): ArchiveItem | null {
    return findItem(body, items, { vars: { familyId, id }, sets: {} });
  }

  it("returns the item when it belongs to the requested family", () => {
    const items = [item({ id: 5n, familyId: FAMILY_A })];
    expect(getForFamily(items, FAMILY_A, 5n)?.id).toBe(5n);
  });

  it("returns null for the same id under another family", () => {
    const items = [item({ id: 5n, familyId: FAMILY_A })];
    expect(getForFamily(items, FAMILY_B, 5n)).toBeNull();
    expect(getForFamily(items, NORWOOD, 5n)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(getForFamily([item({ id: 5n })], FAMILY_A, 99n)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPendingForFamily — pending items are family-scoped and Research-linked
// items are excluded.
// ---------------------------------------------------------------------------

describe("listPendingForFamily (executed predicate)", () => {
  const body = functionBody(archiveLib, "listPendingForFamily");

  function listPendingForFamily(
    items: ArchiveItem[],
    familyId: string,
    linkedIds: bigint[],
  ): ArchiveItem[] {
    return filterItems(body, items, {
      vars: { familyId },
      sets: { linkedIds: new Set(linkedIds) },
    });
  }

  it("returns only pending items of the requested family", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_A, status: { tag: "Pending" } }),
      item({ id: 2n, familyId: FAMILY_B, status: { tag: "Pending" } }),
      item({ id: 3n, familyId: FAMILY_A, status: { tag: "Approved" } }),
    ];
    expect(listPendingForFamily(items, FAMILY_A, []).map((i) => i.id)).toEqual([1n]);
    expect(listPendingForFamily(items, FAMILY_B, []).map((i) => i.id)).toEqual([2n]);
  });

  it("excludes a pending item whose id is Research-linked", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_A, status: { tag: "Pending" } }),
      item({ id: 2n, familyId: FAMILY_A, status: { tag: "Pending" } }),
    ];
    expect(listPendingForFamily(items, FAMILY_A, [1n]).map((i) => i.id)).toEqual([2n]);
  });

  it("never returns a pending item from another family", () => {
    const items = [item({ id: 7n, familyId: FAMILY_B, status: { tag: "Pending" } })];
    expect(listPendingForFamily(items, FAMILY_A, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listApprovedForFamily — approved items are family-scoped and privacy-gated.
// ---------------------------------------------------------------------------

describe("listApprovedForFamily (executed predicate)", () => {
  const body = functionBody(archiveLib, "listApprovedForFamily");

  function listApprovedForFamily(
    items: ArchiveItem[],
    familyId: string,
    caller: string,
    isAdmin: boolean,
    isApprovedFamilyMember: boolean,
  ): ArchiveItem[] {
    return filterItems(body, items, {
      vars: { familyId, caller, isAdmin, isApprovedFamilyMember },
      sets: {},
    });
  }

  it("returns approved items of the family visible to an approved member", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_A, status: { tag: "Approved" }, privacyLevel: { tag: "FamilyOnly" } }),
      item({ id: 2n, familyId: FAMILY_A, status: { tag: "Pending" } }),
    ];
    expect(
      listApprovedForFamily(items, FAMILY_A, ALICE, false, true).map((i) => i.id),
    ).toEqual([1n]);
  });

  it("never returns an approved item from another family", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_B, status: { tag: "Approved" }, privacyLevel: { tag: "Public" } }),
    ];
    expect(listApprovedForFamily(items, FAMILY_A, ALICE, false, true)).toEqual([]);
  });

  it("hides a FamilyOnly item from a non-member and a Private item from a non-contributor", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_A, status: { tag: "Approved" }, privacyLevel: { tag: "FamilyOnly" } }),
      item({ id: 2n, familyId: FAMILY_A, status: { tag: "Approved" }, privacyLevel: { tag: "Private" }, contributor: BOB }),
    ];
    // A non-member sees neither.
    expect(listApprovedForFamily(items, FAMILY_A, ALICE, false, false)).toEqual([]);
    // The contributor sees their own Private item.
    expect(
      listApprovedForFamily(items, FAMILY_A, BOB, false, false).map((i) => i.id),
    ).toEqual([2n]);
  });
});

// ---------------------------------------------------------------------------
// approveForFamily / rejectForFamily — a Steward of another family cannot
// review the item, and the item is never found across the boundary.
// ---------------------------------------------------------------------------

describe("approveForFamily / rejectForFamily (executed predicate)", () => {
  const approveBody = functionBody(archiveLib, "approveForFamily");
  const rejectBody = functionBody(archiveLib, "rejectForFamily");

  function review(
    body: string,
    items: ArchiveItem[],
    familyId: string,
    id: bigint,
  ): ArchiveItem | null {
    return findItem(body, items, { vars: { familyId, id }, sets: {} });
  }

  it("finds a pending item only under its own family", () => {
    const items = [item({ id: 3n, familyId: FAMILY_A, status: { tag: "Pending" } })];
    expect(review(approveBody, items, FAMILY_A, 3n)?.id).toBe(3n);
    // The same id under Family B resolves to nothing, so a Steward of B can
    // never approve or reject a Family A item.
    expect(review(approveBody, items, FAMILY_B, 3n)).toBeNull();
    expect(review(rejectBody, items, FAMILY_B, 3n)).toBeNull();
  });

  it("does not find an already-reviewed item", () => {
    const items = [item({ id: 3n, familyId: FAMILY_A, status: { tag: "Approved" } })];
    expect(review(approveBody, items, FAMILY_A, 3n)).toBeNull();
    expect(review(rejectBody, items, FAMILY_A, 3n)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// countPendingForFamily — the pending count is family-scoped.
// ---------------------------------------------------------------------------

describe("countPendingForFamily (executed predicate)", () => {
  const body = functionBody(pendingCountLib, "countPendingForFamily");

  /**
   * Mirrors the real body's archive loop: it counts an item only when
   * `a.familyId == familyId and a.status == #Pending and not linkedIds.contains(a.id)`.
   * The non-archive loops (recipes, stories, mysteries) are not family-scoped
   * yet and are asserted separately below.
   */
  function countArchive(
    items: ArchiveItem[],
    familyId: string,
    linkedIds: bigint[],
  ): number {
    const loop = /for \(a in archiveItems\.toArray\(\)\.values\(\)\) \{([\s\S]*?)\n    \};/u.exec(body);
    if (loop === null) {
      throw new Error("countPendingForFamily no longer has an archiveItems loop");
    }
    const condition = /if \(([\s\S]*?)\) \{/u.exec(loop[1]);
    if (condition === null) {
      throw new Error("countPendingForFamily archive loop has no condition");
    }
    const linked = new Set(linkedIds);
    return items.filter((value) =>
      evaluateAndChain(condition[1], {
        vars: { familyId },
        sets: { linkedIds: linked },
        record: { name: "a", value: value as unknown as Record<string, Scalar> },
      }),
    ).length;
  }

  it("counts only pending items of the requested family", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_A, status: { tag: "Pending" } }),
      item({ id: 2n, familyId: FAMILY_B, status: { tag: "Pending" } }),
      item({ id: 3n, familyId: FAMILY_A, status: { tag: "Approved" } }),
    ];
    expect(countArchive(items, FAMILY_A, [])).toBe(1);
    expect(countArchive(items, FAMILY_B, [])).toBe(1);
    expect(countArchive(items, NORWOOD, [])).toBe(0);
  });

  it("excludes a Research-linked pending item", () => {
    const items = [
      item({ id: 1n, familyId: FAMILY_A, status: { tag: "Pending" } }),
      item({ id: 2n, familyId: FAMILY_A, status: { tag: "Pending" } }),
    ];
    expect(countArchive(items, FAMILY_A, [1n])).toBe(1);
  });

  it("scopes the recipe loop to the family and keeps stories and mystery contributions family-agnostic", () => {
    // Tenancy 1C-D1 family-scoped Recipes: the recipe loop now consults
    // familyId, so a pending Family A recipe never inflates Family B's count.
    // Stories and mystery contributions are still not family-scoped; their loops
    // must not consult familyId, or the count would silently drop them for every
    // non-default family.
    const recipeLoop = /for \(r in recipes\.toArray\(\)\.values\(\)\) \{([\s\S]*?)\n    \};/u.exec(body);
    const storyLoop = /for \(s in stories\.toArray\(\)\.values\(\)\) \{([\s\S]*?)\n    \};/u.exec(body);
    const mysteryLoop = /for \(m in mysteryContributions\.toArray\(\)\.values\(\)\) \{([\s\S]*?)\n    \};/u.exec(body);
    expect(recipeLoop?.[1]).toContain("r.status == #Pending");
    expect(recipeLoop?.[1]).toContain("r.familyId == familyId");
    expect(storyLoop?.[1]).toContain("s.status == #Pending");
    expect(storyLoop?.[1]).not.toContain("familyId");
    expect(mysteryLoop?.[1]).toContain("m.status == #Pending");
    expect(mysteryLoop?.[1]).not.toContain("familyId");
  });

  it("counts only pending recipes of the requested family", () => {
    // The recipe loop's family conjunct is evaluated against test-only Family A
    // / Family B fixtures, so a pending recipe in another family is excluded.
    const loop = /for \(r in recipes\.toArray\(\)\.values\(\)\) \{([\s\S]*?)\n    \};/u.exec(body);
    if (loop === null) {
      throw new Error("countPendingForFamily no longer has a recipes loop");
    }
    const condition = /if \(([\s\S]*?)\) \{/u.exec(loop[1]);
    if (condition === null) {
      throw new Error("countPendingForFamily recipes loop has no condition");
    }
    const recipes = [
      { familyId: FAMILY_A, status: { tag: "Pending" } },
      { familyId: FAMILY_B, status: { tag: "Pending" } },
      { familyId: FAMILY_A, status: { tag: "Approved" } },
    ];
    const count = (familyId: string): number =>
      recipes.filter((value) =>
        evaluateAndChain(condition[1], {
          vars: { familyId },
          sets: {},
          record: { name: "r", value: value as unknown as Record<string, Scalar> },
        }),
      ).length;
    expect(count(FAMILY_A)).toBe(1);
    expect(count(FAMILY_B)).toBe(1);
    expect(count(NORWOOD)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Interpreter self-check: the behavioral tests must be able to fail.
// ---------------------------------------------------------------------------

describe("behavioral evaluator is not vacuous", () => {
  it("throws when the expected filter scan is absent", () => {
    expect(() => extractItemPredicate("items.map(func it = true);", "filter")).toThrow(
      /no items\.filter/u,
    );
  });

  it("throws rather than silently accepting an or-joined predicate", () => {
    expect(() =>
      evaluateAndChain("it.status == #Pending or it.familyId == familyId", {
        vars: { familyId: FAMILY_A },
        sets: {},
        record: { name: "it", value: item() as unknown as Record<string, Scalar> },
      }),
    ).toThrow();
  });

  it("changes its answer when the family conjunct is removed from the real predicate", () => {
    const body = functionBody(archiveLib, "listPendingForFamily");
    const predicate = extractItemPredicate(body, "filter");
    const items = [item({ id: 1n, familyId: FAMILY_A, status: { tag: "Pending" } })];
    const scope = { vars: { familyId: FAMILY_B }, sets: { linkedIds: new Set<bigint>() } };

    // The real predicate denies the Family A item under Family B.
    expect(
      evaluateAndChain(predicate, {
        ...scope,
        record: { name: "it", value: items[0] as unknown as Record<string, Scalar> },
      }),
    ).toBe(false);

    // Dropping the family conjunct would wrongly allow it, which is exactly the
    // regression the real assertion catches.
    const mutated = predicate.replace("belongsToFamily(it, familyId) and ", "");
    expect(mutated).not.toBe(predicate);
    expect(
      evaluateAndChain(mutated, {
        ...scope,
        record: { name: "it", value: items[0] as unknown as Record<string, Scalar> },
      }),
    ).toBe(true);
  });
});
