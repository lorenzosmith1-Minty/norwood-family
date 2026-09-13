import { ExternalBlob } from "@caffeineai/object-storage";
import {
  Check,
  FileText,
  Image,
  type LucideIcon,
  Paperclip,
  Send,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import {
  useCreateBoardPost,
  useCreateBoardPostWithMedia,
  useGetBoardPost,
  useListBoardPosts,
  useUpdateBoardPost,
} from "../hooks/useBoard";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { profiles } from "../pages/PersonProfilePage";
import {
  ARCHIVE_ITEM_TYPE_LABELS,
  ArchiveItemClassification,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "../types/archive";
import type { OralHistorySpeaker } from "../types/archive";
import {
  POST_TYPE_LABELS,
  type Post,
  type PostTag,
  PostType,
  normalizeTags,
} from "../types/board";

interface BoardPostComposerProps {
  /** The post id when editing an existing post; null for a new post. */
  postId: bigint | null;
  /** Navigates back to the previous view. */
  onBack: () => void;
  /** Opens a person's profile. */
  onOpenProfile: (personId: string) => void;
}

/** The ordered list of post types offered in the type selector. */
const POST_TYPES: PostType[] = [
  PostType.General,
  PostType.Announcement,
  PostType.FamilyQuestion,
  PostType.ResearchHistory,
  PostType.PhotoIdentification,
  PostType.Recipe,
  PostType.ReunionEvent,
  PostType.Memorial,
  PostType.Other,
];

/**
 * A single new media upload attached to a board post. Uploading creates one
 * canonical Archive item (pending) linked to the post; the underlying file is
 * never duplicated. `key` is a local, stable identity for the draft row.
 */
interface NewUploadDraft {
  key: string;
  title: string;
  description: string;
  itemType: ArchiveItemType;
  blob: ExternalBlob;
  /** Byte length of the underlying file, for the size label. */
  size: number;
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

/** Maps a file's MIME type to the archive item type for a new attachment. */
function detectItemType(mime: string): ArchiveItemType {
  if (mime.startsWith("image/")) return ArchiveItemType.Photo;
  if (mime.startsWith("video/")) return ArchiveItemType.Video;
  return ArchiveItemType.Document;
}

/** Per-type icon for a new-upload attachment chip. */
function uploadTypeIcon(itemType: ArchiveItemType): LucideIcon {
  switch (itemType) {
    case ArchiveItemType.Photo:
      return Image;
    case ArchiveItemType.Video:
      return Video;
    default:
      return FileText;
  }
}

/** Formats a byte count as a compact human-readable size. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Family Message Board composer. Creates a new post or edits an existing
 * one (author only). Includes a post-type selector, an optional title, the
 * message body, related-family-member multi-select using the Norwood checkmark
 * chip pattern, and an attachment section that links existing Archive items
 * and/or uploads new photo/document/video media. New uploads create one
 * canonical Archive record each (never duplicating the file) and are sent via
 * useCreateBoardPostWithMedia; posts without new uploads use the plain
 * createBoardPost flow. Saved selections reopen selected when editing.
 */
export function BoardPostComposer({ postId, onBack }: BoardPostComposerProps) {
  const isEditing = postId !== null;
  const { data: existingPost } = useGetBoardPost(postId);
  const { data: archiveItems = [] } = useApprovedArchiveItems();
  const { data: boardPosts = [] } = useListBoardPosts();

  const [postType, setPostType] = useState<PostType>(PostType.General);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [relatedPersonIds, setRelatedPersonIds] = useState<string[]>([]);
  const [linkedMediaIds, setLinkedMediaIds] = useState<bigint[]>([]);
  const [newUploads, setNewUploads] = useState<NewUploadDraft[]>([]);
  const [tags, setTags] = useState<PostTag[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadKeyRef = useRef(0);

  const createPost = useCreateBoardPost();
  const createWithMedia = useCreateBoardPostWithMedia();
  const updatePost = useUpdateBoardPost();

  // When editing, seed the form from the existing post once it loads.
  useEffect(() => {
    if (!existingPost) return;
    setPostType(existingPost.postType);
    setTitle(existingPost.title ?? "");
    setBody(existingPost.body);
    setRelatedPersonIds(existingPost.relatedPersonIds);
    setLinkedMediaIds(existingPost.linkedMediaIds);
    setTags(normalizeTags(existingPost.tags));
  }, [existingPost]);

  const toggleMember = (id: string) => {
    setRelatedPersonIds((current) =>
      current.includes(id)
        ? current.filter((memberId) => memberId !== id)
        : [...current, id],
    );
  };

  const toggleMedia = (id: bigint) => {
    setLinkedMediaIds((current) =>
      current.includes(id)
        ? current.filter((mediaId) => mediaId !== id)
        : [...current, id],
    );
  };

  // The pool of existing tags to suggest from, gathered from the approved
  // archive items the composer already loads plus the tags already used on
  // other board posts (the board's own tag vocabulary). Deduplicated,
  // lowercased.
  const existingTags = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    const collect = (rawTags: string[]) => {
      for (const raw of rawTags) {
        const tag = raw.trim().toLowerCase();
        if (tag && !seen.has(tag)) {
          seen.add(tag);
          result.push(tag);
        }
      }
    };
    for (const item of archiveItems) collect(item.tags);
    for (const post of boardPosts) collect(post.tags);
    return result;
  }, [archiveItems, boardPosts]);

  // Suggestions matching the current draft, excluding tags already chosen.
  const tagSuggestions = useMemo(() => {
    const draft = tagDraft.trim().toLowerCase();
    if (!draft) return [];
    return existingTags
      .filter((tag) => tag.includes(draft) && !tags.includes(tag))
      .slice(0, 6);
  }, [existingTags, tagDraft, tags]);

  /** Adds a tag from the draft input, normalizing and de-duplicating. */
  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, "").trim().toLowerCase();
    if (!tag) return;
    setTags((current) => (current.includes(tag) ? current : [...current, tag]));
    setTagDraft("");
    setShowTagSuggestions(false);
  };

  const removeTag = (tag: string) => {
    setTags((current) => current.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
    } else if (event.key === "Escape") {
      setShowTagSuggestions(false);
    } else if (
      event.key === "Backspace" &&
      tagDraft === "" &&
      tags.length > 0
    ) {
      setTags((current) => current.slice(0, -1));
    }
  };

  // Tags carried by the currently selected linked archive items that are not
  // yet on the post, offered for one-click inheritance.
  const inheritableTags = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of archiveItems) {
      if (!linkedMediaIds.includes(item.id)) continue;
      for (const raw of item.tags) {
        const tag = raw.trim().toLowerCase();
        if (tag && !tags.includes(tag) && !seen.has(tag)) {
          seen.add(tag);
          result.push(tag);
        }
      }
    }
    return result;
  }, [archiveItems, linkedMediaIds, tags]);

  const inheritTags = () => {
    setTags((current) => normalizeTags([...current, ...inheritableTags]));
  };

  const handleNewFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = ExternalBlob.fromBytes(bytes, file.type, file.name);
    const key = `upload-${uploadKeyRef.current++}`;
    setNewUploads((current) => [
      ...current,
      {
        key,
        title: file.name.replace(/\.[^.]+$/, ""),
        description: "",
        itemType: detectItemType(file.type),
        blob,
        size: bytes.byteLength,
        era: "",
        year: null,
        tags: [],
        relatedMemberIds: [],
        relatedBranchId: null,
        sourceStatus: SourceStatus.Unverified,
        privacyLevel: PrivacyLevel.FamilyOnly,
        classification: ArchiveItemClassification.Standard,
        primarySpeaker: null,
      },
    ]);
  };

  const removeUpload = (key: string) => {
    setNewUploads((current) => current.filter((upload) => upload.key !== key));
  };

  const updateUploadTitle = (key: string, value: string) => {
    setNewUploads((current) =>
      current.map((upload) =>
        upload.key === key ? { ...upload, title: value } : upload,
      ),
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError("Please write a message before posting.");
      return;
    }

    for (const upload of newUploads) {
      if (!upload.title.trim()) {
        setError("Please give each new attachment a title.");
        return;
      }
    }

    const trimmedTitle = title.trim() ? title.trim() : null;

    if (isEditing && postId !== null) {
      updatePost.mutate(
        {
          postId,
          postType,
          title: trimmedTitle,
          body: trimmedBody,
          relatedPersonIds,
          linkedMediaIds,
          tags: normalizeTags(tags),
        },
        {
          onSuccess: (result) => {
            if (result === null) {
              setError("This post could not be updated.");
              return;
            }
            onBack();
          },
        },
      );
    } else if (newUploads.length > 0) {
      createWithMedia.mutate(
        {
          postType,
          title: trimmedTitle,
          body: trimmedBody,
          relatedPersonIds,
          existingArchiveItemIds: linkedMediaIds,
          newUploads: newUploads.map((upload) => ({
            title: upload.title.trim(),
            description: upload.description.trim(),
            itemType: upload.itemType,
            blob: upload.blob,
            era: upload.era.trim(),
            year: upload.year,
            tags: upload.tags,
            relatedMemberIds: upload.relatedMemberIds,
            relatedBranchId: upload.relatedBranchId,
            sourceStatus: upload.sourceStatus,
            privacyLevel: upload.privacyLevel,
            classification: upload.classification,
            primarySpeaker: upload.primarySpeaker,
          })),
          tags: normalizeTags(tags),
        },
        {
          onSuccess: () => onBack(),
        },
      );
    } else {
      createPost.mutate(
        {
          postType,
          title: trimmedTitle,
          body: trimmedBody,
          relatedPersonIds,
          linkedMediaIds,
          tags: normalizeTags(tags),
        },
        {
          onSuccess: () => onBack(),
        },
      );
    }
  };

  const isPending =
    createPost.isPending || createWithMedia.isPending || updatePost.isPending;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-ocid="board_compose.back_button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Send
              className="h-4 w-4 rotate-180"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {isEditing ? "Edit post" : "New post"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing
                ? "Update your post for the family board."
                : "Share something with the family."}
            </p>
          </div>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-xl border border-border/60 bg-card p-5 shadow-subtle"
      >
        {/* Post type selector */}
        <div>
          <span className="field-label">Post type</span>
          <div className="flex flex-wrap gap-2">
            {POST_TYPES.map((type) => {
              const selected = postType === type;
              return (
                <button
                  key={type}
                  type="button"
                  data-ocid={`board_compose.type.${type}`}
                  onClick={() => setPostType(type)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {POST_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional title */}
        <div>
          <label htmlFor="board-compose-title" className="field-label">
            Title{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <input
            id="board-compose-title"
            data-ocid="board_compose.title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give your post a title"
            className="form-input"
          />
        </div>

        {/* Body */}
        <div>
          <label htmlFor="board-compose-body" className="field-label">
            Message
          </label>
          <textarea
            id="board-compose-body"
            data-ocid="board_compose.body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What would you like to share with the family?"
            rows={5}
            className="form-input min-h-[120px] resize-y"
          />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="board-compose-tags" className="field-label">
            Tags
          </label>
          <div className="relative">
            <div className="tag-composer" data-ocid="board_compose.tags_input">
              {tags.map((tag) => (
                <span key={tag} className="tag-entry">
                  {tag}
                  <button
                    type="button"
                    data-ocid={`board_compose.tag_remove.${tag}`}
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="tag-remove"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="board-compose-tags"
                type="text"
                value={tagDraft}
                onChange={(event) => {
                  setTagDraft(event.target.value);
                  setShowTagSuggestions(true);
                }}
                onKeyDown={handleTagKeyDown}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => {
                  addTag(tagDraft);
                  setShowTagSuggestions(false);
                }}
                placeholder={
                  tags.length === 0
                    ? "Type a tag and press Enter, e.g. reunion, 1920s, recipe"
                    : "Add another tag…"
                }
                className="tag-composer-input"
              />
            </div>

            {showTagSuggestions && tagSuggestions.length > 0 ? (
              <div
                className="tag-suggest absolute left-0 right-0 top-full z-10 mt-1.5"
                data-ocid="board_compose.tag_suggestions"
              >
                {tagSuggestions.map((tag) => {
                  const matchIndex = tag.indexOf(tagDraft.trim().toLowerCase());
                  return (
                    <button
                      key={tag}
                      type="button"
                      data-ocid={`board_compose.tag_suggest.${tag}`}
                      onMouseDown={(event) => {
                        // Keep focus in the input so the blur handler does not
                        // fire before the suggestion is applied.
                        event.preventDefault();
                        addTag(tag);
                      }}
                      className="tag-suggest-row w-full text-left"
                    >
                      {matchIndex >= 0 ? (
                        <>
                          {tag.slice(0, matchIndex)}
                          <span className="tag-suggest-match">
                            {tag.slice(
                              matchIndex,
                              matchIndex + tagDraft.trim().length,
                            )}
                          </span>
                          {tag.slice(matchIndex + tagDraft.trim().length)}
                        </>
                      ) : (
                        tag
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {showTagSuggestions &&
            tagDraft.trim() &&
            !tags.includes(tagDraft.trim().toLowerCase()) &&
            !existingTags.includes(tagDraft.trim().toLowerCase()) ? (
              <button
                type="button"
                data-ocid="board_compose.tag_create"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(tagDraft);
                }}
                className="tag-suggest-create absolute left-0 right-0 top-full z-10 mt-1.5 w-full text-left"
              >
                Create “{tagDraft.trim()}” as a new tag
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Press Enter or comma to add a tag. Tags help family members find
            this post on the board.
          </p>
        </div>

        {/* Related family members */}
        <div>
          <span className="field-label">Related family members</span>
          <div className="flex flex-wrap gap-2">
            {Object.values(profiles).map((profile) => {
              const selected = relatedPersonIds.includes(profile.id);
              return (
                <button
                  key={profile.id}
                  type="button"
                  data-ocid={`board_compose.member.${profile.id}`}
                  onClick={() => toggleMember(profile.id)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {selected ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {profile.name}
                </button>
              );
            })}
            {/* Backend-resolved / graph-only members have no static profile chip,
                so render one per selected id so they show a visible selected
                checkmark and can be toggled off. */}
            {relatedPersonIds
              .filter((id) => !profiles[id])
              .map((id) => (
                <ResolvedMemberChip
                  key={id}
                  personId={id}
                  selected
                  onToggle={() => toggleMember(id)}
                />
              ))}
          </div>
        </div>

        {/* Attachments */}
        <div className="flex flex-col gap-4">
          <span className="field-label">Attachments</span>

          {/* Link existing archive items */}
          {archiveItems.length > 0 ? (
            <div>
              <span className="text-xs font-semibold text-muted-foreground">
                Link existing archive items
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {archiveItems.map((item) => {
                  const selected = linkedMediaIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-ocid={`board_compose.media.${item.id}`}
                      onClick={() => toggleMedia(item.id)}
                      aria-pressed={selected}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        selected
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {selected ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="max-w-[12rem] truncate">
                        {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]} · {item.title}
                      </span>
                    </button>
                  );
                })}
              </div>
              {inheritableTags.length > 0 ? (
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/70 bg-card/50 px-3 py-2"
                  data-ocid="board_compose.inherit_tags"
                >
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Inherit tags from linked items:
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {inheritableTags.map((tag) => (
                      <span key={tag} className="archive-tag-chip">
                        {tag}
                      </span>
                    ))}
                  </span>
                  <button
                    type="button"
                    data-ocid="board_compose.inherit_tags_button"
                    onClick={inheritTags}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Add to post
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Upload new media (new posts only; the update flow links existing
              items but does not accept new uploads). */}
          {!isEditing ? (
            <div>
              <span className="text-xs font-semibold text-muted-foreground">
                Upload new media
              </span>
              <input
                ref={fileInputRef}
                id="board-compose-upload"
                type="file"
                accept="image/*,video/*,application/pdf,text/plain"
                className="sr-only"
                data-ocid="board_compose.upload_input"
                onChange={(event) => void handleNewFile(event)}
              />
              {newUploads.length > 0 ? (
                <div className="mt-2 flex flex-col gap-2">
                  {newUploads.map((upload, index) => {
                    const Icon = uploadTypeIcon(upload.itemType);
                    return (
                      <div
                        key={upload.key}
                        className="attachment-chip w-full"
                        data-ocid={`board_compose.upload.${index + 1}`}
                      >
                        <span className="attachment-icon">
                          <Icon
                            className="h-3.5 w-3.5"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <input
                            type="text"
                            value={upload.title}
                            onChange={(event) =>
                              updateUploadTitle(upload.key, event.target.value)
                            }
                            placeholder="Attachment title"
                            aria-label="Attachment title"
                            data-ocid={`board_compose.upload.title.${index + 1}`}
                            className="w-full bg-transparent text-xs font-semibold text-foreground outline-none placeholder:text-muted-foreground/70"
                          />
                          <span className="attachment-meta">
                            {ARCHIVE_ITEM_TYPE_LABELS[upload.itemType]} ·{" "}
                            {formatBytes(upload.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          data-ocid={`board_compose.upload.remove.${index + 1}`}
                          onClick={() => removeUpload(upload.key)}
                          aria-label={`Remove ${upload.title || "attachment"}`}
                          className="attachment-remove"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <button
                type="button"
                data-ocid="board_compose.upload_button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/70 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Add a photo, document, or video
              </button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Each upload becomes one Archive item linked to this post. The
                original file is never duplicated.
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <p
            data-ocid="board_compose.error"
            className="text-xs font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4">
          <button
            type="button"
            data-ocid="board_compose.cancel"
            onClick={onBack}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border/60 px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-ocid="board_compose.submit"
            disabled={isPending}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {isEditing ? "Save changes" : "Post to board"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A checkmark chip for a selected member with no static profile entry. */
function ResolvedMemberChip({
  personId,
  selected,
  onToggle,
}: {
  personId: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const { displayName } = useCanonicalPerson(personId, personId);
  return (
    <button
      type="button"
      data-ocid={`board_compose.member.${personId}`}
      onClick={onToggle}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {displayName}
    </button>
  );
}

export type { Post };
