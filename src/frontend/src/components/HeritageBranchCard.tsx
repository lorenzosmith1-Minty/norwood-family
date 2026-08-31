import { motion } from "motion/react";

export interface HeritagePerson {
  id: string;
  name: string;
  role: string;
  parents: string[];
  spouses: string[];
  children: string[];
}

interface HeritageBranchCardProps {
  person: HeritagePerson;
  portrait?: { src: string; alt: string };
  selected: boolean;
  isAnchor: boolean;
  isMe: boolean;
  hasDescendants: boolean;
  large?: boolean;
  onSelect: () => void;
  profilePhoto?: string;
  index: number;
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

export function HeritageBranchCard({
  person,
  portrait,
  selected,
  isAnchor,
  isMe,
  hasDescendants,
  large = false,
  onSelect,
  profilePhoto,
  index,
}: HeritageBranchCardProps) {
  const photoSrc = profilePhoto ?? portrait?.src;
  const photoAlt = profilePhoto
    ? `${person.name}'s profile photo`
    : (portrait?.alt ?? `${person.name}'s initials`);

  const cardClass = [
    "branch-card",
    large ? "min-w-[6rem] px-3 py-3" : "",
    isAnchor ? "branch-card-anchor" : "",
    selected ? "branch-card-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.button
      type="button"
      data-ocid={`branch.person.${index + 1}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${person.name}, ${person.role}`}
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={`${cardClass} focus-visible:outline-none`}
    >
      <span
        className={`branch-portrait ${large ? "h-16 w-16 text-xl" : ""}`}
        aria-hidden="true"
      >
        {photoSrc ? (
          <img src={photoSrc} alt={photoAlt} loading="lazy" />
        ) : (
          getInitials(person.name)
        )}
      </span>
      <span className={`branch-card-name ${large ? "text-sm" : ""}`}>
        {person.name}
      </span>
      <span className="branch-card-relation">{person.role}</span>
      {isAnchor && (
        <span className="branch-anchor-chip mt-1">
          <span className="branch-anchor-dot" aria-hidden="true" />
          Anchor
        </span>
      )}
      {isMe && (
        <span
          data-ocid={`branch.person.${index + 1}.me_badge`}
          className="mt-1 rounded-full border border-accent/40 bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-foreground"
        >
          Me
        </span>
      )}
      {hasDescendants && !isAnchor && (
        <span
          data-ocid={`branch.person.${index + 1}.descendants`}
          className="branch-collapsed-dot mt-1"
          aria-label="Has descendants — anchor here to expand"
        >
          +
        </span>
      )}
    </motion.button>
  );
}
