import type { Photo } from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  FileText,
  ImagePlus,
  Landmark,
  Loader2,
  type LucideIcon,
  NotebookPen,
  ScrollText,
  Trash2,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  useAddPhoto,
  usePhotos,
  useProfilePhoto,
  useProvidersPresent,
  useRemovePhoto,
  useSetProfilePhoto,
} from "../hooks/usePhotoStorage";

export interface ProfileFact {
  label: string;
  value: string;
}

export interface TimelineEntry {
  date: string;
  title: string;
  detail: string;
}

export type SourceKind = "documented" | "family-history" | "unresolved";

export interface SourceCard {
  kind: SourceKind;
  title: string;
  source: string;
  detail: string;
}

export interface FamilySpouse {
  name: string;
  role: string;
  children: string[];
}

export interface FamilyInfo {
  spouseName: string;
  spouseRole: string;
  childrenText: string;
  spouses?: FamilySpouse[];
}

export interface PersonProfile {
  id: string;
  name: string;
  role: string;
  portrait: { src: string; alt: string };
  facts: ProfileFact[];
  story: string;
  family: FamilyInfo;
  timeline: TimelineEntry[];
  sources: SourceCard[];
  // Future-ready fields. Reserved so the data structure can later support
  // relation-to-you, relationship paths, living/historical status, profile
  // ownership/claimed status, and contribution/edit requests — none of which
  // are exposed or built yet.
  relationToYou?: string;
  relationshipPath?: string[];
  livingStatus?: "living" | "historical";
  claimedBy?: string;
  contributionRequests?: unknown[];
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

export const claytonProfile: PersonProfile = {
  id: "clayton",
  name: "Clayton Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Clayton Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    { label: "Born", value: "approx. 1883" },
    {
      label: "Parents",
      value: "Julia “Julie” Norwood and Isaiah Norwood",
    },
    { label: "Evidence status", value: "Mixed" },
  ],
  story:
    "Clayton Norwood was the son of Julia “Julie” Norwood and Isaiah Norwood, born around 1883. The 1920 census lists Clayton as about 37 years old, which places his birth in the early 1880s. Family history describes Clayton as very fair or light skinned, strong-tempered, and quick to defend himself — a man who was respected regardless of race. Family accounts also recall that he suffered from loud nightmares and sleep disturbances. These personal details come from family history and are not confirmed by documented records.",
  family: {
    spouseName: "Ms. Hudson",
    spouseRole: "First Wife",
    childrenText:
      "Clayton married twice. His first wife, Ms. Hudson, and his later wife, Erma T. Williams, together gave him a large family across two marriages.",
    spouses: [
      {
        name: "Ms. Hudson",
        role: "First Wife",
        children: ["Elbert", "Wellman", "Wetherby", "a son who died at birth"],
      },
      {
        name: "Erma T. Williams",
        role: "Second Wife",
        children: [
          "Columbus",
          "Thomas Clayton “Tip / TC”",
          "Alton",
          "Robert Davis “RD”",
          "Ardeanus",
          "Willie B.",
          "James",
          "Freddie",
          "Zelia Mae",
          "Lula Mae",
        ],
      },
    ],
  },
  timeline: [
    {
      date: "c. 1883",
      title: "Born",
      detail:
        "Clayton Norwood is born, the son of Julia “Julie” Norwood and Isaiah Norwood.",
    },
    {
      date: "1920",
      title: "Appears in the census",
      detail:
        "The 1920 U.S. Census lists Clayton as about 37 years old. This is a documented record.",
    },
    {
      date: "Later",
      title: "Marries Erma T. Williams",
      detail:
        "Clayton later marries Erma T. Williams, his second wife. This is a family-history account.",
    },
  ],
  sources: [
    {
      kind: "documented",
      title: "1920 U.S. Census",
      source: "U.S. Federal Census, 1920",
      detail:
        "A documented record that lists Clayton as about 37 years old, supporting his approximate birth around 1883.",
    },
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note describing Clayton as very fair or light skinned, strong-tempered, quick to defend himself, respected regardless of race, and suffering from loud nightmares and sleep disturbances. These personal details are family accounts, not documented records.",
    },
  ],
};

