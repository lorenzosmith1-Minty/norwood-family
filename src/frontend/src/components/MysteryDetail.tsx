import type { Mystery } from "@/types/family-history";
import { MysteryStatus } from "@/types/family-history";
import {
  MYSTERY_STATUS_BADGE,
  MYSTERY_STATUS_LABELS,
} from "@/types/family-history";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  Lightbulb,
  Users,
} from "lucide-react";
import { useState } from "react";
import {
  useMarkMysteryResolved,
  useUpdateCanonicalMystery,
} from "../hooks/useFamilyHistory";
import { PersonLink } from "./PersonLink";

interface MysteryDetailProps {
  mystery: Mystery;
  /** Navigates back to the mystery list. */
  onBack: () => void;
  /** Navigates to a related person's profile. */
  onOpenProfile?: (id: string) => void;
  /** Opens the contribution form for this mystery. */
  onContribute: () => void;
  /** True when the caller is a Family Steward (gates edit/status controls). */
  isAdmin: boolean;
  /** True when the caller is signed in (gates the contribute action). */
  isAuthenticated: boolean;
}

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

/** Shortens a contributor principal to a readable, copy-safe label. */
function formatContributor(contributor: Mystery["contributor"]): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

const STATUS_ORDER: MysteryStatus[] = [
  MysteryStatus.Open,
  MysteryStatus.Researching,
  MysteryStatus.PartiallyResolved,
  MysteryStatus.Resolved,
];

/**
 * Full view of a single family mystery. The KNOWN / POSSIBILITIES / SOURCES
 * sections are visually distinct so a theory can never be mistaken for a
 * confirmed fact: KNOWN is a solid sepia plate, POSSIBILITIES a dashed ochre
 * plate, and SOURCES a document plate. When a mystery is resolved, the prior
 * theories and history are preserved and a resolution summary is shown.
 */
