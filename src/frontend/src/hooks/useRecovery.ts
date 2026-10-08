import {
  type MyRecoveryRequestView,
  type RecoveryAuditView,
  type RecoveryError,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
  RecoveryVerificationDecision,
  type StewardRecoveryVerificationView,
  createActor,
} from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import { Principal } from "@icp-sdk/core/principal";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "./useAuth";

/**
 * React Query hooks for the Phase 4B recovery surface, following the existing
 * useActor(createActor) + useQuery/useMutation pattern used by
 * useMembershipReviews / useMembershipConfirmation / useStewardAuthority.
 *
 * The reads are family-scoped: the active family id is read from the
 * centralized FamilyContext and always passed to the backend (default family
 * included), and `familyScopedId ?? ""` occupies query-key index 1 so the
 * family-exact `recoveryInvalidation` predicate covers every recovery cache. A
 * Family A recovery request therefore never appears in Family B's cache.
 *
 * The backend endpoints are the security boundary: `listRecoveryRequestsForFamily`
 * is Steward-only, and `requestRecoveryForFamily` requires the caller to be the
 * replacement account. These hooks only shape the data for the UI and never
 * widen access.
 *
 * Privacy: the raw `RecoveryRequest` carries account principals and internal
 * ids. Those fields are never rendered — the UI consumes the family-safe
 * projections in `useRecoveryStatus` (plain-language status, person display
 * name) and the Steward queue below, which drops every account principal.
 */

/** The recovery cache key prefix. */
const RECOVERY_KEY = "recovery";

/**
 * The caller's own recovery requests in the active family, newest first.
 *
 * Phase 4B-H1: the backend now exposes a caller-scoped read,
 * `listMyRecoveryRequestsForFamily`, which returns only the requests where the
 * signed-in caller is the requester/replacement account, projected to the
 * minimum caller-facing view (`MyRecoveryRequestView`: target display name,
 * status, timestamps). It is the authoritative source of truth, so status
 * survives a page reload, a fresh browser session, signing in again, or another
 * device with the same replacement account. There is no client-side request-id
 * registry.
 *
 * React Query caching is retained for responsiveness, but the backend remains
 * authoritative. A failed read rejects the query so the page can render a
 * neutral error state with a Retry action; the error tag itself is never
 * surfaced to the user.
 */
export function useMyRecoveryRequests() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { accountId } = useAuth();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [RECOVERY_KEY, familyScopedId ?? "", "mine", accountId ?? ""],
    queryFn: async (): Promise<MyRecoveryRequestView[]> => {
      if (!actor || !accountId) return [];
      const result = await actor.listMyRecoveryRequestsForFamily(familyId);
      if (result.__kind__ === "err") {
        throw new Error("Recovery requests are unavailable");
      }
      return [...result.ok].sort((a, b) => Number(b.createdAt - a.createdAt));
    },
    enabled: !!actor && !isFetching && !!accountId,
  });
}

/**
 * The ordinary Account Recovery requests awaiting a Steward decision in the
 * active family. Steward-gated by the backend; a non-Steward read rejects and
 * the page renders a neutral error state.
 *
 * Only `#AccountRecovery` requests are returned: the Steward decision surface
 * handles exactly the ordinary recovery path. `#StewardRecovery` (the 2-member
 * quorum path) is out of scope for this surface and is filtered out here.
 *
 * A request is "awaiting decision" while it is open — `#Pending`,
 * `#AwaitingVerification`, or `#ReadyForApproval`. Resolved requests
 * (`#Approved`, `#Rejected`, `#Cancelled`, `#Expired`) are excluded so the
 * queue only ever shows work that still needs a Steward.
 */
