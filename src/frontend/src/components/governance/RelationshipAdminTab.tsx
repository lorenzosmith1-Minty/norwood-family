import { Link2, Plus, Trash2, UserCog } from "lucide-react";
import { useState } from "react";
import {
  useAddRelationship,
  useCorrectRelationshipType,
  useListPersonRelationships,
  useRemoveRelationship,
} from "../../hooks/useGovernance";
import { profiles } from "../../pages/PersonProfilePage";
import { resolveDisplayName } from "../../types/family";
import { RelationshipType } from "../../types/governance";
import { RELATIONSHIP_TYPE_LABELS } from "../../types/ownership";

/** Resolves a person's display name from the shared profiles record. */
function personName(personId: string): string {
  return resolveDisplayName(personId, profiles);
}

const RELATIONSHIP_OPTIONS: RelationshipType[] = [
  RelationshipType.Parent,
  RelationshipType.Child,
  RelationshipType.Sibling,
  RelationshipType.SpousePartner,
];

export function RelationshipAdminTab() {
  const personIds = Object.keys(profiles);
  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    personIds[0] ?? "",
  );

  const { data: relationships = [], isLoading } =
    useListPersonRelationships(selectedPersonId);

  const add = useAddRelationship();
  const remove = useRemoveRelationship();
  const correct = useCorrectRelationshipType();

  const [relatedPersonId, setRelatedPersonId] = useState("");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>(
    RelationshipType.Parent,
  );

  const handleAdd = () => {
    if (!selectedPersonId || !relatedPersonId) return;
    add.mutate(
      {
        fromPersonId: selectedPersonId,
        toPersonId: relatedPersonId,
        relationshipType,
      },
      { onSuccess: () => setRelatedPersonId("") },
    );
  };

  return (
    <div
      data-ocid="governance.relationships.panel"
      className="flex flex-col gap-4"
    >
      <section className="gov-section">
        <div className="gov-section-head">
          <h2 className="gov-section-title">Review a Person</h2>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Family member</span>
          <select
            data-ocid="governance.relationships.person_select"
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
            className="form-select"
          >
            {personIds.map((personId) => (
              <option key={personId} value={personId}>
                {personName(personId)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section
        data-ocid="governance.relationships.list_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">
            Relationships ({relationships.length})
          </h2>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading relationships…
          </p>
        ) : relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No confirmed relationships for this person yet.
          </p>
        ) : (
          <ul
            data-ocid="governance.relationships.list"
            className="steward-list"
          >
            {relationships.map((relationship, index) => (
              <li
                key={relationship.id.toString()}
                data-ocid={`governance.relationships.item.${index + 1}`}
                className="steward-row"
              >
                <div className="steward-row-portrait" aria-hidden="true">
                  <Link2 className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="steward-row-body">
                  <span className="steward-row-name">
                    {personName(relationship.toPersonId)}
                  </span>
                  <span className="steward-row-role">
                    {RELATIONSHIP_TYPE_LABELS[relationship.relationshipType]} ·{" "}
                    {relationship.status}
                  </span>
                </div>
                <div className="steward-row-actions">
                  <select
                    data-ocid={`governance.relationships.type_select.${index + 1}`}
                    value={relationship.relationshipType}
                    onChange={(e) =>
                      correct.mutate({
                        relationshipId: relationship.id,
                        relationshipType: e.target.value as RelationshipType,
                      })
                    }
                    disabled={correct.isPending}
                    className="form-select w-auto py-1.5 text-xs"
                    aria-label="Correct relationship type"
                  >
                    {RELATIONSHIP_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {RELATIONSHIP_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-ocid={`governance.relationships.remove_button.${index + 1}`}
                    onClick={() => remove.mutate(relationship.id)}
                    disabled={remove.isPending}
                    className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2
                      className="h-4 w-4"
                      strokeWidth={2.25}
                      aria-hidden="true"
                    />
                    {remove.isPending ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-ocid="governance.relationships.add_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">Add a Relationship</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            data-ocid="governance.relationships.add_person_select"
            value={relatedPersonId}
            onChange={(e) => setRelatedPersonId(e.target.value)}
            className="form-select flex-1"
          >
            <option value="">Select related person…</option>
            {personIds
              .filter((personId) => personId !== selectedPersonId)
              .map((personId) => (
                <option key={personId} value={personId}>
                  {personName(personId)}
                </option>
              ))}
          </select>
          <select
            data-ocid="governance.relationships.add_type_select"
            value={relationshipType}
            onChange={(e) =>
              setRelationshipType(e.target.value as RelationshipType)
            }
            className="form-select w-auto"
          >
            {RELATIONSHIP_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {RELATIONSHIP_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-ocid="governance.relationships.add_button"
            onClick={handleAdd}
            disabled={!relatedPersonId || add.isPending}
            className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            {add.isPending ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
          Every change is recorded in the audit history with who made it and
          when.
        </p>
      </section>
    </div>
  );
}
