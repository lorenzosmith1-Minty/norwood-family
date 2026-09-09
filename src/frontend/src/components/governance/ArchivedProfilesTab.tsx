import type { PersonProfile } from "@/backend";
import { Archive, Inbox, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  useListArchivedProfiles,
  usePermanentlyDeleteProfile,
  useRestoreProfile,
} from "../../hooks/useGovernance";
import { resolveBackendDisplayName } from "../../types/family";

/** Resolves a backend profile's display name. */
function profileName(profile: PersonProfile): string {
  return resolveBackendDisplayName(profile.personId, profile);
}

export function ArchivedProfilesTab() {
  const { data: archived = [], isLoading } = useListArchivedProfiles();
  const restore = useRestoreProfile();
  const permanentlyDelete = usePermanentlyDeleteProfile();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (personId: string) => {
    permanentlyDelete.mutate(
      { personId, confirmation: true },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "err") {
            setDeleteError(result.err);
            return;
          }
          setConfirmingId(null);
          setDeleteError(null);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div
        data-ocid="governance.archived.loading_state"
        className="space-y-3"
        aria-label="Loading archived profiles"
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  if (archived.length === 0) {
    return (
      <div data-ocid="governance.archived.empty_state" className="gov-empty">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h2 className="gov-empty-title">No archived profiles</h2>
        <p className="gov-empty-hint">
          Archived profiles are removed from normal family browsing while their
          relationships, media, and history are preserved.
        </p>
      </div>
    );
  }

  return (
    <div data-ocid="governance.archived.panel" className="flex flex-col gap-4">
      {deleteError ? (
        <div
          data-ocid="governance.archived.delete_error"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-semibold">Could not permanently delete</p>
          <p className="mt-1">
            {deleteError}. A profile can only be permanently deleted when it was
            created in error with no archive items, media, timeline, approved
            relationships, or ownership history.
          </p>
        </div>
      ) : null}

      <ul data-ocid="governance.archived.list" className="flex flex-col gap-2">
        {archived.map((profile, index) => (
          <li
            key={profile.personId}
            data-ocid={`governance.archived.item.${index + 1}`}
            className="archive-row archive-row-archived"
          >
            <div className="archive-row-portrait" aria-hidden="true">
              <Archive className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="archive-row-body">
              <span className="archive-row-name">{profileName(profile)}</span>
              <span className="archive-row-meta">
                {profile.livingStatus} ·{" "}
                {profile.claimStatus === "Claimed" ? "Claimed" : "Unclaimed"}
              </span>
            </div>
            <div className="archive-row-actions">
              <span className="archive-state-badge">Archived</span>
              <button
                type="button"
                data-ocid={`governance.archived.restore_button.${index + 1}`}
                onClick={() => restore.mutate(profile.personId)}
                disabled={restore.isPending}
                className="archive-restore disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw
                  className="h-4 w-4"
                  strokeWidth={2.25}
                  aria-hidden="true"
                />
                {restore.isPending ? "Restoring…" : "Restore"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {confirmingId ? (
        <PermanentDeleteConfirm
          profile={archived.find((p) => p.personId === confirmingId)}
          deleting={permanentlyDelete.isPending}
          onCancel={() => {
            setConfirmingId(null);
            setDeleteError(null);
          }}
          onConfirm={() => handleDelete(confirmingId)}
        />
      ) : null}
    </div>
  );
}

interface PermanentDeleteConfirmProps {
  profile: PersonProfile | undefined;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function PermanentDeleteConfirm({
  profile,
  deleting,
  onCancel,
  onConfirm,
}: PermanentDeleteConfirmProps) {
  if (!profile) return null;
  return (
    <div
      data-ocid="governance.archived.delete_confirm"
      className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
    >
      <h3 className="font-display text-base font-semibold text-foreground">
        Permanently delete {profileName(profile)}?
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground">
        This is permanent and cannot be undone. If this profile has linked
        historical data — archive items, media, timeline, sources, approved
        relationships, or ownership history — it cannot be permanently deleted.
        Relatives are never automatically deleted.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-ocid="governance.archived.delete_confirm_button"
          onClick={onConfirm}
          disabled={deleting}
          className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {deleting ? "Deleting…" : "Confirm permanent delete"}
        </button>
        <button
          type="button"
          data-ocid="governance.archived.delete_cancel_button"
          onClick={onCancel}
          disabled={deleting}
          className="steward-pending-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
