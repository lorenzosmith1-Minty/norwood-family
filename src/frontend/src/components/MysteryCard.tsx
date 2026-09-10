import type { Mystery } from "@/types/family-history";
import {
  MYSTERY_STATUS_BADGE,
  MYSTERY_STATUS_LABELS,
} from "@/types/family-history";
import { Users } from "lucide-react";
import { PersonLink } from "./PersonLink";

interface MysteryCardProps {
  mystery: Mystery;
  /** Opens the full mystery detail view. */
  onOpen: () => void;
  /** Navigates to a related person's profile. */
  onOpenProfile?: (id: string) => void;
}

/**
 * A warm-paper card for one family mystery: the question, a short preview,
 * the related family members, and a status badge. Clicking the title opens the
 * full detail view. Uses the mystery-card / mystery-status utility classes.
 */
export function MysteryCard({
  mystery,
  onOpen,
  onOpenProfile,
}: MysteryCardProps) {
  return (
    <div data-ocid="mystery.card" className="mystery-card">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          data-ocid="mystery.open_button"
          onClick={onOpen}
          className="mystery-card-title min-h-[44px] flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {mystery.title}
        </button>
        <span
          data-ocid="mystery.status_badge"
          className={`mystery-status shrink-0 ${MYSTERY_STATUS_BADGE[mystery.status]}`}
        >
          {MYSTERY_STATUS_LABELS[mystery.status]}
        </span>
      </div>
      <p className="mystery-card-preview line-clamp-3">{mystery.description}</p>
      {mystery.relatedMemberIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Users
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {mystery.relatedMemberIds.map((id) =>
            onOpenProfile ? (
              <PersonLink
                key={id}
                personId={id}
                onOpenProfile={onOpenProfile}
              />
            ) : (
              <span key={id} className="member-chip">
                {id}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
