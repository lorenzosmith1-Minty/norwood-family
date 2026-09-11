import {
  ClaimError,
  ClaimStatus,
  CreateError,
  EditError,
  LivingStatus,
  NotificationType,
  PrivacyLevel,
  RelationshipError,
  RelationshipStatus,
  RelationshipType,
} from "@/backend";
import type {
  Notification as BackendNotification,
  PersonProfile as BackendPersonProfile,
  PersonMatch,
  ProfileEdits,
} from "@/backend";
import type { Principal } from "@icp-sdk/core/principal";

/**
 * Shared frontend types for the profile-ownership and relationship-verification
 * workflows, mirroring the generated backend.d.ts contract. The generated
 * bindings do not export the `ProfileClaimStatus` and
 * `RelationshipRequestStatus` enums, so they are defined here as string unions
 * matching the backend's variant values (Pending / Approved / Rejected).
 *
 * Page tasks import these rather than reaching into the generated bindings
 * directly. The backend enums that ARE exported (`LivingStatus`, `ClaimStatus`,
 * `RelationshipStatus`, `RelationshipType`, `NotificationType`, and the error
 * unions) are re-exported here for a single import surface.
 */

/** Status of a profile claim: pending review, approved, or rejected. */
export type ProfileClaimStatus = "Pending" | "Approved" | "Rejected";

/**
 * Where the "My Profile" nav action should route for the signed-in caller,
 * derived from their own claim state:
 *   - "owned": an APPROVED claim -> the canonical owned profile.
 *   - "pending": a PENDING claim -> the same canonical profile (renders the
 *     PENDING CLAIM state). Never routed back to the "This is Me" flow.
 *   - "add-myself": no claim -> the Add Myself / matching flow.
 */
export type MyProfileRoute = "owned" | "pending" | "add-myself";

/**
 * Resolves the "My Profile" routing decision from the caller's own claim
 * status and connected person id. A connected profile (Claimed = approved,
 * Unclaimed = pending) routes to the canonical profile; no connected profile
 * routes to the Add Myself flow. A pending claim is never routed back to the
 * "This is Me" flow.
 */
export function resolveMyProfileRoute(
  claimStatus: ClaimStatus | undefined,
  personId: string | undefined,
): MyProfileRoute {
  if (claimStatus === ClaimStatus.Claimed && personId) return "owned";
  if (claimStatus === ClaimStatus.Unclaimed && personId) return "pending";
  return "add-myself";
}

/** Status of a relationship request: pending review, approved, or rejected. */
export type RelationshipRequestStatus = "Pending" | "Approved" | "Rejected";

/** A profile claim record tracking who claimed a profile and its review state. */
export interface ProfileClaim {
  id: bigint;
  /** The person whose profile is being claimed. */
  personId: string;
  /** The user who submitted the claim. */
  requestingUserId: Principal;
  status: ProfileClaimStatus;
  /** Nanosecond timestamp of when the claim was submitted. */
  submittedDate: bigint;
  /** Nanosecond timestamp of when the claim was reviewed, once reviewed. */
  reviewedDate?: bigint;
  /** The reviewer who approved/rejected the claim, once reviewed. */
  reviewedBy?: Principal;
}

/** A proposed relationship connection awaiting steward confirmation. */
export interface RelationshipRequest {
  id: bigint;
  /** The person proposing the connection. */
  requestingPersonId: string;
  /** The person being connected to. */
  relatedPersonId: string;
  proposedRelationship: RelationshipType;
  status: RelationshipRequestStatus;
  /** Nanosecond timestamp of when the request was submitted. */
  submittedDate: bigint;
  /** Nanosecond timestamp of when the request was reviewed, once reviewed. */
  reviewedDate?: bigint;
  /** The reviewer who approved/rejected the request, once reviewed. */
  reviewer?: Principal;
}

/** An in-app notification record for a user. */
export interface Notification {
  id: bigint;
  recipient: Principal;
  notificationType: NotificationType;
  message: string;
  /** Nanosecond timestamp of when the notification was created. */
  createdAt: bigint;
  read: boolean;
}

/**
 * A single editable timeline entry in the Edit My Profile form. The backend
 * stores timeline as free-text lines (?[Text]), so each structured entry is
 * serialized to a line on save and parsed back on load. `location` is optional
 * and appended to the detail when present.
 */
export interface TimelineDraft {
  /** Stable local id used only for React keys while editing. */
  id: number;
  /** Date or year, e.g. "1998" or "June 1998". Optional. */
  date: string;
  /** Short title of the milestone. Optional. */
  title: string;
  /** Longer description of the milestone. Optional. */
  detail: string;
  /** Optional location associated with the entry. */
  location: string;
}

