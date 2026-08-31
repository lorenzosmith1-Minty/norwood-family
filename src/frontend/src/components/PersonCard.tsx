import { motion } from "motion/react";

export interface Person {
  id?: string;
  name: string;
  role: string;
  photo?: { src: string; alt: string };
  relationToYou?: string;
}

interface PersonCardProps {
  person: Person;
  selected: boolean;
  onSelect: () => void;
  index: number;
  onOpen?: () => void;
  isMe?: boolean;
  onMarkMe?: () => void;
  profilePhoto?: string;
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
  isMe = false,
  onMarkMe,
  profilePhoto,
}: PersonCardProps) {
  const handleClick = onOpen ?? onSelect;

  const photoSrc = profilePhoto ?? person.photo?.src;
  const photoAlt = profilePhoto
    ? `${person.name}'s profile photo`
    : (person.photo?.alt ?? `${person.name}'s initials`);

  return (
    <div className="relative flex w-full flex-col items-center">
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
        className={`group flex w-full flex-col items-center rounded-xl border px-3 py-3 text-center shadow-subtle transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          selected
            ? "border-accent bg-accent/15 shadow-elevated"
            : "border-border bg-card hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated"
        }`}
      >
        {photoSrc ? (
          <span
            className="mb-2 block h-12 w-12 overflow-hidden rounded-full border-2 border-border bg-card shadow-subtle transition-colors duration-300 group-hover:border-accent/60"
            aria-hidden="true"
          >
            <img
              src={photoSrc}
              alt={photoAlt}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </span>
        ) : (
          <span
            className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full font-display text-base font-semibold transition-colors duration-300 ${
              selected
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-accent-foreground group-hover:bg-accent group-hover:text-accent-foreground"
            }`}
            aria-hidden="true"
          >
            {getInitials(person.name)}
          </span>
        )}
        {isMe && (
          <span
            data-ocid={`tree.person.${index + 1}.me_badge`}
            className="mb-1 rounded-full border border-accent/40 bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-foreground"
          >
            Me
          </span>
        )}
        <span className="font-display text-sm font-semibold leading-snug text-foreground">
          {person.name}
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {person.role}
        </span>
        {selected && (
          <span className="mt-2 w-full rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] leading-tight text-foreground">
            <span className="font-semibold text-accent-foreground/80">
              Relation to You:
            </span>{" "}
            {person.relationToYou ?? "Not set"}
          </span>
        )}
      </motion.button>

      {selected && !isMe && onMarkMe && (
        <button
          type="button"
          data-ocid={`tree.person.${index + 1}.mark_me`}
          onClick={onMarkMe}
          className="mt-2 inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          This is Me
        </button>
      )}
    </div>
  );
}
