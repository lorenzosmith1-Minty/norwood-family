import type { RecoveryStatus, RecoveryTargetMatch } from "@/backend";
import {
  ArrowLeft,
  Check,
  Clock,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  TreePine,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useActiveFamilyId } from "../context/FamilyContext";
import { useAuth } from "../hooks/useAuth";
import { useSearchRecoveryTargets } from "../hooks/useProfileClaims";
import {
  isOpenRecoveryStatus,
  useMyRecoveryRequests,
  useRequestRecovery,
} from "../hooks/useRecovery";
import { presentRecoveryStatus } from "../hooks/useRecoveryStatus";
import { normalizeName } from "../lib/nameMatch";

/**
 * "Recover my Norwood profile" — the Phase 4B self-service recovery entry
 * point.
 *
 * A signed-in replacement account identifies the existing claimed Norwood
 * Person/Profile it wants access to BY NAME ONLY. There is deliberately no
 * field to nominate an arbitrary third-party account: the signed-in caller is
 * always the replacement account, and the backend derives the current owner
 * from the target profile.
 *
 * The wording is plain and family-facing. It never presents the flow as
 * password recovery and never implies Google/Apple credential recovery — it is
 * about restoring access to a family profile through family approval.
 *
 * Privacy (Phase 4B-H1): discovery uses ONLY the dedicated
 * `searchRecoveryTargetsForFamily` read, which returns just an opaque person id
 * and a display name. The page never reads the local family graph, the shared
 * profiles record, or the generic possible-match search, so an unaffiliated
 * replacement account cannot browse or enumerate the family tree. Match cards
 * show only the display name and a "This is my profile" action — no parents, no
 * "Child of…", no siblings, no relationships, no family-tree context, and no
 * private profile details. The page never shows an account principal, an
 * internal membership id, a recovery id, or a raw enum name.
 *
 * Duplicate prevention: when the caller already has an open request for a
 * person, the page shows that existing request's Pending state instead of a new
 * form. A second submission for the same person is also refused by the backend
 * and mapped to the same neutral "already in progress" state.
 */
export interface RecoveryRequestPageProps {
  /** Returns to the previous view (Home). */
  onBack: () => void;
  /** Opens the caller's own recovery status view. */
  onViewStatus: () => void;
}

type Step = "identify" | "confirm";