/**
 * The full editable form state of the expanded Edit My Profile page. Owned in
 * local state (and autosaved to localStorage as a draft), then mapped to a
 * backend ProfileEdits on save. Never a backend-owned record itself.
 */
export interface ProfileDraft {
  preferredName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  nickname: string;
  birthDate: string;
  /** When true, only the birth year is known (birthDate holds a year). */
  birthYearOnly: boolean;
  birthplace: string;
  currentLocation: string;
  occupation: string;
  livingStatus: LivingStatus;
  shortBio: string;
  longerStory: string;
  timeline: TimelineDraft[];
  privacySettings: string;
}

/** Visibility options for editable personal fields (Family / Private only). */
export const PRIVACY_OPTIONS: { value: string; label: string }[] = [
  { value: PrivacyLevel.FamilyOnly, label: "Family only" },
  { value: PrivacyLevel.Private, label: "Private" },
];

export type {
  BackendNotification,
  BackendPersonProfile,
  PersonMatch,
  ProfileEdits,
};
export {
  ClaimError,
  ClaimStatus,
  CreateError,
  EditError,
  LivingStatus,
  NotificationType,
  PrivacyLevel,
  RelationshipError,
  RelationshipStatus,
  RelationshipType,
};

/** Friendly labels for profile claim status. */
export const PROFILE_CLAIM_STATUS_LABELS: Record<ProfileClaimStatus, string> = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};

/** Friendly labels for relationship request status. */
export const RELATIONSHIP_REQUEST_STATUS_LABELS: Record<
  RelationshipRequestStatus,
  string
> = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};

/** Friendly labels for relationship verification status. */
export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  [RelationshipStatus.Confirmed]: "Confirmed",
  [RelationshipStatus.Pending]: "Pending",
  [RelationshipStatus.Disputed]: "Disputed",
};

/** Friendly labels for the four relationship types. */
export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  [RelationshipType.Parent]: "Parent",
  [RelationshipType.Child]: "Child",
  [RelationshipType.Sibling]: "Sibling",
  [RelationshipType.SpousePartner]: "Spouse or Partner",
};

/** Friendly labels for notification types. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NotificationType.ProfileClaimRequested]: "Profile claim requested",
  [NotificationType.ProfileClaimReviewed]: "Profile claim reviewed",
  [NotificationType.RelationshipRequested]: "Relationship requested",
  [NotificationType.RelationshipReviewed]: "Relationship reviewed",
  [NotificationType.BoardMention]: "Board mention",
  [NotificationType.BoardReply]: "Board reply",
  [NotificationType.NewMessage]: "New message",
};

/**
 * Resolves a status badge (base pill class + color tone + label) for a given
 * kind and status. Used by the shared StatusBadge component and by pages that
 * render statuses inline. Returns null for an unknown status so callers can
 * render nothing rather than a broken badge.
 */
export function resolveStatusBadge(
  kind: "claim" | "relationship" | "relationshipRequest",
  status: string,
): { base: string; tone: string; label: string } | null {
  if (kind === "claim") {
    switch (status) {
      case "Unclaimed":
        return {
          base: "claim-badge",
          tone: "claim-badge-unclaimed",
          label: "Unclaimed",
        };
      // A profile claim that has been approved renders as CLAIMED (the profile
      // is now owned), and a pending claim renders as PENDING CLAIM.
      case "Claimed":
      case "Approved":
        return {
          base: "claim-badge",
          tone: "claim-badge-claimed",
          label: "Claimed",
        };
      case "Pending":
        return {
          base: "claim-badge",
          tone: "claim-badge-pending",
          label: "Pending claim",
        };
      case "Rejected":
        return {
          base: "claim-badge",
          tone: "rel-disputed",
          label: "Rejected",
        };
      default:
        return null;
    }
  }

  // Relationship verification and relationship-request statuses share the
  // rel-status pill. Approved maps to the confirmed (green) tone and Rejected
  // to the disputed (terracotta) tone so the review surface reads clearly.
  switch (status) {
    case "Confirmed":
    case "Approved":
      return {
        base: "rel-status",
        tone: "rel-confirmed",
        label: status === "Confirmed" ? "Confirmed" : "Approved",
      };
    case "Pending":
      return { base: "rel-status", tone: "rel-pending", label: "Pending" };
    case "Disputed":
    case "Rejected":
      return {
        base: "rel-status",
        tone: "rel-disputed",
        label: status === "Disputed" ? "Disputed" : "Rejected",
      };
    default:
      return null;
  }
}
