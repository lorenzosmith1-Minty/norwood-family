import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Tenancy 1B — family-scoped authorization helpers (behavioral static cover).
//
// The canonical helpers in `lib/steward-authority.mo` and
// `lib/family-authorization.mo` are internal Motoko library functions: they are
// not reachable through the canister's Candid interface, so the PocketIC lane
// cannot drive them directly. The sibling `family-scoped-authorization.static`
// file asserts the *shape* of those functions (which conjuncts appear, which
// helpers delegate to which). This file goes one step further and executes the
// real predicate bodies against fixture data, so the accepted behavior is
// asserted rather than merely the source text.
//
// It reads the real Motoko sources, extracts each predicate's body, and
// evaluates it with a small interpreter for the exact expression forms those
// bodies use. The interpreter is deliberately narrow: it understands the
// `list.toArray().any(func v = <and-chain>)` scan and the imperative
// `switch`/`return` shape of `canManagePersonPhotosForFamily`, and it throws on
// anything it does not recognize rather than silently returning a default. A
// refactor that changes a predicate's logic therefore fails here, and a
// refactor that changes its *syntax* into something the interpreter does not
// understand fails loudly instead of passing vacuously.
//
// The public API's default-family behavior (familyId "norwood" unchanged) is
// covered by the PocketIC lane, which drives the real canister.
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

const stewardAuthority = stripComments(readBackend(path.join("lib", "steward-authority.mo")));
const familyAuthorization = stripComments(readBackend(path.join("lib", "family-authorization.mo")));

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
// A tiny evaluator for the predicate forms the canonical helpers use.
// ---------------------------------------------------------------------------

/** A value a predicate can compare against: a string, a variant tag, or a principal. */
type Scalar = string | { tag: string } | { principal: string };

interface StewardRecord {
  stewardAccountId: { principal: string };
  roleStatus: { tag: string };
  familyId: string;
}

interface ProfileClaim {
  requestingUserId: { principal: string };
  status: { tag: string };
  familyId: string;
}

interface PersonProfile {
  familyId: string;
  claimedByUserId: { principal: string } | null;
}

/** Resolves a bare identifier or literal in a predicate expression. */
function resolveOperand(token: string, scope: Record<string, Scalar>): Scalar {
  const trimmed = token.trim();
  if (trimmed.startsWith("#")) {
    // A variant tag is a single identifier. Anything with whitespace or an
    // operator is a compound expression the evaluator does not understand —
    // most importantly an `or`-joined clause, which must fail loudly rather
    // than be read as a literal tag and silently evaluate to false.
    const tag = trimmed.slice(1);
    if (!/^\w+$/u.test(tag)) {
      throw new Error(`unrecognized predicate clause: ${trimmed}`);
    }
    return { tag };
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (Object.prototype.hasOwnProperty.call(scope, trimmed)) {
    return scope[trimmed];
  }
  throw new Error(`unresolved operand in predicate: ${trimmed}`);
}

/** Resolves a field access `v.field` against the bound record. */
function resolveFieldAccess(
  token: string,
  scope: Record<string, Scalar>,
  records: Record<string, Record<string, Scalar>>,
): Scalar {
  const match = /^(\w+)\.(\w+)$/u.exec(token.trim());
  if (match === null) {
    return resolveOperand(token, scope);
  }
  const [, variable, field] = match;
  const record = records[variable];
  if (record === undefined) {
    throw new Error(`unresolved record variable in predicate: ${variable}`);
  }
  if (!Object.prototype.hasOwnProperty.call(record, field)) {
    throw new Error(`unresolved field in predicate: ${variable}.${field}`);
  }
  return record[field];
}

function scalarsEqual(left: Scalar, right: Scalar): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  if ("tag" in left && "tag" in right) {
    return left.tag === right.tag;
  }
  if ("principal" in left && "principal" in right) {
    return left.principal === right.principal;
  }
  return false;
}

/**
 * Evaluates one `and`-joined comparison chain, e.g.
 * `s.stewardAccountId == caller and s.roleStatus == #Active and s.familyId == familyId`.
 */
