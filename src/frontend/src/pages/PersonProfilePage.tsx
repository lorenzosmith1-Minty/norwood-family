import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  FileText,
  Landmark,
  type LucideIcon,
  NotebookPen,
  ScrollText,
  Users,
} from "lucide-react";
import { motion } from "motion/react";

export interface ProfileFact {
  label: string;
  value: string;
}

export interface TimelineEntry {
  date: string;
  title: string;
  detail: string;
}

export type SourceKind = "documented" | "family-history";

export interface SourceCard {
  kind: SourceKind;
  title: string;
  source: string;
  detail: string;
}

export interface PersonProfile {
  id: string;
  name: string;
  role: string;
  portrait: { src: string; alt: string };
  facts: ProfileFact[];
  story: string;
  family: { spouseName: string; spouseRole: string; childrenText: string };
  timeline: TimelineEntry[];
  sources: SourceCard[];
}

export const juliaProfile: PersonProfile = {
  id: "julia",
  name: "Julia “Julie” Norwood",
  role: "Matriarch",
  portrait: {
    src: "/assets/generated/matriarch-portrait.dim_800x900.png",
    alt: "A representative vintage sepia-toned studio portrait of an elderly Black woman in a high-collared Victorian dress and headwrap, framed by an aged cream border. This is representative historical imagery, not an actual photograph of Julia Norwood.",
  },
  facts: [
    { label: "Born", value: "approx. 1860" },
    { label: "Died", value: "June 19, 1936" },
    { label: "Location", value: "Mississippi" },
    { label: "Husband", value: "Isaiah Norwood" },
    { label: "Evidence status", value: "Mixed" },
  ],
  story:
    "Julia “Julie” Norwood was the matriarch of the Norwood family, born around 1860 in Mississippi. She married Isaiah Norwood, and together they raised a large family of eight children. Her life in Mississippi anchored the family through the generations, and her memory lives on in the branches of the family tree that descend from her.",
  family: {
    spouseName: "Isaiah Norwood",
    spouseRole: "Husband",
    childrenText:
      "Julia and Isaiah raised eight children together — Clayton, Isaiah Jr., Edward, Hattie, Pinkie, Louise, Lillie, and Lula E. — the next generation of the Norwood family.",
  },
  timeline: [
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
  ],
  sources: [
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
  ],
};

export const isaiahProfile: PersonProfile = {
  id: "isaiah",
  name: "Isaiah Norwood",
  role: "Patriarch",
  portrait: {
    src: "/assets/generated/patriarch-portrait.dim_800x900.png",
    alt: "A representative vintage sepia-toned studio portrait of an elderly Black man in a high-collared Victorian suit with a bow tie, framed by an aged cream border. This is representative historical imagery, not an actual photograph of Isaiah Norwood.",
  },
  facts: [
    { label: "Born", value: "1858" },
    { label: "Husband", value: "Julia “Julie” Norwood" },
    { label: "Evidence status", value: "Mixed" },
  ],
  story:
    "Isaiah Norwood was the patriarch of the Norwood family, born in 1858. He married Julia “Julie” Norwood, and together they built the family that would grow to eight children. Isaiah appears with Julia in the 1880 census in Lincoln County, Mississippi, placing the young family in the region that would anchor the Norwood line for generations. Family history says Isaiah was killed at about age 36. Two different family accounts of his death have been preserved, and neither should be treated as confirmed fact.",
  family: {
    spouseName: "Julia “Julie” Norwood",
    spouseRole: "Wife",
    childrenText:
      "Isaiah and Julia raised eight children together — Clayton, Isaiah Jr., Edward, Hattie, Pinkie, Louise, Lillie, and Lula E. — the next generation of the Norwood family.",
  },
  timeline: [
    {
      date: "1858",
      title: "Born",
      detail:
        "Isaiah Norwood is born. This is a documented record of his birth year.",
    },
    {
      date: "1880",
      title: "Appears in the census",
      detail:
        "Isaiah, about age 22, appears in the census with Julia “Julie” Norwood in Lincoln County, Mississippi. This is a documented record.",
    },
    {
      date: "About age 36",
      title: "Killed",
      detail:
        "Family history says Isaiah is killed at about age 36. This is a family account, not a confirmed documented record.",
    },
    {
      date: "After his death",
      title: "Julia raises their children",
      detail:
        "After Isaiah’s death, Julia raises their children. This is a family account.",
    },
  ],
  sources: [
    {
      kind: "documented",
      title: "1880 U.S. Census",
      source: "U.S. Federal Census, 1880",
      detail:
        "A documented record that supports Isaiah’s approximate age of about 22, his marriage to Julia “Julie” Norwood, and the family’s location in Lincoln County, Mississippi.",
    },
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note passed down through the family. It includes family relationships and oral-history details that help connect Isaiah to the broader Norwood line.",
    },
    {
      kind: "family-history",
      title: "Death Account",
      source: "Family history",
      detail:
        "A family-history account of Isaiah’s death. The exact circumstances are not confirmed, and the account should not be treated as a documented record.",
    },
  ],
};

