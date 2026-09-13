import {
  type ArchiveItemClassification,
  type ArchiveItemType,
  PostStatus,
  PostType,
  type PrivacyLevel,
  PrivacyScope,
  type SourceStatus,
} from "@/backend";
import type {
  Post as BackendPost,
  Reply as BackendReply,
  OralHistorySpeaker,
} from "@/backend";
import type { ExternalBlob } from "@caffeineai/object-storage";

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

/**
 * A free-form tag on a board post. Tags are user-authored strings (trimmed,
 * lowercased, deduplicated) rather than a fixed enum, so they are represented
 * as plain strings mirroring the backend `tags: [Text]` field.
 */
export type PostTag = string;

/** A single Family Message Board post (Family Only privacy scope). */
export type Post = BackendPost;

/** A one-level reply to a board post, shown chronologically under it. */
export type Reply = BackendReply;

/**
 * A single new media upload attached to a board post, mirroring the backend
 * `BoardMediaUpload` contract. Uploading creates one canonical Archive item
 * (pending) linked to the post; the underlying file is never duplicated.
 * Existing Archive items are attached by id instead of re-uploading.
 */
export interface BoardMediaUpload {
  title: string;
  description: string;
  itemType: ArchiveItemType;
  blob: ExternalBlob;
  era: string;
  year: bigint | null;
  tags: string[];
  relatedMemberIds: string[];
  relatedBranchId: string | null;
  sourceStatus: SourceStatus;
  privacyLevel: PrivacyLevel;
  classification: ArchiveItemClassification;
  primarySpeaker: OralHistorySpeaker | null;
}

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

/**
 * Normalizes free-form post tags for storage: trims whitespace, lowercases,
 * and deduplicates while preserving first-seen order. Empty strings are
 * dropped. Mirrors the backend's tag normalization so the frontend and backend
 * agree on the stored `tags: [Text]` values.
 */
export function normalizeTags(tags: string[]): PostTag[] {
  const seen = new Set<string>();
  const result: PostTag[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}
