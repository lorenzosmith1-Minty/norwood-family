import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  FileText,
  Landmark,
  NotebookPen,
  ScrollText,
  Users,
} from "lucide-react";
import { motion } from "motion/react";

interface PersonProfilePageProps {
  onBack: () => void;
}

const facts = [
  { label: "Born", value: "approx. 1860" },
  { label: "Died", value: "June 19, 1936" },
  { label: "Location", value: "Mississippi" },
  { label: "Husband", value: "Isaiah Norwood" },
  { label: "Evidence status", value: "Mixed" },
];

const timeline = [
  {
    date: "c. 1860",
    title: "Born",
    detail: "Julia is born.",
  },
  {
    date: "1880",
    title: "Appears in the census",
    detail:
      "Julia, age about 20, appears in the census with her husband Isaiah Norwood in Lincoln County, Mississippi.",
  },
  {
    date: "After Isaiah’s death",
    title: "Raises her children",
    detail: "Julia raises their children.",
  },
  {
    date: "June 19, 1936",
    title: "Died",
    detail: "Julia dies.",
  },
];

type SourceKind = "documented" | "family-history";

interface SourceCard {
  kind: SourceKind;
  title: string;
  source: string;
  detail: string;
}

const sources: SourceCard[] = [
  {
    kind: "documented",
    title: "1880 U.S. Census",
    source: "U.S. Federal Census, 1880",
    detail:
      "A documented record that supports Julia’s approximate age of about 20, her marriage to Isaiah Norwood, and the family’s location in Lincoln County, Mississippi.",
  },
  {
    kind: "family-history",
    title: "Family Research Notes",
    source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
    detail:
      "A family-history note passed down through the family. It includes family history, relationships, and oral-history details that help connect Julia to the broader Norwood line.",
  },
  {
    kind: "documented",
    title: "Death Information",
    source: "Family records",
    detail:
      "Records Julia’s death as June 19, 1936, marking the end of her life in Mississippi.",
  },
];

export function PersonProfilePage({ onBack }: PersonProfilePageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          data-ocid="profile.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Back to Family Tree
        </button>
      </motion.div>

      {/* Profile header */}
      <motion.header
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <span className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
          <Landmark className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          The Norwood Family
        </span>
        <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Julia “Julie” Norwood
        </h1>
        <p className="mt-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
          Matriarch
        </p>

        <figure className="mt-6 w-full max-w-xs">
          <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-elevated">
            <img
              src="/assets/generated/matriarch-portrait.dim_800x900.png"
              alt="A representative vintage sepia-toned studio portrait of an elderly Black woman in a high-collared Victorian dress and headwrap, framed by an aged cream border. This is representative historical imagery, not an actual photograph of Julia Norwood."
              className="aspect-[4/5] w-full rounded-xl object-cover"
              loading="lazy"
            />
          </div>
          <figcaption className="mt-2 text-center text-xs italic leading-relaxed text-muted-foreground">
            Representative historical portrait — not an actual photograph of
            Julia Norwood.
          </figcaption>
        </figure>

        <dl className="mt-6 grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-subtle"
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {fact.label}
              </dt>
              <dd className="mt-1 font-display text-base font-semibold text-foreground">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </motion.header>

      {/* Her Story */}
      <motion.section
        aria-label="Her Story"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-center gap-2">
          <BookOpen
            className="h-4 w-4 text-accent-foreground/70"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-semibold text-foreground">
            Her Story
          </h2>
        </div>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Julia “Julie” Norwood was the matriarch of the Norwood family, born
          around 1860 in Mississippi. She married Isaiah Norwood, and together
          they raised a large family of eight children. Her life in Mississippi
          anchored the family through the generations, and her memory lives on
          in the branches of the family tree that descend from her.
        </p>
      </motion.section>

      {/* Family */}
      <motion.section
        aria-label="Family"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-center gap-2">
          <Users
            className="h-4 w-4 text-accent-foreground/70"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-semibold text-foreground">
            Family
          </h2>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-subtle">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-base font-semibold text-accent-foreground">
              I
            </span>
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-foreground">
                Isaiah Norwood
              </p>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Husband
              </p>
            </div>
          </div>
          <p className="text-base leading-relaxed text-muted-foreground">
            Julia and Isaiah raised eight children together — Clayton, Isaiah
            Jr., Edward, Hattie, Pinkie, Louise, Lillie, and Lula E. — the next
            generation of the Norwood family.
          </p>
        </div>
      </motion.section>

      {/* Timeline */}
      <motion.section
        aria-label="Timeline"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-center gap-2">
          <CalendarDays
            className="h-4 w-4 text-accent-foreground/70"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-semibold text-foreground">
            Timeline
          </h2>
        </div>
        <ol className="mt-3 flex flex-col gap-3">
          {timeline.map((item) => (
            <li
              key={item.title}
              className="flex gap-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-subtle"
            >
              <span
                className="mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-foreground/70">
                  {item.date}
                </p>
                <p className="mt-0.5 font-display text-base font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>

      {/* Sources */}
      <motion.section
        aria-label="Sources"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-center gap-2">
          <ScrollText
            className="h-4 w-4 text-accent-foreground/70"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-semibold text-foreground">
            Sources
          </h2>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {sources.map((source) => {
            const isDocumented = source.kind === "documented";
            const Icon = isDocumented ? FileText : NotebookPen;
            return (
              <div
                key={source.title}
                className="rounded-2xl border border-border bg-card px-4 py-3 shadow-subtle"
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground/70"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base font-semibold text-foreground">
                        {source.title}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                          isDocumented
                            ? "bg-accent/15 text-accent-foreground"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {isDocumented
                          ? "Documented record"
                          : "Family-history note"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {source.source}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {source.detail}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}
