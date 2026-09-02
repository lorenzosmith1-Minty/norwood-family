import {
  ChevronRight,
  Clock3,
  GitBranch,
  Landmark,
  LibraryBig,
  Search,
  TreePine,
} from "lucide-react";
import { motion } from "motion/react";

const navItems = [
  {
    label: "Explore the Family",
    icon: TreePine,
  },
  {
    label: "Heritage Branch View",
    icon: GitBranch,
  },
  {
    label: "Travel Through Time",
    icon: Clock3,
  },
  {
    label: "Family Stories",
    icon: LibraryBig,
  },
  {
    label: "Family Mysteries",
    icon: Search,
  },
  {
    label: "Add to Our History",
    icon: Landmark,
  },
];

interface HomePageProps {
  onExplore: () => void;
  onAddToHistory: () => void;
  onOpenArchive: () => void;
  onOpenBranch: () => void;
}

export function HomePage({
  onExplore,
  onAddToHistory,
  onOpenArchive,
  onOpenBranch,
}: HomePageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-12 sm:py-16">
      {/* Hero */}
      <motion.header
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="relative mb-10 w-72 sm:w-80">
          <div
            className="logo-halo absolute -inset-10 rounded-full blur-2xl"
            aria-hidden="true"
          />
          <img
            src="/assets/norwood-logo.png"
            alt="Norwood family tree logo — a tree silhouette with the Norwood name across the trunk and the tagline 'Our story across generations.' beneath the roots."
            className="relative h-auto w-full"
            width={1122}
            height={1402}
          />
        </div>
      </motion.header>

      {/* Navigation cards */}
      <nav
        aria-label="Family history sections"
        className="mt-10 flex w-full flex-col gap-3 sm:mt-12"
      >
        {navItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.15 + index * 0.08,
                ease: [0.4, 0, 0.2, 1],
              }}
            >
              <button
                type="button"
                data-ocid={`home.nav_button.${index + 1}`}
                onClick={
                  index === 0
                    ? onExplore
                    : index === 1
                      ? onOpenBranch
                      : index === 3
                        ? onOpenArchive
                        : index === 5
                          ? onAddToHistory
                          : undefined
                }
                className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent-foreground transition-colors duration-300 group-hover:bg-accent group-hover:text-accent-foreground">
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1 font-body text-base font-medium text-foreground sm:text-lg">
                  {item.label}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent-foreground"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
            </motion.div>
          );
        })}
      </nav>

      <p className="mt-10 max-w-sm text-center text-sm text-muted-foreground">
        A living record of the people, places, and moments that make us who we
        are.
      </p>
    </div>
  );
}
