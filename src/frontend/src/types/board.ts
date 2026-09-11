import { PostStatus, PostType, PrivacyScope } from "@/backend";
import type { Post as BackendPost, Reply as BackendReply } from "@/backend";

/**
 * Shared frontend types for the Family Message Board, mirroring the generated
 * backend.d.ts contract. The backend enums that ARE exported (`PostType`,
 * `PostStatus`, `PrivacyScope`) are re-exported here for a single import
 * surface, and the record interfaces are re-exported as type aliases.
 *
 * Page tasks import these rather than reaching into the generated bindings
 * directly.
 */

export type { BackendPost, BackendReply };
export { PostStatus, PostType, PrivacyScope };

/** Stable id of a board post. */
export type PostId = bigint;
/** Stable id of a board reply. */
export type ReplyId = bigint;

/** A single Family Message Board post (Family Only privacy scope). */
export type Post = BackendPost;

/** A one-level reply to a board post, shown chronologically under it. */
export type Reply = BackendReply;

/** Friendly labels for the board post types. */
export const POST_TYPE_LABELS: Record<PostType, string> = {
  [PostType.General]: "General",
  [PostType.Announcement]: "Announcement",
  [PostType.FamilyQuestion]: "Family Question",
  [PostType.ResearchHistory]: "Research / History",
  [PostType.PhotoIdentification]: "Photo Identification",
  [PostType.Recipe]: "Recipe",
  [PostType.ReunionEvent]: "Reunion / Event",
  [PostType.Memorial]: "Memorial",
  [PostType.Other]: "Other",
};

/** Friendly labels for a board post's lifecycle status. */
export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  [PostStatus.Active]: "Active",
  [PostStatus.Archived]: "Archived",
};
