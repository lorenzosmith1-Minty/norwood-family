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
  // "branch" (default) renders the anchor-centered tree card; "hb-node" and
  // "hb-couple" render the compact 10,000-foot map nodes; "hb-unit" and
  // "hb-branch" render the compact family-unit and branch-anchor plates.
  variant?: "branch" | "hb-node" | "hb-couple" | "hb-unit" | "hb-branch";
  // Optional count shown on the compact hb-unit / hb-branch plates, e.g.
  // "7 children" or "112 Descendants".
  count?: string;
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
  variant = "branch",
  count,
}: HeritageBranchCardProps) {
  const photoSrc = profilePhoto ?? portrait?.src;
  const photoAlt = profilePhoto
    ? `${person.name}'s profile photo`
    : (portrait?.alt ?? `${person.name}'s initials`);

  // Compact family-unit / branch-anchor plate: a single tappable card that
  // represents a whole unit or line head with an optional count chip, instead
  // of every individual person. "hb-unit" uses the warm aged-paper surface;
  // "hb-branch" uses the bronze branch-anchor plate.
  if (variant === "hb-unit" || variant === "hb-branch") {
    const isBranch = variant === "hb-branch";
    const cardClass = isBranch ? "hb-branch-card" : "hb-unit-card";
    const portraitClass = isBranch ? "hb-branch-portrait" : "hb-unit-portrait";
    const nameClass = isBranch ? "hb-branch-name" : "hb-unit-name";
    return (
      <motion.button
        type="button"
        data-ocid={`hb.${isBranch ? "branch" : "unit"}.${index + 1}`}
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
        <span className={portraitClass} aria-hidden="true">
          {photoSrc ? (
            <img src={photoSrc} alt={photoAlt} loading="lazy" />
          ) : (
            getInitials(person.name)
          )}
        </span>
        <span className={nameClass}>{person.name}</span>
        {count && (
          <span
            className="hb-branch-count"
            data-ocid={`hb.${isBranch ? "branch" : "unit"}.${index + 1}.count`}
          >
            {count}
          </span>
        )}
      </motion.button>
    );
  }

  // Compact 10,000-foot map node: portrait/initials + name. "hb-couple" marks
  // a major couple / branch anchor; "hb-node" is a compact descendant.
  if (variant === "hb-node" || variant === "hb-couple") {
    const isCouple = variant === "hb-couple";
    return (
      <motion.button
        type="button"
        data-ocid={`hb.node.${index + 1}`}
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
        className={`${isCouple ? "hb-couple-anchor" : "hb-node"} focus-visible:outline-none`}
      >
        <span
          className={isCouple ? "hb-couple-portrait" : "hb-node-portrait"}
          aria-hidden="true"
        >
          {photoSrc ? (
            <img src={photoSrc} alt={photoAlt} loading="lazy" />
          ) : (
            getInitials(person.name)
          )}
        </span>
        <span className={isCouple ? "hb-couple-name" : "hb-node-name"}>
          {person.name}
        </span>
      </motion.button>
    );
  }

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
