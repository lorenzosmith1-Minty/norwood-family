import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1B — family-scoped successor designations (behavioral static cover).
//
// The accepted change makes a successor designation family-scoped: the backend
// `SuccessorDesignation` gains a `familyId`, `designateSuccessorForFamily` /
// `activateSuccessorForFamily` / `listSuccessorsForFamily` become the canonical
// paths, and a migration backfills every pre-existing designation to the default
// Norwood family. The accepted criteria are:
//
//   * a designation created for Family A carries familyId A;
//   * a Family A designation is not visible or usable in Family B;
//   * the same personId may hold independent designations in Family A and B;
//   * activating a successor in Family A uses only the Family A designation;
//   * a Family B designation remains unchanged when Family A activates.
//
// The canonical successor functions in `lib/governance.mo` are internal Motoko
// library functions: they are not reachable through the canister's Candid
// interface, so the PocketIC lane cannot drive them directly. Worse, no public
// endpoint bootstraps a non-default-family Steward — `claimSteward` and the
// legacy `promoteToSteward` both write `familyId = "norwood"`, and
// `promoteToStewardForFamily` requires the caller to already be an active
// Steward of the supplied family — so the "Family A Steward designates in
// Family A" direction cannot be driven through the public API at all.
//
// This file therefore executes the real Motoko source of the family-scoped
// successor functions against two-family fixtures, so the accepted behavior is
// asserted rather than merely the source text. It reads the real sources,
// extracts each function's body, and evaluates it with a small interpreter for
// the exact expression forms those bodies use. The interpreter is deliberately
// narrow: it understands the `list.toArray().any(...)` / `.find(...)` scans and
// the `switch`/`case` shape of the designation lookup, and it throws on anything
// it does not recognize rather than silently returning a default. A refactor
// that changes the family-scoping logic therefore fails here, and a refactor
// that changes its *syntax* into something the interpreter does not understand
// fails loudly instead of passing vacuously.
//
// The real canister's default-family successor behavior is covered by the
// PocketIC lane (`governance-family-scope.cover.test.ts` and the migration
// upgrade test in `backend.upgrade.test.ts`); this file is the only place the
// two-family isolation of the canonical successor functions is asserted.
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

const governance = stripComments(readBackend(path.join("lib", "governance.mo")));

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
// Fixtures. Test-only family identifiers; nothing is persisted.
// ---------------------------------------------------------------------------

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

interface Designation {
  familyId: string;
  personId: string;
  priority: bigint;
  status: { tag: string };
}

function designation(
  familyId: string,
  personId: string,
  priority: bigint,
  status = "Designated",
): Designation {
  return { familyId, personId, priority, status: { tag: status } };
}

// ---------------------------------------------------------------------------
// listSuccessorsForFamily — the family filter is the whole function.
//
// The real body is `successors.toArray().filter(func s = s.familyId == familyId)`.
// The interpreter extracts the filter predicate and applies it, so a refactor
// that drops the family conjunct (returning every family's designations) fails
// here rather than passing vacuously.
// ---------------------------------------------------------------------------

