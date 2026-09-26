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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
 * across families. Mutations invalidate the legacy query-key prefix, which
 * matches both branches.
 */

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
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "conversations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "conversation"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "conversations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "conversation"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "blocked"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "blocked"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "reports"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "reports"],
      });
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
