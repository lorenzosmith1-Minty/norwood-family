import { ArrowRight, Mail, MessageSquareText } from "lucide-react";

interface MessageBoardHubPageProps {
  onBack: () => void;
  onOpenBoard: () => void;
  onOpenInbox: () => void;
}

/**
 * Message Board hub: groups the family's communication features — the Family
 * Message Board (primary) and Private Messages (secondary) — behind large
 * option cards that mirror the Home navigation cards. Each option reuses its
 * existing page; this hub only routes to it.
 */
export function MessageBoardHubPage({
  onBack,
  onOpenBoard,
  onOpenInbox,
}: MessageBoardHubPageProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="hub-header mb-8">
        <button
          type="button"
          data-ocid="message_board_hub.back_button"
          onClick={onBack}
          aria-label="Back to Home"
          className="hub-back"
        >
          <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="hub-title">Message Board</h1>
          <p className="hub-subtitle">
            Keep in touch with the family — share on the board or message
            someone privately.
          </p>
        </div>
      </header>

      <div data-ocid="message_board_hub.grid" className="hub-grid">
        <button
          type="button"
          data-ocid="message_board_hub.board_option"
          onClick={onOpenBoard}
          className="hub-option hub-option-primary hub-accent-comm"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <MessageSquareText
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Family Message Board</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Post updates, questions, and announcements for the whole family.
          </span>
        </button>

        <button
          type="button"
          data-ocid="message_board_hub.inbox_option"
          onClick={onOpenInbox}
          className="hub-option hub-option-secondary hub-accent-comm"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Mail className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="hub-option-title">Private Messages</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Send and read private 1:1 messages with family members.
          </span>
        </button>
      </div>
    </div>
  );
}
