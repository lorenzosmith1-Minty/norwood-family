import { motion } from "motion/react";

export interface Person {
  id?: string;
  name: string;
  role: string;
  photo?: { src: string; alt: string };
  relationToYou?: string;
  years?: string;
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
        className={`ft-card ${selected ? "ft-card-selected" : ""}`}
      >
        {photoSrc ? (
          <span className="ft-card-portrait" aria-hidden="true">
            <img
              src={photoSrc}
              alt={photoAlt}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </span>
        ) : (
          <span className="ft-card-portrait" aria-hidden="true">
            {getInitials(person.name)}
          </span>
        )}
        <span className="ft-card-name">{person.name}</span>
        {person.years && <span className="ft-card-years">{person.years}</span>}
        {selected && (
          <span className="ft-card-detail">
            <span className="ft-role-chip">{person.role}</span>
            <span className="ft-relation-text">
              Relation to You: {person.relationToYou ?? "Not set"}
            </span>
            {isMe && <span className="ft-me-badge">This is me</span>}
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
