import type { StewardIdentity } from "@/backend";
import {
  Crown,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  UserX,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  useActivateSuccessor,
  useDesignateSuccessor,
  useListEligibleStewardCandidates,
  useListStewardIdentities,
  useListStewards,
  useListSuccessors,
  usePromoteToSteward,
  useRemoveSteward,
  useSingleStewardWarning,
} from "../../hooks/useGovernance";
import { profiles } from "../../pages/PersonProfilePage";
import { resolveDisplayName } from "../../types/family";
import {
  STEWARD_ROLE_STATUS_LABELS,
  SUCCESSOR_STATUS_LABELS,
  StewardRoleStatus,
  SuccessorStatus,
} from "../../types/governance";

/** Converts a Motoko nanosecond timestamp to a short human date. */
function formatDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Shortens a principal to a readable, copy-safe label. */
function formatPrincipal(principal: { toText(): string }): string {
  const text = principal.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/** Resolves a person's display name from the shared profiles record. */
function personName(personId: string): string {
  return resolveDisplayName(personId, profiles);
}

/**
 * Resolves the family-facing display name for a steward identity. Priority:
 *   1. The preferred/display name (e.g. "Waxx Minty").
 *   2. The canonical full person name.
 *   3. An abbreviated account id, only as a last-resort administrative
 *      fallback. The raw account id is never shown as the primary name.
 */
function stewardDisplayName(identity: StewardIdentity): string {
  if (identity.displayName?.trim()) return identity.displayName.trim();
  if (identity.canonicalName?.trim()) return identity.canonicalName.trim();
  return formatPrincipal(identity.accountId);
}

export function StewardManagementTab() {
  const { data: stewards = [], isLoading: stewardsLoading } = useListStewards();
  const { data: successors = [], isLoading: successorsLoading } =
    useListSuccessors();
  const { data: warning } = useSingleStewardWarning();
  const { data: stewardIdentities = [] } = useListStewardIdentities();
  const { data: eligibleCandidates = [], isLoading: candidatesLoading } =
    useListEligibleStewardCandidates();

  const promote = usePromoteToSteward();
  const remove = useRemoveSteward();
  const designate = useDesignateSuccessor();
  const activate = useActivateSuccessor();

  const [promotePersonId, setPromotePersonId] = useState("");
  const [successorPersonId, setSuccessorPersonId] = useState("");
  const [priority, setPriority] = useState("1");

  const isLoading = stewardsLoading || successorsLoading;

  // Map each steward's account id to its enriched Person identity so the card
  // can render the family-facing name instead of the raw account id.
  const identityByAccount = new Map(
    stewardIdentities.map((identity) => [
      identity.accountId.toText(),
      identity,
    ]),
  );

  // Map each person id to its enriched Person identity so the successor list
  // can render the linked Person's preferred/display name (e.g. "Waxx Minty")
  // instead of the static canonical name.
  const identityByPersonId = new Map(
    stewardIdentities.map((identity) => [identity.personId, identity]),
  );

  // Living, claimed, account-linked, non-archived, non-active-steward members
  // eligible to be promoted or designated as successors (data-driven).
  const eligibleMembers = eligibleCandidates;

  const activeStewards = stewards.filter(
    (s) => s.roleStatus === StewardRoleStatus.Active,
  );
  const isLastSteward = activeStewards.length <= 1;

  const handlePromote = () => {
    if (!promotePersonId) return;
    promote.mutate(promotePersonId, {
      onSuccess: () => setPromotePersonId(""),
    });
  };

  const handleDesignate = () => {
    if (!successorPersonId) return;
    const parsed = Number(priority);
    const priorityValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    designate.mutate(
      { personId: successorPersonId, priority: BigInt(priorityValue) },
      {
        onSuccess: () => {
          setSuccessorPersonId("");
          setPriority("1");
        },
      },
    );
  };

  return (
    <div data-ocid="governance.stewards.panel" className="flex flex-col gap-4">
      {warning ? (
        <div
          data-ocid="governance.stewards.single_warning"
          className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
        >
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="text-sm leading-snug text-foreground">
            <p className="font-semibold">Only one steward remains</p>
            <p className="mt-1 text-muted-foreground">{warning}</p>
          </div>
        </div>
      ) : null}

      <section
        data-ocid="governance.stewards.list_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">
            Current Stewards ({activeStewards.length})
          </h2>
        </div>
        {isLoading ? (
          <div className="space-y-2" aria-label="Loading stewards">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        ) : activeStewards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active stewards yet. Promote an approved claimed member below.
          </p>
        ) : (
          <ul data-ocid="governance.stewards.list" className="steward-list">
            {activeStewards.map((steward, index) => {
              const identity = identityByAccount.get(
                steward.stewardAccountId.toText(),
              );
              const displayName = identity
                ? stewardDisplayName(identity)
                : formatPrincipal(steward.stewardAccountId);
              return (
                <li
                  key={steward.stewardAccountId.toText()}
                  data-ocid={`governance.stewards.item.${index + 1}`}
                  className="steward-row"
                >
                  <div className="steward-row-portrait" aria-hidden="true">
                    <Crown className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="steward-row-body">
                    <span className="steward-row-name">{displayName}</span>
                    <span className="steward-row-role">
                      {STEWARD_ROLE_STATUS_LABELS[steward.roleStatus]} · steward
                      since {formatDate(steward.assignedAt)}
                    </span>
                  </div>
                  <div className="steward-row-actions">
                    <span className="steward-role-badge">
                      {STEWARD_ROLE_STATUS_LABELS[steward.roleStatus]}
                    </span>
                    <button
                      type="button"
                      data-ocid={`governance.stewards.remove_button.${index + 1}`}
                      onClick={() => remove.mutate(steward.stewardAccountId)}
                      disabled={isLastSteward || remove.isPending}
                      title={
                        isLastSteward
                          ? "The last steward cannot be removed"
                          : "Remove steward role"
                      }
                      className="steward-reject disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserX
                        className="h-4 w-4"
                        strokeWidth={2.25}
                        aria-hidden="true"
                      />
                      {remove.isPending ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        data-ocid="governance.stewards.promote_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">Promote a Family Member</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Promote an approved, claimed family member to the Family Steward role.
        </p>
        {candidatesLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading eligible members…
          </p>
        ) : eligibleMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No eligible family members are available to promote yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              data-ocid="governance.stewards.promote_select"
              value={promotePersonId}
              onChange={(e) => setPromotePersonId(e.target.value)}
              className="form-select flex-1"
            >
              <option value="">Select a family member…</option>
              {eligibleMembers.map((candidate) => (
                <option key={candidate.personId} value={candidate.personId}>
                  {stewardDisplayName(candidate)}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-ocid="governance.stewards.promote_button"
              onClick={handlePromote}
              disabled={!promotePersonId || promote.isPending}
              className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus
                className="h-4 w-4"
                strokeWidth={2.25}
                aria-hidden="true"
              />
              {promote.isPending ? "Promoting…" : "Promote"}
            </button>
          </div>
        )}
      </section>

      <section
        data-ocid="governance.stewards.successor_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">Successor Stewards</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Designate approved claimed members as successors. A successor is a
          designation only — they become an active steward only when a current
          steward explicitly activates them.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            data-ocid="governance.stewards.successor_select"
            value={successorPersonId}
            onChange={(e) => setSuccessorPersonId(e.target.value)}
            className="form-select flex-1"
          >
            <option value="">Select a family member…</option>
            {eligibleMembers.map((candidate) => (
              <option key={candidate.personId} value={candidate.personId}>
                {stewardDisplayName(candidate)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Priority
            <input
              data-ocid="governance.stewards.priority_input"
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="form-input w-20"
            />
          </label>
          <button
            type="button"
            data-ocid="governance.stewards.designate_button"
            onClick={handleDesignate}
            disabled={!successorPersonId || designate.isPending}
            className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Crown className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            {designate.isPending ? "Designating…" : "Designate"}
          </button>
        </div>

        {successorsLoading ? (
          <p className="text-sm text-muted-foreground">Loading successors…</p>
        ) : successors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No successors designated yet.
          </p>
        ) : (
          <ul
            data-ocid="governance.stewards.successor_list"
            className="steward-list"
          >
            {successors
              .slice()
              .sort((a, b) => Number(a.priority - b.priority))
              .map((successor, index) => {
                const identity = identityByPersonId.get(successor.personId);
                const displayName = identity
                  ? stewardDisplayName(identity)
                  : personName(successor.personId);
                return (
                  <li
                    key={successor.personId}
                    data-ocid={`governance.stewards.successor_item.${index + 1}`}
                    className="steward-row"
                  >
                    <div className="steward-row-portrait" aria-hidden="true">
                      <Zap className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <div className="steward-row-body">
                      <span className="steward-row-name">{displayName}</span>
                      <span className="steward-row-role">
                        Priority {successor.priority.toString()} ·{" "}
                        {SUCCESSOR_STATUS_LABELS[successor.status]} · designated{" "}
                        {formatDate(successor.assignedAt)}
                      </span>
                    </div>
                    <div className="steward-row-actions">
                      <span
                        className={`steward-role-badge ${
                          successor.status === SuccessorStatus.Designated
                            ? "is-successor"
                            : ""
                        }`}
                      >
                        {SUCCESSOR_STATUS_LABELS[successor.status]}
                      </span>
                      {successor.status === SuccessorStatus.Designated ? (
                        <button
                          type="button"
                          data-ocid={`governance.stewards.activate_button.${index + 1}`}
                          onClick={() => activate.mutate(successor.personId)}
                          disabled={activate.isPending}
                          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ShieldCheck
                            className="h-4 w-4"
                            strokeWidth={2.25}
                            aria-hidden="true"
                          />
                          {activate.isPending ? "Activating…" : "Activate"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
