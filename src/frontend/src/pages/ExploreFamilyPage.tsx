import {
  type Person,
  PersonCard,
  type RelativeRole,
} from "../components/PersonCard";
import { useExploreFamily } from "../hooks/useExploreFamily";
import {
  FAMILY_GRAPH,
  type RelativeRef,
  resolveDisplayName,
} from "../types/family";
import { type PersonProfile, profiles } from "./PersonProfilePage";

export interface ExploreFamilyPageProps {
  /** The person to focus on. When null, the view resolves its default anchor
   *  (the person marked "Me" if present, otherwise the founding couple). */
  focusPersonId: string | null;
  /** Recenter the view on a relative when one of its cards is tapped. */
  onSelectPerson: (id: string) => void;
  /** Open the existing profile page for the focus person. */
  onOpenProfile: (id: string) => void;
}

/** Pull the first 4-digit year out of a fact value like "approx. 1860". */
function extractYear(value: string): string | undefined {
  const match = value.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return match?.[1];
}

/** Birth–death years from the profile's Born/Died facts, when known. */
function getYears(profile: PersonProfile): string | undefined {
  const born = profile.facts.find((f) => f.label === "Born");
  const died = profile.facts.find((f) => f.label === "Died");
  const bornYear = born ? extractYear(born.value) : undefined;
  const diedYear = died ? extractYear(died.value) : undefined;
  if (!bornYear && !diedYear) return undefined;
  if (bornYear && diedYear) return `${bornYear}–${diedYear}`;
  if (bornYear) return `${bornYear}–`;
  return diedYear;
}

/** Build a PersonCard `Person` from a relative reference, pulling the name and
 *  portrait from the shared profile record when one exists. The display name
 *  resolves through the shared resolver so graph-only nodes (e.g.
 *  lorenzoSmithJr) never leak their raw id. */
function toPerson(ref: RelativeRef): Person {
  const profile = profiles[ref.personId];
  return {
    id: ref.personId,
    name: resolveDisplayName(ref.personId, profiles),
    role: ref.label,
    photo: profile?.portrait,
  };
}

/**
 * Build a minimal profile for a graph-only node — a person present in the
 * shared FAMILY_GRAPH but with no profile record (e.g. lorenzoSmithJr). Explore
 * Family can still center on such a person and show their confirmed relatives,
 * using the canonical display name as the name fallback. Returns undefined when
 * the person is not part of the shared graph at all, in which case the view
 * shows its empty state.
 */
function buildGraphFallbackProfile(id: string): PersonProfile | undefined {
  if (!FAMILY_GRAPH[id]) return undefined;
  const displayName = resolveDisplayName(id, profiles);
  return {
    id,
    name: displayName,
    role: "Family member",
    portrait: {
      src: "/assets/images/placeholder.svg",
      alt: `An initials placeholder portrait for ${displayName}, since no profile record exists for them.`,
    },
    facts: [],
    story: "",
    family: { spouseName: "", spouseRole: "", childrenText: "" },
    timeline: [],
    sources: [],
  };
}

/** A labeled band of compact relative cards. Renders nothing when the group
 *  is empty (i.e. the relationship is not documented for the focus person).
 *  `rowClassName` selects the dedicated positional row utility so each
 *  relationship kind sits in its intended spot in the constellation. */
function RelativeZone({
  label,
  relatives,
  onSelectPerson,
  className = "",
  rowClassName,
  relationRole,
}: {
  label: string;
  relatives: RelativeRef[];
  onSelectPerson: (id: string) => void;
  className?: string;
  rowClassName: string;
  relationRole: RelativeRole;
}) {
  if (relatives.length === 0) return null;
  return (
    <div
      className={`flex flex-col items-center gap-2 ${className}`}
      data-ocid={`explore.zone.${label.toLowerCase()}`}
    >
      <span className="ex-zone-label">{label}</span>
      <div className={rowClassName}>
        {relatives.map((ref, index) => (
          <PersonCard
            key={ref.personId}
            person={toPerson(ref)}
            selected={false}
            onSelect={() => onSelectPerson(ref.personId)}
            index={index}
            variant="relative"
            relationLabel={ref.label}
            role={relationRole}
          />
        ))}
      </div>
    </div>
  );
}

