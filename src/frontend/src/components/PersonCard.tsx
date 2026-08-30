import { motion } from "motion/react";

export interface Person {
  name: string;
  role: string;
  photo?: { src: string; alt: string };
}

interface PersonCardProps {
  person: Person;
  selected: boolean;
  onSelect: () => void;
  index: number;
  onOpen?: () => void;
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

export function PersonCard({
  person,
  selected,
  onSelect,
  index,
  onOpen,
}: PersonCardProps) {
  const handleClick = onOpen ?? onSelect;

  return (
    <motion.button
      type="button"
      data-ocid={`tree.person.${index + 1}`}
      onClick={handleClick}
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
      {person.photo ? (
        <span
          className="mb-3 block h-16 w-16 overflow-hidden rounded-full border-2 border-border bg-card shadow-subtle transition-colors duration-300 group-hover:border-accent/60"
          aria-hidden="true"
        >
          <img
            src={person.photo.src}
            alt={person.photo.alt}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </span>
      ) : (
        <span
          className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full font-display text-lg font-semibold transition-colors duration-300 ${
            selected
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-accent-foreground group-hover:bg-accent group-hover:text-accent-foreground"
          }`}
          aria-hidden="true"
        >
          {getInitials(person.name)}
        </span>
      )}
      <span className="font-display text-base font-semibold leading-snug text-foreground">
        {person.name}
      </span>
      <span className="mt-0.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {person.role}
      </span>
    </motion.button>
  );
}
