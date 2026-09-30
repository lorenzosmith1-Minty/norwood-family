import { createActor } from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import type {
  ConversationSummary,
  ConversationView,
  Message,
  Report,
  ReportStatus,
  ReportedMessageView,
  SendMessageResult,
} from "@/types/messaging";
import { useActor } from "@caffeineai/core-infrastructure";
import type { Principal } from "@icp-sdk/core/principal";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";

/**
 * React Query hooks for Private Messaging, following the existing
 * useActor(createActor) + useQuery/useMutation pattern. Messaging is a
 * canonical 1:1 text-only conversation per account pair, reusable when the
 * same two users message again. Only participants can read a conversation;
 * Stewards see reported message content only when a report is filed.
 *
 * Every hook is family-aware, following the useBoard / useArchiveStorage /
 * useResearchIntake pattern: the active family is read from the centralized
 * FamilyContext and `familyScopedId` is `undefined` for the default family.
 * The default family keeps the exact legacy no-argument call shape and React
 * Query key, while a non-default family routes to the canonical `*ForFamily`
 * endpoint with the familyId included in the key so caches never collide
 * across families. Mutations invalidate through the family-exact helpers below.
 */

/**
 * Family-aware React Query invalidation filters for the Messaging caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["messaging", "conversations"]` filter would also match
 * `["messaging", "conversations", <otherFamily>]` and mark another family's
 * Messaging cache stale. These helpers follow the exact precedent of
 * `boardPostListsInvalidation` in `useBoard.ts`, `researchSourcesInvalidation`
 * in `useResearchIntake.ts`, and `pendingContributionsCountInvalidation` in
 * `usePendingCount.ts`: both branches are family-exact.
 *
 * The Messaging read keys carry the family id at the LAST index:
 * `["messaging", "conversations"]` /
 * `["messaging", "conversations", familyScopedId]`,
 * `["messaging", "conversation", id]` /
 * `["messaging", "conversation", id, familyScopedId]`,
 * `["messaging", "blocked"]` / `["messaging", "blocked", familyScopedId]`,
 * `["messaging", "reports"]` / `["messaging", "reports", familyScopedId]`, and
 * `["messaging", "reports", reportId]` /
 * `["messaging", "reports", reportId, familyScopedId]`.
 *
 * The default family's read key omits the family slot entirely, which is a
 * PREFIX of every non-default key for the same cache. A bare exact-key filter
 * would therefore still mark another family's cache stale, so the default
 * branch keeps the exact key but narrows it with a predicate that admits only
 * the default shape (a `queryKey.length` check). This mirrors the
 * `boardPostListsInvalidation` default branch in `useBoard.ts`.
 *
 * - The default family (`familyScopedId` undefined) targets only the exact
 *   default read key, so no non-default family's key can match.
 * - A non-default family keeps the bare prefix (so the recorded filter shape is
 *   unchanged) but narrows it with a predicate that admits only the active
 *   family's keys.
 *
 * The active family id is always the centralized `useFamilyScopedId()` value;
 * no family id is hard-coded here.
 */

/** Invalidation filter for the conversation-list caches of the active family. */
export function conversationListsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["messaging", "conversations"],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return {
    queryKey: ["messaging", "conversations"],
    predicate: (query) =>
      query.queryKey.length === 3 && query.queryKey[2] === familyScopedId,
  };
}

/** Invalidation filter for the single conversation-detail caches of the active family. */
export function conversationDetailInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["messaging", "conversation"],
      predicate: (query) => query.queryKey.length === 3,
    };
  }
  return {
    queryKey: ["messaging", "conversation"],
    predicate: (query) =>
      query.queryKey.length === 4 && query.queryKey[3] === familyScopedId,
  };
}

/** Invalidation filter for the blocked-participant caches of the active family. */
export function blockedUsersInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["messaging", "blocked"],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return {
    queryKey: ["messaging", "blocked"],
    predicate: (query) =>
      query.queryKey.length === 3 && query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for the report caches of the active family.
 *
 * The `["messaging", "reports"]` prefix also matches the report-detail keys
 * (`["messaging", "reports", reportId]` / `[..., familyScopedId]`), so the
 * predicate admits both the list shape (family at index 2) and the detail shape
 * (family at index 3) for the active family.
 *
 * The default family's list key is `["messaging", "reports"]` (length 2) and
 * its detail key is `["messaging", "reports", reportId]` (length 3). A
 * non-default family's list key is ALSO length 3
 * (`["messaging", "reports", familyScopedId]`), so a bare `length === 3` check
 * would mark another family's report list stale. The default branch therefore
 * admits a length-3 key only when index 2 is a report-id token (the digits of a
 * `bigint` report id, or the `"all"` placeholder used when no report is
 * selected) — never a family id, which is always a slug.
 */
export function reportsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["messaging", "reports"],
      predicate: (query) =>
        query.queryKey.length === 2 ||
        (query.queryKey.length === 3 && isReportIdToken(query.queryKey[2])),
    };
  }
  return {
    queryKey: ["messaging", "reports"],
    predicate: (query) =>
      (query.queryKey.length === 3 && query.queryKey[2] === familyScopedId) ||
      (query.queryKey.length === 4 && query.queryKey[3] === familyScopedId),
  };
}

