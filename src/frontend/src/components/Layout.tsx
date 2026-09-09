import {
  Archive,
  Bell,
  GitBranch,
  Landmark,
  LogIn,
  LogOut,
  ShieldCheck,
  TreePine,
  UserCircle,
  UserCog,
  UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { NotificationBadge } from "./NotificationBadge";

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
  /** True when the signed-in caller is an admin; gates the admin nav links. */
  isAdmin?: boolean;
  /** True when the caller holds a valid, non-anonymous identity. */
  isAuthenticated?: boolean;
  /** The stable internal account ID (ICP Principal) of the signed-in caller. */
  accountId?: string;
  /**
   * The resolved display name for the signed-in caller. Never a raw auth or
   * account ID — it is the linked/pending Person Profile display name, or
   * empty when no profile is connected.
   */
  identityName?: string;
  /** How the caller's identity was resolved (drives the label + badge). */
  identityStatus?: IdentityStatus;
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
  /** Navigates to the admin pending-contributions view. */
  onAdminClick?: () => void;
  /** Navigates to the Family Archive browsing view. */
  onArchiveClick?: () => void;
  /** Navigates to the Heritage Branch View. */
  onBranchClick?: () => void;
  /** Navigates to the Explore Family view. */
  onExploreClick?: () => void;
  /** Navigates to the Family Steward review area (admin-gated). */
  onStewardClick?: () => void;
  /** Navigates to the Family Governance & Safety Controls area (admin-gated). */
  onGovernanceClick?: () => void;
  /** Navigates to the in-app notifications view. */
  onNotificationsClick?: () => void;
  /** Navigates to the "Add Myself to This Family" flow. */
  onAddMyselfClick?: () => void;
}

export function Layout({
  children,
  isAdmin,
  isAuthenticated,
  identityName,
  identityStatus = "none",
  activeView,
  onMyProfileClick,
  onSignInClick,
  onSignOutClick,
  onAdminClick,
  onArchiveClick,
  onBranchClick,
  onExploreClick,
  onStewardClick,
  onGovernanceClick,
  onNotificationsClick,
  onAddMyselfClick,
}: LayoutProps) {
  // Which nav button is active for the current view. Each nav section maps to
  // the view(s) it owns so the active state stays obvious on desktop and mobile.
  const isExploreActive = activeView === "family-tree";
  const isBranchActive = activeView === "heritage-branch";
  const isArchiveActive =
    activeView === "archive" ||
    activeView === "archive-detail" ||
    activeView === "archive-contribute";
  const isAddMyselfActive = activeView === "add-myself";
  const isStewardActive = activeView === "steward-review";
  const isGovernanceActive = activeView === "governance";
  const isNotificationsActive = activeView === "notifications";
  const isMyProfileActive =
    activeView === "my-profile" || activeView === "profile-edit";
  const isAdminActive = activeView === "admin-approval";

  // Steward/admin controls are owner-only. Gate on BOTH authentication and the
  // admin role so they never leak to a signed-out caller (the admin query can
  // be cached and survive a sign-out in some environments).
  const showAdminControls = isAuthenticated && isAdmin;

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
              Add Myself
            </button>
            {showAdminControls ? (
              <button
                type="button"
                data-ocid="layout.admin_link"
                aria-current={isAdminActive ? "page" : undefined}
                onClick={onAdminClick}
                className={navClass(isAdminActive)}
              >
                <ShieldCheck
                  className={navIconClass(isAdminActive)}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Pending Contributions
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
              </button>
            ) : null}
            {showAdminControls ? (
              <button
                type="button"
                data-ocid="layout.governance_link"
                aria-current={isGovernanceActive ? "page" : undefined}
                onClick={onGovernanceClick}
                className={navClass(isGovernanceActive)}
              >
                <Landmark
                  className={navIconClass(isGovernanceActive)}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Family Governance
              </button>
            ) : null}
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
            <span
              className="hidden h-5 w-px bg-border sm:block"
              aria-hidden="true"
            />
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span
                  data-ocid="layout.account_identity"
                  title={
                    identityStatus === "none"
                      ? "Complete your profile"
                      : "My Profile"
                  }
                  className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
                >
                  <UserCircle
                    className="h-4 w-4 shrink-0 text-accent-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {identityName ||
                      (identityStatus === "pending"
                        ? "Complete Profile"
                        : "My Account")}
                  </span>
                  {identityStatus === "pending" ? (
                    <span
                      data-ocid="layout.identity_pending"
                      className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-label="Profile pending"
                    />
                  ) : null}
                </span>
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
                  My Profile
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
