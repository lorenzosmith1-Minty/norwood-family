import {
  ArrowLeft,
  Check,
  ExternalLink,
  GitBranch,
  Route,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useState } from "react";
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
 * invented. Gertrude Adams-Hill is documented as Versie Smith's mother and
 * Harvey Adams Sr. as Gertrude's father; both have profile entries and open
 * via the Open Profile action. People without a profile entry (e.g. Isaiah
 * Jr., Edward, Hattie) are still documented members of the tree and render as
 * selectable cards, but they have no profile to open.
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
    spouses: ["versie-smith"],
    children: [],
  },
  "versie-smith": {
    id: "versie-smith",
    name: "Versie Smith",
    role: "Husband",
    parents: ["gertrude-adams-hill"],
    spouses: ["lula-mae"],
    children: [],
  },
  "gertrude-adams-hill": {
    id: "gertrude-adams-hill",
    name: "Gertrude Adams-Hill",
    role: "Mother",
    parents: ["harvey-adams-sr"],
    spouses: [],
    children: ["versie-smith"],
  },
  "harvey-adams-sr": {
    id: "harvey-adams-sr",
    name: "Harvey Adams Sr.",
    role: "Father",
    parents: [],
    spouses: ["mary-louise-sims", "mary-jane-johnson"],
    children: [
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
  },
  "mary-louise-sims": {
    id: "mary-louise-sims",
    name: "Mary Louise Sims",
    role: "First Wife",
    parents: [],
    spouses: ["harvey-adams-sr"],
    children: [
      "john-adams",
      "louis-adams-sr",
      "albert-adams",
      "charles-adams",
      "homer-adams",
      "versie-adams-sr",
      "judge-granberry-adams",
      "fannie-adams",
      "gertrude-adams-hill",
      "harvey-adams-jr",
      "christine-adams-tucker",
      "robert-adams-sr",
      "ella-mae-adams",
      "eula-lee-adams",
    ],
  },
  "mary-jane-johnson": {
    id: "mary-jane-johnson",
    name: "Mary Jane Johnson",
    role: "Second Wife",
    parents: [],
    spouses: ["harvey-adams-sr"],
    children: ["mildred-adams", "christine-adams"],
  },
  "mildred-adams": {
    id: "mildred-adams",
    name: "Mildred Adams",
    role: "Daughter",
    parents: ["harvey-adams-sr", "mary-jane-johnson"],
    spouses: [],
    children: ["tammy", "punchy", "patricia-rollins"],
  },
  "christine-adams": {
    id: "christine-adams",
    name: "Christine Adams",
    role: "Daughter",
    parents: ["harvey-adams-sr", "mary-jane-johnson"],
    spouses: [],
    children: [],
  },
  tammy: {
    id: "tammy",
    name: "Tammy",
    role: "Daughter",
    parents: ["mildred-adams"],
    spouses: [],
    children: [],
  },
  punchy: {
    id: "punchy",
    name: "Punchy",
    role: "Daughter",
    parents: ["mildred-adams"],
    spouses: [],
    children: [],
  },
  "patricia-rollins": {
    id: "patricia-rollins",
    name: "Patricia Rollins",
    role: "Daughter",
    parents: ["mildred-adams"],
    spouses: [],
    children: [],
  },
  "john-adams": {
    id: "john-adams",
    name: "John Adams",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "louis-adams-sr": {
    id: "louis-adams-sr",
    name: "Louis Adams Sr.",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "albert-adams": {
    id: "albert-adams",
    name: "Albert Adams",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "charles-adams": {
    id: "charles-adams",
    name: "Charles Adams",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "homer-adams": {
    id: "homer-adams",
    name: "Homer Adams",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "versie-adams-sr": {
    id: "versie-adams-sr",
    name: "Versie Adams Sr.",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "judge-granberry-adams": {
    id: "judge-granberry-adams",
    name: "Judge Granberry Adams",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "fannie-adams": {
    id: "fannie-adams",
    name: "Fannie Adams",
    role: "Daughter",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "harvey-adams-jr": {
    id: "harvey-adams-jr",
    name: "Harvey Adams Jr.",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "christine-adams-tucker": {
    id: "christine-adams-tucker",
    name: "Christine Adams Tucker",
    role: "Daughter",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "robert-adams-sr": {
    id: "robert-adams-sr",
    name: "Robert Adams Sr.",
    role: "Son",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "ella-mae-adams": {
    id: "ella-mae-adams",
    name: "Ella Mae Adams",
    role: "Daughter",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
    spouses: [],
    children: [],
  },
  "eula-lee-adams": {
    id: "eula-lee-adams",
    name: "Eula Lee Adams",
    role: "Daughter",
    parents: ["harvey-adams-sr", "mary-louise-sims"],
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

/**
 * Vertical trunk descending from the center of a couple connection, ending in
 * a junction diamond. Uses the shared .ft-* connector system.
 */
function TrunkConnector({ selected = false }: { selected?: boolean }) {
  return (
    <div className="relative my-1 h-8 w-8" aria-hidden="true">
      <span
        className={`ft-trunk absolute left-1/2 top-0 h-full -translate-x-1/2 ${
          selected ? "ft-connector-selected" : ""
        }`}
      />
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <span
          className={`ft-junction block ${
            selected ? "ft-connector-selected" : ""
          }`}
        />
      </span>
    </div>
  );
}

/**
 * Distinct horizontal relationship line joining the anchor and a spouse.
 * Uses the shared .ft-couple-line class so couples read as a clear bar.
 */
function HorizontalConnector({ selected = false }: { selected?: boolean }) {
  return (
    <span
      className={`ft-couple-line w-8 shrink-0 ${
        selected ? "ft-connector-selected" : ""
      }`}
      aria-hidden="true"
    />
  );
}

/**
 * Branch connector: a vertical trunk drops from the row above onto a junction
 * diamond, then a horizontal bar spans the children and short stubs descend to
 * each card. Each parent-to-child stub carries a subtle downward chevron.
 */
function RowConnector({
  count,
  selected = false,
}: {
  count: number;
  selected?: boolean;
}) {
  return (
    <div className="relative my-1 h-10 w-full" aria-hidden="true">
      {/* Trunk descending from the couple center to the junction */}
      <span
        className={`ft-trunk absolute left-1/2 top-0 h-[18px] -translate-x-1/2 ${
          selected ? "ft-connector-selected" : ""
        }`}
      />
      {/* Junction diamond where the trunk meets the branch line */}
      <span className="absolute left-1/2 top-[18px] -translate-x-1/2">
        <span
          className={`ft-junction block ${
            selected ? "ft-connector-selected" : ""
          }`}
        />
      </span>
      {/* Horizontal branch bar spanning the children */}
      <span
        className={`ft-couple-line absolute left-0 right-0 top-[22px] ${
          selected ? "ft-connector-selected" : ""
        }`}
      />
      {/* Child stubs + downward direction chevrons */}
      {Array.from({ length: count }, (_, i) => {
        const x = ((i + 0.5) / count) * 100;
        return (
          <Fragment key={x}>
            <span
              className={`ft-child-stub absolute top-[22px] h-[18px] -translate-x-1/2 ${
                selected ? "ft-connector-selected" : ""
              }`}
              style={{ left: `${x}%` }}
            />
            <span
              className="absolute top-[30px]"
              style={{ left: `calc(${x}% - 0.225rem)` }}
            >
              <span
                className={`ft-chevron block ${
                  selected ? "ft-connector-selected" : ""
                }`}
              />
            </span>
          </Fragment>
        );
      })}
    </div>
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
              <TrunkConnector
                selected={
                  selectedId === anchorId || parents.includes(selectedId ?? "")
                }
              />
            </>
          )}

          {/* Anchor row: spouse(s) beside the anchor */}
          <div className="flex items-center justify-center gap-2">
            {leftSpouses.map((id, i) => (
              <span key={id} className="flex items-center gap-2">
                {renderCard(id, i)}
                <HorizontalConnector
                  selected={selectedId === anchorId || selectedId === id}
                />
              </span>
            ))}
            {renderCard(anchorId, parents.length + leftSpouses.length, true)}
            {rightSpouses.map((id, i) => (
              <span key={id} className="flex items-center gap-2">
                <HorizontalConnector
                  selected={selectedId === anchorId || selectedId === id}
                />
                {renderCard(id, parents.length + leftSpouses.length + 1 + i)}
              </span>
            ))}
          </div>

          {/* Siblings nearby */}
          {siblings.length > 0 && (
            <>
              <RowConnector
                count={siblings.length}
                selected={
                  selectedId === anchorId || siblings.includes(selectedId ?? "")
                }
              />
              <div className="flex flex-wrap justify-center gap-3">
                {siblings.map((id, i) => renderCard(id, i))}
              </div>
            </>
          )}

          {/* Children below */}
          {children.length > 0 && (
            <>
              <RowConnector
                count={children.length}
                selected={
                  selectedId === anchorId || children.includes(selectedId ?? "")
                }
              />
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