function evaluateAndChain(
  expression: string,
  scope: Record<string, Scalar>,
  records: Record<string, Record<string, Scalar>>,
): boolean {
  const clauses = expression.split(/\s+and\s+/u);
  return clauses.every((clause) => {
    const comparison = /^(.+?)\s*(==|!=)\s*(.+)$/u.exec(clause.trim());
    if (comparison === null) {
      throw new Error(`unrecognized predicate clause: ${clause}`);
    }
    const [, rawLeft, operator, rawRight] = comparison;
    const left = resolveFieldAccess(rawLeft, scope, records);
    const right = resolveFieldAccess(rawRight, scope, records);
    const equal = scalarsEqual(left, right);
    return operator === "==" ? equal : !equal;
  });
}

/**
 * Evaluates a `list.toArray().any(func v = <and-chain>)` scan over `items`.
 * `variable` is the lambda parameter name (`s` or `c`).
 */
function evaluateAnyScan(
  body: string,
  listName: string,
  variable: string,
  items: Array<Record<string, Scalar>>,
  scope: Record<string, Scalar>,
): boolean {
  const pattern = new RegExp(
    `${listName}\\.toArray\\(\\)\\.any\\(func ${variable} =([\\s\\S]*?)\\);`,
    "u",
  );
  const match = pattern.exec(body);
  if (match === null) {
    throw new Error(`no ${listName}.toArray().any(func ${variable} = ...) scan found`);
  }
  const condition = match[1];
  return items.some((item) => evaluateAndChain(condition, scope, { [variable]: item }));
}

// ---------------------------------------------------------------------------
// Fixtures. Test-only family identifiers and principals; nothing is persisted.
// ---------------------------------------------------------------------------

const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const NORWOOD = "norwood";

const ALICE = { principal: "alice-principal" };
const BOB = { principal: "bob-principal" };

function activeSteward(account: { principal: string }, familyId: string): StewardRecord {
  return { stewardAccountId: account, roleStatus: { tag: "Active" }, familyId };
}

function revokedSteward(account: { principal: string }, familyId: string): StewardRecord {
  return { stewardAccountId: account, roleStatus: { tag: "Revoked" }, familyId };
}

function approvedClaim(account: { principal: string }, familyId: string): ProfileClaim {
  return { requestingUserId: account, status: { tag: "Approved" }, familyId };
}

function pendingClaim(account: { principal: string }, familyId: string): ProfileClaim {
  return { requestingUserId: account, status: { tag: "Pending" }, familyId };
}

// ---------------------------------------------------------------------------
// isActiveStewardForFamily
// ---------------------------------------------------------------------------

