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
}

const couple: (Person & { id: string })[] = [
  {
    id: "julia",
    name: "Julia “Julie” Norwood",
    role: "Matriarch",
    photo: profiles.julia.portrait,
  },
  {
    id: "isaiah",
    name: "Isaiah Norwood",
    role: "Patriarch",
    photo: profiles.isaiah.portrait,
  },
];

const children: Person[] = [
  { id: "clayton", name: "Clayton", role: "Child", relationToYou: "uncle" },
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
    spouse: { id: "erma", name: "Erma T. Williams", role: "Second Wife" },
    children: [
      { id: "columbus", name: "Columbus", role: "Child" },
      {
        id: "thomas-clayton",
        name: "Thomas Clayton “Tip / TC”",
        role: "Child",
      },
      { id: "alton", name: "Alton", role: "Child" },
      { id: "robert-davis", name: "Robert Davis “RD”", role: "Child" },
      { id: "ardeanus", name: "Ardeanus", role: "Child" },
      { id: "willie-b", name: "Willie B.", role: "Child" },
      { id: "james", name: "James", role: "Child" },
      { id: "freddie", name: "Freddie", role: "Child" },
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
const HARVEY_INDEX = 28;
const MARY_LOUISE_INDEX = 29;
const FIRST_MARRIAGE_CHILDREN_INDICES = Array.from(
  { length: firstMarriageChildren.length },
  (_, i) => 30 + i,
);
const GERTRUDE_INDEX = 44;

const inSet = (selected: number | null, set: number[]) =>
  selected !== null && set.includes(selected);

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
      {/* Spouses side by side */}
      <div className="relative">
        {/* Vertical connector from Clayton's card down to the marriage bar,
            ending in a junction where it meets the bar */}
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
                branch.spouse.id ? profilePhotos?.[branch.spouse.id] : undefined
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
                length: Math.ceil(branch.children.length / CHILDREN_PER_ROW),
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
    </section>
  );
}

export function FamilyTreePage({
  onBack,
  onOpenProfile,
  profilePhotos,
}: FamilyTreePageProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [meIndex, setMeIndex] = useState<number | null>(null);

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
    },
  ];

  const coupleBaseIndex =
    couple.length +
    children.length +
    claytonBranch.flatMap((branch) => [branch.spouse, ...branch.children])
      .length;
  const parentsBaseIndex = coupleBaseIndex + 2;
  const firstMarriageChildrenBaseIndex = parentsBaseIndex + 2;
  const gertrudeIndex =
    firstMarriageChildrenBaseIndex + firstMarriageChildren.length;

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
          family member.
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
              onSelect={() => setSelected(index)}
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
            onSelect={setSelected}
            meIndex={meIndex}
            onMarkMe={setMeIndex}
            onOpenProfile={onOpenProfile}
            profilePhotos={profilePhotos}
          />
        ))}
      </section>

      {/* Clayton's expanded branch below his card */}
      <ClaytonBranch
        branches={claytonBranch}
        baseIndex={couple.length + children.length}
        selected={selected}
        onSelect={setSelected}
        meIndex={meIndex}
        onMarkMe={setMeIndex}
        onOpenProfile={onOpenProfile}
        profilePhotos={profilePhotos}
      />

      {/* Lula Mae and Versie as a couple */}
      <section aria-label="Lula Mae and Versie" className="relative mt-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <PersonCard
            person={{ id: "lula-mae", name: "Lula Mae", role: "Child" }}
            index={coupleBaseIndex}
            selected={selected === coupleBaseIndex}
            onSelect={() => setSelected(coupleBaseIndex)}
            onOpen={() => onOpenProfile("lula-mae")}
            isMe={meIndex === coupleBaseIndex}
            onMarkMe={() => setMeIndex(coupleBaseIndex)}
            profilePhoto={profilePhotos?.["lula-mae"]}
          />
          <PersonCard
            person={{
              id: "versie-smith",
              name: "Versie Smith",
              role: "Husband",
            }}
            index={coupleBaseIndex + 1}
            selected={selected === coupleBaseIndex + 1}
            onSelect={() => setSelected(coupleBaseIndex + 1)}
            onOpen={() => onOpenProfile("versie-smith")}
            isMe={meIndex === coupleBaseIndex + 1}
            onMarkMe={() => setMeIndex(coupleBaseIndex + 1)}
            profilePhoto={profilePhotos?.["versie-smith"]}
          />
        </div>

        {/* Horizontal relationship line between the two cards */}
        <div
          className={`ft-couple-line pointer-events-none absolute left-1/2 top-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 ${
            inSet(selected, [LULA_MAE_INDEX, VERSIE_INDEX])
              ? "ft-connector-selected"
              : ""
          }`}
          aria-hidden="true"
        />
      </section>

      {/* Vertical trunk dropping from the center of the couple down to Versie,
          ending in a junction where it meets the branch line */}
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

      {/* Versie's maternal line: Harvey (father), Mary Louise Sims (first wife),
          their children, and Gertrude (mother) */}
      <section aria-label="Versie's maternal line" className="relative mt-2">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <PersonCard
            person={{
              id: harveyAdamsSrProfile.id,
              name: "Harvey Adams Sr.",
              role: "Father",
            }}
            index={parentsBaseIndex}
            selected={selected === parentsBaseIndex}
            onSelect={() => setSelected(parentsBaseIndex)}
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
            onSelect={() => setSelected(parentsBaseIndex + 1)}
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

        {/* Vertical trunk dropping from the center of the couple down to the
            children, ending in a junction where it meets the branch line */}
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
            length: Math.ceil(firstMarriageChildren.length / CHILDREN_PER_ROW),
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
                onSelect={setSelected}
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
              }}
              index={gertrudeIndex}
              selected={selected === gertrudeIndex}
              onSelect={() => setSelected(gertrudeIndex)}
              onOpen={() => onOpenProfile(gertrudeAdamsHillProfile.id)}
              isMe={meIndex === gertrudeIndex}
              onMarkMe={() => setMeIndex(gertrudeIndex)}
              profilePhoto={profilePhotos?.[gertrudeAdamsHillProfile.id]}
            />
          </div>
        </div>
      </section>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        {selected === null
          ? "Tap a card to highlight a family member."
          : `Selected: “${allPeople[selected]?.name ?? ""}”`}
      </p>
    </div>
  );
}
