import { ArrowLeft, TreePine } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { type Person, PersonCard } from "../components/PersonCard";
import {
  albertAdamsProfile,
  charlesAdamsProfile,
  christineAdamsTuckerProfile,
  ellaMaeAdamsProfile,
  eulaLeeAdamsProfile,
  fannieAdamsProfile,
  gertrudeAdamsHillProfile,
  harveyAdamsJrProfile,
  harveyAdamsSrProfile,
  homerAdamsProfile,
  johnAdamsProfile,
  judgeGranberryAdamsProfile,
  louisAdamsSrProfile,
  maryLouiseSimsProfile,
  profiles,
  robertAdamsSrProfile,
  versieAdamsSrProfile,
} from "./PersonProfilePage";

interface FamilyTreePageProps {
  onBack: () => void;
  onOpenProfile: (id: string) => void;
  profilePhotos?: Record<string, string>;
  /* Person id whose branch should start expanded when the page mounts. Used
     when returning from a profile view so the branch being explored stays
     open. In-session navigation state only — never persisted. */
  initialExpandedPersonId?: string;
}

const couple: (Person & { id: string })[] = [
  {
    id: "julia",
    name: "Julia “Julie” Norwood",
    role: "Matriarch",
    photo: profiles.julia.portrait,
    years: "1860–1936",
  },
  {
    id: "isaiah",
    name: "Isaiah Norwood",
    role: "Patriarch",
    photo: profiles.isaiah.portrait,
    years: "1858–",
  },
];

const children: Person[] = [
  {
    id: "clayton",
    name: "Clayton",
    role: "Child",
    relationToYou: "uncle",
    years: "1883–",
  },
  { name: "Isaiah Jr.", role: "Child" },
  { name: "Edward", role: "Child" },
  { name: "Hattie", role: "Child", relationToYou: "grandaunt" },
  { name: "Pinkie", role: "Child" },
  { name: "Louise", role: "Child" },
  { name: "Lillie", role: "Child" },
  { name: "Lula E.", role: "Child", relationToYou: "great-grandmother" },
];

const claytonBranch: { spouse: Person; children: Person[] }[] = [
  {
    spouse: { id: "hudson", name: "Ms. Hudson", role: "First Wife" },
    children: [
      { id: "elbert", name: "Elbert", role: "Child" },
      { id: "wellman", name: "Wellman", role: "Child" },
      { id: "wetherby", name: "Wetherby", role: "Child" },
      { name: "Son (died at birth)", role: "Child" },
    ],
  },
  {
    spouse: {
      id: "erma",
      name: "Erma T. Williams",
      role: "Second Wife",
      years: "1897–1977",
    },
    children: [
      { id: "columbus", name: "Columbus", role: "Child" },
      {
        id: "thomas-clayton",
        name: "Thomas Clayton “Tip / TC”",
        role: "Child",
      },
      { id: "alton", name: "Alton", role: "Child" },
      { id: "robert-davis", name: "Robert Davis “RD”", role: "Child" },
      {
        id: "ardeanus",
        name: "Ardeanus",
        role: "Child",
        years: "1929–",
      },
      { id: "willie-b", name: "Willie B.", role: "Child", years: "1932–1995" },
      { id: "james", name: "James", role: "Child", years: "1927–1987" },
      { id: "freddie", name: "Freddie", role: "Child", years: "1938–1985" },
      { id: "zelia-mae", name: "Zelia Mae", role: "Child" },
      { id: "lula-mae", name: "Lula Mae", role: "Child" },
    ],
  },
];

const firstMarriageChildren: Person[] = [
  { id: johnAdamsProfile.id, name: "John Adams", role: "Son" },
  { id: louisAdamsSrProfile.id, name: "Louis Adams Sr.", role: "Son" },
  { id: albertAdamsProfile.id, name: "Albert Adams", role: "Son" },
  { id: charlesAdamsProfile.id, name: "Charles Adams", role: "Son" },
  { id: homerAdamsProfile.id, name: "Homer Adams", role: "Son" },
  { id: versieAdamsSrProfile.id, name: "Versie Adams Sr.", role: "Son" },
  {
    id: judgeGranberryAdamsProfile.id,
    name: "Judge Granberry Adams",
    role: "Son",
  },
  { id: fannieAdamsProfile.id, name: "Fannie Adams", role: "Daughter" },
  {
    id: gertrudeAdamsHillProfile.id,
    name: "Gertrude Adams-Hill",
    role: "Daughter",
  },
  { id: harveyAdamsJrProfile.id, name: "Harvey Adams Jr.", role: "Son" },
  {
    id: christineAdamsTuckerProfile.id,
    name: "Christine Adams Tucker",
    role: "Daughter",
  },
  { id: robertAdamsSrProfile.id, name: "Robert Adams Sr.", role: "Son" },
  { id: ellaMaeAdamsProfile.id, name: "Ella Mae Adams", role: "Daughter" },
  { id: eulaLeeAdamsProfile.id, name: "Eula Lee Adams", role: "Daughter" },
];

