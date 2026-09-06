import { RelationshipType } from "@/backend";
import {
  ArrowLeft,
  Check,
  Loader2,
  PartyPopper,
  Search,
  ShieldCheck,
  TreePine,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppleLogo, GoogleLogo } from "../components/LoginSurface";
import { useAuth } from "../hooks/useAuth";
import {
  useCreateMyself,
  useSearchPossibleMatches,
} from "../hooks/useProfileClaims";
import { useProposeRelationship } from "../hooks/useRelationshipRequests";
import { namesMatch } from "../lib/nameMatch";
import { saveOriginatingView } from "../lib/originatingView";
import { FAMILY_GRAPH, resolveDisplayName } from "../types/family";
import type { PersonMatch } from "../types/ownership";
import { RELATIONSHIP_TYPE_LABELS } from "../types/ownership";
import { profiles } from "./PersonProfilePage";

/**
 * The "Add Myself to This Family" flow. Step 1 asks for the person's name and
 * searches existing family data for possible matches (backend search plus a
 * local search of the shared profiles record / family graph). Step 2 shows the
 * possible matches with the person's name and parents when known, each offering
 * "This is Me" (routes to the existing profile claim flow) or "None of these
 * are me". Step 3, when no match exists, lets the user choose an existing
 * family member and how they relate to them.
 *
 * No authentication is required up front: name search, possible matches,
 * choosing the connecting family member, and choosing the relationship all
 * happen before sign-in. Authentication is only required at final submission —
 * the user is offered "Continue with Google" and "Continue with Apple" to
 * "Save your place in the family". After a successful sign-in the flow returns
 * to the exact state with all entered information preserved, then creates the
 * profile and the pending relationship request automatically (the user does
 * not restart). The new profile is never inserted into the shared graph until
 * confirmed, so it is never isolated.
 *
 * Data-driven: matches and the connection picker come from the shared
 * FAMILY_GRAPH and profiles record, never hardcoded family members.
 */
export interface AddMyselfPageProps {
  /** Returns to the previous view (Home). */
  onBack: () => void;
  /** Routes to the existing profile claim flow for a matched person. */
  onOpenProfile: (personId: string) => void;
}

type Step = "name" | "matches" | "connect";

/**
 * sessionStorage key for the Add Myself flow. The entered state is persisted
 * so a full-page auth redirect (Google / Apple one-click sign-in) returns the
 * user to the exact Add Myself state with all entered information preserved —
 * they never restart the flow.
 */
const ADD_MYSELF_STORAGE_KEY = "addMyself.draft.v1";

/** The user-entered Add Myself state that survives a full-page auth redirect. */
interface AddMyselfDraft {
  step: Step;
  name: string;
  submittedName: string;
  selectedPersonId: string | null;
  relationshipType: RelationshipType | null;
  /** Pending-submit flag that triggers the auto-submit effect after sign-in. */
  submissionAttempt: number;
}