export const profiles: Record<string, PersonProfile> = {
  julia: juliaProfile,
  isaiah: isaiahProfile,
};

interface PersonProfilePageProps {
  onBack: () => void;
  person: PersonProfile;
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className="h-4 w-4 text-accent-foreground/70"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <h2 className="font-display text-xl font-semibold text-foreground">
        {label}
      </h2>
    </div>
  );
}

function EmptySection() {
  return (
    <div
      data-ocid="profile.section.empty_state"
      className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-center shadow-subtle"
    >
      <p className="font-display text-base font-semibold text-foreground">
        Not yet populated
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        This section is still being researched and will be added soon.
      </p>
    </div>
  );
}

export function PersonProfilePage({ onBack, person }: PersonProfilePageProps) {
  const storyLabel = person.id === "julia" ? "Her Story" : "His Story";

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
          {person.name}
        </h1>
        <p className="mt-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
          {person.role}
        </p>

        <figure className="mt-6 w-full max-w-xs">
          <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-elevated">
            <img
              src={person.portrait.src}
              alt={person.portrait.alt}
              className="aspect-[4/5] w-full rounded-xl object-cover"
              loading="lazy"
            />
          </div>
          <figcaption className="mt-2 text-center text-xs italic leading-relaxed text-muted-foreground">
            Representative historical portrait — not an actual photograph of{" "}
            {person.name.split(" ")[0]} Norwood.
          </figcaption>
        </figure>

        <dl className="mt-6 grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          {person.facts.map((fact) => (
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

      {/* Story */}
      <motion.section
        aria-label={storyLabel}
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      >
        <SectionHeader icon={BookOpen} label={storyLabel} />
        {person.story ? (
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {person.story}
          </p>
        ) : (
          <EmptySection />
        )}
      </motion.section>

      {/* Family */}
      <motion.section
        aria-label="Family"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
      >
        <SectionHeader icon={Users} label="Family" />
        {person.family.spouseName ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-subtle">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-base font-semibold text-accent-foreground">
                {person.family.spouseName.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-foreground">
                  {person.family.spouseName}
                </p>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {person.family.spouseRole}
                </p>
              </div>
            </div>
            <p className="text-base leading-relaxed text-muted-foreground">
              {person.family.childrenText}
            </p>
          </div>
        ) : (
          <EmptySection />
        )}
      </motion.section>

      {/* Timeline */}
      <motion.section
        aria-label="Timeline"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <SectionHeader icon={CalendarDays} label="Timeline" />
        {person.timeline.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-3">
            {person.timeline.map((item) => (
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
        ) : (
          <EmptySection />
        )}
      </motion.section>

      {/* Sources */}
      <motion.section
        aria-label="Sources"
        className="mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <SectionHeader icon={ScrollText} label="Sources" />
        {person.sources.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {person.sources.map((source) => {
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
        ) : (
          <EmptySection />
        )}
      </motion.section>
    </div>
  );
}