/* Harvey Adams Sr.'s second marriage to Mary Jane Johnson, and the daughters
   of that marriage's child Mildred. These mirror the fixed layout order below
   (Mary Jane as second wife, Mildred + Christine as children, then Mildred's
   daughters Tammy, Punchy, and Patricia Rollins). */
const secondMarriageChildren: Person[] = [
  { id: "mildred-adams", name: "Mildred Adams", role: "Daughter" },
  { id: "christine-adams", name: "Christine Adams", role: "Daughter" },
];

const mildredChildren: Person[] = [
  { id: "tammy", name: "Tammy", role: "Daughter" },
  { id: "punchy", name: "Punchy", role: "Daughter" },
  { id: "patricia-rollins", name: "Patricia Rollins", role: "Daughter" },
];

/* The seven children of Lula Mae Norwood and Versie Smith, shown as a compact
   Family Unit cluster. Profile ids were added to the profiles record by a
   parallel task; dates are deliberately omitted to respect the confirmed-facts
   boundary. */
const lulaVersieChildren: (Person & { id: string })[] = [
  {
    id: "lorenzoSmithSr",
    name: "Lorenzo Smith Sr.",
    role: "Son",
    relationToYou: "granduncle",
  },
  {
    id: "versieSmithJr",
    name: "Versie Smith Jr.",
    role: "Son",
    relationToYou: "granduncle",
  },
  {
    id: "herbertSmith",
    name: "Herbert Smith",
    role: "Son",
    relationToYou: "granduncle",
  },
  {
    id: "alonzoSmith",
    name: "Alonzo Smith",
    role: "Son",
    relationToYou: "granduncle",
  },
  {
    id: "sherriSmith",
    name: "Sherri Smith",
    role: "Daughter",
    relationToYou: "grandaunt",
  },
  {
    id: "beatriceSmith",
    name: "Beatrice Smith",
    role: "Daughter",
    relationToYou: "grandaunt",
  },
  {
    id: "edSmith",
    name: "Ed Smith",
    role: "Son",
    relationToYou: "granduncle",
  },
];

const CHILDREN_PER_ROW = 4;

/* Numeric indices of every person in the tree, used to decide which connector
   run belongs to the currently selected person. These mirror the fixed layout
   order below (couple, children, Clayton branch, Lula Mae/Versie, Harvey's
   maternal line). */
const COUPLE_INDICES = [0, 1];
const CHILDREN_INDICES = [2, 3, 4, 5, 6, 7, 8, 9];
const CLAYTON_INDEX = 2;
const CLAYTON_SPOUSE_INDICES = [10, 11];
const LULA_MAE_INDEX = 26;
const VERSIE_INDEX = 27;
const LULA_VERSIE_CHILDREN_INDICES = Array.from(
  { length: lulaVersieChildren.length },
  (_, i) => 28 + i,
);
const HARVEY_INDEX = 28 + lulaVersieChildren.length;
const MARY_LOUISE_INDEX = HARVEY_INDEX + 1;
const FIRST_MARRIAGE_CHILDREN_INDICES = Array.from(
  { length: firstMarriageChildren.length },
  (_, i) => MARY_LOUISE_INDEX + 1 + i,
);
const GERTRUDE_INDEX =
  FIRST_MARRIAGE_CHILDREN_INDICES[FIRST_MARRIAGE_CHILDREN_INDICES.length - 1] +
  1;
const MARY_JANE_INDEX = GERTRUDE_INDEX + 1;
const SECOND_MARRIAGE_CHILDREN_INDICES = [
  MARY_JANE_INDEX + 1,
  MARY_JANE_INDEX + 2,
];
const MILDRED_INDEX = SECOND_MARRIAGE_CHILDREN_INDICES[0];
const MILDRED_CHILDREN_INDICES = [
  MILDRED_INDEX + 2,
  MILDRED_INDEX + 3,
  MILDRED_INDEX + 4,
];

/* Collapsible major descendant branches. Each maps to the contiguous run of
   person indices it owns so the tree can (a) show a descendant count when
   collapsed, and (b) auto-expand the branch containing the selected card. */
const CLAYTON_BRANCH_INDICES = Array.from({ length: 16 }, (_, i) => 10 + i);
const LULA_VERSIE_BRANCH_INDICES = Array.from(
  { length: 2 + lulaVersieChildren.length + 17 },
  (_, i) => 26 + i,
);
const HARVEY_SECOND_BRANCH_INDICES = Array.from(
  { length: 6 },
  (_, i) => MARY_JANE_INDEX + i,
);

const BRANCH_INDICES: Record<string, number[]> = {
  clayton: CLAYTON_BRANCH_INDICES,
  lulaVersie: LULA_VERSIE_BRANCH_INDICES,
  harveySecond: HARVEY_SECOND_BRANCH_INDICES,
};

/* Person ids that live inside each collapsible branch, used to decide which
   branch should start expanded when arriving from a profile view. */