export function useRecoveryRequestsForSteward() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [RECOVERY_KEY, familyScopedId ?? "", "stewardQueue"],
    queryFn: async (): Promise<RecoveryRequest[]> => {
      if (!actor) return [];
      const result = await actor.listRecoveryRequestsForFamily(familyId);
      if (result.__kind__ === "err") {
        throw new Error("Recovery requests are unavailable");
      }
      return result.ok
        .filter(
          (request) =>
            request.recoveryType === RecoveryType.AccountRecovery &&
            isOpenRecoveryStatus(request.status),
        )
        .sort((a, b) => Number(b.createdAt - a.createdAt));
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The number of ordinary Account Recovery requests awaiting a Steward decision
 * in the active family. Derived from the canonical Steward queue so the hub
 * badge and the review page always agree; zero when the queue is empty or still
 * loading.
 */
export function useRecoveryRequestCount(): number {
  const { data: requests = [] } = useRecoveryRequestsForSteward();
  return requests.length;
}

/**
 * The Steward Recovery verification surface for the active family: the
 * family-safe `StewardRecoveryVerificationView` entries the backend returns for
 * the signed-in caller.
 *
 * The backend is the authorization boundary: `listStewardRecoveryVerificationsForFamily`
 * already excludes the recovery candidate and every non-approved caller, and it
 * returns already-verified entries too (`callerHasVerified` true with
 * `callerDecision` set). The frontend therefore renders exactly what the
 * backend returns and never widens access — the UI gating in the card is an
 * additional guard only.
 *
 * The view carries only family-safe fields (candidate display name, status,
 * quorum counts, the caller's own decision) plus the internal `recoveryId` the
 * verify action needs. It never carries an account principal or a membership
 * id, and `recoveryId` is passed straight to the action and never rendered, so
 * nothing private can leak through this hook.
 */
export function useStewardRecoveryVerifications() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [RECOVERY_KEY, familyScopedId ?? "", "stewardVerifications"],
    queryFn: async (): Promise<StewardRecoveryVerificationView[]> => {
      if (!actor) return [];
      const result =
        await actor.listStewardRecoveryVerificationsForFamily(familyId);
      if (result.__kind__ === "err") {
        throw new Error("Recovery verifications are unavailable");
      }
      return result.ok;
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The authorized recovery audit history for one request in the active family,
 * newest first.
 *
 * Phase 4D: `listAuthorizedRecoveryAuditForFamily` is the minimum authorized
 * audit read. The backend allows it for the same parties that may view the
 * request itself (an active Steward of the family, the requester, the current
 * owner, or the replacement account) and returns only family-safe fields
 * (`actionLabel`, `actorDisplayLabel`, `affectedDisplayNames`, `timestamp`) —
 * never the internal audit id, the recovery request id, the family id, an
 * account principal, or the free-text summary. The hook therefore shapes the
 * data for the UI and never widens access.
 *
 * The read is keyed by the internal `recoveryId`, which is passed straight to
 * the backend and never rendered. A failed read rejects the query so the surface
 * can render a neutral error state with a Retry action; the error tag itself is
 * never surfaced to the user.
 */
export function useAuthorizedRecoveryAudit(recoveryId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      RECOVERY_KEY,
      familyScopedId ?? "",
      "audit",
      recoveryId?.toString() ?? "",
    ],
    queryFn: async (): Promise<RecoveryAuditView[]> => {
      if (!actor || recoveryId === null) return [];
      const result = await actor.listAuthorizedRecoveryAuditForFamily(
        familyId,
        recoveryId,
      );
      if (result.__kind__ === "err") {
        throw new Error("Recovery history is unavailable");
      }
      return [...result.ok].sort((a, b) => Number(b.timestamp - a.timestamp));
    },
    enabled: !!actor && !isFetching && recoveryId !== null,
  });
}

/**
 * The result of a Steward Recovery verification action, normalized for the UI.
 * `confirmed` / `disputed` carry the backend's updated request so the surface
 * can reflect backend state; `alreadySettled` is the neutral "this request
 * changed before you acted" state; `error` is the neutral failure state.
 */
export type RecoveryVerificationOutcome =
  | { kind: "confirmed"; request: RecoveryRequest }
  | { kind: "disputed"; request: RecoveryRequest }
  | { kind: "alreadySettled" }
  | { kind: "error" };

/**
 * Records the caller's Steward Recovery verification decision for a request in
 * the active family. Both the Confirm and Dispute actions call this single
 * existing backend action — there is no new quorum logic in the frontend.
 *
 * The backend derives the verifier identity server-side, refuses the recovery
 * candidate (self-verification), and refuses a second decision from the same
 * verifier. A request that changed before the caller acted (already resolved,
 * no longer open, or the caller is no longer eligible) maps to the neutral
 * `alreadySettled` state so no private reason or technical tag is exposed.
 */
export function useVerifyStewardRecovery() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recoveryId,
      decision,
    }: {
      recoveryId: bigint;
      decision: RecoveryVerificationDecision;
    }): Promise<RecoveryVerificationOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.verifyStewardRecoveryForFamily(
        familyId,
        recoveryId,
        decision,
      );
      if (result.__kind__ === "ok") {
        return decision === RecoveryVerificationDecision.Confirm
          ? { kind: "confirmed", request: result.ok }
          : { kind: "disputed", request: result.ok };
      }
      return isAlreadySettledError(result.err)
        ? { kind: "alreadySettled" }
        : { kind: "error" };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "error") return;
      // The backend read is authoritative, so invalidating the recovery caches
      // refreshes quorum progress and the caller's own decision from state.
      void queryClient.invalidateQueries(recoveryInvalidation(familyScopedId));
    },
  });
}

/**
 * Builds the React Query invalidation filter for the recovery caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["recovery"]` filter would also match `["recovery", <otherFamily>, ...]` and
 * mark another family's cache stale. The filter is therefore family-exact: the
 * default family (`familyScopedId` undefined) targets only keys whose family
 * slot is the default sentinel `""`, and a non-default family targets only keys
 * whose family slot is that family id (family id at index 1).
 */