/** Initials avatar text from a full name (first two words). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function RecoveryRequestPage({
  onBack,
  onViewStatus,
}: RecoveryRequestPageProps) {
  const { isAuthenticated, isInitializing } = useAuth();
  const familyId = useActiveFamilyId();
  const search = useSearchRecoveryTargets(familyId);
  const request = useRequestRecovery();
  const {
    data: myRequests = [],
    isLoading: myRequestsLoading,
    isError: myRequestsError,
    refetch: refetchMyRequests,
  } = useMyRecoveryRequests();

  const [step, setStep] = useState<Step>("identify");
  const [name, setName] = useState("");
  const [submittedName, setSubmittedName] = useState("");
  const [selected, setSelected] = useState<RecoveryTargetMatch | null>(null);
  // The person id whose request was just created, so the page can show the
  // Pending state for that exact person without re-reading the whole list.
  const [createdPersonId, setCreatedPersonId] = useState<string | null>(null);
  // The status of the request returned by the create mutation, so the Pending
  // state can render immediately from the mutation result instead of waiting for
  // the caller-scoped list to refetch asynchronously.
  const [createdStatus, setCreatedStatus] = useState<RecoveryStatus | null>(
    null,
  );
  const [submitError, setSubmitError] = useState(false);

  const matches = search.data ?? [];

  // The caller's own open requests, keyed by normalized target name, so an
  // existing open request is shown instead of a new form (duplicate
  // prevention). The caller-scoped view carries the target display name rather
  // than a person id, so the name is the only identity available here.
  const openByName = useMemo(() => {
    const map = new Map<string, (typeof myRequests)[number]>();
    for (const req of myRequests) {
      if (isOpenRecoveryStatus(req.status)) {
        map.set(normalizeName(req.targetName), req);
      }
    }
    return map;
  }, [myRequests]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmittedName(trimmed);
    search.mutate(trimmed);
    setStep("confirm");
  };

  const handleChoose = (match: RecoveryTargetMatch) => {
    setSelected(match);
    setSubmitError(false);
    setCreatedPersonId(null);
    setCreatedStatus(null);
  };

  const handleSubmit = () => {
    if (!selected) return;
    const personId = selected.personId;
    setSubmitError(false);
    request.mutate(
      { personId },
      {
        onSuccess: (result) => {
          if (result.kind === "created") {
            // The mutation result carries the just-created request's status, so
            // the Pending state renders immediately without waiting for the
            // caller-scoped list to refetch.
            setCreatedPersonId(personId);
            setCreatedStatus(result.request.status);
            return;
          }
          if (result.kind === "alreadyPending") {
            // A pre-existing open request the backend refused to duplicate.
            // The caller-scoped list already holds it, so the Pending state
            // renders from that list.
            setCreatedPersonId(personId);
            setCreatedStatus(null);
            return;
          }
          setSubmitError(true);
        },
        onError: () => setSubmitError(true),
      },
    );
  };

  const resetToIdentify = () => {
    setStep("identify");
    setSelected(null);
    setSubmitError(false);
    setCreatedPersonId(null);
    setCreatedStatus(null);
  };

  // The person whose Pending state is currently shown: either the request just
  // created, or an existing open request for the selected person.
  const selectedOpenRequest = selected
    ? openByName.get(normalizeName(selected.name))
    : undefined;
  const pendingPersonId =
    createdPersonId ??
    (selectedOpenRequest ? (selected?.personId ?? null) : null);
  // Prefer the mutation result's status while the caller-scoped list is still
  // refetching; fall back to the list entry once it lands.
  const pendingStatus = createdStatus ?? selectedOpenRequest?.status;
  const pendingName = pendingPersonId
    ? selected?.personId === pendingPersonId
      ? selected.name
      : (selectedOpenRequest?.targetName ?? "")
    : "";

  const isSignedIn = isAuthenticated;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <button
        type="button"
        data-ocid="recovery_request.back_button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <header className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <KeyRound
            className="h-3.5 w-3.5 text-accent-foreground"
            aria-hidden="true"
          />
          Recover a profile
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Recover my Norwood profile
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          If you can no longer sign in to a Norwood family profile you already
          claimed, you can ask your family to restore your access. A family
          Steward reviews the request before anything changes.
        </p>
      </header>

      {!isSignedIn ? (
        <section
          data-ocid="recovery_request.signin_required_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-14 text-center"
        >
          <span className="signin-crest">
            <TreePine
              className="h-7 w-7"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Sign in to start a recovery
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {isInitializing
              ? "Checking your sign-in…"
              : "Recovery is started from the account you want to use going forward. Sign in first, then choose the family profile you want to recover."}
          </p>
        </section>
      ) : (
        <>
          <ol
            data-ocid="recovery_request.steps"
            className="flex flex-wrap items-center gap-2 text-xs font-semibold"
          >
            {(["identify", "confirm"] as Step[]).map((s, i) => {
              const active = step === s;
              const done = s === "confirm" && step === "confirm";
              return (
                <li
                  key={s}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                    active
                      ? "border-accent/60 bg-accent/10 text-foreground"
                      : "border-border/60 bg-card/60 text-muted-foreground/70"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {s === "identify" ? "Find the profile" : "Confirm"}
                </li>
              );
            })}
          </ol>

          {step === "identify" ? (
            <section
              data-ocid="recovery_request.identify_step"
              className="rounded-xl border border-border/60 bg-card p-6"
            >
              <form onSubmit={handleSearch} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="recovery-person-name" className="field-label">
                    Whose profile do you want to recover?
                  </label>
                  <input
                    id="recovery-person-name"
                    data-ocid="recovery_request.name_input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Lula Mae Norwood"
                    className="form-input"
                    autoComplete="off"
                  />
                  <p className="text-xs leading-snug text-muted-foreground">
                    Enter the name of the family profile you already claimed.
                    You can only recover a profile for the account you are
                    signed in with.
                  </p>
                </div>
                <button
                  type="submit"
                  data-ocid="recovery_request.search_button"
                  disabled={!name.trim() || search.isPending}
                  className="this-is-me-action"
                >
                  {search.isPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                  {search.isPending ? "Searching…" : "Search the family"}
                </button>
              </form>
            </section>
          ) : (
            <section
              data-ocid="recovery_request.confirm_step"
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold text-foreground">
                  Is this the profile?
                </h2>
                <button
                  type="button"
                  data-ocid="recovery_request.edit_name_button"
                  onClick={resetToIdentify}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Change name
                </button>
              </div>

              {search.isPending ? (
                <div
                  data-ocid="recovery_request.loading_state"
                  className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-14 text-center"
                >
                  <Loader2
                    className="h-6 w-6 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    Searching for “{submittedName}”…
                  </p>
                </div>
              ) : search.isError ? (
                <div
                  data-ocid="recovery_request.search_error_state"
                  className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-14 text-center"
                >
                  <Users
                    className="h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="font-display text-xl font-semibold text-foreground">
                    We couldn’t search right now
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Something went wrong while looking for a matching profile.
                    Please try again.
                  </p>
                  <button
                    type="button"
                    data-ocid="recovery_request.search_retry_button"
                    onClick={() => search.mutate(submittedName)}
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Try again
                  </button>
                </div>
              ) : matches.length > 0 ? (
                <div
                  data-ocid="recovery_request.match_list"
                  className="flex flex-col gap-3"
                >
                  {matches.map((match, index) => {
                    const isSelected = selected?.personId === match.personId;
                    const hasOpen = openByName.has(normalizeName(match.name));
                    return (
                      <div
                        key={match.personId}
                        data-ocid={`recovery_request.match.${index}`}
                        className={`match-card ${
                          isSelected ? "border-accent/60" : ""
                        }`}
                      >
                        <div className="match-card-portrait" aria-hidden="true">
                          {initials(match.name)}
                        </div>
                        <div className="match-card-body">
                          <p className="match-card-name">{match.name}</p>
                        </div>
                        <div className="match-card-actions">
                          {hasOpen ? (
                            <span
                              data-ocid={`recovery_request.match.pending.${index}`}
                              className="claim-badge claim-badge-pending"
                            >
                              <Clock
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Request in progress
                            </span>
                          ) : (
                            <button
                              type="button"
                              data-ocid={`recovery_request.choose.${index}`}
                              onClick={() => handleChoose(match)}
                              className="match-this-is-me"
                            >
                              <Check className="h-4 w-4" aria-hidden="true" />
                              {isSelected ? "Selected" : "This is my profile"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  data-ocid="recovery_request.empty_state"
                  className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-14 text-center"
                >
                  <Users
                    className="h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="font-display text-xl font-semibold text-foreground">
                    No one named “{submittedName}” found
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    We couldn’t find a matching family profile. Check the
                    spelling, or ask a family Steward for help.
                  </p>
                </div>
              )}

              {selected && !selectedOpenRequest && !createdPersonId ? (
                <div className="rounded-xl border border-border/60 bg-card p-6">
                  <div className="flex items-start gap-3">
                    <span className="signin-crest" aria-hidden="true">
                      <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="font-display text-base font-semibold text-foreground">
                        Recover access to {selected.name}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        We’ll send a request to your family. A family Steward
                        reviews it, and once approved you’ll be able to sign in
                        to this profile with the account you’re using now.
                      </p>
                    </div>
                  </div>

                  {submitError ? (
                    <p
                      data-ocid="recovery_request.error_state"
                      className="mt-4 text-sm text-destructive"
                      role="alert"
                    >
                      We couldn’t start your recovery request. Please try again.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    data-ocid="recovery_request.submit_button"
                    onClick={handleSubmit}
                    disabled={request.isPending}
                    className="this-is-me-action mt-4"
                  >
                    {request.isPending ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    )}
                    {request.isPending
                      ? "Sending your request…"
                      : "Ask my family to restore access"}
                  </button>
                </div>
              ) : null}

              {pendingPersonId && pendingStatus !== undefined ? (
                <div
                  data-ocid="recovery_request.pending_state"
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-6"
                >
                  <div className="flex items-center gap-2">
                    <span className="status-pill status-pending">
                      {presentRecoveryStatus(pendingStatus).label}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    Your request for {pendingName} is in progress
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {presentRecoveryStatus(pendingStatus).description}
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    Until it’s approved, this request doesn’t give you family
                    membership, profile ownership, or Steward access.
                  </p>
                  <button
                    type="button"
                    data-ocid="recovery_request.view_status_button"
                    onClick={onViewStatus}
                    className="inline-flex w-fit min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Track my request
                  </button>
                </div>
              ) : null}
            </section>
          )}

          <section
            data-ocid="recovery_request.my_requests_section"
            className="rounded-xl border border-border/60 bg-card p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Your recovery requests
              </h2>
              <button
                type="button"
                data-ocid="recovery_request.status_link"
                onClick={onViewStatus}
                className="text-xs font-semibold text-foreground underline decoration-accent/60 underline-offset-2 transition-colors hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                View all
              </button>
            </div>
            {myRequestsLoading ? (
              <p
                data-ocid="recovery_request.my_requests.loading_state"
                className="mt-3 text-sm text-muted-foreground"
              >
                Loading your requests…
              </p>
            ) : myRequestsError ? (
              <div className="mt-3 flex flex-col gap-2">
                <p
                  data-ocid="recovery_request.my_requests.error_state"
                  className="text-sm text-muted-foreground"
                >
                  We couldn’t load your recovery requests.
                </p>
                <button
                  type="button"
                  data-ocid="recovery_request.my_requests.retry_button"
                  onClick={() => void refetchMyRequests()}
                  className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Retry
                </button>
              </div>
            ) : myRequests.length === 0 ? (
              <p
                data-ocid="recovery_request.my_requests.empty_state"
                className="mt-3 text-sm text-muted-foreground"
              >
                You haven’t started a recovery request yet.
              </p>
            ) : (
              <ul
                data-ocid="recovery_request.my_requests.list"
                className="mt-3 flex flex-col gap-2"
              >
                {myRequests.map((req, index) => {
                  const presentation = presentRecoveryStatus(req.status);
                  return (
                    <li
                      key={`${req.targetName}-${req.createdAt.toString()}`}
                      data-ocid={`recovery_request.my_requests.item.${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3.5 py-2.5"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {req.targetName}
                      </span>
                      <span
                        className={`status-pill ${
                          presentation.tone === "approved"
                            ? "status-approved"
                            : presentation.tone === "rejected"
                              ? "status-rejected"
                              : "status-pending"
                        }`}
                      >
                        {presentation.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