const CLAYTON_BRANCH_IDS = new Set([
  "clayton",
  "hudson",
  "elbert",
  "wellman",
  "wetherby",
  "erma",
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
]);

const LULA_VERSIE_BRANCH_IDS = new Set([
  "lula-mae",
  "versie-smith",
  ...lulaVersieChildren.map((child) => child.id),
  "gertrude-adams-hill",
  "harvey-adams-sr",
  "mary-louise-sims",
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
]);

const HARVEY_SECOND_BRANCH_IDS = new Set([
  "harvey-adams-sr",
  "mary-jane-johnson",
  "mildred-adams",
  "christine-adams",
  "tammy",
  "punchy",
  "patricia-rollins",
]);

/* Every branch key that contains the given person id. A person can appear in
   more than one branch (e.g. Lula Mae, Harvey Adams Sr.), so all containing
   branches are returned so the explored person is never hidden. */
const branchesForPerson = (id: string): string[] => {
  const branches: string[] = [];
  if (CLAYTON_BRANCH_IDS.has(id)) branches.push("clayton");
  if (LULA_VERSIE_BRANCH_IDS.has(id)) branches.push("lulaVersie");
  if (HARVEY_SECOND_BRANCH_IDS.has(id)) branches.push("harveySecond");
  return branches;
};

const inSet = (selected: number | null, set: number[]) =>
  selected !== null && set.includes(selected);

interface BranchFoldProps {
  name: string;
  count: number;
  onToggle: () => void;
  dataOcid: string;
  open?: boolean;
}

/* Persistent branch summary row: branch person name + descendant count chip +
   expand/collapse affordance. Rendered in BOTH the collapsed and expanded
   states so an expanded branch always shows a control to collapse it again.
   The whole row is the tap target (min 44px). */
function BranchFold({
  name,
  count,
  onToggle,
  dataOcid,
  open = false,
}: BranchFoldProps) {
  return (
    <button
      type="button"
      data-ocid={dataOcid}
      onClick={onToggle}
      aria-expanded={open}
      className={`ft-branch-fold ${open ? "ft-branch-fold-open" : ""}`}
    >
      <span className="ft-branch-fold-name">{name}</span>
      <span className="ft-branch-fold-count">{count}</span>
      <span className="ft-branch-fold-toggle" aria-hidden="true">
        <span className="ft-fold-chevron" />
      </span>
    </button>
  );
}

interface BranchRowProps {
  rowChildren: Person[];
  rowOffset: number;
  parentIndices: number[];
  selected: number | null;
  onSelect: (index: number) => void;
  meIndex: number | null;
  onMarkMe: (index: number) => void;
  onOpenProfile?: (id: string) => void;
  profilePhotos?: Record<string, string>;
}

