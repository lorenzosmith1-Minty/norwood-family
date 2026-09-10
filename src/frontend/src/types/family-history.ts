import {
  EvidenceStatus,
  MysteryContributionType,
  MysteryStatus,
  TimelineEventType,
} from "@/backend";
import type {
  Mystery as BackendMystery,
  MysteryContribution as BackendMysteryContribution,
  Resolution as BackendResolution,
  Story as BackendStory,
  TimelineEvent as BackendTimelineEvent,
  TimelineLinkTarget as BackendTimelineLinkTarget,
} from "@/backend";

/**
 * Shared family-history types mirroring the generated backend.d.ts contract,
 * plus friendly human labels and badge classes for evidence status, mystery
 * status, and the timeline link targets. Page tasks import these rather than
 * reaching into the generated bindings directly.
 *
 * StoryStatus and MysteryContributionStatus are not emitted by the bindgen
 * (they only appear as field types), so they are declared here as string
 * unions matching the backend #Pending/#Approved/#Rejected variants.
 */
export type Story = BackendStory;
export type Mystery = BackendMystery;
export type MysteryContribution = BackendMysteryContribution;
export type Resolution = BackendResolution;
export type TimelineEvent = BackendTimelineEvent;
export type TimelineLinkTarget = BackendTimelineLinkTarget;

export {
  EvidenceStatus,
  MysteryStatus,
  MysteryContributionType,
  TimelineEventType,
};

/** Lifecycle of a contributed story (not emitted by bindgen). */
export type StoryStatus = "Pending" | "Approved" | "Rejected";

/** Lifecycle of a mystery contribution (not emitted by bindgen). */
export type MysteryContributionStatus = "Pending" | "Approved" | "Rejected";

/** Friendly labels for evidence status. */
export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  [EvidenceStatus.Documented]: "Documented",
  [EvidenceStatus.FamilyHistory]: "Family History",
  [EvidenceStatus.PersonalMemory]: "Personal Memory",
  [EvidenceStatus.Unresolved]: "Unresolved",
};

/**
 * Badge modifier class (from index.css) for each evidence status. Documented
 * is a solid green confirmed fact; Family History / Personal Memory /
 * Unresolved use a dashed edge so a theory or memory can never be mistaken
 * for documented fact.
 */
export const EVIDENCE_STATUS_BADGE: Record<EvidenceStatus, string> = {
  [EvidenceStatus.Documented]: "evidence-documented",
  [EvidenceStatus.FamilyHistory]: "evidence-history",
  [EvidenceStatus.PersonalMemory]: "evidence-memory",
  [EvidenceStatus.Unresolved]: "evidence-unresolved",
};

/** Friendly labels for mystery status. */
export const MYSTERY_STATUS_LABELS: Record<MysteryStatus, string> = {
  [MysteryStatus.Open]: "Open",
  [MysteryStatus.Researching]: "Researching",
  [MysteryStatus.PartiallyResolved]: "Partially Resolved",
  [MysteryStatus.Resolved]: "Resolved",
};

/** Badge modifier class (from index.css) for each mystery status. */
export const MYSTERY_STATUS_BADGE: Record<MysteryStatus, string> = {
  [MysteryStatus.Open]: "mystery-open",
  [MysteryStatus.Researching]: "mystery-researching",
  [MysteryStatus.PartiallyResolved]: "mystery-partial",
  [MysteryStatus.Resolved]: "mystery-resolved",
};

/** Friendly labels for mystery contribution types. */
export const MYSTERY_CONTRIBUTION_TYPE_LABELS: Record<
  MysteryContributionType,
  string
> = {
  [MysteryContributionType.Lead]: "Lead",
  [MysteryContributionType.Note]: "Note",
  [MysteryContributionType.Memory]: "Memory",
  [MysteryContributionType.Source]: "Source",
};

/** Friendly labels for timeline event types. */
export const TIMELINE_EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  [TimelineEventType.Birth]: "Birth",
  [TimelineEventType.Death]: "Death",
  [TimelineEventType.Marriage]: "Marriage",
  [TimelineEventType.FamilyEvent]: "Family Event",
  [TimelineEventType.Migration]: "Migration",
  [TimelineEventType.MilitaryService]: "Military Service",
  [TimelineEventType.CensusDocument]: "Census Document",
  [TimelineEventType.Story]: "Story",
  [TimelineEventType.PhotoDocument]: "Photo or Document",
  [TimelineEventType.Location]: "Location",
  [TimelineEventType.Mystery]: "Mystery",
};

/** The kind of target a timeline event links to. */
export type TimelineLinkKind = TimelineLinkTarget["__kind__"];

/** Extracts the link kind from a timeline event's link target. */
export function getTimelineLinkKind(
  target: TimelineLinkTarget,
): TimelineLinkKind {
  return target.__kind__;
}

/** Extracts the target id from a timeline event's link target, if any. */
export function getTimelineLinkId(
  target: TimelineLinkTarget,
): bigint | string | null {
  switch (target.__kind__) {
    case "Story":
      return target.Story;
    case "Mystery":
      return target.Mystery;
    case "Person":
      return target.Person;
    case "ArchiveItem":
      return target.ArchiveItem;
  }
}
