import { Send } from "lucide-react";
import { useState } from "react";

/**
 * Text-only message composer for a 1:1 conversation. Owns the in-progress
 * draft as local UI state (never backend state) and clears it synchronously on
 * send, restoring it if the send fails. Enter sends; Shift+Enter inserts a
 * newline. Disabled while a send is pending or when the conversation is
 * blocked.
 */
interface MessageComposerProps {
  /** Sends the message body. The parent owns the mutation and its error state. */
  onSend: (body: string) => void;
  /** True while a send is in flight or the conversation is blocked. */
  disabled?: boolean;
  /** Placeholder text for the input. */
  placeholder?: string;
}

export function MessageComposer({
  onSend,
  disabled = false,
  placeholder = "Write a message…",
}: MessageComposerProps) {
  const [draft, setDraft] = useState("");

  const canSend = draft.trim().length > 0 && !disabled;

  const handleSend = () => {
    const body = draft.trim();
    if (!body || disabled) return;
    // Clear the draft synchronously before the mutation settles so the user can
    // start typing the next message immediately. Restore it only if the send
    // fails and the user hasn't typed something newer.
    setDraft("");
    onSend(body);
  };

  return (
    <div className="composer">
      <textarea
        data-ocid="composer.textarea"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        aria-label="Message"
        disabled={disabled}
        className="composer-textarea"
      />
      <button
        type="button"
        data-ocid="composer.send_button"
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Send message"
        className="composer-send"
      >
        <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