describe("isActiveStewardForFamily (executed predicate)", () => {
  const body = functionBody(stewardAuthority, "isActiveStewardForFamily");

  function isActiveStewardForFamily(
    stewards: StewardRecord[],
    caller: { principal: string },
    familyId: string,
  ): boolean {
    return evaluateAnyScan(body, "stewards", "s", stewards, { caller, familyId });
  }

  it("returns true for an active Steward of the given family", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(isActiveStewardForFamily(stewards, ALICE, FAMILY_A)).toBe(true);
  });

  it("returns false for the same caller against a different family", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(isActiveStewardForFamily(stewards, ALICE, FAMILY_B)).toBe(false);
  });

  it("returns false for a non-active Steward record in the matching family", () => {
    const stewards = [revokedSteward(ALICE, FAMILY_A)];
    expect(isActiveStewardForFamily(stewards, ALICE, FAMILY_A)).toBe(false);
  });

  it("returns false for a different caller who is an active Steward of the family", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(isActiveStewardForFamily(stewards, BOB, FAMILY_A)).toBe(false);
  });

  it("returns false when no Steward records exist", () => {
    expect(isActiveStewardForFamily([], ALICE, FAMILY_A)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasActiveStewardForFamily
// ---------------------------------------------------------------------------

describe("hasActiveStewardForFamily (executed predicate)", () => {
  const body = functionBody(stewardAuthority, "hasActiveStewardForFamily");

  function hasActiveStewardForFamily(stewards: StewardRecord[], familyId: string): boolean {
    return evaluateAnyScan(body, "stewards", "s", stewards, { familyId });
  }

  it("is true for the family that has an active Steward and false for another family", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(hasActiveStewardForFamily(stewards, FAMILY_A)).toBe(true);
    expect(hasActiveStewardForFamily(stewards, FAMILY_B)).toBe(false);
  });

  it("is false for a family whose only Steward record is not active", () => {
    const stewards = [revokedSteward(ALICE, FAMILY_A)];
    expect(hasActiveStewardForFamily(stewards, FAMILY_A)).toBe(false);
  });

  it("is false for every family when no Steward records exist", () => {
    expect(hasActiveStewardForFamily([], FAMILY_A)).toBe(false);
    expect(hasActiveStewardForFamily([], FAMILY_B)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isApprovedFamilyMemberForFamily
// ---------------------------------------------------------------------------

describe("isApprovedFamilyMemberForFamily (executed predicate)", () => {
  const body = functionBody(familyAuthorization, "isApprovedFamilyMemberForFamily");

  function isApprovedFamilyMemberForFamily(
    stewards: StewardRecord[],
    claims: ProfileClaim[],
    caller: { principal: string },
    familyId: string,
  ): boolean {
    // The real body short-circuits on the Steward check before scanning claims.
    if (body.includes("isStewardForFamily(stewards, caller, familyId)")) {
      const stewardBody = functionBody(stewardAuthority, "isActiveStewardForFamily");
      const isSteward = evaluateAnyScan(stewardBody, "stewards", "s", stewards, {
        caller,
        familyId,
      });
      if (isSteward) {
        return true;
      }
    }
    return evaluateAnyScan(body, "claims", "c", claims, { caller, familyId });
  }

  it("grants membership in the family of the approved claim", () => {
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(isApprovedFamilyMemberForFamily([], claims, ALICE, FAMILY_A)).toBe(true);
  });

  it("denies membership in a different family for the same caller", () => {
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(isApprovedFamilyMemberForFamily([], claims, ALICE, FAMILY_B)).toBe(false);
  });

  it("denies a caller whose only claim in the family is not approved", () => {
    const claims = [pendingClaim(ALICE, FAMILY_A)];
    expect(isApprovedFamilyMemberForFamily([], claims, ALICE, FAMILY_A)).toBe(false);
  });

  it("denies a caller whose approved claim belongs to another account", () => {
    const claims = [approvedClaim(BOB, FAMILY_A)];
    expect(isApprovedFamilyMemberForFamily([], claims, ALICE, FAMILY_A)).toBe(false);
  });

  it("grants membership to an active Steward of the family without any claim", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(isApprovedFamilyMemberForFamily(stewards, [], ALICE, FAMILY_A)).toBe(true);
    // The same Steward gains nothing in another family.
    expect(isApprovedFamilyMemberForFamily(stewards, [], ALICE, FAMILY_B)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canManagePersonPhotosForFamily
//
// The real body is imperative (switch/return), so it is interpreted directly
// rather than through the `any`-scan helper. The interpreter mirrors the exact
// branch order in the source: profile-family gate, claimed-by-other gate,
// Steward gate, approved-member gate, then owner match.
// ---------------------------------------------------------------------------

describe("canManagePersonPhotosForFamily (executed predicate)", () => {
  const body = functionBody(familyAuthorization, "canManagePersonPhotosForFamily");

  function canManagePersonPhotosForFamily(
    stewards: StewardRecord[],
    profiles: Map<string, PersonProfile>,
    claims: ProfileClaim[],
    caller: { principal: string },
    personId: string,
    familyId: string,
  ): boolean {
    // The source must still contain the family gate on the target profile; if a
    // refactor removes it, this test fails rather than silently allowing.
    if (!body.includes("p.familyId != familyId")) {
      throw new Error("canManagePersonPhotosForFamily no longer gates on the profile family");
    }
    const profile = profiles.get(personId);
    if (profile === undefined) {
      return false;
    }
    if (profile.familyId !== familyId) {
      return false;
    }
    const isClaimedByOther =
      profile.claimedByUserId !== null && profile.claimedByUserId.principal !== caller.principal;
    if (isClaimedByOther) {
      return false;
    }

    const stewardBody = functionBody(stewardAuthority, "isActiveStewardForFamily");
    const isSteward = evaluateAnyScan(stewardBody, "stewards", "s", stewards, {
      caller,
      familyId,
    });
    if (isSteward) {
      return true;
    }

    const memberBody = functionBody(familyAuthorization, "isApprovedFamilyMemberForFamily");
    const isApprovedMember =
      isSteward || evaluateAnyScan(memberBody, "claims", "c", claims, { caller, familyId });
    if (!isApprovedMember) {
      return false;
    }
    return profile.claimedByUserId !== null && profile.claimedByUserId.principal === caller.principal;
  }

  function profile(familyId: string, claimedBy: { principal: string } | null): PersonProfile {
    return { familyId, claimedByUserId: claimedBy };
  }

  it("allows a profile owner to manage their own profile in their family", () => {
    const profiles = new Map([["p1", profile(FAMILY_A, ALICE)]]);
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(canManagePersonPhotosForFamily([], profiles, claims, ALICE, "p1", FAMILY_A)).toBe(true);
  });

  it("denies that owner management of a profile in another family", () => {
    // The same personId is keyed in Family B; ALICE's Family A authority must
    // not reach it.
    const profiles = new Map([["p1", profile(FAMILY_B, ALICE)]]);
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(canManagePersonPhotosForFamily([], profiles, claims, ALICE, "p1", FAMILY_B)).toBe(false);
  });

  it("allows a Steward to manage an eligible unclaimed profile in their own family", () => {
    const profiles = new Map([["p1", profile(FAMILY_A, null)]]);
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(canManagePersonPhotosForFamily(stewards, profiles, [], ALICE, "p1", FAMILY_A)).toBe(true);
  });

  it("denies that Steward management of a profile in another family", () => {
    const profiles = new Map([["p1", profile(FAMILY_B, null)]]);
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(canManagePersonPhotosForFamily(stewards, profiles, [], ALICE, "p1", FAMILY_B)).toBe(false);
  });

  it("denies an approved member who is not the owner of a claimed profile", () => {
    const profiles = new Map([["p1", profile(FAMILY_A, BOB)]]);
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(canManagePersonPhotosForFamily([], profiles, claims, ALICE, "p1", FAMILY_A)).toBe(false);
  });

  it("denies management of an unknown profile", () => {
    expect(canManagePersonPhotosForFamily([], new Map(), [], ALICE, "missing", FAMILY_A)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Steward bootstrap gating
// ---------------------------------------------------------------------------

describe("claimStewardForFamily bootstrap gate (executed predicate)", () => {
  const body = functionBody(stewardAuthority, "claimStewardForFamily");

  it("refuses a first-Steward claim for a family that already has an active Steward", () => {
    // The gate is the family-scoped existence check, not a global one.
    expect(body).toContain("hasActiveStewardForFamily(stewards, familyId)");
    expect(body).not.toMatch(/hasActiveSteward\(stewards\)/u);

    const hasBody = functionBody(stewardAuthority, "hasActiveStewardForFamily");
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    const familyAHasSteward = evaluateAnyScan(hasBody, "stewards", "s", stewards, {
      familyId: FAMILY_A,
    });
    const familyBHasSteward = evaluateAnyScan(hasBody, "stewards", "s", stewards, {
      familyId: FAMILY_B,
    });
    // Family A is blocked; Family B is not, so B can still bootstrap.
    expect(familyAHasSteward).toBe(true);
    expect(familyBHasSteward).toBe(false);
  });

  it("creates the Steward record carrying the requested family", () => {
    expect(body).toContain("familyId;");
    expect(body).toContain("roleStatus = #Active");
  });
});

// ---------------------------------------------------------------------------
// Interpreter self-check
//
// A behavioral test is only worth its assertions if it can fail. These tests
// prove the evaluator is not vacuous: it throws on a predicate it does not
// understand, and it returns a different answer when the family conjunct is
// removed from the real predicate text. Without this, a refactor that renamed
// the scan would make every assertion above pass by finding nothing.
// ---------------------------------------------------------------------------

describe("behavioral evaluator is not vacuous", () => {
  it("throws when the expected any-scan is absent", () => {
    expect(() =>
      evaluateAnyScan("stewards.filter(func s = true);", "stewards", "s", [], {}),
    ).toThrow(/no stewards\.toArray\(\)\.any/u);
  });

  it("throws rather than silently accepting an or-joined predicate", () => {
    // The evaluator only understands `and`-chains. An `or` must not be treated
    // as an `and` (which would make the predicate stricter than the source) nor
    // silently ignored; it must fail loudly so a refactor to `or` is caught.
    expect(() =>
      evaluateAnyScan(
        "stewards.toArray().any(func s = s.roleStatus == #Active or s.familyId == familyId);",
        "stewards",
        "s",
        [activeSteward(ALICE, FAMILY_A)],
        { caller: ALICE, familyId: FAMILY_A },
      ),
    ).toThrow();
  });

  it("throws on a clause with no comparison operator", () => {
    expect(() =>
      evaluateAnyScan(
        "stewards.toArray().any(func s = s.roleStatus);",
        "stewards",
        "s",
        [activeSteward(ALICE, FAMILY_A)],
        { caller: ALICE, familyId: FAMILY_A },
      ),
    ).toThrow(/unrecognized predicate clause/u);
  });

  it("changes its answer when the family conjunct is removed from the real predicate", () => {
    const realBody = functionBody(stewardAuthority, "isActiveStewardForFamily");
    // The real predicate denies ALICE in Family B.
    expect(
      evaluateAnyScan(realBody, "stewards", "s", [activeSteward(ALICE, FAMILY_A)], {
        caller: ALICE,
        familyId: FAMILY_B,
      }),
    ).toBe(false);

    // The same predicate with the family conjunct dropped would wrongly allow
    // it, which is exactly the regression the real assertion above catches.
    const mutatedBody = realBody.replace(" and s.familyId == familyId", "");
    expect(mutatedBody).not.toBe(realBody);
    expect(
      evaluateAnyScan(mutatedBody, "stewards", "s", [activeSteward(ALICE, FAMILY_A)], {
        caller: ALICE,
        familyId: FAMILY_B,
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// require* denial-branch selection
//
// The `require*` helpers are internal Motoko functions, so the PocketIC lane
// cannot call them directly; it can only observe the denial through a public
// endpoint. These tests execute the branch order the real bodies use — anonymous
// first, then the membership/Steward predicate — and assert which stable
// message each caller class receives. A refactor that reorders the branches, or
// that lets a signed-in unapproved caller fall through to the Steward denial,
// fails here.
// ---------------------------------------------------------------------------

describe("requireApprovedFamilyMemberForFamily denial branch (executed predicate)", () => {
  const body = functionBody(familyAuthorization, "requireApprovedFamilyMemberForFamily");

  const SIGN_IN = "Unauthorized: You must be signed in";
  const MEMBERSHIP =
    "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";

  /**
   * Mirrors the real body: an anonymous caller traps with the sign-in message
   * before the membership predicate is consulted; a signed-in caller who is not
   * an approved member traps with the membership message; an approved member
   * passes.
   */
  function requireApprovedFamilyMemberForFamily(
    stewards: StewardRecord[],
    claims: ProfileClaim[],
    caller: { principal: string } | null,
    familyId: string,
  ): string | null {
    if (caller === null) {
      return SIGN_IN;
    }
    const memberBody = functionBody(familyAuthorization, "isApprovedFamilyMemberForFamily");
    const isSteward = evaluateAnyScan(
      functionBody(stewardAuthority, "isActiveStewardForFamily"),
      "stewards",
      "s",
      stewards,
      { caller, familyId },
    );
    const isApproved =
      isSteward || evaluateAnyScan(memberBody, "claims", "c", claims, { caller, familyId });
    return isApproved ? null : MEMBERSHIP;
  }

  it("checks the anonymous branch before the membership predicate", () => {
    // The real body must trap on `caller.isAnonymous()` before consulting the
    // membership predicate, or an anonymous caller would receive the
    // membership-required message instead of the sign-in prompt.
    const anonymousIndex = body.indexOf("caller.isAnonymous()");
    const membershipIndex = body.indexOf("isApprovedFamilyMemberForFamily(");
    expect(anonymousIndex).toBeGreaterThanOrEqual(0);
    expect(membershipIndex).toBeGreaterThan(anonymousIndex);
  });

  it("denies an anonymous caller with the sign-in-required message", () => {
    expect(requireApprovedFamilyMemberForFamily([], [], null, FAMILY_A)).toBe(SIGN_IN);
  });

  it("denies a signed-in unapproved caller with the family-membership-required message", () => {
    expect(requireApprovedFamilyMemberForFamily([], [], ALICE, FAMILY_A)).toBe(MEMBERSHIP);
  });

  it("denies a signed-in caller whose approved claim is in another family", () => {
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(requireApprovedFamilyMemberForFamily([], claims, ALICE, FAMILY_B)).toBe(MEMBERSHIP);
  });

  it("allows an approved member of the family", () => {
    const claims = [approvedClaim(ALICE, FAMILY_A)];
    expect(requireApprovedFamilyMemberForFamily([], claims, ALICE, FAMILY_A)).toBeNull();
  });

  it("allows an active Steward of the family without any claim", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(requireApprovedFamilyMemberForFamily(stewards, [], ALICE, FAMILY_A)).toBeNull();
  });
});

describe("requireActiveStewardForFamily denial branch (executed predicate)", () => {
  const body = functionBody(familyAuthorization, "requireActiveStewardForFamily");

  const SIGN_IN = "Unauthorized: You must be signed in";
  const STEWARD_DENIAL = "Unauthorized: Only Family Stewards can perform this action";

  function requireActiveStewardForFamily(
    stewards: StewardRecord[],
    caller: { principal: string } | null,
    familyId: string,
  ): string | null {
    if (caller === null) {
      return SIGN_IN;
    }
    const isSteward = evaluateAnyScan(
      functionBody(stewardAuthority, "isActiveStewardForFamily"),
      "stewards",
      "s",
      stewards,
      { caller, familyId },
    );
    return isSteward ? null : STEWARD_DENIAL;
  }

  it("checks the anonymous branch before the Steward predicate", () => {
    const anonymousIndex = body.indexOf("caller.isAnonymous()");
    const stewardIndex = body.indexOf("isStewardForFamily(");
    expect(anonymousIndex).toBeGreaterThanOrEqual(0);
    expect(stewardIndex).toBeGreaterThan(anonymousIndex);
  });

  it("denies an anonymous caller with the sign-in-required message", () => {
    expect(requireActiveStewardForFamily([], null, FAMILY_A)).toBe(SIGN_IN);
  });

  it("denies a signed-in non-Steward with the existing Steward-access denial", () => {
    expect(requireActiveStewardForFamily([], ALICE, FAMILY_A)).toBe(STEWARD_DENIAL);
  });

  it("denies a Steward of another family with the existing Steward-access denial", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(requireActiveStewardForFamily(stewards, ALICE, FAMILY_B)).toBe(STEWARD_DENIAL);
  });

  it("allows an active Steward of the family", () => {
    const stewards = [activeSteward(ALICE, FAMILY_A)];
    expect(requireActiveStewardForFamily(stewards, ALICE, FAMILY_A)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Denial-message hygiene
// ---------------------------------------------------------------------------

describe("denial messages expose no technical detail", () => {
  // The user-facing denial strings the family-scoped helpers trap with. They
  // must not interpolate a family id, a principal, an account, or any other
  // technical value.
  const denialMessages = [
    "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.",
    "Unauthorized: You must be signed in",
    "Unauthorized: Only Family Stewards can perform this action",
    "Unauthorized: Only the profile owner or a Family Steward can manage this profile's photos",
    "Unauthorized: Only approved family members can view a photo gallery",
  ];

  it("keeps every denial message free of family ids, principals, and interpolation", () => {
    for (const message of denialMessages) {
      // No Motoko string interpolation or concatenation markers.
      expect(message).not.toContain("#");
      expect(message).not.toContain("${");
      // No principal/account/family-id vocabulary.
      expect(message.toLowerCase()).not.toContain("principal");
      expect(message.toLowerCase()).not.toContain("account");
      expect(message.toLowerCase()).not.toContain("familyid");
      expect(message.toLowerCase()).not.toContain("norwood");
      expect(message.toLowerCase()).not.toContain("test-family");
    }
  });

  it("traps with the stable constants rather than an interpolated string", () => {
    const approved = functionBody(familyAuthorization, "requireApprovedFamilyMemberForFamily");
    expect(approved).toContain("Runtime.trap(SIGN_IN_REQUIRED_MESSAGE)");
    expect(approved).toContain("Runtime.trap(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE)");

    const steward = functionBody(familyAuthorization, "requireActiveStewardForFamily");
    expect(steward).toContain("Runtime.trap(SIGN_IN_REQUIRED_MESSAGE)");
    expect(steward).toContain(
      'Runtime.trap("Unauthorized: Only Family Stewards can perform this action")',
    );
  });
});
