import { RelationshipType } from "@/backend";
import { Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useProposeRelationship } from "../hooks/useRelationshipRequests";
import { RELATIONSHIP_TYPE_LABELS } from "../types/ownership";

/**
 * A form to propose a new or changed relationship between two people. The user
 * picks Parent / Child / Sibling / Spouse or Partner, and submitting creates a
 * Relationship Request that starts Pending — it is never treated as confirmed
 * until a Family Steward approves it. Data-driven: the four relationship types
 * come from the shared RelationshipType enum, never hardcoded family members.
 */
export interface RelationshipRequestFormProps {
  /** The person the relationship is being added to. */
  fromPersonId: string;
  /** The person being connected as a relative. */
  toPersonId: string;
  /** Optional callback fired after a successful proposal. */
  onSuccess?: () => void;
}

const RELATIONSHIP_OPTIONS: RelationshipType[] = [
  RelationshipType.Parent,
  RelationshipType.Child,
  RelationshipType.Sibling,
  RelationshipType.SpousePartner,
];

export function RelationshipRequestForm({
  fromPersonId,
  toPersonId,
  onSuccess,
}: RelationshipRequestFormProps) {
  const [selected, setSelected] = useState<RelationshipType | null>(null);
  const propose = useProposeRelationship();

  const handleSubmit = () => {
    if (!selected) return;
    propose.mutate(
      { fromPersonId, toPersonId, relationshipType: selected },
      { onSuccess },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="relation-picker">
        <legend className="sr-only">Relationship type</legend>
        {RELATIONSHIP_OPTIONS.map((type) => {
          const isSelected = selected === type;
          return (
            <label
              key={type}
              className={`relation-option ${isSelected ? "relation-option-selected" : ""}`}
            >
              <input
                type="radio"
                name="relationship-type"
                value={type}
                checked={isSelected}
                onChange={() => setSelected(type)}
                data-ocid={`relationship_request.option.${type}`}
                className="sr-only"
              />
              {RELATIONSHIP_TYPE_LABELS[type]}
            </label>
          );
        })}
      </fieldset>

      <button
        type="button"
        data-ocid="relationship_request.submit_button"
        onClick={handleSubmit}
        disabled={!selected || propose.isPending}
        className="this-is-me-action"
      >
        {propose.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Link2 className="h-4 w-4" aria-hidden="true" />
        )}
        {propose.isPending ? "Submitting…" : "Propose Relationship"}
      </button>

      {propose.isError ? (
        <p
          data-ocid="relationship_request.error_state"
          className="text-sm text-destructive"
        >
          Could not propose this relationship. Please try again.
        </p>
      ) : null}
    </div>
  );
}
