import type { PersonProfile } from "../pages/PersonProfilePage";

export type { PersonProfile } from "../pages/PersonProfilePage";

/**
 * The closest-relationship kinds the two family exploration views surface.
 * Each is shown only when the family record documents it for the focus person.
 */
export type FamilyRelation =
  | "father"
  | "mother"
  | "spouse"
  | "sibling"
  | "child";

/** A single closest relative: which person and how they relate to the focus. */
export interface RelativeRef {
  personId: string;
  relation: FamilyRelation;
  /** Human-readable relationship label, e.g. "Father", "Spouse", "Sibling". */
  label: string;
}

/** Closest relatives of one focus person, grouped by relationship kind. */
export interface FamilyRelations {
  father: RelativeRef[];
  mother: RelativeRef[];
  spouse: RelativeRef[];
  siblings: RelativeRef[];
  children: RelativeRef[];
}

/**
 * One node in the shared family relationship graph. Father/mother are explicit
 * (rather than an undifferentiated parents array) so the Explore Family view
 * can label each parent correctly. Only documented relationships are present —
 * an absent parent is simply omitted.
 */
export interface FamilyGraphNode {
  id: string;
  father?: string;
  mother?: string;
  spouses: string[];
  children: string[];
  /**
   * Lifecycle status of this person/relationship in the shared graph.
   * Absent means "approved" (already part of the shared family graph).
   * Future contribution work can stage additions as "pending" before they
   * are merged in. Type-level preparation only — no workflow is wired here.
   */
  status?: RelationshipStatus;
}

export type FamilyGraph = Record<string, FamilyGraphNode>;

/** Lifecycle status of a person or relationship in the shared graph. */
export type RelationshipStatus = "approved" | "pending";

/**
 * A proposed relationship addition staged for review before it joins the
 * shared graph. Future contribution work can build the pending-review
 * workflow on top of this shape — a living family member proposes a Parent,
 * Spouse/Partner, Sibling, or Child, and it enters a pending state until
 * approved. Type-level preparation only; no UI or workflow is built here.
 */
export interface PendingRelationship {
  id: string;
  /** The person the relationship is being added to. */
  personId: string;
  /** The person being added as a relative. */
  relatedPersonId: string;
  relation: FamilyRelation;
  status: "pending";
  submittedBy?: string;
  submittedAt?: number;
}

/**
 * Staging area for proposed relationship additions awaiting review. Starts
 * empty; future contribution work appends PendingRelationship entries here
 * before they are merged into FAMILY_GRAPH.
 */
export const PENDING_RELATIONSHIPS: PendingRelationship[] = [];

/** The founding-couple anchor used when no person is marked "Me". */
export const DEFAULT_ANCHOR_ID = "julia";

/**
 * Shared relationship graph for the two family exploration views. It mirrors
 * the relationships already documented in the Heritage Branch View graph and
 * the Family Tree (couple, children, Clayton branch, Lula Mae + Versie family
 * unit, Versie's maternal line, Harvey's second marriage). Presentation wiring
 * only — it never changes the underlying family data.
 */
