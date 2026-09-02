import { motion } from "motion/react";

export interface Person {
  id?: string;
  name: string;
  role: string;
  photo?: { src: string; alt: string };
  relationToYou?: string;
  years?: string;
}

export type CardVariant = "default" | "couple" | "child" | "relative";

interface PersonCardProps {
  person: Person;
  selected: boolean;
  onSelect: () => void;
  index: number;
  onOpen?: () => void;
  isMe?: boolean;
  onMarkMe?: () => void;
  profilePhoto?: string;
  variant?: CardVariant;
  // When true (default), clicking the card also opens the person's profile
  // (onOpen). When false, clicking only selects the card so the Relation to
  // You / This is Me reveal stays visible, and the profile opens through the
  // reveal's "Open Profile" button. Used by the Family Unit child cards.
  openOnSelect?: boolean;
  // Relationship label shown on the compact "relative" card (Explore Family).
  // Falls back to `person.role` when omitted.
  relationLabel?: string;
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
  variant = "default",
  openOnSelect = true,
  relationLabel,
}: PersonCardProps) {
  // Selecting a card records it as the current selection so the
  // Relation-to-You / This-is-Me reveal is available. By default the same
  // click also opens the person's profile (onOpen); the Family Unit child
  // cards set openOnSelect={false} so clicking only selects them and the
  // profile opens through the reveal's "Open Profile" button.
  const handleClick = () => {
    onSelect();
    if (openOnSelect) {
      onOpen?.();
    }
  };

  const photoSrc = profilePhoto ?? person.photo?.src;
  const photoAlt = profilePhoto
    ? `${person.name}'s profile photo`
    : (person.photo?.alt ?? `${person.name}'s initials`);

  // Compact Explore Family relative card: portrait/initials + name + a simple
  // relationship label. Tapping it recenters the view on that person.
  if (variant === "relative") {
    return (
      <motion.button
        type="button"
        data-ocid={`explore.relative.${index + 1}`}
        onClick={onSelect}
        aria-pressed={selected}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: index * 0.05,
          ease: [0.4, 0, 0.2, 1],
        }}
        className="ex-relative-card focus-visible:outline-none"
      >
        <span className="ex-relative-portrait" aria-hidden="true">
          {photoSrc ? (
            <img
              src={photoSrc}
              alt={photoAlt}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            getInitials(person.name)
          )}
        </span>
        <span className="ex-relative-name">{person.name}</span>
        <span className="ex-relative-relation">
          {relationLabel ?? person.role}
        </span>
      </motion.button>
    );
  }

  const isFu = variant === "couple" || variant === "child";
  const cardClass = isFu
    ? `${variant === "couple" ? "fu-couple-card" : "fu-child-card"} ${
        selected ? "border-[oklch(var(--branch-selected))]" : ""
      }`
    : `ft-card ${selected ? "ft-card-selected" : ""}`;
  const portraitClass = isFu
    ? `${variant === "couple" ? "fu-couple-portrait" : "fu-child-portrait"} ${
        selected ? "shadow-[0_0_0_2px_oklch(var(--branch-selected))]" : ""
      }`
    : "ft-card-portrait";
  const nameClass = isFu
    ? variant === "couple"
      ? "fu-couple-name"
      : "fu-child-name"
    : "ft-card-name";

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
        className={cardClass}
      >
        {photoSrc ? (
          <span className={portraitClass} aria-hidden="true">
            <img
              src={photoSrc}
              alt={photoAlt}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </span>
        ) : (
          <span className={portraitClass} aria-hidden="true">
            {getInitials(person.name)}
          </span>
        )}
        <span className={nameClass}>{person.name}</span>
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

      {selected && (onOpen || (!isMe && onMarkMe)) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {!openOnSelect && onOpen && (
            <button
              type="button"
              data-ocid={`tree.person.${index + 1}.open_profile`}
              onClick={onOpen}
              className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Open Profile
            </button>
          )}
          {!isMe && onMarkMe && (
            <button
              type="button"
              data-ocid={`tree.person.${index + 1}.mark_me`}
              onClick={onMarkMe}
              className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              This is Me
            </button>
          )}
        </div>
      )}
    </div>
  );
}