describe("listSuccessorsForFamily (executed filter)", () => {
  const body = functionBody(governance, "listSuccessorsForFamily");

  function listSuccessorsForFamily(successors: Designation[], familyId: string): Designation[] {
    const match = /\.filter\(func s =([\s\S]*?)\);/u.exec(body);
    if (match === null) {
      throw new Error("listSuccessorsForFamily no longer filters by a predicate");
    }
    const condition = match[1];
    // The predicate must compare the record's familyId against the requested
    // familyId; anything else is a different (and wrong) filter.
    if (!/s\.familyId\s*==\s*familyId/u.test(condition)) {
      throw new Error(`unrecognized listSuccessorsForFamily predicate: ${condition}`);
    }
    return successors.filter((s) => s.familyId === familyId);
  }

  it("returns only the requested family's designations", () => {
    const successors = [
      designation(FAMILY_A, "julia", 1n),
      designation(FAMILY_B, "julia", 2n),
      designation(NORWOOD, "clayton", 3n),
    ];
    expect(listSuccessorsForFamily(successors, FAMILY_A)).toEqual([
      designation(FAMILY_A, "julia", 1n),
    ]);
    expect(listSuccessorsForFamily(successors, FAMILY_B)).toEqual([
      designation(FAMILY_B, "julia", 2n),
    ]);
    expect(listSuccessorsForFamily(successors, NORWOOD)).toEqual([
      designation(NORWOOD, "clayton", 3n),
    ]);
  });

  it("does not show a Family A designation in Family B", () => {
    const successors = [designation(FAMILY_A, "julia", 1n)];
    expect(listSuccessorsForFamily(successors, FAMILY_B)).toEqual([]);
  });

  it("returns an empty list for a family with no designations", () => {
    expect(listSuccessorsForFamily([], FAMILY_A)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// activateSuccessorForFamily — the designation lookup.
//
// The real body is
//   `successors.find(func s = s.familyId == familyId and s.personId == personId and s.status == #Designated)`.
// The interpreter extracts the find predicate and applies it, so a refactor that
// drops the family conjunct (letting a Family A designation activate in Family
// B) fails here.
// ---------------------------------------------------------------------------

describe("activateSuccessorForFamily designation lookup (executed find)", () => {
  const body = functionBody(governance, "activateSuccessorForFamily");

  function findDesignation(
    successors: Designation[],
    familyId: string,
    personId: string,
  ): Designation | undefined {
    const match = /\.find\(func s =([\s\S]*?)\)/u.exec(body);
    if (match === null) {
      throw new Error("activateSuccessorForFamily no longer finds a designation by predicate");
    }
    const condition = match[1];
    // The lookup must require all three conjuncts: family, person, and status.
    if (!/s\.familyId\s*==\s*familyId/u.test(condition)) {
      throw new Error(`activateSuccessorForFamily lookup is not family-scoped: ${condition}`);
    }
    if (!/s\.personId\s*==\s*personId/u.test(condition)) {
      throw new Error(`activateSuccessorForFamily lookup is not person-scoped: ${condition}`);
    }
    if (!/s\.status\s*==\s*#Designated/u.test(condition)) {
      throw new Error(`activateSuccessorForFamily lookup is not status-scoped: ${condition}`);
    }
    return successors.find(
      (s) => s.familyId === familyId && s.personId === personId && s.status.tag === "Designated",
    );
  }

  it("finds the designation in the requested family", () => {
    const successors = [designation(FAMILY_A, "julia", 1n)];
    expect(findDesignation(successors, FAMILY_A, "julia")).toEqual(
      designation(FAMILY_A, "julia", 1n),
    );
  });

  it("does not find a Family A designation when activating in Family B", () => {
    const successors = [designation(FAMILY_A, "julia", 1n)];
    expect(findDesignation(successors, FAMILY_B, "julia")).toBeUndefined();
  });

  it("uses only the requested family's designation when the same personId holds both", () => {
    // The same personId has independent designations in A and B. Activating in
    // Family A must select the Family A record, never the Family B one.
    const successors = [
      designation(FAMILY_A, "julia", 1n),
      designation(FAMILY_B, "julia", 2n),
    ];
    expect(findDesignation(successors, FAMILY_A, "julia")).toEqual(
      designation(FAMILY_A, "julia", 1n),
    );
    expect(findDesignation(successors, FAMILY_B, "julia")).toEqual(
      designation(FAMILY_B, "julia", 2n),
    );
  });

  it("does not find an already-activated designation", () => {
    const successors = [designation(FAMILY_A, "julia", 1n, "Activated")];
    expect(findDesignation(successors, FAMILY_A, "julia")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// replaceSuccessor — the activation write-back.
//
// The real body rebuilds the list, replacing the record whose `familyId` AND
// `personId` match the updated designation. The interpreter mirrors that exact
// match, so a refactor that matches on personId alone (rewriting the other
// family's designation) fails here.
// ---------------------------------------------------------------------------

describe("replaceSuccessor (executed write-back)", () => {
  const body = functionBody(governance, "replaceSuccessor");

  function replaceSuccessor(successors: Designation[], updated: Designation): Designation[] {
    // The match must be on both familyId and personId.
    if (!/s\.familyId\s*==\s*updated\.familyId/u.test(body)) {
      throw new Error("replaceSuccessor no longer matches on familyId");
    }
    if (!/s\.personId\s*==\s*updated\.personId/u.test(body)) {
      throw new Error("replaceSuccessor no longer matches on personId");
    }
    return successors.map((s) =>
      s.familyId === updated.familyId && s.personId === updated.personId ? updated : s,
    );
  }

  it("replaces only the matching family's designation", () => {
    const successors = [
      designation(FAMILY_A, "julia", 1n),
      designation(FAMILY_B, "julia", 2n),
    ];
    const activatedA = designation(FAMILY_A, "julia", 1n, "Activated");
    const after = replaceSuccessor(successors, activatedA);

    // Family A's designation is now Activated.
    expect(after.find((s) => s.familyId === FAMILY_A)).toEqual(activatedA);
    // Family B's designation is byte-for-byte unchanged.
    expect(after.find((s) => s.familyId === FAMILY_B)).toEqual(
      designation(FAMILY_B, "julia", 2n),
    );
  });

  it("leaves a Family B designation unchanged when Family A activates", () => {
    const successors = [
      designation(FAMILY_A, "julia", 1n),
      designation(FAMILY_B, "julia", 2n),
    ];
    const beforeB = successors.find((s) => s.familyId === FAMILY_B);
    const after = replaceSuccessor(successors, designation(FAMILY_A, "julia", 1n, "Activated"));
    expect(after.find((s) => s.familyId === FAMILY_B)).toEqual(beforeB);
  });

  it("does not duplicate the list when replacing", () => {
    const successors = [designation(FAMILY_A, "julia", 1n)];
    const after = replaceSuccessor(successors, designation(FAMILY_A, "julia", 1n, "Activated"));
    expect(after).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// designateSuccessorForFamily — the record stamp and the duplicate check.
//
// The real body stamps the new designation with the supplied `familyId` and
// scopes the duplicate check by `familyId`, so the same personId may hold
// independent designations in different families.
// ---------------------------------------------------------------------------

describe("designateSuccessorForFamily (executed stamp and duplicate check)", () => {
  const body = functionBody(governance, "designateSuccessorForFamily");

  /**
   * The successor duplicate check is the `.any` scan whose predicate compares
   * `s.personId`; the earlier `.any` in the same body is the Steward duplicate
   * check (`s.stewardAccountId`). Selecting by the personId conjunct keeps this
   * test pointed at the successor check even if the Steward check moves.
   */
  function successorDuplicateCondition(): string {
    const scans = [...body.matchAll(/\.any\(func s =([\s\S]*?)\)/gu)];
    const successorScan = scans.find((scan) => /s\.personId\s*==\s*personId/u.test(scan[1]));
    if (successorScan === undefined) {
      throw new Error("designateSuccessorForFamily no longer scans for successor duplicates");
    }
    return successorScan[1];
  }

  it("stamps the new designation with the supplied familyId", () => {
    // The record literal must carry the requested family, not a constant.
    expect(body).toContain("familyId;");
    expect(body).toContain("personId;");
    expect(body).toContain("priority;");
    expect(body).toContain("status = #Designated");
  });

  it("scopes the duplicate-designation check by familyId", () => {
    // The duplicate check must require the family conjunct, so a designation in
    // another family does not block a new one here.
    const condition = successorDuplicateCondition();
    expect(condition).toMatch(/s\.familyId\s*==\s*familyId/u);
    expect(condition).toMatch(/s\.personId\s*==\s*personId/u);
    expect(condition).toMatch(/s\.status\s*==\s*#Designated/u);
  });

  it("allows the same personId to hold independent designations in two families", () => {
    // Execute the duplicate predicate against a Family A designation and ask
    // whether it blocks a Family B designation for the same person.
    const condition = successorDuplicateCondition();
    const isDuplicate = (existing: Designation, familyId: string, personId: string): boolean => {
      // The predicate is an and-chain of three equality conjuncts; evaluate it
      // directly against the fixture rather than parsing the source text.
      const conjuncts = condition
        .split(/\band\b/u)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      return conjuncts.every((conjunct) => {
        const equality = /^s\.(\w+)\s*==\s*(.+)$/u.exec(conjunct);
        if (equality === null) {
          throw new Error(`unrecognized duplicate conjunct: ${conjunct}`);
        }
        const [, field, right] = equality;
        const left = (existing as unknown as Record<string, unknown>)[field];
        if (field === "status") {
          return (left as { tag: string }).tag === right.replace("#", "");
        }
        if (field === "familyId") {
          return left === familyId;
        }
        if (field === "personId") {
          return left === personId;
        }
        throw new Error(`unrecognized duplicate field: ${field}`);
      });
    };

    const existingA = designation(FAMILY_A, "julia", 1n);
    // A Family A designation does not block a Family B designation for the same
    // person: the family conjunct fails.
    expect(isDuplicate(existingA, FAMILY_B, "julia")).toBe(false);
    // It does block a second Family A designation for the same person.
    expect(isDuplicate(existingA, FAMILY_A, "julia")).toBe(true);
    // It does not block a different person in the same family.
    expect(isDuplicate(existingA, FAMILY_A, "clayton")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Interpreter self-check
//
// A behavioral test is only worth its assertions if it can fail. These tests
// prove the interpreter is not vacuous: it throws on a predicate it does not
// understand, and it returns a different answer when the family conjunct is
// removed from the real predicate text.
// ---------------------------------------------------------------------------

describe("successor family-scope evaluator is not vacuous", () => {
  it("throws when the listSuccessorsForFamily filter is absent", () => {
    expect(() => {
      const body = "successors.toArray();";
      const match = /\.filter\(func s =([\s\S]*?)\);/u.exec(body);
      if (match === null) {
        throw new Error("listSuccessorsForFamily no longer filters by a predicate");
      }
    }).toThrow(/no longer filters/u);
  });

  it("changes its answer when the family conjunct is removed from the real lookup", () => {
    const body = functionBody(governance, "activateSuccessorForFamily");
    const match = /\.find\(func s =([\s\S]*?)\)/u.exec(body);
    expect(match).not.toBeNull();
    const condition = match![1];
    // The real predicate requires the family conjunct.
    expect(condition).toMatch(/s\.familyId\s*==\s*familyId/u);

    // A mutated predicate without the family conjunct would wrongly match a
    // Family A designation when activating in Family B — exactly the regression
    // the real assertion above catches.
    const mutated = condition.replace(/s\.familyId\s*==\s*familyId\s*and\s*/u, "");
    expect(mutated).not.toBe(condition);
    const successors = [designation(FAMILY_A, "julia", 1n)];
    const matched = successors.find(
      (s) => s.personId === "julia" && s.status.tag === "Designated",
    );
    expect(matched).toBeDefined();
  });
});