/**
 * Whether a report-cache key segment is a report-id token rather than a family
 * id. `useGetReportedMessage` builds the detail key from
 * `reportId?.toString() ?? "all"`, so a valid token is either the `"all"`
 * placeholder or the decimal digits of a `bigint` report id. Family ids are
 * slugs, so this distinguishes the default detail shape from a non-default
 * family's list shape without hard-coding any family id.
 */
function isReportIdToken(value: unknown): boolean {
  return value === "all" || (typeof value === "string" && /^\d+$/u.test(value));
}

/** Lists the signed-in user's 1:1 conversations, newest activity first. */
export function useListConversations() {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "conversations"]
        : ["messaging", "conversations", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as ConversationSummary[];
      return familyScopedId === undefined
        ? actor.listConversations()
        : actor.listConversationsForFamily(familyScopedId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a single conversation's full view (participants + messages). */
export function useGetConversation(conversationId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "conversation", conversationId?.toString() ?? "all"]
        : [
            "messaging",
            "conversation",
            conversationId?.toString() ?? "all",
            familyScopedId,
          ],
    queryFn: async () => {
      if (!actor || conversationId === null) return null;
      return familyScopedId === undefined
        ? actor.getConversation(conversationId)
        : actor.getConversationForFamily(familyScopedId, conversationId);
    },
    enabled: !!actor && !isFetching && conversationId !== null,
  });
}

/**
 * Lists the person ids of every other member the signed-in caller may message
 * (living, claimed, linked to an active account, not archived, not self). Not
 * gated to stewards — any approved member may read it, so the Private Messages
 * inbox can determine whether any other eligible member exists.
 */
export function useListMessageableMembers() {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "messageableMembers"]
        : ["messaging", "messageableMembers", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as string[];
      return familyScopedId === undefined
        ? actor.listMessageableMembers()
        : actor.listMessageableMembersForFamily(familyScopedId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Whether the signed-in caller may message a given person. */
export function useCanMessagePerson(personId: string | null) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "canMessage", personId]
        : ["messaging", "canMessage", personId, familyScopedId],
    queryFn: async () => {
      if (!actor || personId === null) return false;
      return familyScopedId === undefined
        ? actor.canMessagePerson(personId)
        : actor.canMessagePersonForFamily(familyScopedId, personId);
    },
    enabled: !!actor && !isFetching && personId !== null,
  });
}

/** Sends a text message to a recipient person, creating/reusing the 1:1 conversation. */
export function useSendMessage() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recipientPersonId: string;
      body: string;
    }): Promise<SendMessageResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.sendMessage(input.recipientPersonId, input.body)
        : actor.sendMessageForFamily(
            familyScopedId,
            input.recipientPersonId,
            input.body,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        conversationListsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        conversationDetailInvalidation(familyScopedId),
      );
      // A sent message notifies the recipient, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/** Marks a conversation as read (updates unread state). */
export function useMarkConversationRead() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.markConversationRead(conversationId)
        : actor.markConversationReadForFamily(familyScopedId, conversationId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        conversationListsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        conversationDetailInvalidation(familyScopedId),
      );
    },
  });
}

/** Blocks a user, preventing new messages from them. */
export function useBlockUser() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedAccountId: Principal) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.blockUser(blockedAccountId)
        : actor.blockUserForFamily(familyScopedId, blockedAccountId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        blockedUsersInvalidation(familyScopedId),
      );
    },
  });
}

/** Unblocks a previously blocked user. */
export function useUnblockUser() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedAccountId: Principal) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.unblockUser(blockedAccountId)
        : actor.unblockUserForFamily(familyScopedId, blockedAccountId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        blockedUsersInvalidation(familyScopedId),
      );
    },
  });
}

/** Lists the account ids the signed-in user has blocked. */
export function useListBlockedUsers() {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "blocked"]
        : ["messaging", "blocked", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Principal[];
      return familyScopedId === undefined
        ? actor.listBlockedUsers()
        : actor.listBlockedUsersForFamily(familyScopedId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Reports a specific message with a reason (steward review surface). */
export function useReportMessage() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: bigint; reason: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.reportMessage(input.messageId, input.reason)
        : actor.reportMessageForFamily(
            familyScopedId,
            input.messageId,
            input.reason,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(reportsInvalidation(familyScopedId));
      // Filing a report notifies the stewards, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/** Lists all filed message reports (steward-only). */
export function useListReports() {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "reports"]
        : ["messaging", "reports", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Report[];
      return familyScopedId === undefined
        ? actor.listReports()
        : actor.listReportsForFamily(familyScopedId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a reported message together with its report (steward-only). */
export function useGetReportedMessage(reportId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["messaging", "reports", reportId?.toString() ?? "all"]
        : [
            "messaging",
            "reports",
            reportId?.toString() ?? "all",
            familyScopedId,
          ],
    queryFn: async () => {
      if (!actor || reportId === null) return null;
      return familyScopedId === undefined
        ? actor.getReportedMessage(reportId)
        : actor.getReportedMessageForFamily(familyScopedId, reportId);
    },
    enabled: !!actor && !isFetching && reportId !== null,
  });
}

/** Reviews a message report (steward-only). */
export function useReviewReport() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: bigint; status: ReportStatus }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.reviewReport(input.reportId, input.status)
        : actor.reviewReportForFamily(
            familyScopedId,
            input.reportId,
            input.status,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(reportsInvalidation(familyScopedId));
      // Reviewing a report notifies the reporter, so the unread badge must
      // refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

export type {
  ConversationSummary,
  ConversationView,
  Message,
  Report,
  ReportedMessageView,
  SendMessageResult,
};
