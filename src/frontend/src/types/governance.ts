import {
  AuditActionType,
  MergeConflictStatus,
  MergeError,
  RelationshipAdminError,
  RelationshipStatus,
  RelationshipType,
  RemovalError,
  StewardAuditKind,
  StewardError,
  StewardRoleStatus,
  SuccessorStatus,
} from "@/backend";
import type {
  AuditEntry,
  DuplicateCandidate,
  DuplicatePair,
  MergeConflict,
  MergeResult,
  ProfileRemovalRequest,
  Relationship,
  Result_1,
  Result_2,
  Result_4,
  Result_5,
  Result_8,
  Result_9,
  Result_10,
  Result_11,
  Result_14,
  Result_16,
  StewardAuditEntry,
  StewardRecord,
  SuccessorDesignation,
} from "@/backend";

/**
 * Shared frontend types for the Family Governance & Safety Controls area,
 * mirroring the generated backend.d.ts contract. The generated bindings do not
 * export the `ProfileRemovalStatus` enum, so it is defined here as a string
 * union matching the backend's variant values (Approved / Rejected / Pending).
 *
 * Page tasks import these rather than reaching into the generated bindings
 * directly. The backend enums that ARE exported (`StewardRoleStatus`,
 * `SuccessorStatus`, `MergeConflictStatus`, `AuditActionType`, the error
 * unions, and the relationship enums) are re-exported here for a single import
 * surface.
 */

/** Review status of a profile-removal request: pending, approved, or rejected. */
export type ProfileRemovalStatus = "Approved" | "Rejected" | "Pending";

/** Friendly labels for a merged steward audit entry's kind. */
export const STEWARD_AUDIT_KIND_LABELS: Record<StewardAuditKind, string> = {
  [StewardAuditKind.Governance]: "Governance",
  [StewardAuditKind.ConflictResolution]: "Conflict resolution",
};

/** Friendly labels for a conflict-resolution action recorded in the audit. */
export const CONFLICT_RESOLUTION_LABELS: Record<string, string> = {
  KeepExisting: "Keep Existing",
  ReplaceExisting: "Replace Existing",
  PreserveBoth: "Preserve Both / Unresolved",
  NeedsResearch: "Needs Research",
};

export type {
  AuditEntry,
  DuplicateCandidate,
  DuplicatePair,
  MergeConflict,
  MergeResult,
  ProfileRemovalRequest,
  Relationship,
  Result_1,
  Result_10,
  Result_11,
  Result_14,
  Result_16,
  Result_2,
  Result_4,
  Result_5,
  Result_8,
  Result_9,
  StewardAuditEntry,
  StewardRecord,
  SuccessorDesignation,
};
export {
  AuditActionType,
  MergeConflictStatus,
  MergeError,
  RelationshipAdminError,
  RelationshipStatus,
  RelationshipType,
  RemovalError,
  StewardAuditKind,
  StewardError,
  StewardRoleStatus,
  SuccessorStatus,
};

/** Friendly labels for a steward's role status. */
export const STEWARD_ROLE_STATUS_LABELS: Record<StewardRoleStatus, string> = {
  [StewardRoleStatus.Active]: "Active",
  [StewardRoleStatus.Removed]: "Removed",
};

/** Friendly labels for a successor designation's status. */
export const SUCCESSOR_STATUS_LABELS: Record<SuccessorStatus, string> = {
  [SuccessorStatus.Designated]: "Designated",
  [SuccessorStatus.Activated]: "Activated",
  [SuccessorStatus.Removed]: "Removed",
};

/** Friendly labels for a merge conflict's resolution status. */
export const MERGE_CONFLICT_STATUS_LABELS: Record<MergeConflictStatus, string> =
  {
    [MergeConflictStatus.Pending]: "Pending",
    [MergeConflictStatus.Resolved]: "Resolved",
  };

/** Friendly labels for a profile-removal request's review status. */
export const PROFILE_REMOVAL_STATUS_LABELS: Record<
  ProfileRemovalStatus,
  string
> = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};

/** Friendly labels for the audit-log action types. */
export const AUDIT_ACTION_LABELS: Record<AuditActionType, string> = {
  [AuditActionType.StewardPromoted]: "Steward promoted",
  [AuditActionType.StewardRemoved]: "Steward removed",
  [AuditActionType.SuccessorDesignated]: "Successor designated",
  [AuditActionType.SuccessorActivated]: "Successor activated",
  [AuditActionType.ProfileArchived]: "Profile archived",
  [AuditActionType.ProfileRestored]: "Profile restored",
  [AuditActionType.ProfilePermanentlyDeleted]: "Profile permanently deleted",
  [AuditActionType.ProfileRemovalRequested]: "Profile removal requested",
  [AuditActionType.ProfileRemovalReviewed]: "Profile removal reviewed",
  [AuditActionType.ClaimApproved]: "Claim approved",
  [AuditActionType.ClaimRejected]: "Claim rejected",
  [AuditActionType.RelationshipAdded]: "Relationship added",
  [AuditActionType.RelationshipRemoved]: "Relationship removed",
  [AuditActionType.RelationshipTypeCorrected]: "Relationship type corrected",
  [AuditActionType.RelationshipRequestApproved]:
    "Relationship request approved",
  [AuditActionType.RelationshipRequestRejected]:
    "Relationship request rejected",
  [AuditActionType.RelationshipRequestPending]: "Relationship request pending",
  [AuditActionType.DuplicateMerged]: "Duplicate merged",
  [AuditActionType.BoardReplyRemoved]: "Board reply removed",
  [AuditActionType.BoardPostArchived]: "Board post archived",
  [AuditActionType.BoardPostRestored]: "Board post restored",
};