/** Read the persisted draft, tolerating missing/corrupt sessionStorage data. */
function loadDraft(): AddMyselfDraft | null {
  try {
    const raw = sessionStorage.getItem(ADD_MYSELF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AddMyselfDraft>;
    if (
      typeof parsed.step !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.submittedName !== "string"
    ) {
      return null;
    }
    return {
      step: parsed.step as Step,
      name: parsed.name,
      submittedName: parsed.submittedName,
      selectedPersonId:
        typeof parsed.selectedPersonId === "string"
          ? parsed.selectedPersonId
          : null,
      relationshipType:
        parsed.relationshipType != null
          ? (parsed.relationshipType as RelationshipType)
          : null,
      submissionAttempt:
        typeof parsed.submissionAttempt === "number"
          ? parsed.submissionAttempt
          : 0,
    };
  } catch {
    return null;
  }
}

const RELATIONSHIP_OPTIONS: RelationshipType[] = [
  RelationshipType.Parent,
  RelationshipType.Child,
  RelationshipType.Sibling,
  RelationshipType.SpousePartner,
];

/** Initials avatar text from a full name (first two words). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

/**
 * Resolve a person's display name from the shared profiles record or the graph
 * id. Uses the shared resolveDisplayName resolver so graph-only nodes (e.g.
 * the canonical lorenzoSmithJr) render their canonical display name with exact
 * capitalization and spacing instead of leaking the raw id.
 */
function personDisplayName(id: string): string {
  return resolveDisplayName(id, profiles);
}

/**
 * Build local name matches from the authoritative shared family graph. Every
 * node in FAMILY_GRAPH is searched (including graph-only nodes with no profile
 * record, such as Lorenzo Smith Jr.), using the shared nameMatch utility for
 * normalized, fuzzy matching. Parents are resolved from the graph's father /
 * mother edges and shown when known.
 */
function buildLocalMatches(name: string): PersonMatch[] {
  const query = name.trim();
  if (!query) return [];
  const matches: PersonMatch[] = [];
  for (const node of Object.values(FAMILY_GRAPH)) {
    const displayName = personDisplayName(node.id);
    if (!namesMatch(displayName, query)) continue;
    const parents: string[] = [];
    for (const parentId of [node.father, node.mother]) {
      if (parentId) {
        parents.push(personDisplayName(parentId));
      }
    }
    matches.push({ name: displayName, personId: node.id, parents });
  }
  return matches;
}

/**
 * Merge backend matches with local matches, de-duplicated by person id.
 *
 * Local matches (derived from the authoritative shared FAMILY_GRAPH) take
 * precedence over backend matches. This guarantees that a canonical graph
 * record such as "lorenzoSmithJr" is always surfaced first and never shadowed
 * by a principal-keyed duplicate profile the backend may have tracked from a
 * prior createMyself call — so "This is Me" always opens/claims the canonical
 * record, never a duplicate.
 */
function mergeMatches(
  local: PersonMatch[],
  backend: PersonMatch[],
): PersonMatch[] {
  const seen = new Set<string>();
  const merged: PersonMatch[] = [];
  for (const match of [...local, ...backend]) {
    if (seen.has(match.personId)) continue;
    seen.add(match.personId);
    merged.push(match);
  }
  return merged;
}

export function AddMyselfPage({ onBack, onOpenProfile }: AddMyselfPageProps) {
  const {
    isAuthenticated,
    isLoggingIn,
    isLoginError,
    loginError,
    signInWithGoogle,
    signInWithApple,
  } = useAuth();
  const [step, setStep] = useState<Step>(() => loadDraft()?.step ?? "name");
  const [name, setName] = useState(() => loadDraft()?.name ?? "");
  const [submittedName, setSubmittedName] = useState(
    () => loadDraft()?.submittedName ?? "",
  );
  const [createdPersonId, setCreatedPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(
    () => loadDraft()?.selectedPersonId ?? null,
  );
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType | null>(
      () => loadDraft()?.relationshipType ?? null,
    );
  const [showSignIn, setShowSignIn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionAttempt, setSubmissionAttempt] = useState(
    () => loadDraft()?.submissionAttempt ?? 0,
  );
  const [activeProvider, setActiveProvider] = useState<
    "google" | "apple" | null
  >(null);

  // Ref guards that ensure the auto-submit effect fires each backend call
  // exactly once per submission attempt. The react-query mutation objects
  // (create/propose) change identity when their internal state changes, so
  // they must NOT be listed in the effect's dependency array — doing so makes
  // the effect re-run and re-submit. These refs gate each phase instead.
  const createInitiatedRef = useRef(false);
  const proposeInitiatedRef = useRef(false);

  // Persist the entered Add Myself state to sessionStorage on every change so
  // a full-page auth redirect (Google / Apple one-click sign-in) restores the
  // exact flow with all entered information preserved. The pending-submit
  // submissionAttempt flag is persisted too so the auto-submit effect fires
  // after the redirect remount. Only user-entered state is persisted —
  // transient UI state (sign-in panel, submission progress, backend-created
  // person id) is intentionally excluded.
  useEffect(() => {
    const draft: AddMyselfDraft = {
      step,
      name,
      submittedName,
      selectedPersonId,
      relationshipType,
      submissionAttempt,
    };
    try {
      sessionStorage.setItem(ADD_MYSELF_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage may be unavailable (e.g. private mode); the flow still
      // works, it just won't survive a full-page redirect.
    }
  }, [
    step,
    name,
    submittedName,
    selectedPersonId,
    relationshipType,
    submissionAttempt,
  ]);

  // Clear the persisted draft once the flow completes successfully so a later
  // visit starts fresh.
  useEffect(() => {
    if (submitted) {
      try {
        sessionStorage.removeItem(ADD_MYSELF_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
    }
  }, [submitted]);

  const search = useSearchPossibleMatches();
  const create = useCreateMyself();
  const propose = useProposeRelationship();

  const matches = useMemo(
    () => mergeMatches(buildLocalMatches(submittedName), search.data ?? []),
    [submittedName, search.data],
  );

  const existingPeople = useMemo(
    () => Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const selectedPerson = selectedPersonId
    ? profiles[selectedPersonId]
    : undefined;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmittedName(trimmed);
    search.mutate(trimmed);
    setStep("matches");
  };

  // "None of these are me" / "Create my profile" move straight to the connect
  // step. The profile is NOT created here — creation is deferred to final
  // submission, after authentication, so no auth is required up front.
  const handleNoMatch = () => {
    setStep("connect");
  };

  // Final submission. If the user is not authenticated, show the sign-in panel
  // (Google / Apple) instead of submitting. All entered state is preserved.
  const handleFinalSubmit = () => {
    if (!relationshipType || !selectedPersonId) return;
    // A new submission attempt resets the phase guards so the auto-submit
    // effect can run create + propose again (e.g. after a failed attempt).
    createInitiatedRef.current = false;
    proposeInitiatedRef.current = false;
    setSubmissionAttempt((n) => n + 1);
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
  };

  // After authentication completes (or when an already-authenticated user
  // submits), create the profile if needed, then submit the pending
  // relationship request automatically — the user does not restart the flow.
  // The mutation objects (create/propose) are included in the dependency array
  // to satisfy exhaustive-deps; their identity may change when internal state
  // changes, but the ref guards gate each phase so createMyself and
  // proposeRelationship each fire exactly once per submission attempt.
  useEffect(() => {
    if (
      step !== "connect" ||
      !isAuthenticated ||
      submitted ||
      submissionAttempt === 0
    ) {
      return;
    }
    if (!relationshipType || !selectedPersonId) return;
    setShowSignIn(false);
    if (!createdPersonId) {
      if (createInitiatedRef.current) return;
      createInitiatedRef.current = true;
      create.mutate(submittedName, {
        onSuccess: (result) => {
          if (result.__kind__ === "ok") {
            setCreatedPersonId(result.ok.personId);
          }
        },
      });
    } else {
      if (proposeInitiatedRef.current) return;
      proposeInitiatedRef.current = true;
      propose.mutate(
        {
          fromPersonId: createdPersonId,
          toPersonId: selectedPersonId,
          relationshipType,
        },
        { onSuccess: () => setSubmitted(true) },
      );
    }
  }, [
    step,
    isAuthenticated,
    createdPersonId,
    relationshipType,
    selectedPersonId,
    submitted,
    submissionAttempt,
    submittedName,
    create.mutate,
    propose.mutate,
  ]);

  const handleGoogle = () => {
    setActiveProvider("google");
    saveOriginatingView({ view: "add-myself" });
    signInWithGoogle();
  };

  const handleApple = () => {
    setActiveProvider("apple");
    saveOriginatingView({ view: "add-myself" });
    signInWithApple();
  };

  const googlePending = isLoggingIn && activeProvider === "google";
  const applePending = isLoggingIn && activeProvider === "apple";
  const submitting = create.isPending || propose.isPending;

  const createdProfile = createdPersonId
    ? profiles[createdPersonId]
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <button
        type="button"
        data-ocid="add_myself.back_button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Add Myself to This Family
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Find yourself in the family tree, or add a new profile and connect it
          to an existing family member. New connections start as pending
          requests until a Family Steward confirms them.
        </p>
      </header>

      <ol
        data-ocid="add_myself.steps"
        className="flex flex-wrap items-center gap-2 text-xs font-semibold"
      >
        {(["name", "matches", "connect"] as Step[]).map((s, i) => {
          const active = step === s;
          const done =
            (s === "matches" && step !== "name") ||
            (s === "connect" && step === "connect");
          return (
            <li
              key={s}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                active
                  ? "border-accent/60 bg-accent/10 text-foreground"
                  : done
                    ? "border-border bg-card text-muted-foreground"
                    : "border-border/60 bg-card/60 text-muted-foreground/70"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : done
                      ? "bg-success/20 text-success"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              {s === "name"
                ? "Your name"
                : s === "matches"
                  ? "Possible matches"
                  : "Connect"}
            </li>
          );
        })}
      </ol>

      {step === "name" ? (
        <section
          data-ocid="add_myself.name_step"
          className="rounded-xl border border-border/60 bg-card p-6"
        >
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="add-myself-name" className="field-label">
                Your name
              </label>
              <input
                id="add-myself-name"
                data-ocid="add_myself.name_input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan Norwood"
                className="form-input"
                autoComplete="name"
              />
            </div>
            <button
              type="submit"
              data-ocid="add_myself.search_button"
              disabled={!name.trim() || search.isPending}
              className="this-is-me-action"
            >
              {search.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              {search.isPending ? "Searching…" : "Search the family"}
            </button>
          </form>
        </section>
      ) : null}

      {step === "matches" ? (
        <section
          data-ocid="add_myself.matches_step"
          className="flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Possible matches
            </h2>
            <button
              type="button"
              data-ocid="add_myself.edit_name_button"
              onClick={() => setStep("name")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Change name
            </button>
          </div>

          {search.isPending ? (
            <div
              data-ocid="add_myself.loading_state"
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-14 text-center"
            >
              <Loader2
                className="h-6 w-6 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                Searching the family tree for “{submittedName}”…
              </p>
            </div>
          ) : matches.length > 0 ? (
            <div
              data-ocid="add_myself.match_list"
              className="flex flex-col gap-3"
            >
              {matches.map((match, index) => (
                <div
                  key={match.personId}
                  data-ocid={`add_myself.match.${index}`}
                  className="match-card"
                >
                  <div className="match-card-portrait" aria-hidden="true">
                    {initials(match.name)}
                  </div>
                  <div className="match-card-body">
                    <p className="match-card-name">{match.name}</p>
                    <p className="match-card-parents">
                      {match.parents.length > 0
                        ? `Child of ${match.parents.join(" and ")}`
                        : "No parents recorded"}
                    </p>
                  </div>
                  <div className="match-card-actions">
                    <button
                      type="button"
                      data-ocid={`add_myself.this_is_me.${index}`}
                      onClick={() => onOpenProfile(match.personId)}
                      className="match-this-is-me"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      This is Me
                    </button>
                    <button
                      type="button"
                      data-ocid={`add_myself.none_of_these.${index}`}
                      onClick={handleNoMatch}
                      className="match-none"
                    >
                      None of these are me
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              data-ocid="add_myself.empty_state"
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
                We couldn’t find a matching profile in the family tree. You can
                create a new profile and connect it to an existing family
                member.
              </p>
              <button
                type="button"
                data-ocid="add_myself.create_button"
                onClick={handleNoMatch}
                className="this-is-me-action"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Create my profile
              </button>
            </div>
          )}
        </section>
      ) : null}

      {step === "connect" ? (
        <section
          data-ocid="add_myself.connect_step"
          className="flex flex-col gap-5"
        >
          <div className="rounded-xl border border-border/60 bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="match-card-portrait" aria-hidden="true">
                {initials(submittedName)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="match-card-name">
                  {createdProfile?.name ?? submittedName}
                </p>
                <p className="match-card-parents">
                  New profile — not yet part of the family tree.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-6">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Who connects you to this family?
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Choose an existing family member and how you relate to them. The
              connection is proposed as a pending request and only joins the
              shared family tree once a Family Steward confirms it.
            </p>

            <div
              data-ocid="add_myself.person_picker"
              className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-border/60"
            >
              <ul className="flex flex-col">
                {existingPeople.map((person, index) => {
                  const isSelected = selectedPersonId === person.id;
                  return (
                    <li
                      key={person.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <button
                        type="button"
                        data-ocid={`add_myself.person.${index}`}
                        onClick={() => setSelectedPersonId(person.id)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                          isSelected ? "bg-accent/10" : "hover:bg-muted"
                        }`}
                      >
                        <span
                          className="match-card-portrait !h-9 !w-9 !text-xs"
                          aria-hidden="true"
                        >
                          {initials(person.name)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {person.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {person.role}
                          </span>
                        </span>
                        {isSelected ? (
                          <Check
                            className="h-4 w-4 shrink-0 text-accent-foreground"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {selectedPersonId ? (
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                How are you related?
              </h3>
              <fieldset className="relation-picker">
                <legend className="sr-only">Relationship type</legend>
                {RELATIONSHIP_OPTIONS.map((type) => {
                  const isSelected = relationshipType === type;
                  return (
                    <label
                      key={type}
                      className={`relation-option ${
                        isSelected ? "relation-option-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="add-myself-relationship"
                        value={type}
                        checked={isSelected}
                        onChange={() => setRelationshipType(type)}
                        data-ocid={`add_myself.relationship.${type}`}
                        className="sr-only"
                      />
                      {RELATIONSHIP_TYPE_LABELS[type]}
                    </label>
                  );
                })}
              </fieldset>
            </div>
          ) : null}

          {selectedPersonId && relationshipType ? (
            submitted ? (
              <div
                data-ocid="add_myself.success_state"
                className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-card px-6 py-12 text-center"
              >
                <span className="signin-crest">
                  <PartyPopper
                    className="h-7 w-7"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <h2 className="font-display text-xl font-semibold text-foreground">
                  Your place in the family is saved
                </h2>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Your Norwood profile and connection to{" "}
                  {selectedPerson?.name ?? "your family member"} have been sent
                  for confirmation. A Family Steward will review it before it
                  joins the family tree.
                </p>
              </div>
            ) : showSignIn ? (
              <div className="signin-panel" data-ocid="add_myself.signin_panel">
                <div className="signin-head">
                  <span className="signin-crest">
                    <TreePine
                      className="h-7 w-7"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                  <h2 className="signin-title">
                    Save your place in the family
                  </h2>
                  <p className="signin-subtitle">
                    Sign in securely to create your Norwood profile and send
                    this family connection for confirmation.
                  </p>
                </div>

                <div className="signin-stack">
                  <button
                    type="button"
                    data-ocid="add_myself.signin_google_button"
                    onClick={handleGoogle}
                    disabled={isLoggingIn}
                    className="signin-btn signin-google"
                  >
                    <span className="signin-logo">
                      {googlePending ? (
                        <Loader2
                          className="h-5 w-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <GoogleLogo />
                      )}
                    </span>
                    {googlePending ? "Signing in…" : "Continue with Google"}
                  </button>

                  <div className="signin-divider" aria-hidden="true">
                    or
                  </div>

                  <button
                    type="button"
                    data-ocid="add_myself.signin_apple_button"
                    onClick={handleApple}
                    disabled={isLoggingIn}
                    className="signin-btn signin-apple"
                  >
                    <span className="signin-logo">
                      {applePending ? (
                        <Loader2
                          className="h-5 w-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <AppleLogo />
                      )}
                    </span>
                    {applePending ? "Signing in…" : "Continue with Apple"}
                  </button>
                </div>

                {isLoginError ? (
                  <p
                    className="signin-footnote"
                    data-ocid="add_myself.signin_error_state"
                    role="alert"
                  >
                    We couldn’t sign you in
                    {loginError ? ` (${loginError.message})` : ""}. Please try
                    again.
                  </p>
                ) : (
                  <p className="signin-footnote">
                    Your account is private and secure. We never post to your
                    Google or Apple account, and your identity stays yours.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  data-ocid="add_myself.save_button"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="this-is-me-action"
                >
                  {submitting ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {create.isPending
                    ? "Creating your profile…"
                    : propose.isPending
                      ? "Sending for confirmation…"
                      : "Save your place in the family"}
                </button>

                {create.isError || propose.isError ? (
                  <p
                    data-ocid="add_myself.error_state"
                    className="text-sm text-destructive"
                  >
                    Could not save your place in the family. Please try again.
                  </p>
                ) : null}
              </div>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
