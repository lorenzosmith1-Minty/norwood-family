import {
  Archive,
  Bell,
  GitBranch,
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
  onMyProfileClick,
  onSignInClick,
  onSignOutClick,
  onAdminClick,
  onArchiveClick,
  onBranchClick,
  onExploreClick,
  onStewardClick,
  onNotificationsClick,
  onAddMyselfClick,
}: LayoutProps) {
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
              onClick={onExploreClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <TreePine
                className="h-4 w-4 text-accent-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Explore Family
            </button>
            <button
              type="button"
              data-ocid="layout.branch_link"
              onClick={onBranchClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <GitBranch
                className="h-4 w-4 text-accent-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Heritage Branch
            </button>
            <button
              type="button"
              data-ocid="layout.archive_link"
              onClick={onArchiveClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Archive
                className="h-4 w-4 text-accent-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Family Archive
            </button>
            <button
              type="button"
              data-ocid="layout.add_myself_link"
              onClick={onAddMyselfClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <UserPlus
                className="h-4 w-4 text-accent-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Add Myself
            </button>
            {isAdmin ? (
              <button
                type="button"
                data-ocid="layout.admin_link"
                onClick={onAdminClick}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ShieldCheck
                  className="h-4 w-4 text-accent-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Pending Contributions
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                data-ocid="layout.steward_link"
                onClick={onStewardClick}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <UserCog
                  className="h-4 w-4 text-accent-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Family Steward
              </button>
            ) : null}
            <button
              type="button"
              data-ocid="layout.notifications_link"
              onClick={onNotificationsClick}
              className="relative inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Bell
                className="h-4 w-4 text-accent-foreground"
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
                  onClick={onMyProfileClick}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <UserCircle
                    className="h-4 w-4 text-accent-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  My Profile
                </button>
                <button
                  type="button"
                  data-ocid="layout.sign_out_button"
                  onClick={onSignOutClick}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