export const ermaProfile: PersonProfile = {
  id: "erma",
  name: "Erma T. Williams",
  role: "Wife of Clayton Norwood",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Erma T. Williams, since no photograph of her is known to exist.",
  },
  facts: [
    { label: "Birth year", value: "Uncertain (c. 1885 or 1897)" },
    { label: "Husband", value: "Clayton Norwood" },
    { label: "Evidence status", value: "Mixed" },
  ],
  story:
    "Erma T. Williams was the second wife of Clayton Norwood. Her birth year is unresolved: the 1920 census records her as about 35 years old, which would place her birth around 1885, while her headstone gives her dates as Nov. 21, 1897 – June 7, 1977. These two accounts conflict, and neither should be treated as confirmed. Family history also recalls her brother Frenchie Williams, who lived in Ponchatoula, Louisiana, and reached about age 101 — a family-history note, not a documented record.",
  family: {
    spouseName: "Clayton Norwood",
    spouseRole: "Husband",
    childrenText:
      "Erma married Clayton Norwood, his second wife, and together they had ten children — Columbus, Thomas Clayton “Tip / TC”, Alton, Robert Davis “RD”, Ardeanus, Willie B., James, Freddie, Zelia Mae, and Lula Mae.",
    spouses: [
      {
        name: "Clayton Norwood",
        role: "Husband",
        children: [
          "Columbus",
          "Thomas Clayton “Tip / TC”",
          "Alton",
          "Robert Davis “RD”",
          "Ardeanus",
          "Willie B.",
          "James",
          "Freddie",
          "Zelia Mae",
          "Lula Mae",
        ],
      },
    ],
  },
  timeline: [
    {
      date: "c. 1885 or Nov. 21, 1897",
      title: "Birth year uncertain",
      detail:
        "Erma’s birth year is unresolved. The 1920 census suggests about 1885, while her headstone records Nov. 21, 1897. The two accounts conflict.",
    },
    {
      date: "1920",
      title: "Appears in the census",
      detail:
        "The 1920 U.S. Census records Erma as about 35 years old. This is a documented record.",
    },
    {
      date: "Later",
      title: "Marries Clayton Norwood",
      detail:
        "Erma later marries Clayton Norwood as his second wife. This is a family-history account.",
    },
    {
      date: "June 7, 1977",
      title: "Died",
      detail:
        "Erma’s headstone records her death on June 7, 1977. This is a documented record.",
    },
  ],
  sources: [
    {
      kind: "documented",
      title: "1920 U.S. Census",
      source: "U.S. Federal Census, 1920",
      detail:
        "A documented record that lists Erma as about 35 years old, supporting an approximate birth around 1885.",
    },
    {
      kind: "documented",
      title: "Headstone information",
      source: "Headstone",
      detail:
        "A documented record from Erma’s headstone giving her dates as Nov. 21, 1897 – June 7, 1977.",
    },
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note recalling Erma’s brother Frenchie Williams, who lived in Ponchatoula, Louisiana, and reached about age 101. This is a family account, not a documented record.",
    },
    {
      kind: "unresolved",
      title: "Birth year conflict",
      source: "Census vs. headstone",
      detail:
        "The 1920 census (age 35, ~1885) and Erma’s headstone (Nov. 21, 1897) give conflicting birth years. This conflict is unresolved and neither account should be treated as confirmed.",
    },
  ],
};

