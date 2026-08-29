import { ArrowLeft, TreePine } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { type Person, PersonCard } from "../components/PersonCard";

interface FamilyTreePageProps {
  onBack: () => void;
}

const couple: Person[] = [
  { name: "Julia “Julie” Norwood", role: "Matriarch" },
  { name: "Isaiah Norwood", role: "Patriarch" },
];

const children: Person[] = [
  { name: "Clayton", role: "Child" },
  { name: "Isaiah Jr.", role: "Child" },
  { name: "Edward", role: "Child" },
  { name: "Hattie", role: "Child" },
  { name: "Pinkie", role: "Child" },
  { name: "Louise", role: "Child" },
  { name: "Lillie", role: "Child" },
  { name: "Lula E.", role: "Child" },
];

export function FamilyTreePage({ onBack }: FamilyTreePageProps) {
  const [selected, setSelected] = useState<number | null>(null);

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

      {/* Couple */}
      <section
        aria-label="Starting couple"
        className="mt-10 grid grid-cols-2 gap-3 sm:gap-4"
      >
        {couple.map((person, index) => (
          <PersonCard
            key={person.name}
            person={person}
            index={index}
            selected={selected === index}
            onSelect={() => setSelected(index)}
          />
        ))}
      </section>

      {/* Connecting line from couple to children */}
      <div
        className="relative mx-auto my-2 flex h-8 w-px bg-border"
        aria-hidden="true"
      >
        <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-border" />
      </div>

      {/* Children */}
      <section
        aria-label="Children"
        className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
      >
        {children.map((person, index) => (
          <PersonCard
            key={person.name}
            person={person}
            index={index + couple.length}
            selected={selected === index + couple.length}
            onSelect={() => setSelected(index + couple.length)}
          />
        ))}
      </section>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        {selected === null
          ? "Tap a card to highlight a family member."
          : `Selected: “${[...couple, ...children][selected].name}”`}
      </p>
    </div>
  );
}