export function recoveryInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  const familySlot = familyScopedId ?? "";
  return {
    queryKey: [RECOVERY_KEY],
    predicate: (query) => query.queryKey[1] === familySlot,
  };
}

/** True while a recovery request is still open and can be decided. */
export function isOpenRecoveryStatus(status: RecoveryStatus): boolean {
  switch (status) {
    case RecoveryStatus.Pending:
    case RecoveryStatus.AwaitingVerification:
    case RecoveryStatus.ReadyForApproval:
      return true;
    default:
      return false;
  }
}

/** The result of a recovery action, normalized for the UI. */
export type RecoveryActionOutcome =
  | { kind: "created"; request: RecoveryRequest }
  | { kind: "approved"; request: RecoveryRequest }
  | { kind: "rejected"; request: RecoveryRequest }
  | { kind: "alreadyPending" }
  | { kind: "alreadySettled" }
  | { kind: "error" };

/**
 * Creates a self-service recovery request for an existing claimed profile in
 * the active family. The caller IS the replacement account: the backend derives
 * the current owner from the target profile and refuses any caller that is not
 * the replacement account, so no arbitrary third-party nomination is possible.
 *
 * `#AlreadyPending` maps to a neutral "already in progress" state (a second
 * request for the same person while one is open is refused). Every other error
 * collapses to a neutral `error` state so no technical tag is exposed.
 */
export function useRequestRecovery() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { accountId } = useAuth();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
    }: {
      personId: string;
    }): Promise<RecoveryActionOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      if (!accountId) return { kind: "error" };
      const result = await actor.requestRecoveryForFamily(
        familyId,
        personId,
        Principal.fromText(accountId),
      );
      if (result.__kind__ === "ok") {
        return { kind: "created", request: result.ok };
      }
      return result.err === "AlreadyPending"
        ? { kind: "alreadyPending" }
        : { kind: "error" };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "error") return;
      // The caller-scoped backend read is authoritative, so invalidating the
      // recovery caches is enough to surface the new request on the status
      // page — no client-side id registry is involved.
      void queryClient.invalidateQueries(recoveryInvalidation(familyScopedId));
    },
  });
}

/**
 * Approves an ordinary Account Recovery request in the active family. The
 * Steward identity is derived server-side; the caller can never approve on
 * behalf of another Steward, and a Steward can never approve their own
 * recovery.
 *
 * A request that changed before the Steward acted (already resolved, no longer
 * open, or the caller is no longer an authorized Steward) maps to
 * `alreadySettled`, which the UI renders as a neutral "already settled" state
 * with no private reason or technical tag exposed.
 */
export function useApproveRecovery() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recoveryId,
    }: {
      recoveryId: bigint;
    }): Promise<RecoveryActionOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.approveAccountRecoveryForFamily(
        familyId,
        recoveryId,
      );
      if (result.__kind__ === "ok") {
        return { kind: "approved", request: result.ok };
      }
      return isAlreadySettledError(result.err)
        ? { kind: "alreadySettled" }
        : { kind: "error" };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "error") return;
      void queryClient.invalidateQueries(recoveryInvalidation(familyScopedId));
    },
  });
}

/**
 * Rejects an open recovery request in the active family. Allowed for an active
 * Steward or the requester themselves (withdrawal); the backend enforces both.
 *
 * A request that changed before the action (already resolved, or the caller is
 * no longer authorized) maps to `alreadySettled`, rendered as a neutral
 * "already settled" state.
 */
export function useRejectRecovery() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recoveryId,
    }: {
      recoveryId: bigint;
    }): Promise<RecoveryActionOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.rejectRecoveryForFamily(familyId, recoveryId);
      if (result.__kind__ === "ok") {
        return { kind: "rejected", request: result.ok };
      }
      return isAlreadySettledError(result.err)
        ? { kind: "alreadySettled" }
        : { kind: "error" };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "error") return;
      void queryClient.invalidateQueries(recoveryInvalidation(familyScopedId));
    },
  });
}

/**
 * Maps a recovery error tag to the neutral "this request was already settled"
 * state. Every request-change error collapses to the same neutral state so no
 * private reason is exposed. `#NotSignedIn` and `#NotSteward` are surfaced as
 * errors because they are not request changes.
 */
export function isAlreadySettledError(error: RecoveryError): boolean {
  switch (error) {
    case "AlreadyResolved":
    case "RequestNotFound":
    case "InvalidTransition":
    case "QuorumNotMet":
    case "SelfApproval":
    case "SelfVerification":
    case "AlreadyVerifier":
    case "NotAuthorized":
    case "NotOwner":
    case "FamilyNotFound":
    case "PersonNotFound":
    case "ReplacementNotMember":
      return true;
    default:
      return false;
  }
}