export const msHudsonProfile: PersonProfile = {
  id: "hudson",
  name: "Ms. Hudson",
  role: "First Wife of Clayton Norwood",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Ms. Hudson, since no photograph of her is known to exist.",
  },
  facts: [
    { label: "Husband", value: "Clayton Norwood" },
    {
      label: "Children",
      value: "Elbert, Wellman, Wetherby, and a son who died at birth",
    },
    { label: "Evidence status", value: "Limited" },
  ],
  story:
    "Ms. Hudson was the first wife of Clayton Norwood and the mother of Elbert, Wellman, Wetherby, and a son who died at birth. Very little is known about her beyond this — her full name, dates, and the details of her life have not been preserved in the family records gathered so far.",
  family: {
    spouseName: "Clayton Norwood",
    spouseRole: "Husband",
    childrenText:
      "Ms. Hudson and Clayton Norwood had four children together — Elbert, Wellman, Wetherby, and a son who died at birth.",
    spouses: [
      {
        name: "Clayton Norwood",
        role: "Husband",
        children: ["Elbert", "Wellman", "Wetherby", "a son who died at birth"],
      },
    ],
  },
  timeline: [
    {
      date: "Unknown",
      title: "Marries Clayton Norwood",
      detail:
        "Ms. Hudson marries Clayton Norwood as his first wife. The date is not recorded in the family records gathered so far.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Ms. Hudson as Clayton Norwood's first wife and the mother of Elbert, Wellman, Wetherby, and a son who died at birth. Little else about her is known.",
    },
  ],
};

export const elbertProfile: PersonProfile = {
  id: "elbert",
  name: "Elbert Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Elbert Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Ms. Hudson",
    },
    { label: "Wife", value: "Rose" },
    { label: "Children", value: "None (no biological children)" },
    { label: "Evidence status", value: "Family history" },
  ],
  story:
    "Elbert Norwood was the son of Clayton Norwood and Ms. Hudson. Family history recalls that Elbert left Mississippi for Chicago by freight train to escape racism. He worked as a porter and later at the Post Office. He married Rose, and the couple had no biological children. Family history also tells of an attempted adoption, though the details of that story are not fully documented. These accounts are family history, not confirmed documented records.",
  family: {
    spouseName: "Rose",
    spouseRole: "Wife",
    childrenText:
      "Elbert married Rose. The couple had no biological children. Family history recalls that they attempted to adopt a child, though the details of that story are not fully documented.",
  },
  timeline: [
    {
      date: "Unknown",
      title: "Leaves Mississippi for Chicago",
      detail:
        "Family history recalls that Elbert left Mississippi for Chicago by freight train to escape racism. This is a family account, not a documented record.",
    },
    {
      date: "Unknown",
      title: "Works as a porter, then at the Post Office",
      detail:
        "Family history recalls that Elbert worked as a porter and later at the Post Office. This is a family account, not a documented record.",
    },
    {
      date: "Unknown",
      title: "Marries Rose",
      detail:
        "Elbert marries Rose. The couple had no biological children. This is a family account, not a documented record.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note recalling Elbert's move from Mississippi to Chicago by freight train to escape racism, his work as a porter and then at the Post Office, his marriage to Rose, and the couple's attempted adoption. These are family accounts, not documented records.",
    },
  ],
};

export const wellmanProfile: PersonProfile = {
  id: "wellman",
  name: "Wellman Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Wellman Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Ms. Hudson",
    },
    { label: "Evidence status", value: "Limited" },
  ],
  story:
    "Wellman Norwood was the son of Clayton Norwood and Ms. Hudson. Very little is known about his life. The family records gathered so far identify him as one of the couple's children but preserve few details about him.",
  family: {
    spouseName: "",
    spouseRole: "",
    childrenText: "",
  },
  timeline: [
    {
      date: "Unknown",
      title: "Born",
      detail:
        "Wellman Norwood is born, the son of Clayton Norwood and Ms. Hudson. The date is not recorded in the family records gathered so far.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Wellman as a son of Clayton Norwood and Ms. Hudson. Little else about him is known.",
    },
  ],
};

