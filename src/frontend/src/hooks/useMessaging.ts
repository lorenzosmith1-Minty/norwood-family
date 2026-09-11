import { createActor } from "@/backend";
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

/**
 * React Query hooks for Private Messaging, following the existing
 * useActor(createActor) + useQuery/useMutation pattern. Messaging is a
 * canonical 1:1 text-only conversation per account pair, reusable when the
 * same two users message again. Only participants can read a conversation;
 * Stewards see reported message content only when a report is filed.
 */

/** Lists the signed-in user's 1:1 conversations, newest activity first. */
export function useListConversations() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["messaging", "conversations"],
    queryFn: async () => {
      if (!actor) return [] as ConversationSummary[];
      return actor.listConversations();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a single conversation's full view (participants + messages). */
export function useGetConversation(conversationId: bigint | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      "messaging",
      "conversation",
      conversationId?.toString() ?? "all",
    ],
    queryFn: async () => {
      if (!actor || conversationId === null) return null;
      return actor.getConversation(conversationId);
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
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["messaging", "messageableMembers"],
    queryFn: async () => {
      if (!actor) return [] as string[];
      return actor.listMessageableMembers();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Whether the signed-in caller may message a given person. */
export function useCanMessagePerson(personId: string | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["messaging", "canMessage", personId],
    queryFn: async () => {
      if (!actor || personId === null) return false;
      return actor.canMessagePerson(personId);
    },
    enabled: !!actor && !isFetching && personId !== null,
  });
}

/** Sends a text message to a recipient person, creating/reusing the 1:1 conversation. */
export function useSendMessage() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recipientPersonId: string;
      body: string;
    }): Promise<SendMessageResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.sendMessage(input.recipientPersonId, input.body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "conversations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "conversation"],
      });
      // A sent message notifies the recipient, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Marks a conversation as read (updates unread state). */
export function useMarkConversationRead() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markConversationRead(conversationId);
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
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedAccountId: Principal) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.blockUser(blockedAccountId);
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
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedAccountId: Principal) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.unblockUser(blockedAccountId);
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
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["messaging", "blocked"],
    queryFn: async () => {
      if (!actor) return [] as Principal[];
      return actor.listBlockedUsers();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Reports a specific message with a reason (steward review surface). */
export function useReportMessage() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: bigint; reason: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.reportMessage(input.messageId, input.reason);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "reports"],
      });
      // Filing a report notifies the stewards, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Lists all filed message reports (steward-only). */
export function useListReports() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["messaging", "reports"],
    queryFn: async () => {
      if (!actor) return [] as Report[];
      return actor.listReports();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a reported message together with its report (steward-only). */
export function useGetReportedMessage(reportId: bigint | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["messaging", "reports", reportId?.toString() ?? "all"],
    queryFn: async () => {
      if (!actor || reportId === null) return null;
      return actor.getReportedMessage(reportId);
    },
    enabled: !!actor && !isFetching && reportId !== null,
  });
}

/** Reviews a message report (steward-only). */
export function useReviewReport() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: bigint; status: ReportStatus }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.reviewReport(input.reportId, input.status);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "reports"],
      });
      // Reviewing a report notifies the reporter, so the unread badge must
      // refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
