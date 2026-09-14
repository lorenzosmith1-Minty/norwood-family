import { GitBranch, Users } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { FamilyAccessGate } from "../components/FamilyAccessGate";
import {
  HeritageBranchCard,
  type HeritagePerson,
} from "../components/HeritageBranchCard";
import { useListArchivedProfileIds } from "../hooks/useGovernance";
import { useListConfirmedRelationships } from "../hooks/useRelationshipRequests";
import {
  FAMILY_GRAPH,
  type FamilyGraph,
  overlayConfirmedRelationships,
} from "../types/family";
import { profiles } from "./PersonProfilePage";

interface HeritageBranchPageProps {
  onOpenExploreFamily: (personId: string) => void;
  /** Navigates to the shared sign-in surface from the no-access state. */
  onSignIn: () => void;
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
function toPerson(id: string, graph: FamilyGraph): HeritagePerson {
  const node = graph[id];
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

/**
 * Compute a generation depth for every person in the graph via BFS from the
 * root ancestors (people with no documented parents). Ancestors get a lower
 * number than their descendants, so sorting the map plates by this depth
 * renders ancestors above descendants throughout the Heritage Branch view.
 */
function computeGenerations(graph: FamilyGraph): Map<string, number> {
  const generation = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, node] of Object.entries(graph)) {
    if (!node.father && !node.mother) {
      generation.set(id, 0);
      queue.push(id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const node = graph[id];
    const depth = generation.get(id) ?? 0;
    for (const childId of node?.children ?? []) {
      const child = graph[childId];
      if (!child) continue;
      const next = depth + 1;
      const current = generation.get(childId);
      // A child sits one generation below each parent. When a child has two
      // parents at different depths, use the deeper one so the child never
      // renders above an ancestor.
      if (current === undefined || next > current) {
        generation.set(childId, next);
        queue.push(childId);
      }
    }
  }

  return generation;
}

/**
 * One plate in the bounded overview map, carrying its stable data-ocid cluster
 * id (so reordering never breaks the deterministic markers) and the generation
 * depth used to place ancestors above descendants.
 */
interface MapPlate {
  kind: "unit" | "anchor";
  /** Stable data-ocid cluster id, e.g. "unit_cluster.1" or "branch_cluster.3". */
  clusterId: string;
  title: string;
  personIds: string[];
  generation: number;
}

export default function HeritageBranchPage({
  onOpenExploreFamily,
  onSignIn,
}: HeritageBranchPageProps) {
  // Overlay the backend's confirmed relationships onto the shared graph at
  // render time so approved relationship requests appear in the map without
  // mutating the static FAMILY_GRAPH. Falls back to the static graph when the
  // user is not signed in (no confirmed relationships loaded).
  const { data: confirmed = [] } = useListConfirmedRelationships();
  const graph = useMemo(
    () => overlayConfirmedRelationships(FAMILY_GRAPH, confirmed),
    [confirmed],
  );

  // Hide archived profiles from normal family browsing. Archived person ids
  // come from the backend's non-steward-gated listArchivedProfileIds query.
  const { data: archivedIds = [] } = useListArchivedProfileIds();
  const archived = new Set(archivedIds);
  const visibleUnits = FAMILY_UNITS.filter(
    (unit) => !unit.personIds.every((id) => archived.has(id)),
  );
  const visibleAnchors = BRANCH_ANCHORS.filter(
    (anchor) => !archived.has(anchor.personId),
  );

  // Order the map plates by generation depth so ancestors render above their
  // descendants throughout the view (e.g. Clayton above his daughter Lula Mae).
  // Each plate keeps its stable data-ocid cluster id from its original array
  // position, so reordering never breaks the deterministic markers.
  const generations = computeGenerations(graph);
  const plateGeneration = (personIds: string[]): number => {
    const depths = personIds
      .map((id) => generations.get(id))
      .filter((d): d is number => d !== undefined);
    return depths.length ? Math.min(...depths) : Number.MAX_SAFE_INTEGER;
  };
  const mapPlates: MapPlate[] = [
    ...visibleUnits.map((unit, ui) => ({
      kind: "unit" as const,
      clusterId: `unit_cluster.${ui + 1}`,
      title: unit.title,
      personIds: unit.personIds,
      generation: plateGeneration(unit.personIds),
    })),
    ...visibleAnchors.map((anchor, bi) => ({
      kind: "anchor" as const,
      clusterId: `branch_cluster.${bi + 1}`,
      title: anchor.title,
      personIds: [anchor.personId],
      generation: plateGeneration([anchor.personId]),
    })),
  ].sort((a, b) => a.generation - b.generation);

  // Running index across the whole map so every card gets a unique data-ocid.
  let cardIndex = 0;

  const renderUnitCard = (id: string) => {
    const person = toPerson(id, graph);
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

  const renderBranchCard = (personId: string) => {
    const person = toPerson(personId, graph);
    const profile = profiles[personId];
    const idx = cardIndex++;
    return (
      <HeritageBranchCard
        key={personId}
        person={person}
        portrait={profile?.portrait}
        index={idx}
        selected={false}
        isAnchor={false}
        isMe={false}
        hasDescendants={false}
        variant="hb-branch"
        onSelect={() => onOpenExploreFamily(personId)}
      />
    );
  };

  return (
    <FamilyAccessGate onSignIn={onSignIn}>
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
            A 10,000-foot map of the major family units and branch lines. Tap
            any card to open Explore Family focused on that person.
          </p>
        </motion.header>

        {/* Bounded overview map */}
        <motion.div
          className="hb-map mt-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Map plates (family units + branch anchors) ordered so ancestors
            render above descendants. */}
          {mapPlates.map((plate, pi) => (
            <div key={plate.clusterId}>
              {pi > 0 && <ClusterConnector />}
              <section
                className="hb-cluster"
                data-ocid={`hb.${plate.clusterId}`}
              >
                <div className="hb-cluster-head">
                  <h2 className="hb-cluster-title">{plate.title}</h2>
                </div>
                <div className="hb-cluster-grid">
                  {plate.kind === "unit"
                    ? plate.personIds.map((id) => renderUnitCard(id))
                    : renderBranchCard(plate.personIds[0])}
                </div>
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
            card to open Explore Family centered on that person for the full
            detail.
          </p>
        </motion.footer>
      </div>
    </FamilyAccessGate>
  );
}
