import { useCanonicalPerson } from "../hooks/useCanonicalPerson";

interface PersonLinkProps {
  personId: string;
  /** Navigates to the person's profile. */
  onOpenProfile: (id: string) => void;
  /** Optional override for the display name (defaults to the canonical name). */
  name?: string;
}

/**
 * A tappable chip linking to a person's profile. Resolves the canonical
 * display name from the backend Person Profile record (preferredName-first)
 * so the linked identity is always the family-facing name, never a raw id.
 */
export function PersonLink({ personId, onOpenProfile, name }: PersonLinkProps) {
  const canonical = useCanonicalPerson(personId, name ?? "");
  const displayName = canonical.displayName || name || personId;

  return (
    <button
      type="button"
      data-ocid="person_link"
      onClick={() => onOpenProfile(personId)}
      className="timeline-link"
    >
      {displayName}
    </button>
  );
}
