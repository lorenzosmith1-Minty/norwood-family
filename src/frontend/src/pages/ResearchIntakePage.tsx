import {
  BookOpen,
  Check,
  ClipboardList,
  FileText,
  Link2,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import {
  useCreateFinding,
  useCreateNewPersonCandidate,
  useCreateRelationshipProposal,
  useCreateSource,
  useListFindings,
  useListNewPersonCandidates,
  useListRelationshipProposals,
  useListSources,
} from "../hooks/useResearchIntake";
import { resolveDisplayName } from "../types/family";
import {
  EVIDENCE_LABEL_LABELS,
  FINDING_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from "../types/research-intake";
import type {
  EvidenceLabel,
  FindingContent,
  FindingType,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchError,
  ReviewStatus,
  SourceType,
} from "../types/research-intake";
import { profiles } from "./PersonProfilePage";

interface ResearchIntakePageProps {
  onBack: () => void;
  onOpenReviewQueue: () => void;
  onOpenConflictReview: () => void;
}

type Tab = "sources" | "findings" | "candidates" | "relationships";

const TABS: { id: Tab; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "findings", label: "Proposed Findings" },
  { id: "candidates", label: "New Person Candidates" },
  { id: "relationships", label: "Relationship Proposals" },
];

/** Converts a Motoko nanosecond timestamp to a short human date. */
function formatDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Maps a backend ResearchError to a friendly, actionable message. */
function researchErrorMessage(err: ResearchError): string {
  switch (err.__kind__) {
    case "notAuthorized":
      return "You are not authorized to perform this action.";
    case "notFound":
      return "The referenced record could not be found.";
    case "invalidState":
      return err.invalidState;
  }
}

/** The canonical family members available for Person matching. */
function useCanonicalPeople(): { id: string; name: string }[] {
  return useMemo(
    () =>
      Object.entries(profiles).map(([id, person]) => ({
        id,
        name: person.name,
      })),
    [],
  );
}

/** A small inline error banner shared by every intake form. */
function FormError({ message }: { message: string }) {
  return (
    <div
      data-ocid="research.form.error_state"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <X
        className="mt-0.5 h-4 w-4 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span>{message}</span>
    </div>
  );
}

/** A reusable empty state for a research list. */
function ResearchEmpty({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div data-ocid="research.empty_state" className="research-empty">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BookOpen
          className="h-6 w-6 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
      <p className="research-empty-title">{title}</p>
      <p className="research-empty-hint">{hint}</p>
    </div>
  );
}

/** Review-status pill using the shared status language. */
function StatusPill({ status }: { status: ReviewStatus }) {
  const cls =
    status === "Approved"
      ? "status-approved"
      : status === "Rejected"
        ? "status-rejected"
        : status === "Conflicting"
          ? "status-pending"
          : "status-pending";
  return (
    <span className={`status-pill ${cls}`}>{REVIEW_STATUS_LABELS[status]}</span>
  );
}

/* ------------------------------------------------------------------ */
/* Sources tab                                                         */
/* ------------------------------------------------------------------ */

function SourcesTab() {
  const { data: sources = [], isLoading } = useListSources();
  const createSource = useCreateSource();

  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<SourceType | "">("");
  const [description, setDescription] = useState("");
  const [archiveItemId, setArchiveItemId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length > 0 &&
    sourceType !== "" &&
    description.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    const trimmedArchive = archiveItemId.trim();
    const parsedArchive = trimmedArchive === "" ? null : BigInt(trimmedArchive);
    const capturedTitle = title.trim();
    const capturedType = sourceType as SourceType;
    const capturedDescription = description.trim();
    setTitle("");
    setSourceType("");
    setDescription("");
    setArchiveItemId("");
    createSource.mutate(
      {
        title: capturedTitle,
        sourceType: capturedType,
        description: capturedDescription,
        archiveItemId: parsedArchive,
      },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "err") {
            setError(researchErrorMessage(result.err));
          }
        },
        onError: () =>
          setError("Your source couldn't be saved. Please try again."),
      },
    );
  };

  return (
    <div className="research-panel">
      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Record a source</span>
        </div>
        <p className="research-section-hint">
          Every fact needs provenance. Create a lightweight source record so a
          proposed finding can always point back to where the information came
          from. Sources enter as proposed and are reviewed before use.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Title</span>
            <input
              data-ocid="research.source.title_input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 1900 census, Norwood household"
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Source type</span>
            <select
              data-ocid="research.source.type_select"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="form-select"
            >
              <option value="">Select a type…</option>
              {(Object.keys(SOURCE_TYPE_LABELS) as SourceType[]).map((type) => (
                <option key={type} value={type}>
                  {SOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="field-label">Description</span>
          <textarea
            data-ocid="research.source.description_input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this source and where was it found?"
            className="form-textarea"
          />
        </label>
        <label className="block">
          <span className="field-label">
            Archive item link{" "}
            <span className="font-normal normal-case">(optional)</span>
          </span>
          <input
            data-ocid="research.source.archive_link_input"
            type="text"
            value={archiveItemId}
            onChange={(e) => setArchiveItemId(e.target.value)}
            placeholder="Archive item id, e.g. 12"
            className="form-input"
          />
        </label>
        {error && <FormError message={error} />}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-ocid="research.source.submit_button"
            onClick={handleSubmit}
            disabled={!canSubmit || createSource.isPending}
            className="research-resolve"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {createSource.isPending ? "Saving…" : "Add source"}
          </button>
        </div>
      </section>

      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Sources</span>
        </div>
        {isLoading ? (
          <div
            data-ocid="research.sources.loading_state"
            className="flex flex-col gap-2"
          >
            {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
              <div
                key={id}
                className="h-20 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : sources.length === 0 ? (
          <ResearchEmpty
            title="No sources yet"
            hint="Record your first source above so proposed findings can carry provenance."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {sources.map((source) => (
              <article
                key={source.id}
                data-ocid={`research.sources.item.${source.id}`}
                className="research-source-card"
              >
                <div className="research-source-head">
                  <h3 className="research-source-title">{source.title}</h3>
                  <StatusPill status={source.status} />
                </div>
                <span className="archive-type-badge">
                  {SOURCE_TYPE_LABELS[source.sourceType]}
                </span>
                <p className="research-source-meta">{source.description}</p>
                <div className="research-finding-meta">
                  {source.archiveItemId !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <Link2
                        className="h-3 w-3"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      Archive item #{source.archiveItemId.toString()}
                    </span>
                  )}
                  <span>Added {formatDate(source.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Proposed Findings tab                                               */
/* ------------------------------------------------------------------ */

/** Renders the content fields for the selected finding type. */
function FindingContentFields({
  findingType,
  people,
  content,
  onChange,
}: {
  findingType: FindingType;
  people: { id: string; name: string }[];
  content: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  const set = (key: string, value: string) => onChange({ [key]: value });

  if (findingType === "PersonFact") {
    return (
      <>
        <label className="block">
          <span className="field-label">Field</span>
          <input
            data-ocid="research.finding.content.field_input"
            type="text"
            value={content.field ?? ""}
            onChange={(e) => set("field", e.target.value)}
            placeholder="e.g. Birth date"
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Value</span>
          <input
            data-ocid="research.finding.content.value_input"
            type="text"
            value={content.value ?? ""}
            onChange={(e) => set("value", e.target.value)}
            placeholder="e.g. 12 March 1898"
            className="form-input"
          />
        </label>
      </>
    );
  }

  if (findingType === "TimelineEvent") {
    return (
      <>
        <label className="block">
          <span className="field-label">Event title</span>
          <input
            data-ocid="research.finding.content.event_title_input"
            type="text"
            value={content.eventTitle ?? ""}
            onChange={(e) => set("eventTitle", e.target.value)}
            placeholder="e.g. Moved to the farm"
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Date (optional)</span>
          <input
            data-ocid="research.finding.content.event_date_input"
            type="text"
            value={content.eventDate ?? ""}
            onChange={(e) => set("eventDate", e.target.value)}
            placeholder="e.g. 1921"
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Description</span>
          <textarea
            data-ocid="research.finding.content.event_description_input"
            value={content.eventDescription ?? ""}
            onChange={(e) => set("eventDescription", e.target.value)}
            className="form-textarea"
          />
        </label>
      </>
    );
  }

  if (findingType === "Story") {
    return (
      <>
        <label className="block">
          <span className="field-label">Story title</span>
          <input
            data-ocid="research.finding.content.story_title_input"
            type="text"
            value={content.storyTitle ?? ""}
            onChange={(e) => set("storyTitle", e.target.value)}
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Story text</span>
          <textarea
            data-ocid="research.finding.content.story_text_input"
            value={content.storyText ?? ""}
            onChange={(e) => set("storyText", e.target.value)}
            className="form-textarea"
          />
        </label>
      </>
    );
  }

  if (findingType === "Mystery") {
    return (
      <>
        <label className="block">
          <span className="field-label">Mystery title</span>
          <input
            data-ocid="research.finding.content.mystery_title_input"
            type="text"
            value={content.mysteryTitle ?? ""}
            onChange={(e) => set("mysteryTitle", e.target.value)}
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Description</span>
          <textarea
            data-ocid="research.finding.content.mystery_description_input"
            value={content.mysteryDescription ?? ""}
            onChange={(e) => set("mysteryDescription", e.target.value)}
            className="form-textarea"
          />
        </label>
      </>
    );
  }

  if (findingType === "Source") {
    return (
      <>
        <label className="block">
          <span className="field-label">Source title</span>
          <input
            data-ocid="research.finding.content.source_title_input"
            type="text"
            value={content.sourceTitle ?? ""}
            onChange={(e) => set("sourceTitle", e.target.value)}
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Description</span>
          <textarea
            data-ocid="research.finding.content.source_description_input"
            value={content.sourceDescription ?? ""}
            onChange={(e) => set("sourceDescription", e.target.value)}
            className="form-textarea"
          />
        </label>
      </>
    );
  }

  // Relationship
  return (
    <>
      <label className="block">
        <span className="field-label">From person</span>
        <select
          data-ocid="research.finding.content.relationship_from_select"
          value={content.relationshipFrom ?? ""}
          onChange={(e) => set("relationshipFrom", e.target.value)}
          className="form-select"
        >
          <option value="">Select a person…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">To person</span>
        <select
          data-ocid="research.finding.content.relationship_to_select"
          value={content.relationshipTo ?? ""}
          onChange={(e) => set("relationshipTo", e.target.value)}
          className="form-select"
        >
          <option value="">Select a person…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Relationship type</span>
        <input
          data-ocid="research.finding.content.relationship_type_input"
          type="text"
          value={content.relationshipType ?? ""}
          onChange={(e) => set("relationshipType", e.target.value)}
          placeholder="e.g. Daughter"
          className="form-input"
        />
      </label>
    </>
  );
}

/** Builds a FindingContent from the flat content form state. */
function buildFindingContent(
  findingType: FindingType,
  content: Record<string, string>,
  personId: string | null,
): FindingContent {
  switch (findingType) {
    case "PersonFact":
      return {
        __kind__: "PersonFact",
        PersonFact: {
          field: content.field ?? "",
          value: content.value ?? "",
          personId: personId ?? "",
        },
      };
    case "TimelineEvent":
      return {
        __kind__: "TimelineEvent",
        TimelineEvent: {
          title: content.eventTitle ?? "",
          date: content.eventDate ? content.eventDate : undefined,
          description: content.eventDescription ?? "",
          personId: personId ?? "",
        },
      };
    case "Story":
      return {
        __kind__: "Story",
        Story: {
          title: content.storyTitle ?? "",
          storyText: content.storyText ?? "",
          relatedPersonIds: personId ? [personId] : [],
        },
      };
    case "Mystery":
      return {
        __kind__: "Mystery",
        Mystery: {
          title: content.mysteryTitle ?? "",
          description: content.mysteryDescription ?? "",
          relatedPersonIds: personId ? [personId] : [],
        },
      };
    case "Source":
      return {
        __kind__: "Source",
        Source: {
          title: content.sourceTitle ?? "",
          description: content.sourceDescription ?? "",
          sourceType: "ResearchNotes" as SourceType,
        },
      };
    case "Relationship":
      return {
        __kind__: "Relationship",
        Relationship: {
          fromPersonId: content.relationshipFrom ?? "",
          toPersonId: content.relationshipTo ?? "",
          relationshipType: content.relationshipType ?? "",
        },
      };
    default:
      return {
        __kind__: "PersonFact",
        PersonFact: { field: "", value: "", personId: personId ?? "" },
      };
  }
}

/** Short human summary of a finding's content for the list view. */
function findingContentSummary(finding: ProposedFinding): string {
  const c = finding.content;
  switch (c.__kind__) {
    case "PersonFact":
      return `${c.PersonFact.field}: ${c.PersonFact.value}`;
    case "TimelineEvent":
      return c.TimelineEvent.description;
    case "Story":
      return c.Story.storyText;
    case "Mystery":
      return c.Mystery.description;
    case "Source":
      return c.Source.description;
    case "Relationship":
      return `${c.Relationship.fromPersonId} → ${c.Relationship.toPersonId} (${c.Relationship.relationshipType})`;
  }
}

function FindingsTab() {
  const { data: findings = [], isLoading } = useListFindings();
  const { data: sources = [] } = useListSources();
  const { data: candidates = [] } = useListNewPersonCandidates();
  const createFinding = useCreateFinding();
  const people = useCanonicalPeople();

  const [title, setTitle] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState<EvidenceLabel | "">("");
  const [findingType, setFindingType] = useState<FindingType | "">("");
  const [sourceId, setSourceId] = useState("");
  const [matchMode, setMatchMode] = useState<"person" | "candidate">("person");
  const [personId, setPersonId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [content, setContent] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const contentValid = (() => {
    if (findingType === "") return false;
    switch (findingType) {
      case "PersonFact":
        return Boolean(content.field?.trim() && content.value?.trim());
      case "TimelineEvent":
        return Boolean(content.eventTitle?.trim());
      case "Story":
        return Boolean(content.storyTitle?.trim() && content.storyText?.trim());
      case "Mystery":
        return Boolean(content.mysteryTitle?.trim());
      case "Source":
        return Boolean(content.sourceTitle?.trim());
      case "Relationship":
        return Boolean(
          content.relationshipFrom &&
            content.relationshipTo &&
            content.relationshipType?.trim(),
        );
    }
  })();

  const canSubmit =
    title.trim().length > 0 &&
    evidenceLabel !== "" &&
    findingType !== "" &&
    sourceId !== "" &&
    contentValid &&
    (matchMode === "person" ? personId !== "" : candidateId !== "");

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    const capturedTitle = title.trim();
    const capturedLabel = evidenceLabel as EvidenceLabel;
    const capturedType = findingType as FindingType;
    const capturedSource = BigInt(sourceId);
    const capturedContent = { ...content };
    const capturedPersonId = matchMode === "person" ? personId : null;
    const capturedCandidateId =
      matchMode === "candidate" ? BigInt(candidateId) : null;
    setTitle("");
    setEvidenceLabel("");
    setFindingType("");
    setSourceId("");
    setPersonId("");
    setCandidateId("");
    setContent({});
    createFinding.mutate(
      {
        title: capturedTitle,
        evidenceLabel: capturedLabel,
        findingType: capturedType,
        content: buildFindingContent(
          capturedType,
          capturedContent,
          capturedPersonId,
        ),
        sourceId: capturedSource,
        personId: capturedPersonId,
        newPersonCandidateId: capturedCandidateId,
      },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "err") {
            setError(researchErrorMessage(result.err));
          }
        },
        onError: () =>
          setError("Your finding couldn't be saved. Please try again."),
      },
    );
  };

  return (
    <div className="research-panel">
      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Propose a finding</span>
        </div>
        <p className="research-section-hint">
          Record a proposed fact with one evidence label, linked to a source and
          matched to a family member. Findings enter as proposed and are never
          applied to canonical family data automatically.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Title</span>
            <input
              data-ocid="research.finding.title_input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Birth date of Julia Norwood"
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Evidence label</span>
            <select
              data-ocid="research.finding.evidence_select"
              value={evidenceLabel}
              onChange={(e) =>
                setEvidenceLabel(e.target.value as EvidenceLabel)
              }
              className="form-select"
            >
              <option value="">Select a label…</option>
              {(Object.keys(EVIDENCE_LABEL_LABELS) as EvidenceLabel[]).map(
                (label) => (
                  <option key={label} value={label}>
                    {EVIDENCE_LABEL_LABELS[label]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Finding type</span>
            <select
              data-ocid="research.finding.type_select"
              value={findingType}
              onChange={(e) => {
                setFindingType(e.target.value as FindingType);
                setContent({});
              }}
              className="form-select"
            >
              <option value="">Select a type…</option>
              {(Object.keys(FINDING_TYPE_LABELS) as FindingType[]).map(
                (type) => (
                  <option key={type} value={type}>
                    {FINDING_TYPE_LABELS[type]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Source</span>
            <select
              data-ocid="research.finding.source_select"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="form-select"
            >
              <option value="">Select a source…</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id.toString()}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {findingType !== "" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FindingContentFields
              findingType={findingType as FindingType}
              people={people}
              content={content}
              onChange={(patch) =>
                setContent((prev) => ({ ...prev, ...patch }))
              }
            />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <span className="field-label">Person match</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-ocid="research.finding.match_person_tab"
              onClick={() => setMatchMode("person")}
              className={`research-tab ${matchMode === "person" ? "research-tab-active" : ""}`}
            >
              <Users className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Existing person
            </button>
            <button
              type="button"
              data-ocid="research.finding.match_candidate_tab"
              onClick={() => setMatchMode("candidate")}
              className={`research-tab ${matchMode === "candidate" ? "research-tab-active" : ""}`}
            >
              <UserPlus
                className="h-4 w-4"
                strokeWidth={2}
                aria-hidden="true"
              />
              New person candidate
            </button>
          </div>
          {matchMode === "person" ? (
            <label className="block">
              <span className="field-label">Family member</span>
              <select
                data-ocid="research.finding.person_select"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="form-select"
              >
                <option value="">Select a family member…</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="field-label">New person candidate</span>
              <select
                data-ocid="research.finding.candidate_select"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="form-select"
              >
                <option value="">Select a candidate…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id.toString()}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && <FormError message={error} />}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-ocid="research.finding.submit_button"
            onClick={handleSubmit}
            disabled={!canSubmit || createFinding.isPending}
            className="research-resolve"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {createFinding.isPending ? "Saving…" : "Propose finding"}
          </button>
        </div>
      </section>

      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Proposed findings</span>
        </div>
        {isLoading ? (
          <div
            data-ocid="research.findings.loading_state"
            className="flex flex-col gap-2"
          >
            {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
              <div
                key={id}
                className="h-24 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : findings.length === 0 ? (
          <ResearchEmpty
            title="No proposed findings yet"
            hint="Propose your first finding above, linking it to a source and a family member."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {findings.map((finding) => (
              <article
                key={finding.id}
                data-ocid={`research.findings.item.${finding.id}`}
                className="research-finding-card"
              >
                <div className="research-finding-head">
                  <h3 className="research-finding-title">{finding.title}</h3>
                  <StatusPill status={finding.status} />
                </div>
                <span className="research-evidence research-evidence-finding">
                  {EVIDENCE_LABEL_LABELS[finding.evidenceLabel]}
                </span>
                <p className="research-finding-detail">
                  {findingContentSummary(finding)}
                </p>
                <div className="research-finding-meta">
                  <span className="inline-flex items-center gap-1">
                    <FileText
                      className="h-3 w-3"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    {FINDING_TYPE_LABELS[finding.findingType]}
                  </span>
                  <span className="research-actor">
                    {finding.personId
                      ? resolveDisplayName(finding.personId, profiles)
                      : finding.newPersonCandidateId !== undefined
                        ? "New person candidate"
                        : "Unmatched"}
                  </span>
                  <span>Proposed {formatDate(finding.submittedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New Person Candidates tab                                           */
/* ------------------------------------------------------------------ */

function CandidatesTab() {
  const { data: candidates = [], isLoading } = useListNewPersonCandidates();
  const { data: sources = [] } = useListSources();
  const createCandidate = useCreateNewPersonCandidate();

  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 && details.trim().length > 0 && sourceId !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    const capturedName = name.trim();
    const capturedDetails = details.trim();
    const capturedSource = BigInt(sourceId);
    setName("");
    setDetails("");
    setSourceId("");
    createCandidate.mutate(
      {
        name: capturedName,
        details: capturedDetails,
        sourceId: capturedSource,
      },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "err") {
            setError(researchErrorMessage(result.err));
          }
        },
        onError: () =>
          setError("Your candidate couldn't be saved. Please try again."),
      },
    );
  };

  return (
    <div className="research-panel">
      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Add a person candidate</span>
        </div>
        <p className="research-section-hint">
          When research surfaces a person not yet in the family tree, record
          them as a New Person Candidate. They enter as proposed and are
          reviewed before becoming a canonical Person.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Name</span>
            <input
              data-ocid="research.candidate.name_input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Martha Norwood"
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Source</span>
            <select
              data-ocid="research.candidate.source_select"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="form-select"
            >
              <option value="">Select a source…</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id.toString()}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="field-label">Details</span>
          <textarea
            data-ocid="research.candidate.details_input"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="What do we know about this person and why are they a candidate?"
            className="form-textarea"
          />
        </label>
        {error && <FormError message={error} />}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-ocid="research.candidate.submit_button"
            onClick={handleSubmit}
            disabled={!canSubmit || createCandidate.isPending}
            className="research-resolve"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {createCandidate.isPending ? "Saving…" : "Add candidate"}
          </button>
        </div>
      </section>

      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">New person candidates</span>
        </div>
        {isLoading ? (
          <div
            data-ocid="research.candidates.loading_state"
            className="flex flex-col gap-2"
          >
            {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
              <div
                key={id}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <ResearchEmpty
            title="No candidates yet"
            hint="Add a New Person Candidate above when research surfaces someone not yet in the tree."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {candidates.map((candidate) => (
              <article
                key={candidate.id}
                data-ocid={`research.candidates.item.${candidate.id}`}
                className="research-source-card"
              >
                <div className="research-source-head">
                  <h3 className="research-source-title">{candidate.name}</h3>
                  <StatusPill status={candidate.status} />
                </div>
                <span className="research-evidence research-evidence-candidate">
                  New person candidate
                </span>
                <p className="research-source-meta">{candidate.details}</p>
                <div className="research-finding-meta">
                  <span>Proposed {formatDate(candidate.submittedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Relationship Proposals tab                                          */
/* ------------------------------------------------------------------ */

function RelationshipsTab() {
  const { data: proposals = [], isLoading } = useListRelationshipProposals();
  const { data: sources = [] } = useListSources();
  const createProposal = useCreateRelationshipProposal();
  const people = useCanonicalPeople();

  const [fromPersonId, setFromPersonId] = useState("");
  const [toPersonId, setToPersonId] = useState("");
  const [relationshipType, setRelationshipType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    fromPersonId !== "" &&
    toPersonId !== "" &&
    relationshipType.trim().length > 0 &&
    sourceId !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    const capturedFrom = fromPersonId;
    const capturedTo = toPersonId;
    const capturedType = relationshipType.trim();
    const capturedSource = BigInt(sourceId);
    setFromPersonId("");
    setToPersonId("");
    setRelationshipType("");
    setSourceId("");
    createProposal.mutate(
      {
        fromPersonId: capturedFrom,
        toPersonId: capturedTo,
        relationshipType: capturedType,
        sourceId: capturedSource,
      },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "err") {
            setError(researchErrorMessage(result.err));
          }
        },
        onError: () =>
          setError("Your proposal couldn't be saved. Please try again."),
      },
    );
  };

  return (
    <div className="research-panel">
      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Propose a relationship</span>
        </div>
        <p className="research-section-hint">
          Propose a relationship between two family members, backed by a source.
          Proposals enter as proposed and are reviewed before being applied.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">From person</span>
            <select
              data-ocid="research.relationship.from_select"
              value={fromPersonId}
              onChange={(e) => setFromPersonId(e.target.value)}
              className="form-select"
            >
              <option value="">Select a person…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">To person</span>
            <select
              data-ocid="research.relationship.to_select"
              value={toPersonId}
              onChange={(e) => setToPersonId(e.target.value)}
              className="form-select"
            >
              <option value="">Select a person…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Relationship type</span>
            <input
              data-ocid="research.relationship.type_input"
              type="text"
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value)}
              placeholder="e.g. Daughter"
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Source</span>
            <select
              data-ocid="research.relationship.source_select"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="form-select"
            >
              <option value="">Select a source…</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id.toString()}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <FormError message={error} />}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-ocid="research.relationship.submit_button"
            onClick={handleSubmit}
            disabled={!canSubmit || createProposal.isPending}
            className="research-resolve"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {createProposal.isPending ? "Saving…" : "Propose relationship"}
          </button>
        </div>
      </section>

      <section className="research-section">
        <div className="research-section-head">
          <span className="research-section-title">Relationship proposals</span>
        </div>
        {isLoading ? (
          <div
            data-ocid="research.relationships.loading_state"
            className="flex flex-col gap-2"
          >
            {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
              <div
                key={id}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <ResearchEmpty
            title="No relationship proposals yet"
            hint="Propose a relationship between two family members above."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {proposals.map((proposal) => (
              <article
                key={proposal.id}
                data-ocid={`research.relationships.item.${proposal.id}`}
                className="research-source-card"
              >
                <div className="research-source-head">
                  <h3 className="research-source-title">
                    {resolveDisplayName(proposal.fromPersonId, profiles)} →{" "}
                    {resolveDisplayName(proposal.toPersonId, profiles)}
                  </h3>
                  <StatusPill status={proposal.status} />
                </div>
                <span className="research-evidence research-evidence-relationship">
                  {proposal.relationshipType}
                </span>
                <div className="research-finding-meta">
                  <span>Proposed {formatDate(proposal.submittedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ResearchIntakePage({
  onBack,
  onOpenReviewQueue,
  onOpenConflictReview,
}: ResearchIntakePageProps) {
  const { data: isAdmin = false, isLoading: adminLoading } = useIsAdmin();
  const [tab, setTab] = useState<Tab>("sources");

  if (!adminLoading && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <button
          type="button"
          data-ocid="research_intake.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">←</span> Back to Family Steward
        </button>
        <div
          data-ocid="research_intake.unauthorized_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShieldCheck
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Family Steward access required
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            The Research Intake workspace is available to Family Stewards. Sign
            in with a steward account to record sources, proposed findings, and
            person candidates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="hub-header mb-6">
        <button
          type="button"
          data-ocid="research_intake.back_button"
          onClick={onBack}
          aria-label="Back to Family Steward"
          className="hub-back"
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="min-w-0">
          <h1 className="hub-title">Research Intake</h1>
          <p className="hub-subtitle">
            Record sources, proposed findings, and person candidates for review.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            data-ocid="research_intake.open_review_queue"
            onClick={onOpenReviewQueue}
            className="research-tab"
          >
            <ClipboardList
              className="h-4 w-4"
              strokeWidth={2}
              aria-hidden="true"
            />
            Review Queue
          </button>
          <button
            type="button"
            data-ocid="research_intake.open_conflict_review"
            onClick={onOpenConflictReview}
            className="research-tab"
          >
            <Scale className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Conflict Review
          </button>
        </div>
      </header>

      <div
        className="research-tabs mb-6"
        role="tablist"
        aria-label="Research intake sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-ocid={`research_intake.tab.${t.id}`}
            onClick={() => setTab(t.id)}
            className={`research-tab ${tab === t.id ? "research-tab-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sources" && <SourcesTab />}
      {tab === "findings" && <FindingsTab />}
      {tab === "candidates" && <CandidatesTab />}
      {tab === "relationships" && <RelationshipsTab />}
    </div>
  );
}
