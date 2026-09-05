import { GitBranch, Users } from "lucide-react";
import { motion } from "motion/react";
import {
  HeritageBranchCard,
  type HeritagePerson,
} from "../components/HeritageBranchCard";
import { FAMILY_GRAPH } from "../types/family";
import { profiles } from "./PersonProfilePage";

interface HeritageBranchPageProps {
  onOpenExploreFamily: (personId: string) => void;
}

/**
 * Display names for documented family members who have no profile record yet.
 * These people are still part of the tree and render as compact map nodes, but
 * they have no profile page to open.
 */
const NAME_FALLBACK: Record<string, string> = {
  "isaiah-jr": "Isaiah Jr.",
  edward: "Edward",
  hattie: "Hattie",
  pinkie: "Pinkie",
  louise: "Louise",
  lillie: "Lillie",
  "lula-e": "Lula E.",
  "clayton-son-died": "Son (died at birth)",
};

/** Convert a shared graph node into the compact map card's person shape. */
function toPerson(id: string): HeritagePerson {
  const node = FAMILY_GRAPH[id];
  return {
    id,
    name: profiles[id]?.name ?? NAME_FALLBACK[id] ?? id,
    role: profiles[id]?.role ?? "Family",
    parents: [node?.father, node?.mother].filter((p): p is string =>
      Boolean(p),
    ),
    spouses: node?.spouses ?? [],
    children: node?.children ?? [],
  };
}

/**
 * A compact family-unit plate: a couple (two hb-unit cards side by side).
 * Represents a whole unit as one tappable cluster instead of every individual
 * person.
 */
interface FamilyUnit {
  id: string;
  title: string;
  personIds: string[];
}

/**
 * A compact branch-anchor plate: one line head (hb-branch card) for a major
 * branch line.
 */
interface BranchAnchor {
  id: string;
  title: string;
  personId: string;
}

/**
 * The bounded 10,000-foot map. Major family units and branch anchors render as
 * compact cards instead of every individual person, so the whole family reads
 * as a scannable overview. Only documented relationships from FAMILY_GRAPH are
 * shown, and tapping any card opens Explore Family on the anchor person.
 */
const FAMILY_UNITS: FamilyUnit[] = [
  {
    id: "founding",
    title: "Founding Couple",
    personIds: ["julia", "isaiah"],
  },
  {
    id: "lula-versie",
    title: "Lula Mae + Versie Family Unit",
    personIds: ["lula-mae", "versie-smith"],
  },
];

const BRANCH_ANCHORS: BranchAnchor[] = [
  {
    id: "clayton",
    title: "Clayton Branch",
    personId: "clayton",
  },
  {
    id: "smith",
    title: "Smith Branch",
    personId: "lorenzoSmithSr",
  },
  {
    id: "adams",
    title: "Versie's Maternal / Adams Line",
    personId: "harvey-adams-sr",
  },
];

/** Short curved descent connector between map plates. */
function ClusterConnector() {
  return (
    <svg
      className="hb-connector mx-auto my-1 h-9 w-7"
      viewBox="0 0 28 36"
      aria-hidden="true"
    >
      <path d="M14 0 v20 M14 20 L6 32 M14 20 L22 32" />
    </svg>
  );
}

export default function HeritageBranchPage({
  onOpenExploreFamily,
}: HeritageBranchPageProps) {
  // Running index across the whole map so every card gets a unique data-ocid.
  let cardIndex = 0;

  const renderUnitCard = (id: string) => {
    const person = toPerson(id);
    const profile = profiles[id];
    const idx = cardIndex++;
    return (
      <HeritageBranchCard
        key={id}
        person={person}
        portrait={profile?.portrait}
        index={idx}
        selected={false}
        isAnchor={false}
        isMe={false}
        hasDescendants={false}
        variant="hb-unit"
        onSelect={() => onOpenExploreFamily(id)}
      />
    );
  };

  const renderBranchCard = (anchor: BranchAnchor) => {
    const person = toPerson(anchor.personId);
    const profile = profiles[anchor.personId];
    const idx = cardIndex++;
    return (
      <HeritageBranchCard
        key={anchor.id}
        person={person}
        portrait={profile?.portrait}
        index={idx}
        selected={false}
        isAnchor={false}
        isMe={false}
        hasDescendants={false}
        variant="hb-branch"
        onSelect={() => onOpenExploreFamily(anchor.personId)}
      />
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:py-10">
      {/* Header */}
      <motion.header
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
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
          A 10,000-foot map of the major family units and branch lines. Tap any
          card to open Explore Family focused on that person.
        </p>
      </motion.header>

      {/* Bounded overview map */}
      <motion.div
        className="hb-map mt-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Family units: couple plates */}
        {FAMILY_UNITS.map((unit, ui) => (
          <div key={unit.id}>
            {ui > 0 && <ClusterConnector />}
            <section
              className="hb-cluster"
              data-ocid={`hb.unit_cluster.${ui + 1}`}
            >
              <div className="hb-cluster-head">
                <h2 className="hb-cluster-title">{unit.title}</h2>
              </div>
              <div className="hb-cluster-grid">
                {unit.personIds.map((id) => renderUnitCard(id))}
              </div>
            </section>
          </div>
        ))}

        {/* Branch anchors: line-head plates */}
        {BRANCH_ANCHORS.map((anchor, bi) => (
          <div key={anchor.id}>
            <ClusterConnector />
            <section
              className="hb-cluster"
              data-ocid={`hb.branch_cluster.${bi + 1}`}
            >
              <div className="hb-cluster-head">
                <h2 className="hb-cluster-title">{anchor.title}</h2>
              </div>
              <div className="hb-cluster-grid">{renderBranchCard(anchor)}</div>
            </section>
          </div>
        ))}
      </motion.div>

      {/* Legend / guidance */}
      <motion.footer
        className="mt-6 flex items-start gap-2 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          This is a simplified overview of the major family lines. Tap any card
          to open Explore Family centered on that person for the full detail.
        </p>
      </motion.footer>
    </div>
  );
}
