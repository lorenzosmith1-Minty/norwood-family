import { Check, Image, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import {
  useCreateBoardPost,
  useGetBoardPost,
  useUpdateBoardPost,
} from "../hooks/useBoard";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { profiles } from "../pages/PersonProfilePage";
import { ARCHIVE_ITEM_TYPE_LABELS } from "../types/archive";
import { POST_TYPE_LABELS, type Post, PostType } from "../types/board";

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
 * The Family Message Board composer. Creates a new post or edits an existing
 * one (author only). Includes a post-type selector, an optional title, the
 * message body, related-family-member multi-select using the Norwood checkmark
 * chip pattern, and optional linked archive/media items. Saved selections
 * reopen selected when editing.
 */
export function BoardPostComposer({ postId, onBack }: BoardPostComposerProps) {
  const isEditing = postId !== null;
  const { data: existingPost } = useGetBoardPost(postId);
  const { data: archiveItems = [] } = useApprovedArchiveItems();

  const [postType, setPostType] = useState<PostType>(PostType.General);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [relatedPersonIds, setRelatedPersonIds] = useState<string[]>([]);
  const [linkedMediaIds, setLinkedMediaIds] = useState<bigint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createPost = useCreateBoardPost();
  const updatePost = useUpdateBoardPost();

  // When editing, seed the form from the existing post once it loads.
  useEffect(() => {
    if (!existingPost) return;
    setPostType(existingPost.postType);
    setTitle(existingPost.title ?? "");
    setBody(existingPost.body);
    setRelatedPersonIds(existingPost.relatedPersonIds);
    setLinkedMediaIds(existingPost.linkedMediaIds);
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError("Please write a message before posting.");
      return;
    }

    const input = {
      postType,
      title: title.trim() ? title.trim() : null,
      body: trimmedBody,
      relatedPersonIds,
      linkedMediaIds,
    };

    if (isEditing && postId !== null) {
      updatePost.mutate(
        { postId, ...input },
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
    } else {
      createPost.mutate(input, {
        onSuccess: () => onBack(),
      });
    }
  };

  const isPending = createPost.isPending || updatePost.isPending;

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

        {/* Linked media */}
        {archiveItems.length > 0 ? (
          <div>
            <span className="field-label">
              Link existing media{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </span>
            <div className="flex flex-wrap gap-2">
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
                      <Image className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="max-w-[12rem] truncate">
                      {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]} · {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

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
