import type { EvidenceStatus } from "@/types/family-history";
import {
  EVIDENCE_STATUS_BADGE,
  EVIDENCE_STATUS_LABELS,
} from "@/types/family-history";

interface EvidenceBadgeProps {
  status: EvidenceStatus;
  /** Optional override for the badge label (defaults to the status label). */
  label?: string;
}

/**
 * Evidence badge for a story or timeline event. Uses the evidence-badge
 * utility classes from index.css: Documented renders as a solid green
 * confirmed fact, while Family History / Personal Memory / Unresolved use a
 * dashed edge so a theory or memory can never be mistaken for documented
 * fact.
 */
export function EvidenceBadge({ status, label }: EvidenceBadgeProps) {
  return (
    <span
      data-ocid="evidence_badge"
      className={`evidence-badge ${EVIDENCE_STATUS_BADGE[status]}`}
    >
      {label ?? EVIDENCE_STATUS_LABELS[status]}
    </span>
  );
}
