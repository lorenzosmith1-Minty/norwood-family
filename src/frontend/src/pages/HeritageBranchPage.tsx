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

interface Cluster {
  id: string;
  title: string;
  /** Major couple / branch anchor nodes rendered as hb-couple cards. */
  anchorIds: string[];
  /** Compact descendant nodes rendered as hb-node cards. */
  nodeIds: string[];
  /** Short summary shown in the hb-count-chip, e.g. "14 children". */
  countLabel: string;
}

/**
 * The bounded 10,000-foot map. Each cluster groups one major line's head and
 * descendants so the whole family reads as a scannable overview without every
 * detail at once. Only documented relationships from FAMILY_GRAPH are shown.
 */
const CLUSTERS: Cluster[] = [
  {
    id: "founding",
    title: "Founding Couple",
    anchorIds: ["julia", "isaiah"],
    nodeIds: [
      "clayton",
      "isaiah-jr",
      "edward",
      "hattie",
      "pinkie",
      "louise",
      "lillie",
      "lula-e",
    ],
    countLabel: "8 children",
  },
  {
    id: "clayton",
    title: "Clayton Branch",
    anchorIds: ["clayton"],
    nodeIds: [
      "elbert",
      "wellman",
      "wetherby",
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
    countLabel: "14 children · 2 marriages",
  },
  {
    id: "lula-versie",
    title: "Lula Mae + Versie Family Unit",
    anchorIds: ["lula-mae", "versie-smith"],
    nodeIds: [],
    countLabel: "7 children",
  },
  {
    id: "smith",
    title: "Smith Branch",
    anchorIds: [],
    nodeIds: [
      "lorenzoSmithSr",
      "versieSmithJr",
      "herbertSmith",
      "alonzoSmith",
      "sherriSmith",
      "beatriceSmith",
      "edSmith",
    ],
    countLabel: "7 children",
  },
  {
    id: "adams",
    title: "Adams Maternal Line",
    anchorIds: ["harvey-adams-sr"],
    nodeIds: [
      "gertrude-adams-hill",
      "john-adams",
      "louis-adams-sr",
      "albert-adams",
      "charles-adams",
      "homer-adams",
      "versie-adams-sr",
      "judge-granberry-adams",
      "fannie-adams",
      "harvey-adams-jr",
      "christine-adams-tucker",
      "robert-adams-sr",
      "ella-mae-adams",
      "eula-lee-adams",
      "mildred-adams",
      "christine-adams",
    ],
    countLabel: "16 children · 2 marriages",
  },
];

/** Short curved descent connector between clusters. */
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
  // Running index across the whole map so every node gets a unique data-ocid.
  let nodeIndex = 0;

  const renderNode = (id: string, variant: "hb-node" | "hb-couple") => {
    const person = toPerson(id);
    const profile = profiles[id];
    const idx = nodeIndex++;
    return (
      <HeritageBranchCard
        key={id}
        person={person}
        portrait={profile?.portrait}
        index={idx}
        selected={false}
        isAnchor={false}
        isMe={false}
        hasDescendants={person.children.length > 0}
        variant={variant}
        onSelect={() => onOpenExploreFamily(id)}
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
          A 10,000-foot view of how the major family lines connect. Tap any
          person to open Explore Family focused on them.
        </p>
      </motion.header>

      {/* Bounded overview map */}
      <motion.div
        className="hb-map mt-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      >
        {CLUSTERS.map((cluster, ci) => (
          <div key={cluster.id}>
            {ci > 0 && <ClusterConnector />}
            <section className="hb-cluster" data-ocid={`hb.cluster.${ci + 1}`}>
              <div className="hb-cluster-head">
                <h2 className="hb-cluster-title">{cluster.title}</h2>
                <span
                  className="hb-count-chip"
                  data-ocid={`hb.cluster.${ci + 1}.count`}
                >
                  {cluster.countLabel}
                </span>
              </div>

              {cluster.anchorIds.length > 0 && (
                <div className="hb-cluster-grid">
                  {cluster.anchorIds.map((id) => renderNode(id, "hb-couple"))}
                </div>
              )}

              {cluster.nodeIds.length > 0 && (
                <div className="hb-cluster-grid">
                  {cluster.nodeIds.map((id) => renderNode(id, "hb-node"))}
                </div>
              )}
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
          This is a simplified overview of the major family lines. Tap any
          person to open Explore Family centered on them for the full detail.
        </p>
      </motion.footer>
    </div>
  );
}
