import {
  ConflictResolutionAction,
  EvidenceLabel,
  FindingType,
  ReviewAction,
  ReviewItemKind,
  ReviewStatus,
  SourceType,
} from "@/backend";
import type {
  ConflictReviewItem,
  FindingContent,
  FindingId,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
  ResearchError,
  Result_16,
  Result_17,
  Result_18,
  Result_20,
  ReviewQueue,
  ReviewQueueItem,
  SourceId,
  SourceRecord,
} from "@/backend";
import type { ArchiveItem } from "@/types/archive";

/**
 * Shared frontend types for the Historical Research Intake workspace, mirroring
 * the generated backend.d.ts contract. The backend enums that ARE exported
 * (`SourceType`, `EvidenceLabel`, `FindingType`, `ReviewStatus`,
 * `ReviewAction`, `ReviewItemKind`, and the `ResearchError` union) are
 * re-exported here as values so page tasks get a single import surface and can
 * use them in `switch` statements and as object keys. The record/result
 * interfaces are re-exported as types.
 *
 * Page tasks import these rather than reaching into the generated bindings
 * directly.
 */

export type {
  ConflictReviewItem,
  FindingContent,
  FindingId,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
  Result_16,
  Result_17,
  Result_18,
  Result_20,
  ReviewQueue,
  ReviewQueueItem,
  SourceId,
  SourceRecord,
  ResearchError,
};
export {
  ConflictResolutionAction,
  EvidenceLabel,
  FindingType,
  ReviewAction,
  ReviewItemKind,
  ReviewStatus,
  SourceType,
};

/**
 * Result of a research source upload, mirroring the backend `SourceUploadResult`
 * contract: the created Source record plus the canonical Archive item it links
 * to. The Archive item is created first (pending) and the Source record links
 * to it via `archiveItemId`, so no manually typed Archive Item ID is required.
 */
export interface SourceUploadResult {
  source: SourceRecord;
  archiveItem: ArchiveItem;
}

/** Friendly labels for a source record's type. */
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  [SourceType.CensusCitation]: "Census citation",
  [SourceType.DeedPropertyReference]: "Deed / property reference",
  [SourceType.EmailThread]: "Email thread",
  [SourceType.ResearchNotes]: "Research notes",
  [SourceType.CertificateHeadstoneReference]:
    "Certificate / headstone reference",
  [SourceType.UploadedDocumentImage]: "Uploaded document / image",
};

/** Friendly labels for a proposed finding's evidence label. */
export const EVIDENCE_LABEL_LABELS: Record<EvidenceLabel, string> = {
  [EvidenceLabel.Documented]: "Documented",
  [EvidenceLabel.FamilyHistoryOralHistory]: "Family history / oral history",
  [EvidenceLabel.PersonalMemory]: "Personal memory",
  [EvidenceLabel.Hypothesis]: "Hypothesis",
  [EvidenceLabel.Conflicting]: "Conflicting",
  [EvidenceLabel.NeedsResearch]: "Needs research",
};

/** Friendly labels for a proposed finding's type. */
export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  [FindingType.PersonFact]: "Person fact",
  [FindingType.Relationship]: "Relationship",
  [FindingType.TimelineEvent]: "Timeline event",
  [FindingType.Story]: "Story",
  [FindingType.Mystery]: "Mystery",
  [FindingType.Source]: "Source",
};

/** Friendly labels for a research item's review status. */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  [ReviewStatus.Pending]: "Pending",
  [ReviewStatus.Approved]: "Approved",
  [ReviewStatus.Rejected]: "Rejected",
  [ReviewStatus.Conflicting]: "Conflicting",
  [ReviewStatus.NeedsResearch]: "Needs research",
};

/** Friendly labels for a conflict resolution action. */
export const CONFLICT_ACTION_LABELS: Record<ConflictResolutionAction, string> =
  {
    [ConflictResolutionAction.KeepExisting]: "Keep Existing",
    [ConflictResolutionAction.ReplaceExisting]: "Replace Existing",
    [ConflictResolutionAction.PreserveBoth]: "Preserve Both / Unresolved",
    [ConflictResolutionAction.NeedsResearch]: "Needs Research",
  };