export const FAMILY_GRAPH: FamilyGraph = {
  julia: {
    id: "julia",
    spouses: ["isaiah"],
    children: [
      "clayton",
      "isaiah-jr",
      "edward",
      "hattie",
      "pinkie",
      "louise",
      "lillie",
      "lula-e",
    ],
  },
  isaiah: {
    id: "isaiah",
    spouses: ["julia"],
    children: [
      "clayton",
      "isaiah-jr",
      "edward",
      "hattie",
      "pinkie",
      "louise",
      "lillie",
      "lula-e",
    ],
  },
  clayton: {
    id: "clayton",
    father: "isaiah",
    mother: "julia",
    spouses: ["hudson", "erma"],
    children: [
      "elbert",
      "wellman",
      "wetherby",
      "clayton-son-died",
      "columbus",
      "thomas-clayton",
      "alton",
      "robert-davis",
      "ardeanus",
      "willie-b",
      "james",
      "freddie",
      "zelia-mae",
      "lula-mae",
    ],
  },
  "isaiah-jr": {
    id: "isaiah-jr",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  edward: {
    id: "edward",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  hattie: {
    id: "hattie",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  pinkie: {
    id: "pinkie",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  louise: {
    id: "louise",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  lillie: {
    id: "lillie",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  "lula-e": {
    id: "lula-e",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  },
  hudson: {
    id: "hudson",
    spouses: ["clayton"],
    children: ["elbert", "wellman", "wetherby", "clayton-son-died"],
  },
  erma: {
    id: "erma",
    spouses: ["clayton"],
    children: [
      "columbus",
      "thomas-clayton",
      "alton",
      "robert-davis",
      "ardeanus",
      "willie-b",
      "james",
      "freddie",
      "zelia-mae",
      "lula-mae",
    ],
  },
  elbert: {
    id: "elbert",
    father: "clayton",
    mother: "hudson",
    spouses: [],
    children: [],
  },
  wellman: {
    id: "wellman",
    father: "clayton",
    mother: "hudson",
    spouses: [],
    children: [],
  },
  wetherby: {
    id: "wetherby",
    father: "clayton",
    mother: "hudson",
    spouses: [],
    children: [],
  },
  "clayton-son-died": {
    id: "clayton-son-died",
    father: "clayton",
    mother: "hudson",
    spouses: [],
    children: [],
  },
  columbus: {
    id: "columbus",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  "thomas-clayton": {
    id: "thomas-clayton",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  alton: {
    id: "alton",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  "robert-davis": {
    id: "robert-davis",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  ardeanus: {
    id: "ardeanus",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  "willie-b": {
    id: "willie-b",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  james: {
    id: "james",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  freddie: {
    id: "freddie",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  "zelia-mae": {
    id: "zelia-mae",
    father: "clayton",
    mother: "erma",
    spouses: [],
    children: [],
  },
  "lula-mae": {
    id: "lula-mae",
    father: "clayton",
    mother: "erma",
    spouses: ["versie-smith"],
    children: [
      "lorenzoSmithSr",
      "versieSmithJr",
      "herbertSmith",
      "alonzoSmith",
      "sherriSmith",
      "beatriceSmith",
      "edSmith",
    ],
  },
  "versie-smith": {
    id: "versie-smith",
    mother: "gertrude-adams-hill",
    spouses: ["lula-mae"],
    children: [
      "lorenzoSmithSr",
      "versieSmithJr",
      "herbertSmith",
      "alonzoSmith",
      "sherriSmith",
      "beatriceSmith",
      "edSmith",
    ],
  },
  "gertrude-adams-hill": {
    id: "gertrude-adams-hill",
    father: "harvey-adams-sr",
    spouses: [],
    children: ["versie-smith"],
  },
  "harvey-adams-sr": {
    id: "harvey-adams-sr",
    spouses: ["mary-louise-sims", "mary-jane-johnson"],
    children: [
      "gertrude-adams-hill",
      "john-adams",
      "louis-adams-sr",
      "albert-adams",
      "charles-adams",
      "homer-adams",
      "versie-adams-sr",
      "judge-granberry-adams",
      "fannie-adams",
      "harvey-adams-jr",
      "christine-adams-tucker",
      "robert-adams-sr",
      "ella-mae-adams",
      "eula-lee-adams",
      "mildred-adams",
      "christine-adams",
    ],
  },
  "mary-louise-sims": {
    id: "mary-louise-sims",
    spouses: ["harvey-adams-sr"],
    children: [
      "john-adams",
      "louis-adams-sr",
      "albert-adams",
      "charles-adams",
      "homer-adams",
      "versie-adams-sr",
      "judge-granberry-adams",
      "fannie-adams",
      "gertrude-adams-hill",
      "harvey-adams-jr",
      "christine-adams-tucker",
      "robert-adams-sr",
      "ella-mae-adams",
      "eula-lee-adams",
    ],
  },
  "mary-jane-johnson": {
    id: "mary-jane-johnson",
    spouses: ["harvey-adams-sr"],
    children: ["mildred-adams", "christine-adams"],
  },
  "mildred-adams": {
    id: "mildred-adams",
    father: "harvey-adams-sr",
    mother: "mary-jane-johnson",
    spouses: [],
    children: ["tammy", "punchy", "patricia-rollins"],
  },
  "christine-adams": {
    id: "christine-adams",
    father: "harvey-adams-sr",
    mother: "mary-jane-johnson",
    spouses: [],
    children: [],
  },
  tammy: {
    id: "tammy",
    mother: "mildred-adams",
    spouses: [],
    children: [],
  },
  punchy: {
    id: "punchy",
    mother: "mildred-adams",
    spouses: [],
    children: [],
  },
  "patricia-rollins": {
    id: "patricia-rollins",
    mother: "mildred-adams",
    spouses: [],
    children: [],
  },
  "john-adams": {
    id: "john-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "louis-adams-sr": {
    id: "louis-adams-sr",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "albert-adams": {
    id: "albert-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "charles-adams": {
    id: "charles-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "homer-adams": {
    id: "homer-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "versie-adams-sr": {
    id: "versie-adams-sr",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "judge-granberry-adams": {
    id: "judge-granberry-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "fannie-adams": {
    id: "fannie-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "harvey-adams-jr": {
    id: "harvey-adams-jr",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "christine-adams-tucker": {
    id: "christine-adams-tucker",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "robert-adams-sr": {
    id: "robert-adams-sr",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "ella-mae-adams": {
    id: "ella-mae-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  "eula-lee-adams": {
    id: "eula-lee-adams",
    father: "harvey-adams-sr",
    mother: "mary-louise-sims",
    spouses: [],
    children: [],
  },
  lorenzoSmithSr: {
    id: "lorenzoSmithSr",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: ["lorenzoSmithJr"],
  },
  lorenzoSmithJr: {
    id: "lorenzoSmithJr",
    father: "lorenzoSmithSr",
    spouses: [],
    children: [],
  },
  versieSmithJr: {
    id: "versieSmithJr",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: [],
  },
  herbertSmith: {
    id: "herbertSmith",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: [],
  },
  alonzoSmith: {
    id: "alonzoSmith",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: [],
  },
  sherriSmith: {
    id: "sherriSmith",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: [],
  },
  beatriceSmith: {
    id: "beatriceSmith",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: [],
  },
  edSmith: {
    id: "edSmith",
    father: "versie-smith",
    mother: "lula-mae",
    spouses: [],
    children: [],
  },
};

/** Sibling ids of a person, derived from shared parents in the graph. */
export function getSiblingIds(
  id: string,
  graph: FamilyGraph = FAMILY_GRAPH,
): string[] {
  const node = graph[id];
  if (!node) return [];
  const siblingSet = new Set<string>();
  const parentIds = [node.father, node.mother].filter((p): p is string =>
    Boolean(p),
  );
  for (const parentId of parentIds) {
    for (const childId of graph[parentId]?.children ?? []) {
      if (childId !== id) siblingSet.add(childId);
    }
  }
  return [...siblingSet];
}

const EMPTY_RELATIONS: FamilyRelations = {
  father: [],
  mother: [],
  spouse: [],
  siblings: [],
  children: [],
};

/**
 * Resolve the closest relatives of a focus person, grouped by relationship
 * kind. Each group is populated only when the family record documents it.
 */
export function getClosestRelatives(
  id: string,
  graph: FamilyGraph = FAMILY_GRAPH,
): FamilyRelations {
  const node = graph[id];
  if (!node) return EMPTY_RELATIONS;

  const father: RelativeRef[] = node.father
    ? [{ personId: node.father, relation: "father", label: "Father" }]
    : [];
  const mother: RelativeRef[] = node.mother
    ? [{ personId: node.mother, relation: "mother", label: "Mother" }]
    : [];
  const spouse: RelativeRef[] = node.spouses.map((personId) => ({
    personId,
    relation: "spouse",
    label: "Spouse",
  }));
  const siblings: RelativeRef[] = getSiblingIds(id, graph).map((personId) => ({
    personId,
    relation: "sibling",
    label: "Sibling",
  }));
  const children: RelativeRef[] = node.children.map((personId) => ({
    personId,
    relation: "child",
    label: "Child",
  }));

  return { father, mother, spouse, siblings, children };
}

/**
 * Default Explore Family focus: the person marked "Me" (relationToYou === 'me'
 * or a 'me' flag) when present, otherwise the founding-couple anchor.
 */
export function resolveDefaultFocus(
  profiles: Record<string, PersonProfile>,
): string {
  const me = Object.values(profiles).find(
    (p) =>
      p.relationToYou === "me" ||
      (p as PersonProfile & { me?: boolean }).me === true,
  );
  return me?.id ?? DEFAULT_ANCHOR_ID;
}