export const wetherbyProfile: PersonProfile = {
  id: "wetherby",
  name: "Wetherby Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Wetherby Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Ms. Hudson",
    },
    { label: "Evidence status", value: "Limited" },
  ],
  story:
    "Wetherby Norwood was the son of Clayton Norwood and Ms. Hudson. Very little is known about his life. The family records gathered so far identify him as one of the couple's children but preserve few details about him.",
  family: {
    spouseName: "",
    spouseRole: "",
    childrenText: "",
  },
  timeline: [
    {
      date: "Unknown",
      title: "Born",
      detail:
        "Wetherby Norwood is born, the son of Clayton Norwood and Ms. Hudson. The date is not recorded in the family records gathered so far.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Wetherby as a son of Clayton Norwood and Ms. Hudson. Little else about him is known.",
    },
  ],
};

export const columbusProfile: PersonProfile = {
  id: "columbus",
  name: "Columbus Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Columbus Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Erma T. Williams",
    },
    { label: "Location", value: "Ogden, Utah" },
    { label: "Evidence status", value: "Limited" },
  ],
  story:
    "Columbus Norwood was the son of Clayton Norwood and Erma T. Williams. He is associated with Ogden, Utah. No additional details about his life are currently recorded in the family records gathered so far.",
  family: {
    spouseName: "",
    spouseRole: "",
    childrenText: "",
  },
  timeline: [
    {
      date: "Unknown",
      title: "Born",
      detail:
        "Columbus Norwood is born, the son of Clayton Norwood and Erma T. Williams. The date is not recorded in the family records gathered so far.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Columbus as a son of Clayton Norwood and Erma T. Williams, associated with Ogden, Utah. No additional details about him are currently recorded.",
    },
  ],
};

export const thomasClaytonProfile: PersonProfile = {
  id: "thomas-clayton",
  name: "Thomas Clayton “Tip / TC” Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Thomas Clayton “Tip / TC” Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Erma T. Williams",
    },
    { label: "Location", value: "Mississippi" },
    { label: "Evidence status", value: "Family history" },
  ],
  story:
    "Thomas Clayton “Tip / TC” Norwood was the son of Clayton Norwood and Erma T. Williams. He is associated with Mississippi. Family history records that he had daughters Vanessa and Denise, and that Vanessa is associated with Texas. These details are family-history notes, not confirmed documented records.",
  family: {
    spouseName: "",
    spouseRole: "",
    childrenText:
      "Family history records that Thomas Clayton “Tip / TC” Norwood had daughters Vanessa and Denise, and that Vanessa is associated with Texas. This is a family-history note, not a documented record.",
  },
  timeline: [
    {
      date: "Unknown",
      title: "Born",
      detail:
        "Thomas Clayton “Tip / TC” Norwood is born, the son of Clayton Norwood and Erma T. Williams. The date is not recorded in the family records gathered so far.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Thomas Clayton “Tip / TC” Norwood as a son of Clayton Norwood and Erma T. Williams, associated with Mississippi. It also records his daughters Vanessa and Denise, with Vanessa associated with Texas. These are family accounts, not documented records.",
    },
  ],
};

export const altonProfile: PersonProfile = {
  id: "alton",
  name: "Alton Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Alton Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Erma T. Williams",
    },
    { label: "Location", value: "Chicago" },
    { label: "Evidence status", value: "Limited" },
  ],
  story:
    "Alton Norwood was the son of Clayton Norwood and Erma T. Williams. He is associated with Chicago. No additional details about his life are currently recorded in the family records gathered so far.",
  family: {
    spouseName: "",
    spouseRole: "",
    childrenText: "",
  },
  timeline: [
    {
      date: "Unknown",
      title: "Born",
      detail:
        "Alton Norwood is born, the son of Clayton Norwood and Erma T. Williams. The date is not recorded in the family records gathered so far.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Alton as a son of Clayton Norwood and Erma T. Williams, associated with Chicago. No additional details about him are currently recorded.",
    },
  ],
};

