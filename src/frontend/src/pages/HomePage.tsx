import {
  ChevronRight,
  Clock3,
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
}

export function HomePage({ onExplore }: HomePageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-12 sm:py-16">
      {/* Hero */}
      <motion.header
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="relative mb-8 w-56 sm:w-64">
          <div
            className="absolute -inset-3 rounded-[2rem] bg-accent/20 blur-2xl"
            aria-hidden="true"
          />
          <img
            src="/assets/generated/black-family-portrait.dim_800x900.png"
            alt="A representative vintage sepia-toned portrait of a Black family of five, dressed in formal mid-century attire and posed in a living room, presented as an old photograph with worn, deckled edges."
            className="relative w-full rounded-2xl shadow-elevated ring-1 ring-border"
            width={800}
            height={900}
          />
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
          The Norwood Family
        </p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
          Norwood Family
          <br />
          Connection
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">
          Our story across generations.
        </p>
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
                onClick={index === 0 ? onExplore : undefined}
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
