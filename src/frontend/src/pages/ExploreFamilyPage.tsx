import { type Person, PersonCard } from "../components/PersonCard";
import { useExploreFamily } from "../hooks/useExploreFamily";
import type { RelativeRef } from "../types/family";
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

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** A labeled band of compact relative cards. Renders nothing when the group
 *  is empty (i.e. the relationship is not documented for the focus person). */
function RelativeZone({
  label,
  relatives,
  onSelectPerson,
  className = "",
}: {
  label: string;
  relatives: RelativeRef[];
  onSelectPerson: (id: string) => void;
  className?: string;
}) {
  if (relatives.length === 0) return null;
  return (
    <div
      className={`flex flex-col items-center gap-2 ${className}`}
      data-ocid={`explore.zone.${label.toLowerCase()}`}
    >
      <span className="ex-zone-label">{label}</span>
      <div className="ex-zone-row">
        {relatives.map((ref, index) => {
          const profile = profiles[ref.personId];
          const person: Person = {
            id: ref.personId,
            name: profile?.name ?? ref.personId,
            role: ref.label,
            photo: profile?.portrait,
          };
          return (
            <PersonCard
              key={ref.personId}
              person={person}
              selected={false}
              onSelect={() => onSelectPerson(ref.personId)}
              index={index}
              variant="relative"
              relationLabel={ref.label}
            />
          );
        })}
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

  if (!focus) {
    return (
      <div className="ex-stage" data-ocid="explore.empty_state">
        <p className="text-sm text-muted-foreground">
          No family member found to explore.
        </p>
      </div>
    );
  }

  const years = getYears(focus);
  const isMe =
    focus.relationToYou === "me" ||
    (focus as PersonProfile & { me?: boolean }).me === true;
  const relationText = focus.relationToYou ?? "Family member";

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

      {/* Parents: father above-left, mother above-right */}
      <div className="flex w-full items-start justify-center gap-3">
        <RelativeZone
          label="Father"
          relatives={relatives.father}
          onSelectPerson={onSelectPerson}
        />
        <RelativeZone
          label="Mother"
          relatives={relatives.mother}
          onSelectPerson={onSelectPerson}
        />
      </div>

      <span className="ex-connector" aria-hidden="true" />

      {/* Focus person */}
      <div className="ex-focus-card" data-ocid="explore.focus_card">
        <span className="ex-focus-portrait" aria-hidden="true">
          {focus.portrait.src ? (
            <img
              src={focus.portrait.src}
              alt={focus.portrait.alt}
              className="h-full w-full object-cover"
            />
          ) : (
            getInitials(focus.name)
          )}
        </span>
        {isMe && <span className="ex-me-badge">This is me</span>}
        <span className="ex-focus-name">{focus.name}</span>
        {years && <span className="ex-focus-years">{years}</span>}
        <span className="ex-focus-relation">{relationText}</span>
        <button
          type="button"
          data-ocid="explore.view_profile"
          onClick={() => onOpenProfile(resolvedId)}
          className="ex-focus-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View Profile
        </button>
      </div>

      <span className="ex-connector" aria-hidden="true" />

      {/* Spouse/partner beside the focus */}
      <RelativeZone
        label="Spouse"
        relatives={relatives.spouse}
        onSelectPerson={onSelectPerson}
        className="w-full"
      />

      {/* Siblings to the side */}
      <RelativeZone
        label="Siblings"
        relatives={relatives.siblings}
        onSelectPerson={onSelectPerson}
        className="w-full"
      />

      {/* Children below */}
      <RelativeZone
        label="Children"
        relatives={relatives.children}
        onSelectPerson={onSelectPerson}
        className="w-full"
      />
    </div>
  );
}