export default function ExploreFamilyPage({
  focusPersonId,
  onSelectPerson,
  onOpenProfile,
}: ExploreFamilyPageProps) {
  const {
    focusPersonId: resolvedId,
    focus,
    relatives,
  } = useExploreFamily(focusPersonId, profiles);

  // A graph-only node (e.g. lorenzoSmithJr) has no profile record, so the hook
  // returns no focus. Fall back to a synthesized profile so the view still
  // centers on the person and shows their confirmed relatives from the shared
  // graph. Only when the person is absent from both the profiles and the shared
  // graph do we show the empty state.
  const focusProfile = focus ?? buildGraphFallbackProfile(resolvedId);

  if (!focusProfile) {
    return (
      <div className="ex-stage" data-ocid="explore.empty_state">
        <p className="text-sm text-muted-foreground">
          No family member found to explore.
        </p>
      </div>
    );
  }

  const years = getYears(focusProfile);
  const isMe =
    focusProfile.relationToYou === "me" ||
    (focusProfile as PersonProfile & { me?: boolean }).me === true;
  const relationText = focusProfile.relationToYou ?? "Family member";

  return (
    <div className="ex-stage" data-ocid="explore.page">
      <header className="w-full text-center">
        <h1 className="font-display text-xl font-semibold text-foreground">
          Explore Family
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap a relative to move through the family.
        </p>
      </header>

      {/* Parents: father upper-left, mother upper-right of the focus card */}
      <div className="ex-parent-row">
        <RelativeZone
          label="Father"
          relatives={relatives.father}
          onSelectPerson={onSelectPerson}
          rowClassName="ex-parent-row"
          relationRole="father"
        />
        <RelativeZone
          label="Mother"
          relatives={relatives.mother}
          onSelectPerson={onSelectPerson}
          rowClassName="ex-parent-row"
          relationRole="mother"
        />
      </div>

      <span className="ex-connector" aria-hidden="true" />

      {/* Center band: spouse(s) immediately LEFT of the focus card at half
          size and the focus card as the largest centered card. The band is
          sized so spouse + focus fit fully within the mobile viewport — the
          spouse card is compact and never clipped, and never pushes the focus
          card off-screen. */}
      <div className="ex-center-band">
        {relatives.spouse.length > 0 && (
          <div
            className="ex-spouse-stack shrink-0"
            data-ocid="explore.zone.spouse"
          >
            {relatives.spouse.map((ref, index) => (
              <PersonCard
                key={ref.personId}
                person={toPerson(ref)}
                selected={false}
                onSelect={() => onSelectPerson(ref.personId)}
                index={index}
                variant="spouse-half"
                relationLabel={ref.label}
              />
            ))}
          </div>
        )}

        <PersonCard
          person={{
            id: resolvedId,
            name: focusProfile.name,
            role: relationText,
            photo: focusProfile.portrait,
            years,
          }}
          selected={false}
          onSelect={() => onSelectPerson(resolvedId)}
          index={0}
          variant="focus"
          isMe={isMe}
          relationLabel={relationText}
          onOpen={() => onOpenProfile(resolvedId)}
        />
      </div>

      {/* Siblings: a compact section BELOW the focus card that wraps into
          multiple rows on mobile. All sibling cards stay fully visible with
          no horizontal scrolling. */}
      <RelativeZone
        label="Siblings"
        relatives={relatives.siblings}
        onSelectPerson={onSelectPerson}
        className="w-full"
        rowClassName="ex-siblings-row"
        relationRole="sibling"
      />

      {/* Children directly below the Siblings section */}
      <RelativeZone
        label="Children"
        relatives={relatives.children}
        onSelectPerson={onSelectPerson}
        className="w-full"
        rowClassName="ex-children-row"
        relationRole="child"
      />
    </div>
  );
}