export const robertDavisProfile: PersonProfile = {
  id: "robert-davis",
  name: "Robert Davis “RD” Norwood",
  role: "Son",
  portrait: {
    src: "/assets/images/placeholder.svg",
    alt: "An initials placeholder portrait for Robert Davis “RD” Norwood, since no photograph of him is known to exist.",
  },
  facts: [
    {
      label: "Parents",
      value: "Clayton Norwood and Erma T. Williams",
    },
    { label: "Born", value: "Aug. 22, 1927" },
    { label: "Died", value: "March 28, 1987" },
    { label: "Location", value: "Los Angeles" },
    { label: "Evidence status", value: "Limited" },
  ],
  story:
    "Robert Davis “RD” Norwood was the son of Clayton Norwood and Erma T. Williams. His recorded dates are Aug. 22, 1927 – March 28, 1987, and he is associated with Los Angeles. No additional details about his life are currently recorded in the family records gathered so far.",
  family: {
    spouseName: "",
    spouseRole: "",
    childrenText: "",
  },
  timeline: [
    {
      date: "Aug. 22, 1927",
      title: "Born",
      detail:
        "Robert Davis “RD” Norwood is born, the son of Clayton Norwood and Erma T. Williams.",
    },
    {
      date: "March 28, 1987",
      title: "Died",
      detail: "Robert Davis “RD” Norwood dies.",
    },
  ],
  sources: [
    {
      kind: "family-history",
      title: "Family Research Notes",
      source: "NORWOOD FAMILY CONNECTION (From Alonzo Smith)",
      detail:
        "A family-history note identifying Robert Davis “RD” Norwood as a son of Clayton Norwood and Erma T. Williams, with recorded dates of Aug. 22, 1927 – March 28, 1987, and an association with Los Angeles. These are family accounts, not documented records.",
    },
  ],
};

export const profiles: Record<string, PersonProfile> = {
  julia: juliaProfile,
  isaiah: isaiahProfile,
  clayton: claytonProfile,
  erma: ermaProfile,
  hudson: msHudsonProfile,
  elbert: elbertProfile,
  wellman: wellmanProfile,
  wetherby: wetherbyProfile,
  columbus: columbusProfile,
  "thomas-clayton": thomasClaytonProfile,
  alton: altonProfile,
  "robert-davis": robertDavisProfile,
};

