import { Archive, GitBranch, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  /** True when the signed-in caller is an admin; gates the admin nav link. */
  isAdmin?: boolean;
  /** Navigates to the admin pending-contributions view. */
  onAdminClick?: () => void;
  /** Navigates to the Family Archive browsing view. */
  onArchiveClick?: () => void;
  /** Navigates to the Heritage Branch View. */
  onBranchClick?: () => void;
}

export function Layout({
  children,
  isAdmin,
  onAdminClick,
  onArchiveClick,
  onBranchClick,
}: LayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        className="paper-grain pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
      />
      <header className="border-b border-border bg-card shadow-subtle">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <p className="font-display text-lg font-semibold text-foreground">
            Norwood Family Connection
          </p>
          <div className="flex items-center gap-2">
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
