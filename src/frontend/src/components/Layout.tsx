import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        className="paper-grain pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
      />
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