export function MysteryDetail({
  mystery,
  onBack,
  onOpenProfile,
  onContribute,
  isAdmin,
  isAuthenticated,
}: MysteryDetailProps) {
  const [status, setStatus] = useState<MysteryStatus>(mystery.status);
  const [showResolve, setShowResolve] = useState(false);
  const [summary, setSummary] = useState("");
  const [evidence, setEvidence] = useState("");

  const updateMystery = useUpdateCanonicalMystery();
  const markResolved = useMarkMysteryResolved();

  const changeStatus = (next: MysteryStatus) => {
    setStatus(next);
    updateMystery.mutate({
      id: mystery.id,
      title: mystery.title,
      description: mystery.description,
      relatedMemberIds: mystery.relatedMemberIds,
      relatedBranchId: mystery.relatedBranchId ?? null,
      knownFacts: mystery.knownFacts,
      possibilities: mystery.possibilities,
      relatedSourceIds: mystery.relatedSourceIds,
      relatedArchiveItemIds: mystery.relatedArchiveItemIds,
      status: next,
    });
  };

  const submitResolution = () => {
    if (!summary.trim()) return;
    const evidenceList = evidence
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    markResolved.mutate(
      {
        id: mystery.id,
        summary: summary.trim(),
        supportingEvidence: evidenceList,
      },
      {
        onSuccess: () => {
          setShowResolve(false);
          setSummary("");
          setEvidence("");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          data-ocid="mystery.back_button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All mysteries
        </button>
        <span
          data-ocid="mystery.status_badge"
          className={`mystery-status ${MYSTERY_STATUS_BADGE[mystery.status]}`}
        >
          {MYSTERY_STATUS_LABELS[mystery.status]}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {mystery.title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {mystery.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {mystery.relatedMemberIds.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
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
          </span>
        )}
        {mystery.relatedBranchId && (
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {mystery.relatedBranchId}
          </span>
        )}
        <span>Contributed by {formatContributor(mystery.contributor)}</span>
        <span>Created {formatDate(mystery.createdAt)}</span>
        <span>Updated {formatDate(mystery.updatedAt)}</span>
      </div>

      <div className="mystery-sections">
        <section
          data-ocid="mystery.known_section"
          className="mystery-section mystery-known"
        >
          <div className="mystery-section-head">
            <span className="mystery-section-title">Known</span>
          </div>
          <p className="mystery-section-hint">
            What existing evidence supports.
          </p>
          {mystery.knownFacts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {mystery.knownFacts.map((fact) => (
                <li key={`known-${fact}`} className="mystery-section-item">
                  {fact}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mystery-section-hint">
              No confirmed facts recorded yet.
            </p>
          )}
        </section>

        <section
          data-ocid="mystery.possibilities_section"
          className="mystery-section mystery-possibility"
        >
          <div className="mystery-section-head">
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            <span className="mystery-section-title">Possibilities</span>
          </div>
          <p className="mystery-section-hint">
            Family theories, oral history, and research hypotheses — not
            confirmed fact.
          </p>
          {mystery.possibilities.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {mystery.possibilities.map((possibility) => (
                <li key={possibility} className="mystery-section-item">
                  {possibility}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mystery-section-hint">No theories recorded yet.</p>
          )}
        </section>

        <section
          data-ocid="mystery.sources_section"
          className="mystery-section mystery-source"
        >
          <div className="mystery-section-head">
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span className="mystery-section-title">Sources</span>
          </div>
          <p className="mystery-section-hint">
            Documents and Archive items supporting the research.
          </p>
          {mystery.relatedSourceIds.length === 0 &&
          mystery.relatedArchiveItemIds.length === 0 ? (
            <p className="mystery-section-hint">No sources recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mystery.relatedSourceIds.map((id) => (
                <li key={id.toString()} className="mystery-section-item">
                  <span className="item-tag">Source</span> #{id.toString()}
                </li>
              ))}
              {mystery.relatedArchiveItemIds.map((id) => (
                <li key={id.toString()} className="mystery-section-item">
                  <span className="item-tag">Archive</span> #{id.toString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {mystery.resolution && (
        <section
          data-ocid="mystery.resolution_section"
          className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-success">
              Resolution
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {mystery.resolution.summary}
          </p>
          {mystery.resolution.supportingEvidence.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mystery.resolution.supportingEvidence.map((item) => (
                <li key={item} className="mystery-section-item">
                  {item}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Resolved {formatDate(mystery.resolution.resolvedAt)} — the prior
            theories and research trail above are preserved.
          </p>
        </section>
      )}

      {isAuthenticated && (
        <button
          type="button"
          data-ocid="mystery.contribute_button"
          onClick={onContribute}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ backgroundColor: "oklch(var(--primary))" }}
        >
          Contribute a note, memory, lead, or source
        </button>
      )}

      {isAdmin && (
        <section
          data-ocid="mystery.steward_controls"
          className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Steward controls
          </h2>

          <div className="flex flex-col gap-2">
            <label htmlFor="mystery-status" className="field-label">
              Status
            </label>
            <select
              id="mystery-status"
              data-ocid="mystery.status_select"
              value={status}
              onChange={(e) => changeStatus(e.target.value as MysteryStatus)}
              className="form-select"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {MYSTERY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {updateMystery.isError && (
              <p className="text-xs text-destructive">
                Could not update status. Please try again.
              </p>
            )}
          </div>

          {mystery.status !== MysteryStatus.Resolved && (
            <div className="flex flex-col gap-2">
              {!showResolve ? (
                <button
                  type="button"
                  data-ocid="mystery.resolve_button"
                  onClick={() => setShowResolve(true)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-success/40 px-4 py-2 text-sm font-semibold text-success transition-colors hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Mark resolved
                </button>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                  <label htmlFor="resolution-summary" className="field-label">
                    Resolution summary
                  </label>
                  <textarea
                    id="resolution-summary"
                    data-ocid="mystery.resolution_summary_input"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="What the evidence now supports…"
                    className="form-textarea"
                  />
                  <label htmlFor="resolution-evidence" className="field-label">
                    Supporting evidence (one per line)
                  </label>
                  <textarea
                    id="resolution-evidence"
                    data-ocid="mystery.resolution_evidence_input"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="Document or Archive reference…"
                    className="form-textarea"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-ocid="mystery.confirm_resolve_button"
                      onClick={submitResolution}
                      disabled={!summary.trim() || markResolved.isPending}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-success transition-colors hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {markResolved.isPending
                        ? "Resolving…"
                        : "Confirm resolution"}
                    </button>
                    <button
                      type="button"
                      data-ocid="mystery.cancel_resolve_button"
                      onClick={() => setShowResolve(false)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Cancel
                    </button>
                  </div>
                  {markResolved.isError && (
                    <p className="text-xs text-destructive">
                      Could not mark resolved. Please try again.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