function BranchRow({
  rowChildren,
  rowOffset,
  parentIndices,
  selected,
  onSelect,
  meIndex,
  onMarkMe,
  onOpenProfile,
  profilePhotos,
}: BranchRowProps) {
  const barSelected =
    inSet(selected, parentIndices) ||
    rowChildren.some((_, i) => selected === rowOffset + i);
  return (
    <div className="relative">
      {/* Horizontal branch bar spanning the row */}
      <div
        className={`ft-connector pointer-events-none absolute left-0 right-0 top-0 h-px ${
          barSelected ? "ft-connector-selected" : ""
        }`}
        aria-hidden="true"
      />
      {/* Vertical stubs dropping from the bar down to each child, each
          ending in a downward chevron just above the card. The grid mirrors
          the card grid's gaps so every stub sits on its card's center. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {rowChildren.map((person, i) => {
          const index = rowOffset + i;
          const stubSelected =
            inSet(selected, parentIndices) || selected === index;
          return (
            <div key={person.name} className="flex flex-col items-center">
              <div
                className={`ft-child-stub h-6 ${
                  stubSelected ? "ft-connector-selected" : ""
                }`}
                aria-hidden="true"
              />
              <span
                className={`ft-chevron -mt-1.5 ${
                  stubSelected ? "ft-connector-selected" : ""
                }`}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {rowChildren.map((person, i) => {
          const index = rowOffset + i;
          return (
            <PersonCard
              key={person.name}
              person={person}
              index={index}
              selected={selected === index}
              onSelect={() => onSelect(index)}
              onOpen={
                person.id && onOpenProfile
                  ? () => onOpenProfile(person.id as string)
                  : undefined
              }
              isMe={meIndex === index}
              onMarkMe={() => onMarkMe(index)}
              profilePhoto={person.id ? profilePhotos?.[person.id] : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ClaytonBranchProps {
  branches: { spouse: Person; children: Person[] }[];
  baseIndex: number;
  selected: number | null;
  onSelect: (index: number) => void;
  meIndex: number | null;
  onMarkMe: (index: number) => void;
  onOpenProfile?: (id: string) => void;
  profilePhotos?: Record<string, string>;
  collapsed: boolean;
  onToggle: () => void;
}

function ClaytonBranch({
  branches,
  baseIndex,
  selected,
  onSelect,
  meIndex,
  onMarkMe,
  onOpenProfile,
  profilePhotos,
  collapsed,
  onToggle,
}: ClaytonBranchProps) {
  const spouseIndices = branches.map((_, i) => baseIndex + i);
  const childrenStart = baseIndex + branches.length;
  let cursor = childrenStart;
  const childGroups = branches.map((branch) => {
    const group = branch.children.map((_, i) => cursor + i);
    cursor += branch.children.length;
    return group;
  });

  const claytonSpouseSelected = inSet(selected, [
    CLAYTON_INDEX,
    ...CLAYTON_SPOUSE_INDICES,
  ]);

  return (
    <section aria-label="Clayton's branch" className="relative mt-2">
      {/* Vertical connector from Clayton's card down to the marriage bar,
          ending in a junction where it meets the bar. Stays visible even when
          the branch is collapsed so the tree structure reads at a glance. */}
      <div
        className={`ft-trunk pointer-events-none absolute left-[25%] top-0 bottom-1/2 sm:left-[12.5%] ${
          claytonSpouseSelected ? "ft-connector-selected" : ""
        }`}
        aria-hidden="true"
      >
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"
          aria-hidden="true"
        >
          <span
            className={`ft-junction block ${
              claytonSpouseSelected ? "ft-connector-selected" : ""
            }`}
          />
        </span>
      </div>

      <BranchFold
        name="Clayton"
        count={16}
        open={!collapsed}
        onToggle={onToggle}
        dataOcid="tree.branch.clayton"
      />

      {!collapsed && (
        <div className="ft-branch-expanded">
          {/* Spouses side by side */}
          <div className="relative">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {branches.map((branch, i) => (
                <PersonCard
                  key={branch.spouse.name}
                  person={branch.spouse}
                  index={spouseIndices[i]}
                  selected={selected === spouseIndices[i]}
                  onSelect={() => onSelect(spouseIndices[i])}
                  onOpen={
                    branch.spouse.id && onOpenProfile
                      ? () => onOpenProfile(branch.spouse.id as string)
                      : undefined
                  }
                  isMe={meIndex === spouseIndices[i]}
                  onMarkMe={() => onMarkMe(spouseIndices[i])}
                  profilePhoto={
                    branch.spouse.id
                      ? profilePhotos?.[branch.spouse.id]
                      : undefined
                  }
                />
              ))}
            </div>
            {/* Horizontal relationship line between the two spouses; on sm it
                widens so Clayton's trunk (offset to his card column) meets it */}
            <div
              className={`ft-couple-line pointer-events-none absolute left-1/2 top-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 sm:w-3/4 ${
                claytonSpouseSelected ? "ft-connector-selected" : ""
              }`}
              aria-hidden="true"
            />
          </div>

          {/* Children under each spouse */}
          <div className="mt-6 space-y-6">
            {branches.map((branch, i) => {
              const spouseIndex = spouseIndices[i];
              const childIndices = childGroups[i];
              const downSelected =
                selected === spouseIndex ||
                selected === CLAYTON_INDEX ||
                (selected !== null && childIndices.includes(selected));
              return (
                <div key={branch.spouse.name}>
                  {/* Vertical trunk from the spouse down to their children,
                      ending in a junction where it meets the branch bar */}
                  <div
                    className={`ft-trunk relative mx-auto h-6 ${
                      downSelected ? "ft-connector-selected" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
                        downSelected ? "ft-connector-selected" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  {Array.from({
                    length: Math.ceil(
                      branch.children.length / CHILDREN_PER_ROW,
                    ),
                  }).map((_, row) => {
                    const rowChildren = branch.children.slice(
                      row * CHILDREN_PER_ROW,
                      row * CHILDREN_PER_ROW + CHILDREN_PER_ROW,
                    );
                    const rowOffset = childGroups[i][row * CHILDREN_PER_ROW];
                    return (
                      <BranchRow
                        key={rowChildren[0].name}
                        rowChildren={rowChildren}
                        rowOffset={rowOffset}
                        parentIndices={[spouseIndex]}
                        selected={selected}
                        onSelect={onSelect}
                        meIndex={meIndex}
                        onMarkMe={onMarkMe}
                        onOpenProfile={onOpenProfile}
                        profilePhotos={profilePhotos}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function FamilyTreePage({
  onBack,
  onOpenProfile,
  profilePhotos,
  initialExpandedPersonId,
}: FamilyTreePageProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [meIndex, setMeIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      clayton: true,
      lulaVersie: true,
      harveySecond: true,
    };
    if (initialExpandedPersonId) {
      for (const key of branchesForPerson(initialExpandedPersonId)) {
        initial[key] = false;
      }
    }
    return initial;
  });

  const rows: { offset: number; people: Person[] }[] = [];
  for (let i = 0; i < children.length; i += CHILDREN_PER_ROW) {
    rows.push({
      offset: couple.length + i,
      people: children.slice(i, i + CHILDREN_PER_ROW),
    });
  }

  const allPeople: Person[] = [
    ...couple,
    ...children,
    ...claytonBranch.flatMap((branch) => [branch.spouse, ...branch.children]),
    { id: "lula-mae", name: "Lula Mae", role: "Child" },
    { id: "versie-smith", name: "Versie Smith", role: "Husband" },
    ...lulaVersieChildren,
    {
      id: harveyAdamsSrProfile.id,
      name: "Harvey Adams Sr.",
      role: "Father",
    },
    {
      id: maryLouiseSimsProfile.id,
      name: "Mary Louise Sims",
      role: "First Wife",
    },
    ...firstMarriageChildren,
    {
      id: gertrudeAdamsHillProfile.id,
      name: "Gertrude Adams-Hill",
      role: "Mother",
      years: "1913–",
    },
    {
      id: "mary-jane-johnson",
      name: "Mary Jane Johnson",
      role: "Second Wife",
    },
    ...secondMarriageChildren,
    ...mildredChildren,
  ];

  const coupleBaseIndex =
    couple.length +
    children.length +
    claytonBranch.flatMap((branch) => [branch.spouse, ...branch.children])
      .length;
  const parentsBaseIndex = coupleBaseIndex + 2 + lulaVersieChildren.length;
  const firstMarriageChildrenBaseIndex = parentsBaseIndex + 2;
  const gertrudeIndex =
    firstMarriageChildrenBaseIndex + firstMarriageChildren.length;

  /* Selecting a card also expands the branch that contains it, so the selected
     person is never hidden behind a collapsed fold. */
  const handleSelect = (index: number) => {
    setSelected(index);
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const [key, indices] of Object.entries(BRANCH_INDICES)) {
        if (indices.includes(index) && next[key]) {
          next[key] = false;
        }
      }
      return next;
    });
  };

  /* Toggling a branch never collapses the branch holding the selected card,
     so the current selection stays visible. */
  const toggleBranch = (key: string) => {
    setCollapsed((prev) => {
      const indices = BRANCH_INDICES[key];
      if (!prev[key] && selected !== null && indices.includes(selected)) {
        return prev;
      }
      return { ...prev, [key]: !prev[key] };
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
      {/* Header */}
      <motion.header
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          data-ocid="tree.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Back to Home
        </button>

        <span className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
          <TreePine className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          The Norwood Family
        </span>
        <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Family Tree
        </h1>
        <p className="mt-3 max-w-md text-base text-muted-foreground">
          Julia and Isaiah, and their eight children. Tap a card to select a
          family member, or expand a branch to explore its descendants.
        </p>
      </motion.header>

      {/* Couple with horizontal relationship line */}
      <section aria-label="Starting couple" className="relative mt-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {couple.map((person, index) => (
            <PersonCard
              key={person.name}
              person={person}
              index={index}
              selected={selected === index}
              onSelect={() => handleSelect(index)}
              onOpen={() => onOpenProfile(couple[index].id)}
              isMe={meIndex === index}
              onMarkMe={() => setMeIndex(index)}
              profilePhoto={profilePhotos?.[couple[index].id]}
            />
          ))}
        </div>

        {/* Horizontal relationship line between the two cards */}
        <div
          className={`ft-couple-line pointer-events-none absolute left-1/2 top-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 ${
            inSet(selected, COUPLE_INDICES) ? "ft-connector-selected" : ""
          }`}
          aria-hidden="true"
        />
      </section>

      {/* Vertical trunk dropping from the center of the couple, ending in a
          junction where it meets the children's branch line */}
      <div
        className={`ft-trunk relative mx-auto h-8 ${
          inSet(selected, [...COUPLE_INDICES, ...CHILDREN_INDICES])
            ? "ft-connector-selected"
            : ""
        }`}
        aria-hidden="true"
      >
        <span
          className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
            inSet(selected, [...COUPLE_INDICES, ...CHILDREN_INDICES])
              ? "ft-connector-selected"
              : ""
          }`}
          aria-hidden="true"
        />
      </div>

      {/* Children branching below the couple */}
      <section aria-label="Children" className="space-y-6">
        {rows.map((row) => (
          <BranchRow
            key={row.people[0].name}
            rowChildren={row.people}
            rowOffset={row.offset}
            parentIndices={COUPLE_INDICES}
            selected={selected}
            onSelect={handleSelect}
            meIndex={meIndex}
            onMarkMe={setMeIndex}
            onOpenProfile={onOpenProfile}
            profilePhotos={profilePhotos}
          />
        ))}
      </section>

      {/* Clayton's branch below his card */}
      <ClaytonBranch
        branches={claytonBranch}
        baseIndex={couple.length + children.length}
        selected={selected}
        onSelect={handleSelect}
        meIndex={meIndex}
        onMarkMe={setMeIndex}
        onOpenProfile={onOpenProfile}
        profilePhotos={profilePhotos}
        collapsed={collapsed.clayton}
        onToggle={() => toggleBranch("clayton")}
      />

      {/* Lula Mae and Versie as a couple, and Versie's maternal line below */}
      <section aria-label="Lula Mae and Versie" className="relative mt-10">
        <BranchFold
          name="Lula Mae & Versie"
          count={26}
          open={!collapsed.lulaVersie}
          onToggle={() => toggleBranch("lulaVersie")}
          dataOcid="tree.branch.lula_versie"
        />
        {/* Vertical trunk stays visible even when the branch is collapsed
            so the tree structure reads at a glance */}
        <div
          className={`ft-trunk relative mx-auto h-8 ${
            inSet(selected, [LULA_MAE_INDEX, VERSIE_INDEX])
              ? "ft-connector-selected"
              : ""
          }`}
          aria-hidden="true"
        >
          <span
            className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
              inSet(selected, [LULA_MAE_INDEX, VERSIE_INDEX])
                ? "ft-connector-selected"
                : ""
            }`}
            aria-hidden="true"
          />
        </div>

        {!collapsed.lulaVersie && (
          <div className="ft-branch-expanded">
            {/* Family Unit cluster: Lula Mae + Versie couple and their seven
                children, self-contained on a framed plate with short local
                connectors only */}
            <div className="fu-cluster">
              {/* Couple together at the top of the cluster */}
              <div className="fu-couple">
                <PersonCard
                  variant="couple"
                  person={{ id: "lula-mae", name: "Lula Mae", role: "Child" }}
                  index={LULA_MAE_INDEX}
                  selected={selected === LULA_MAE_INDEX}
                  onSelect={() => handleSelect(LULA_MAE_INDEX)}
                  onOpen={() => onOpenProfile("lula-mae")}
                  isMe={meIndex === LULA_MAE_INDEX}
                  onMarkMe={() => setMeIndex(LULA_MAE_INDEX)}
                  profilePhoto={profilePhotos?.["lula-mae"]}
                />
                <span className="fu-couple-line" aria-hidden="true" />
                <PersonCard
                  variant="couple"
                  person={{
                    id: "versie-smith",
                    name: "Versie Smith",
                    role: "Husband",
                  }}
                  index={VERSIE_INDEX}
                  selected={selected === VERSIE_INDEX}
                  onSelect={() => handleSelect(VERSIE_INDEX)}
                  onOpen={() => onOpenProfile("versie-smith")}
                  isMe={meIndex === VERSIE_INDEX}
                  onMarkMe={() => setMeIndex(VERSIE_INDEX)}
                  profilePhoto={profilePhotos?.["versie-smith"]}
                />
              </div>

              {/* Short trunk + junction down to the children label */}
              <div className="fu-trunk" aria-hidden="true" />
              <span className="fu-junction" aria-hidden="true" />

              {/* Their Children label */}
              <div className="fu-children-label">
                <span className="fu-label-rule" aria-hidden="true" />
                Their Children
                <span className="fu-label-rule" aria-hidden="true" />
              </div>

              {/* Seven children as compact clickable cards */}
              <div className="fu-children-grid">
                {lulaVersieChildren.map((child, i) => {
                  const index = LULA_VERSIE_CHILDREN_INDICES[i];
                  return (
                    <div key={child.id} className="flex flex-col items-center">
                      <span className="fu-child-stub" aria-hidden="true" />
                      <PersonCard
                        variant="child"
                        person={child}
                        index={index}
                        selected={selected === index}
                        onSelect={() => handleSelect(index)}
                        onOpen={() => onOpenProfile(child.id)}
                        openOnSelect={false}
                        isMe={meIndex === index}
                        onMarkMe={() => setMeIndex(index)}
                        profilePhoto={profilePhotos?.[child.id]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Versie's maternal line: Harvey (father), Mary Louise Sims
                (first wife), their children, and Gertrude (mother) */}
            <section
              aria-label="Versie's maternal line"
              className="relative mt-2"
            >
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <PersonCard
                  person={{
                    id: harveyAdamsSrProfile.id,
                    name: "Harvey Adams Sr.",
                    role: "Father",
                  }}
                  index={parentsBaseIndex}
                  selected={selected === parentsBaseIndex}
                  onSelect={() => handleSelect(parentsBaseIndex)}
                  onOpen={() => onOpenProfile(harveyAdamsSrProfile.id)}
                  isMe={meIndex === parentsBaseIndex}
                  onMarkMe={() => setMeIndex(parentsBaseIndex)}
                  profilePhoto={profilePhotos?.[harveyAdamsSrProfile.id]}
                />
                <PersonCard
                  person={{
                    id: maryLouiseSimsProfile.id,
                    name: "Mary Louise Sims",
                    role: "First Wife",
                  }}
                  index={parentsBaseIndex + 1}
                  selected={selected === parentsBaseIndex + 1}
                  onSelect={() => handleSelect(parentsBaseIndex + 1)}
                  onOpen={() => onOpenProfile(maryLouiseSimsProfile.id)}
                  isMe={meIndex === parentsBaseIndex + 1}
                  onMarkMe={() => setMeIndex(parentsBaseIndex + 1)}
                  profilePhoto={profilePhotos?.[maryLouiseSimsProfile.id]}
                />
              </div>

              {/* Horizontal relationship line between the two cards */}
              <div
                className={`ft-couple-line pointer-events-none absolute left-1/2 top-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 ${
                  inSet(selected, [HARVEY_INDEX, MARY_LOUISE_INDEX])
                    ? "ft-connector-selected"
                    : ""
                }`}
                aria-hidden="true"
              />

              {/* Vertical trunk dropping from the center of the couple down to
                  the children, ending in a junction where it meets the branch
                  line */}
              <div
                className={`ft-trunk relative mx-auto h-8 ${
                  inSet(selected, [
                    HARVEY_INDEX,
                    MARY_LOUISE_INDEX,
                    ...FIRST_MARRIAGE_CHILDREN_INDICES,
                    GERTRUDE_INDEX,
                  ])
                    ? "ft-connector-selected"
                    : ""
                }`}
                aria-hidden="true"
              >
                <span
                  className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
                    inSet(selected, [
                      HARVEY_INDEX,
                      MARY_LOUISE_INDEX,
                      ...FIRST_MARRIAGE_CHILDREN_INDICES,
                      GERTRUDE_INDEX,
                    ])
                      ? "ft-connector-selected"
                      : ""
                  }`}
                  aria-hidden="true"
                />
              </div>

              {/* Children of Harvey Adams Sr. and Mary Louise Sims */}
              <div className="mt-2 space-y-6">
                {Array.from({
                  length: Math.ceil(
                    firstMarriageChildren.length / CHILDREN_PER_ROW,
                  ),
                }).map((_, row) => {
                  const rowChildren = firstMarriageChildren.slice(
                    row * CHILDREN_PER_ROW,
                    row * CHILDREN_PER_ROW + CHILDREN_PER_ROW,
                  );
                  return (
                    <BranchRow
                      key={rowChildren[0].name}
                      rowChildren={rowChildren}
                      rowOffset={
                        firstMarriageChildrenBaseIndex + row * CHILDREN_PER_ROW
                      }
                      parentIndices={[HARVEY_INDEX, MARY_LOUISE_INDEX]}
                      selected={selected}
                      onSelect={handleSelect}
                      meIndex={meIndex}
                      onMarkMe={setMeIndex}
                      onOpenProfile={onOpenProfile}
                      profilePhotos={profilePhotos}
                    />
                  );
                })}
              </div>

              {/* Vertical trunk dropping from the children down to Gertrude,
                  ending in a junction where it meets the branch line */}
              <div
                className={`ft-trunk relative mx-auto h-8 ${
                  inSet(selected, [
                    ...FIRST_MARRIAGE_CHILDREN_INDICES,
                    GERTRUDE_INDEX,
                  ])
                    ? "ft-connector-selected"
                    : ""
                }`}
                aria-hidden="true"
              >
                <span
                  className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
                    inSet(selected, [
                      ...FIRST_MARRIAGE_CHILDREN_INDICES,
                      GERTRUDE_INDEX,
                    ])
                      ? "ft-connector-selected"
                      : ""
                  }`}
                  aria-hidden="true"
                />
              </div>

              {/* Gertrude Adams-Hill, mother of Versie Smith */}
              <div className="mt-2 flex justify-center">
                <div className="w-full max-w-[calc(50%-0.375rem)] sm:max-w-[calc(50%-0.5rem)]">
                  <PersonCard
                    person={{
                      id: gertrudeAdamsHillProfile.id,
                      name: "Gertrude Adams-Hill",
                      role: "Mother",
                      years: "1913–",
                    }}
                    index={gertrudeIndex}
                    selected={selected === gertrudeIndex}
                    onSelect={() => handleSelect(gertrudeIndex)}
                    onOpen={() => onOpenProfile(gertrudeAdamsHillProfile.id)}
                    isMe={meIndex === gertrudeIndex}
                    onMarkMe={() => setMeIndex(gertrudeIndex)}
                    profilePhoto={profilePhotos?.[gertrudeAdamsHillProfile.id]}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </section>

      {/* Harvey's second marriage: Mary Jane Johnson as his second wife, their
          children Mildred and Christine, and Mildred's daughters */}
      <section aria-label="Harvey's second marriage" className="relative mt-10">
        <BranchFold
          name="Harvey Adams Sr."
          count={6}
          open={!collapsed.harveySecond}
          onToggle={() => toggleBranch("harveySecond")}
          dataOcid="tree.branch.harvey_second"
        />
        {/* Vertical trunk stays visible even when the branch is collapsed
            so the tree structure reads at a glance */}
        <div
          className={`ft-trunk relative mx-auto h-8 ${
            inSet(selected, [
              HARVEY_INDEX,
              MARY_JANE_INDEX,
              ...SECOND_MARRIAGE_CHILDREN_INDICES,
              ...MILDRED_CHILDREN_INDICES,
            ])
              ? "ft-connector-selected"
              : ""
          }`}
          aria-hidden="true"
        >
          <span
            className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
              inSet(selected, [
                HARVEY_INDEX,
                MARY_JANE_INDEX,
                ...SECOND_MARRIAGE_CHILDREN_INDICES,
                ...MILDRED_CHILDREN_INDICES,
              ])
                ? "ft-connector-selected"
                : ""
            }`}
            aria-hidden="true"
          />
        </div>

        {!collapsed.harveySecond && (
          <div className="ft-branch-expanded">
            {/* Harvey and Mary Jane Johnson as a couple */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <PersonCard
                person={{
                  id: harveyAdamsSrProfile.id,
                  name: "Harvey Adams Sr.",
                  role: "Father",
                }}
                index={HARVEY_INDEX}
                selected={selected === HARVEY_INDEX}
                onSelect={() => handleSelect(HARVEY_INDEX)}
                onOpen={() => onOpenProfile(harveyAdamsSrProfile.id)}
                isMe={meIndex === HARVEY_INDEX}
                onMarkMe={() => setMeIndex(HARVEY_INDEX)}
                profilePhoto={profilePhotos?.[harveyAdamsSrProfile.id]}
              />
              <PersonCard
                person={{
                  id: "mary-jane-johnson",
                  name: "Mary Jane Johnson",
                  role: "Second Wife",
                }}
                index={MARY_JANE_INDEX}
                selected={selected === MARY_JANE_INDEX}
                onSelect={() => handleSelect(MARY_JANE_INDEX)}
                onOpen={() => onOpenProfile("mary-jane-johnson")}
                isMe={meIndex === MARY_JANE_INDEX}
                onMarkMe={() => setMeIndex(MARY_JANE_INDEX)}
                profilePhoto={profilePhotos?.["mary-jane-johnson"]}
              />
            </div>

            {/* Horizontal relationship line between the two cards */}
            <div
              className={`ft-couple-line pointer-events-none absolute left-1/2 top-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 ${
                inSet(selected, [HARVEY_INDEX, MARY_JANE_INDEX])
                  ? "ft-connector-selected"
                  : ""
              }`}
              aria-hidden="true"
            />

            {/* Vertical trunk dropping from the center of the couple down to
                the children, ending in a junction where it meets the branch
                line */}
            <div
              className={`ft-trunk relative mx-auto h-8 ${
                inSet(selected, [
                  HARVEY_INDEX,
                  MARY_JANE_INDEX,
                  ...SECOND_MARRIAGE_CHILDREN_INDICES,
                  ...MILDRED_CHILDREN_INDICES,
                ])
                  ? "ft-connector-selected"
                  : ""
              }`}
              aria-hidden="true"
            >
              <span
                className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
                  inSet(selected, [
                    HARVEY_INDEX,
                    MARY_JANE_INDEX,
                    ...SECOND_MARRIAGE_CHILDREN_INDICES,
                    ...MILDRED_CHILDREN_INDICES,
                  ])
                    ? "ft-connector-selected"
                    : ""
                }`}
                aria-hidden="true"
              />
            </div>

            {/* Children of Harvey Adams Sr. and Mary Jane Johnson */}
            <div className="mt-2">
              <BranchRow
                rowChildren={secondMarriageChildren}
                rowOffset={SECOND_MARRIAGE_CHILDREN_INDICES[0]}
                parentIndices={[HARVEY_INDEX, MARY_JANE_INDEX]}
                selected={selected}
                onSelect={handleSelect}
                meIndex={meIndex}
                onMarkMe={setMeIndex}
                onOpenProfile={onOpenProfile}
                profilePhotos={profilePhotos}
              />
            </div>

            {/* Vertical trunk dropping from Mildred down to her daughters,
                ending in a junction where it meets the branch line */}
            <div
              className={`ft-trunk pointer-events-none relative left-[25%] h-8 sm:left-[12.5%] ${
                inSet(selected, [MILDRED_INDEX, ...MILDRED_CHILDREN_INDICES])
                  ? "ft-connector-selected"
                  : ""
              }`}
              aria-hidden="true"
            >
              <span
                className={`ft-junction absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${
                  inSet(selected, [MILDRED_INDEX, ...MILDRED_CHILDREN_INDICES])
                    ? "ft-connector-selected"
                    : ""
                }`}
                aria-hidden="true"
              />
            </div>

            {/* Daughters of Mildred Adams */}
            <div className="mt-2">
              <BranchRow
                rowChildren={mildredChildren}
                rowOffset={MILDRED_CHILDREN_INDICES[0]}
                parentIndices={[MILDRED_INDEX]}
                selected={selected}
                onSelect={handleSelect}
                meIndex={meIndex}
                onMarkMe={setMeIndex}
                onOpenProfile={onOpenProfile}
                profilePhotos={profilePhotos}
              />
            </div>
          </div>
        )}
      </section>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        {selected === null
          ? "Tap a card to highlight a family member."
          : `Selected: “${allPeople[selected]?.name ?? ""}”`}
      </p>
    </div>
  );
}
