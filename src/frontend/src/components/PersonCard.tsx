import { motion } from "motion/react";

export interface Person {
  name: string;
  role: string;
}

interface PersonCardProps {
  person: Person;
  selected: boolean;
  onSelect: () => void;
  index: number;
}

export function PersonCard({
  person,
  selected,
  onSelect,
  index,
}: PersonCardProps) {
  return (
    <motion.button
      type="button"
      data-ocid={`tree.person.${index + 1}`}
      onClick={onSelect}
      aria-pressed={selected}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.1 + index * 0.06,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={`group flex w-full flex-col items-center rounded-2xl border px-4 py-4 text-center shadow-subtle transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        selected
          ? "border-accent bg-accent/15 shadow-elevated"
          : "border-border bg-card hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated"
      }`}
    >
      <span
        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full font-display text-lg font-semibold transition-colors duration-300 ${
          selected
            ? "bg-accent text-accent-foreground"
            : "bg-secondary text-accent-foreground group-hover:bg-accent group-hover:text-accent-foreground"
        }`}
        aria-hidden="true"
      >
        {person.name.charAt(0)}
      </span>
      <span className="font-display text-base font-semibold leading-snug text-foreground">
        {person.name}
      </span>
      <span className="mt-0.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {person.role}
      </span>
    </motion.button>
  );
}
