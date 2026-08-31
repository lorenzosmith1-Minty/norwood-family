import { ArrowLeft, TreePine } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { type Person, PersonCard } from "../components/PersonCard";
import { profiles } from "./PersonProfilePage";

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
      { name: "Ardeanus", role: "Child" },
      { name: "Willie B.", role: "Child" },
      { name: "James", role: "Child" },
      { name: "Freddie", role: "Child" },
      { name: "Zelia Mae", role: "Child" },
      { name: "Lula Mae", role: "Child" },
    ],
  },
];

const CHILDREN_PER_ROW = 4;

interface BranchRowProps {
  rowChildren: Person[];
  rowOffset: number;
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
  selected,
  onSelect,
  meIndex,
  onMarkMe,
  onOpenProfile,
  profilePhotos,
}: BranchRowProps) {
  return (
    <div className="relative">
      {/* Horizontal branch bar spanning the row */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-border"
        aria-hidden="true"
      />
      {/* Vertical stubs dropping from the bar down to each child */}
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {rowChildren.map((person) => (
          <div key={person.name} className="flex justify-center">
            <div className="h-6 w-px bg-border" aria-hidden="true" />
          </div>
        ))}
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

  return (
    <section aria-label="Clayton's branch" className="relative mt-2">
      {/* Vertical connector from Clayton's card down to the spouses */}
      <div
        className="pointer-events-none absolute left-[25%] top-0 h-8 w-px bg-border sm:left-[12.5%]"
        aria-hidden="true"
      />

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
                branch.spouse.id ? profilePhotos?.[branch.spouse.id] : undefined
              }
            />
          ))}
        </div>
        {/* Horizontal relationship line between the two spouses */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-px w-1/2 -translate-x-1/2 -translate-y-1/2 bg-border"
          aria-hidden="true"
        />
      </div>

      {/* Children under each spouse */}
      <div className="mt-6 space-y-6">
        {branches.map((branch, i) => (
          <div key={branch.spouse.name}>
            {/* Vertical connector from the spouse down to their children */}
            <div
              className="relative mx-auto flex h-6 w-px bg-border"
              aria-hidden="true"
            />
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
        ))}
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
  ];

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
          className="pointer-events-none absolute left-1/2 top-1/2 h-px w-1/2 -translate-x-1/2 -translate-y-1/2 bg-border"
          aria-hidden="true"
        />
      </section>

      {/* Vertical trunk dropping from the center of the couple */}
      <div
        className="relative mx-auto flex h-8 w-px bg-border"
        aria-hidden="true"
      >
        <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-border" />
      </div>

      {/* Children branching below the couple */}
      <section aria-label="Children" className="mt-2 space-y-6">
        {rows.map((row) => (
          <BranchRow
            key={row.people[0].name}
            rowChildren={row.people}
            rowOffset={row.offset}
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

      <p className="mt-10 text-center text-sm text-muted-foreground">
        {selected === null
          ? "Tap a card to highlight a family member."
          : `Selected: “${allPeople[selected]?.name ?? ""}”`}
      </p>
    </div>
  );
}