interface PersonProfilePageProps {
  onBack: () => void;
  person: PersonProfile;
  profilePhoto?: string;
  onProfilePhotoChange: (personId: string, url: string | null) => void;
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

const PLACEHOLDER_SRC = "/assets/images/placeholder.svg";

interface CompletenessField {
  label: string;
  done: boolean;
}

function computeCompleteness(
  person: PersonProfile,
  hasProfilePhoto: boolean,
): {
  fields: CompletenessField[];
  done: number;
  total: number;
  percent: number;
} {
  const fields: CompletenessField[] = [
    {
      label: "Photo",
      done: hasProfilePhoto || person.portrait.src !== PLACEHOLDER_SRC,
    },
    {
      label: "Birth information",
      done: person.facts.some(
        (fact) => fact.label === "Born" || fact.label === "Birth year",
      ),
    },
    {
      label: "Death information",
      done: person.facts.some((fact) => fact.label === "Died"),
    },
    {
      label: "Family relationships",
      done: Boolean(
        person.family.spouseName || (person.family.spouses?.length ?? 0) > 0,
      ),
    },
    { label: "Story", done: Boolean(person.story) },
    { label: "Timeline", done: person.timeline.length > 0 },
    { label: "Sources", done: person.sources.length > 0 },
  ];
  const done = fields.filter((field) => field.done).length;
  const percent = Math.round((done / fields.length) * 100);
  return { fields, done, total: fields.length, percent };
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

interface PhotoGalleryProps {
  personId: string;
  personName: string;
  onProfilePhotoChange: (personId: string, url: string | null) => void;
}

function PhotoGallery({
  personId,
  personName,
  onProfilePhotoChange,
}: PhotoGalleryProps) {
  const { data: photos = [], isLoading } = usePhotos(personId);
  const { data: profilePhoto, isLoading: profilePhotoLoading } =
    useProfilePhoto(personId);
  const addPhoto = useAddPhoto();
  const setProfilePhoto = useSetProfilePhoto();
  const removePhoto = useRemovePhoto();
  const [progress, setProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Report the loaded profile photo up to App so it can be shared with the
  // profile header and the Family Tree card. Always report, including null, so
  // a removed profile photo clears the shared App state instead of leaving a
  // stale photo behind. Skip while the query is still loading so the initial
  // mount does not wipe a previously-set profile photo from App's state.
  useEffect(() => {
    if (profilePhotoLoading) return;
    onProfilePhotoChange(
      personId,
      profilePhoto ? profilePhoto.blob.getDirectURL() : null,
    );
  }, [profilePhoto, personId, onProfilePhotoChange, profilePhotoLoading]);

  const profilePhotoUrl = profilePhoto?.blob.getDirectURL();

  const handleFile = async (file: File) => {
    if (!file) return;
    setProgress(0);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = ExternalBlob.fromBytes(
      bytes,
      file.type,
      file.name,
    ).withUploadProgress(setProgress);
    addPhoto.mutate(
      { personId, blob, filename: file.name, mimeType: file.type },
      {
        onSuccess: () => setProgress(null),
        onError: () => setProgress(null),
      },
    );
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {photos.length === 0
            ? "No photos have been added yet."
            : `${photos.length} photo${photos.length === 1 ? "" : "s"} in the gallery.`}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          data-ocid="profile.add_photo_input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          data-ocid="profile.add_photo_button"
          onClick={() => fileInputRef.current?.click()}
          disabled={addPhoto.isPending}
          className="add-photo-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          {addPhoto.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          {addPhoto.isPending ? "Uploading…" : "Add Photo"}
        </button>
      </div>

      {progress !== null && (
        <div className="mt-3" data-ocid="profile.upload_progress">
          <div
            className="progress-track"
            role="progressbar"
            tabIndex={0}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploading… {progress}%
          </p>
        </div>
      )}

      {isLoading ? (
        <div
          data-ocid="profile.gallery.loading_state"
          className="mt-3 grid grid-cols-3 gap-3"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={`skeleton-${i}`}
              className="aspect-square animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div
          data-ocid="profile.gallery.empty_state"
          className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-center shadow-subtle"
        >
          <Camera
            className="mx-auto h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="mt-2 font-display text-base font-semibold text-foreground">
            No photos yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a photo to build {personName.split(" ")[0]}'s gallery.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {photos.map((photo: Photo, index) => {
            const url = photo.blob.getDirectURL();
            const isProfile = url === profilePhotoUrl;
            return (
              <div
                key={photo.id.toString()}
                className="gallery-thumb group"
                data-ocid={`profile.gallery.item.${index + 1}`}
              >
                <img
                  src={url}
                  alt={photo.filename}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                {isProfile && (
                  <span
                    data-ocid={`profile.gallery.item.${index + 1}.profile_badge`}
                    className="photo-badge absolute left-2 top-2"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Profile
                  </span>
                )}
                <div className="photo-hover-overlay">
                  <button
                    type="button"
                    data-ocid={`profile.gallery.item.${index + 1}.set_profile`}
                    onClick={() =>
                      setProfilePhoto.mutate({ personId, photoId: photo.id })
                    }
                    disabled={isProfile || setProfilePhoto.isPending}
                    className="set-profile-photo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                  >
                    {isProfile ? "Profile Photo" : "Set as Profile Photo"}
                  </button>
                  <button
                    type="button"
                    data-ocid={`profile.gallery.item.${index + 1}.remove`}
                    onClick={() =>
                      removePhoto.mutate({ personId, photoId: photo.id })
                    }
                    disabled={removePhoto.isPending}
                    aria-label={`Remove ${photo.filename}`}
                    className="remove-photo-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhotosSection({
  person,
  onProfilePhotoChange,
}: {
  person: PersonProfile;
  onProfilePhotoChange: (personId: string, url: string | null) => void;
}) {
  const providersPresent = useProvidersPresent();
  return (
    <motion.section
      aria-label="Photos"
      className="mt-10"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.12, ease: [0.4, 0, 0.2, 1] }}
    >
      <SectionHeader icon={Camera} label="Photos" />
      {providersPresent ? (
        <PhotoGallery
          personId={person.id}
          personName={person.name}
          onProfilePhotoChange={onProfilePhotoChange}
        />
      ) : (
        <div
          data-ocid="profile.gallery.empty_state"
          className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-center shadow-subtle"
        >
          <Camera
            className="mx-auto h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="mt-2 font-display text-base font-semibold text-foreground">
            No photos yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a photo to build {person.name.split(" ")[0]}'s gallery.
          </p>
        </div>
      )}
    </motion.section>
  );
}

export function PersonProfilePage({
  onBack,
  person,
  profilePhoto,
  onProfilePhotoChange,
}: PersonProfilePageProps) {
  const storyLabel =
    person.id === "julia" || person.id === "erma" || person.id === "hudson"
      ? "Her Story"
      : "His Story";

  const hasProfilePhoto = Boolean(profilePhoto);
  const completeness = computeCompleteness(person, hasProfilePhoto);
  const portraitSrc = profilePhoto ?? person.portrait.src;
  const portraitAlt = profilePhoto
    ? `${person.name}'s profile photo`
    : person.portrait.alt;

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
            {portraitSrc ? (
              <img
                src={portraitSrc}
                alt={portraitAlt}
                className="aspect-[4/5] w-full rounded-xl object-cover"
                loading="lazy"
              />
            ) : (
              <div
                data-ocid="profile.header.initials"
                className="flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-secondary"
              >
                <span className="font-display text-6xl font-semibold text-accent-foreground">
                  {getInitials(person.name)}
                </span>
              </div>
            )}
          </div>
          <figcaption className="mt-2 text-center text-xs italic leading-relaxed text-muted-foreground">
            {profilePhoto
              ? "Uploaded profile photo."
              : `Representative historical portrait — not an actual photograph of ${person.name.split(" ")[0]} Norwood.`}
          </figcaption>
        </figure>

        {/* Profile completeness indicator */}
        <div
          data-ocid="profile.completeness"
          className="mt-6 w-full max-w-md rounded-2xl border border-border bg-card px-4 py-3 shadow-subtle"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Profile completeness
            </p>
            <span className="completeness-pill">{completeness.percent}%</span>
          </div>
          <div
            className="progress-track mt-2"
            role="progressbar"
            tabIndex={0}
            aria-valuenow={completeness.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completeness"
          >
            <div
              className="progress-fill"
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {completeness.fields.map((field) => (
              <span
                key={field.label}
                className={`inline-flex items-center gap-1 text-[11px] ${
                  field.done ? "text-muted-foreground" : "text-destructive"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    field.done ? "bg-success" : "bg-destructive"
                  }`}
                  aria-hidden="true"
                />
                {field.label}
              </span>
            ))}
          </div>
        </div>

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
            {person.family.spouses ? (
              person.family.spouses.map((spouse) => (
                <div
                  key={spouse.name}
                  className="rounded-2xl border border-border bg-card px-4 py-3 shadow-subtle"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-base font-semibold text-accent-foreground">
                      {spouse.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold text-foreground">
                        {spouse.name}
                      </p>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {spouse.role}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Children: {spouse.children.join(", ")}
                  </p>
                </div>
              ))
            ) : (
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
            )}
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
              const isUnresolved = source.kind === "unresolved";
              const Icon = isDocumented
                ? FileText
                : isUnresolved
                  ? AlertTriangle
                  : NotebookPen;
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
                              : isUnresolved
                                ? "bg-destructive/15 text-destructive"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {isDocumented
                            ? "Documented record"
                            : isUnresolved
                              ? "Unresolved conflict"
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

      {/* Photos */}
      <PhotosSection
        person={person}
        onProfilePhotoChange={onProfilePhotoChange}
      />
    </div>
  );
}
