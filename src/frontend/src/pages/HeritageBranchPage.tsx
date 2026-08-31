import {
  ArrowLeft,
  Check,
  ExternalLink,
  GitBranch,
  Route,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import {
  HeritageBranchCard,
  type HeritagePerson,
} from "../components/HeritageBranchCard";
import { profiles } from "./PersonProfilePage";

interface HeritageBranchPageProps {
  onBack: () => void;
  onOpenProfile: (id: string) => void;
  profilePhotos?: Record<string, string>;
}

/**
 * Documented family relationships, derived from the existing FamilyTreePage
 * tree data (couple, children, claytonBranch) and the profiles record. Only
 * relationships present in the family record are included — nothing is
 * invented. People without a profile entry (e.g. Isaiah Jr., Edward, Hattie)
 * are still documented members of the tree and render as selectable cards,
 * but they have no profile to open.
 */
const HERITAGE: Record<string, HeritagePerson> = {
  julia: {
    id: "julia",
    name: "Julia “Julie” Norwood",
    role: "Matriarch",
    parents: [],
    spouses: ["isaiah"],
    children: [
      "clayton",
      "isaiah-jr",
      "edward",
      "hattie",
      "pinkie",
      "louise",
      "lillie",
      "lula-e",
    ],
  },
  isaiah: {
    id: "isaiah",
    name: "Isaiah Norwood",
    role: "Patriarch",
    parents: [],
    spouses: ["julia"],
    children: [
      "clayton",
      "isaiah-jr",
      "edward",
      "hattie",
      "pinkie",
      "louise",
      "lillie",
      "lula-e",
    ],
  },
  clayton: {
    id: "clayton",
    name: "Clayton Norwood",
    role: "Son",
    parents: ["julia", "isaiah"],
    spouses: ["hudson", "erma"],
    children: [
      "elbert",
      "wellman",
      "wetherby",
      "clayton-son-died",
      "columbus",
      "thomas-clayton",
      "alton",
      "robert-davis",
      "ardeanus",
      "willie-b",
      "james",
      "freddie",
      "zelia-mae",
      "lula-mae",
    ],
  },
  "isaiah-jr": {
    id: "isaiah-jr",
    name: "Isaiah Jr.",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  edward: {
    id: "edward",
    name: "Edward",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  hattie: {
    id: "hattie",
    name: "Hattie",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  pinkie: {
    id: "pinkie",
    name: "Pinkie",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  louise: {
    id: "louise",
    name: "Louise",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  lillie: {
    id: "lillie",
    name: "Lillie",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  "lula-e": {
    id: "lula-e",
    name: "Lula E.",
    role: "Child",
    parents: ["julia", "isaiah"],
    spouses: [],
    children: [],
  },
  hudson: {
    id: "hudson",
    name: "Ms. Hudson",
    role: "First Wife",
    parents: [],
    spouses: ["clayton"],
    children: ["elbert", "wellman", "wetherby", "clayton-son-died"],
  },
  erma: {
    id: "erma",
    name: "Erma T. Williams",
    role: "Second Wife",
    parents: [],
    spouses: ["clayton"],
    children: [
      "columbus",
      "thomas-clayton",
      "alton",
      "robert-davis",
      "ardeanus",
      "willie-b",
      "james",
      "freddie",
      "zelia-mae",
      "lula-mae",
    ],
  },
  elbert: {
    id: "elbert",
    name: "Elbert Norwood",
    role: "Son",
    parents: ["clayton", "hudson"],
    spouses: [],
    children: [],
  },
  wellman: {
    id: "wellman",
    name: "Wellman Norwood",
    role: "Son",
    parents: ["clayton", "hudson"],
    spouses: [],
    children: [],
  },
  wetherby: {
    id: "wetherby",
    name: "Wetherby Norwood",
    role: "Son",
    parents: ["clayton", "hudson"],
    spouses: [],
    children: [],
  },
  "clayton-son-died": {
    id: "clayton-son-died",
    name: "Son (died at birth)",
    role: "Child",
    parents: ["clayton", "hudson"],
    spouses: [],
    children: [],
  },
  columbus: {
    id: "columbus",
    name: "Columbus Norwood",
    role: "Son",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  "thomas-clayton": {
    id: "thomas-clayton",
    name: "Thomas Clayton “Tip / TC”",
    role: "Son",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  alton: {
    id: "alton",
    name: "Alton Norwood",
    role: "Son",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  "robert-davis": {
    id: "robert-davis",
    name: "Robert Davis “RD”",
    role: "Son",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  ardeanus: {
    id: "ardeanus",
    name: "Ardeanus",
    role: "Child",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  "willie-b": {
    id: "willie-b",
    name: "Willie B.",
    role: "Child",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  james: {
    id: "james",
    name: "James",
    role: "Child",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  freddie: {
    id: "freddie",
    name: "Freddie",
    role: "Child",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  "zelia-mae": {
    id: "zelia-mae",
    name: "Zelia Mae",
    role: "Child",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
  "lula-mae": {
    id: "lula-mae",
    name: "Lula Mae",
    role: "Child",
    parents: ["clayton", "erma"],
    spouses: [],
    children: [],
  },
};

function getSiblings(id: string): string[] {
  const person = HERITAGE[id];
  const siblingSet = new Set<string>();
  for (const parentId of person.parents) {
    for (const childId of HERITAGE[parentId].children) {
      if (childId !== id) siblingSet.add(childId);
    }
  }
  return [...siblingSet];
}

/** Gentle curved trunk connecting a single parent/center down to the next row. */
function TrunkConnector() {
  return (
    <svg
      className="branch-connector my-1 h-8 w-8"
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <path d="M16 0 C 20 12, 12 20, 16 32" />
    </svg>
  );
}

/** Short horizontal relationship line between the anchor and a spouse. */
function HorizontalConnector() {
  return (
    <svg
      className="branch-connector h-1 w-8"
      viewBox="0 0 32 4"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 2 L32 2" />
    </svg>
  );
}

/**
 * Organic branch connector: a curved trunk drops from the row above onto a
 * horizontal bar, then curved stubs descend to each card in the row below.
 */
function RowConnector({ count }: { count: number }) {
  const xs = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100);
  return (
    <svg
      className="branch-connector my-1 h-10 w-full"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M50 0 C 50 10, 50 10, 50 18" />
      <path d={`M${xs[0]} 18 L${xs[xs.length - 1]} 18`} />
      {xs.map((x) => (
        <path key={x} d={`M${x} 18 C ${x} 26, ${x} 26, ${x} 40`} />
      ))}
    </svg>
  );
}

type Revealed = "relation" | "path" | null;

export function HeritageBranchPage({
  onBack,
  onOpenProfile,
  profilePhotos,
}: HeritageBranchPageProps) {
  const [anchorId, setAnchorId] = useState<string>("julia");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed>(null);

  const anchor = HERITAGE[anchorId];
  const parents = anchor.parents;
  const spouses = anchor.spouses;
  const siblings = getSiblings(anchorId);
  const children = anchor.children;

  const leftSpouses = spouses.slice(0, Math.ceil(spouses.length / 2));
  const rightSpouses = spouses.slice(Math.ceil(spouses.length / 2));

  const selected = selectedId ? HERITAGE[selectedId] : null;
  const selectedProfile = selectedId ? profiles[selectedId] : undefined;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setRevealed(null);
  };

  const handleAnchorHere = () => {
    if (!selectedId) return;
    setAnchorId(selectedId);
    setSelectedId(null);
    setRevealed(null);
  };

  const renderCard = (id: string, index: number, large = false) => {
    const person = HERITAGE[id];
    const profile = profiles[id];
    return (
      <HeritageBranchCard
        key={id}
        person={person}
        portrait={profile?.portrait}
        index={index}
        selected={selectedId === id}
        isAnchor={anchorId === id}
        isMe={meId === id}
        hasDescendants={person.children.length > 0}
        large={large}
        onSelect={() => handleSelect(id)}
        profilePhoto={profilePhotos?.[id]}
      />
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:py-10">
      {/* Header */}
      <motion.header
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          data-ocid="branch.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Back to Family Tree
        </button>

        <span className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
          <GitBranch
            className="h-4 w-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          The Norwood Family
        </span>
        <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Heritage Branch View
        </h1>
        <p className="mt-3 max-w-md text-base text-muted-foreground">
          Explore {anchor.name.split(" ")[0]}'s direct lineage. Tap a person to
          select them, then anchor the tree around them to reveal their own
          branch.
        </p>

        <div className="branch-anchor-chip mt-5">
          <span className="branch-anchor-dot" aria-hidden="true" />
          Anchor: {anchor.name}
        </div>
      </motion.header>

      {/* Tree canvas */}
      <motion.div
        className="branch-canvas mt-8 rounded-2xl border border-border/60 px-3 py-8 sm:px-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex flex-col items-center">
          {/* Parents above the anchor */}
          {parents.length > 0 && (
            <>
              <div className="flex justify-center gap-3">
                {parents.map((id, i) => renderCard(id, i))}
              </div>
              <TrunkConnector />
            </>
          )}

          {/* Anchor row: spouse(s) beside the anchor */}
          <div className="flex items-center justify-center gap-2">
            {leftSpouses.map((id, i) => (
              <span key={id} className="flex items-center gap-2">
                {renderCard(id, i)}
                <HorizontalConnector />
              </span>
            ))}
            {renderCard(anchorId, parents.length + leftSpouses.length, true)}
            {rightSpouses.map((id, i) => (
              <span key={id} className="flex items-center gap-2">
                <HorizontalConnector />
                {renderCard(id, parents.length + leftSpouses.length + 1 + i)}
              </span>
            ))}
          </div>

          {/* Siblings nearby */}
          {siblings.length > 0 && (
            <>
              <RowConnector count={siblings.length} />
              <div className="flex flex-wrap justify-center gap-3">
                {siblings.map((id, i) => renderCard(id, i))}
              </div>
            </>
          )}

          {/* Children below */}
          {children.length > 0 && (
            <>
              <RowConnector count={children.length} />
              <div className="flex flex-wrap justify-center gap-3">
                {children.map((id, i) => renderCard(id, i))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Action rail revealed when a person is selected */}
      {selected && (
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-elevated">
            <p className="mb-3 text-center font-display text-lg font-semibold text-foreground">
              {selected.name}
            </p>
            <div className="branch-actions">
              <button
                type="button"
                data-ocid="branch.action.relation"
                onClick={() =>
                  setRevealed((r) => (r === "relation" ? null : "relation"))
                }
                aria-expanded={revealed === "relation"}
                className="branch-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                Relation to You
              </button>
              <button
                type="button"
                data-ocid="branch.action.path"
                onClick={() =>
                  setRevealed((r) => (r === "path" ? null : "path"))
                }
                aria-expanded={revealed === "path"}
                className="branch-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Route className="h-3.5 w-3.5" aria-hidden="true" />
                Relationship Path
              </button>
              <button
                type="button"
                data-ocid="branch.action.open_profile"
                onClick={() => selectedProfile && onOpenProfile(selected.id)}
                disabled={!selectedProfile}
                className="branch-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open Profile
              </button>
              <button
                type="button"
                data-ocid="branch.action.anchor"
                onClick={handleAnchorHere}
                className="branch-action branch-action-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                Anchor Tree Here
              </button>
              <button
                type="button"
                data-ocid="branch.action.mark_me"
                onClick={() => setMeId(selected.id)}
                disabled={meId === selected.id}
                className="branch-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                This is Me
              </button>
            </div>

            {revealed === "relation" && (
              <div
                data-ocid="branch.action.relation.value"
                className="mt-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-center text-sm text-foreground"
              >
                <span className="font-semibold text-accent-foreground/80">
                  Relation to You:
                </span>{" "}
                {selectedProfile?.relationToYou ?? "Not recorded"}
              </div>
            )}
            {revealed === "path" && (
              <div
                data-ocid="branch.action.path.value"
                className="mt-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-center text-sm text-foreground"
              >
                <span className="font-semibold text-accent-foreground/80">
                  Relationship Path:
                </span>{" "}
                {selectedProfile?.relationshipPath?.length
                  ? selectedProfile.relationshipPath.join(" → ")
                  : "Not recorded"}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
