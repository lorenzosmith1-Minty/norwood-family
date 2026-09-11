import { Skeleton } from "@/components/ui/skeleton";
import {
  Archive,
  Bell,
  GitBranch,
  LibraryBig,
  LogIn,
  LogOut,
  MessageSquareText,
  TreePine,
  UserCircle,
  UserCog,
  UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { NotificationBadge } from "./NotificationBadge";
import { StewardActionBadge } from "./StewardActionBadge";

/** How the signed-in caller's visible identity was resolved. */
export type IdentityStatus = "linked" | "pending" | "none";

/** Base classes shared by every pill nav button. */
const NAV_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
/** Resting nav button: paper surface with a subtle hover accent. */
const NAV_IDLE =
  "border-border bg-background text-foreground hover:border-accent/50 hover:bg-muted";
/** Active nav button: subtle brown fill + stronger brown border (Norwood). */
const NAV_ACTIVE = "border-accent bg-accent/15 text-foreground";

function navClass(active: boolean): string {
  return `${NAV_BASE} ${active ? NAV_ACTIVE : NAV_IDLE}`;
}

function navIconClass(active: boolean): string {
  return active ? "h-4 w-4 text-accent" : "h-4 w-4 text-accent-foreground";
}

interface LayoutProps {
  children: ReactNode;
  /** True when the signed-in caller is an admin; gates the steward nav link. */
  isAdmin?: boolean;
  /** True when the caller holds a valid, non-anonymous identity. */
  isAuthenticated?: boolean;
  /**
   * True when the caller is an approved family member (a linked, claimed
   * Person Profile). Gates the Message Board nav link.
   */
  isApprovedMember?: boolean;
  /**
   * True while the signed-in caller's account/profile/claim/steward state is
   * still resolving from the backend. While true, the permission-dependent
   * navigation (Add Myself / Add Family, Message Board, Family Steward, the
   * profile control, and Sign out) is replaced by a neutral skeleton so the
   * navbar never renders permission-dependent navigation from incomplete auth
   * state. The public nav links stay visible.
   */
  isHydrating?: boolean;
  /** The stable internal account ID (ICP Principal) of the signed-in caller. */
  accountId?: string;
  /**
   * The resolved display name for the signed-in caller. Never a raw auth or
   * account ID — it is the linked/pending Person Profile display name, or
   * empty when no profile is connected.
   */
  identityName?: string;
  /** How the caller's identity was resolved (drives the profile label). */
  identityStatus?: IdentityStatus;
  /**
   * True when the caller owns an approved/claimed Person Profile. Drives the
   * Add Myself / Add Family nav label toggle: before a claim the position
   * reads "Add Myself"; after an approved claim it reads "Add Family".
   */
  hasClaimedProfile?: boolean;
  /**
   * The currently active view. Used to highlight the matching nav button with
   * a subtle Norwood active-state indicator (no layout change).
   */
  activeView?: string;
  /** Navigates to the signed-in caller's own profile ("My Profile"). */
  onMyProfileClick?: () => void;
  /** Navigates to the shared sign-in surface. */
  onSignInClick?: () => void;
  /** Signs the current caller out. */
  onSignOutClick?: () => void;
  /** Navigates to the Family Archive browsing view. */
  onArchiveClick?: () => void;
  /** Navigates to the Heritage Branch View. */
  onBranchClick?: () => void;
  /** Navigates to the Explore Family view. */
  onExploreClick?: () => void;
  /** Navigates to the Family History hub. */
  onHistoryClick?: () => void;
  /** Navigates to the Add Myself / Add Family flow. */
  onAddMyselfClick?: () => void;
  /** Navigates to the Message Board hub (approved members only). */
  onMessageBoardClick?: () => void;
  /** Navigates to the Family Steward hub (admin-gated). */
  onStewardClick?: () => void;
  /** Navigates to the in-app notifications view. */
  onNotificationsClick?: () => void;
}

export function Layout({
  children,
  isAdmin,
  isAuthenticated,
  isApprovedMember,
  isHydrating = false,
  identityName,
  hasClaimedProfile = false,
  activeView,
  onMyProfileClick,
  onSignInClick,
  onSignOutClick,
  onArchiveClick,
  onBranchClick,
  onExploreClick,
  onHistoryClick,
  onAddMyselfClick,
  onMessageBoardClick,
  onStewardClick,
  onNotificationsClick,
}: LayoutProps) {
  // Which nav button is active for the current view. Each nav section maps to
  // the view(s) it owns so the active state stays obvious on desktop and mobile.
  const isExploreActive = activeView === "family-tree";
  const isBranchActive = activeView === "heritage-branch";
  const isArchiveActive =
    activeView === "archive" ||
    activeView === "archive-detail" ||
    activeView === "archive-contribute" ||
    // Family Videos & Oral History is reached from Family Archive (no separate
    // top-level pill), so the Family Archive pill stays highlighted there.
    activeView === "videos" ||
    activeView === "video-detail" ||
    activeView === "video-contribute" ||
    // Family Recipes is reached from Home / Family Archive / Person Profiles
    // (no separate top-level pill), so the Family Archive pill stays
    // highlighted there too.
    activeView === "recipes" ||
    activeView === "recipe-detail" ||
    activeView === "recipe-contribute";
  // Family History hub groups Family Stories, Family Mysteries, and Travel
  // Through Time, so the pill stays highlighted across all of them.
  const isHistoryActive =
    activeView === "family-history" ||
    activeView === "stories" ||
    activeView === "mysteries" ||
    activeView === "timeline";
  const isAddMyselfActive = activeView === "add-myself";
  // Message Board hub groups the Family Message Board and Private Messages.
  const isMessageBoardActive =
    activeView === "message-board-hub" ||
    activeView === "board" ||
    activeView === "board-post" ||
    activeView === "board-compose" ||
    activeView === "inbox" ||
    activeView === "conversation";
  // Family Steward hub groups every administrative function.
  const isStewardActive =
    activeView === "steward-hub" ||
    activeView === "steward-review" ||
    activeView === "governance" ||
    activeView === "admin-approval";
  const isNotificationsActive = activeView === "notifications";
  const isMyProfileActive =
    activeView === "my-profile" || activeView === "profile-edit";

  // Steward controls are owner-only. Gate on BOTH authentication and the
  // admin role so they never leak to a signed-out caller (the admin query can
  // be cached and survive a sign-out in some environments).
  const showAdminControls = isAuthenticated && isAdmin;

  // The Message Board hub (Family Message Board + Private Messages) is for
  // approved family members only. Guests and members without an approved
  // claim never see this nav link.
  const showApprovedMemberControls = isAuthenticated && isApprovedMember;

  // The Add Myself / Add Family position toggles on claim state: before an
  // approved claim it reads "Add Myself"; after an approved/claimed profile it
  // reads "Add Family" (which begins the family-member addition workflow).
  const addLabel = hasClaimedProfile ? "Add Family" : "Add Myself";

  // The profile control is a single button labeled with the caller's canonical
  // preferred/display name, falling back to "My Profile" before a linked
  // profile exists. A raw account id is never surfaced.
  const profileLabel = identityName || "My Profile";

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        className="paper-grain pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
      />
      <header className="border-b border-border bg-card shadow-subtle">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <p className="font-display text-xl font-semibold tracking-tight text-foreground">
              Norwood
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-ocid="layout.explore_link"
              aria-current={isExploreActive ? "page" : undefined}
              onClick={onExploreClick}
              className={navClass(isExploreActive)}
            >
              <TreePine
                className={navIconClass(isExploreActive)}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Explore Family
            </button>
            <button
              type="button"
              data-ocid="layout.branch_link"
              aria-current={isBranchActive ? "page" : undefined}
              onClick={onBranchClick}
              className={navClass(isBranchActive)}
            >
              <GitBranch
                className={navIconClass(isBranchActive)}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Heritage Branch
            </button>
            <button
              type="button"
              data-ocid="layout.archive_link"
              aria-current={isArchiveActive ? "page" : undefined}
              onClick={onArchiveClick}
              className={navClass(isArchiveActive)}
            >
              <Archive
                className={navIconClass(isArchiveActive)}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Family Archive
            </button>
            <button
              type="button"
              data-ocid="layout.history_link"
              aria-current={isHistoryActive ? "page" : undefined}
              onClick={onHistoryClick}
              className={navClass(isHistoryActive)}
            >
              <LibraryBig
                className={navIconClass(isHistoryActive)}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Family History
            </button>
            {isHydrating ? (
              <div
                data-ocid="layout.hydration_skeleton"
                aria-label="Loading your account"
                className="flex items-center gap-2"
              >
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  data-ocid="layout.add_myself_link"
                  aria-current={isAddMyselfActive ? "page" : undefined}
                  onClick={onAddMyselfClick}
                  className={navClass(isAddMyselfActive)}
                >
                  <UserPlus
                    className={navIconClass(isAddMyselfActive)}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {addLabel}
                </button>
                {showApprovedMemberControls ? (
                  <button
                    type="button"
                    data-ocid="layout.message_board_link"
                    aria-current={isMessageBoardActive ? "page" : undefined}
                    onClick={onMessageBoardClick}
                    className={navClass(isMessageBoardActive)}
                  >
                    <MessageSquareText
                      className={navIconClass(isMessageBoardActive)}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Message Board
                  </button>
                ) : null}
                {showAdminControls ? (
                  <button
                    type="button"
                    data-ocid="layout.steward_link"
                    aria-current={isStewardActive ? "page" : undefined}
                    onClick={onStewardClick}
                    className={navClass(isStewardActive)}
                  >
                    <UserCog
                      className={navIconClass(isStewardActive)}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Family Steward
                    <StewardActionBadge />
                  </button>
                ) : null}
              </>
            )}
            <button
              type="button"
              data-ocid="layout.notifications_link"
              aria-current={isNotificationsActive ? "page" : undefined}
              onClick={onNotificationsClick}
              className={navClass(isNotificationsActive)}
            >
              <Bell
                className={navIconClass(isNotificationsActive)}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Notifications
              <NotificationBadge />
            </button>
            {isHydrating ? null : (
              <>
                <span
                  className="hidden h-5 w-px bg-border sm:block"
                  aria-hidden="true"
                />
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-ocid="layout.my_profile_link"
                      aria-current={isMyProfileActive ? "page" : undefined}
                      onClick={onMyProfileClick}
                      className={navClass(isMyProfileActive)}
                    >
                      <UserCircle
                        className={navIconClass(isMyProfileActive)}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className="max-w-[10rem] truncate">
                        {profileLabel}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-ocid="layout.sign_out_button"
                      onClick={onSignOutClick}
                      className={navClass(false)}
                    >
                      <LogOut
                        className="h-4 w-4 text-accent-foreground"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-ocid="layout.sign_in_button"
                    onClick={onSignInClick}
                    className={navClass(false)}
                  >
                    <LogIn
                      className="h-4 w-4 text-accent-foreground"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Sign in
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-border bg-card/60 py-6">
        <div className="mx-auto w-full max-w-3xl px-6 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()}. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(
                window.location.hostname,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline decoration-accent/60 underline-offset-2 transition-colors hover:text-accent-foreground"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
