import { useMemo } from "react";
import type { PersonProfile } from "../types/family";
import {
  type FamilyRelations,
  getClosestRelatives,
  resolveDefaultFocus,
} from "../types/family";

export interface ExploreFamilyState {
  /** The resolved focus person id (explicit focus or the default anchor). */
  focusPersonId: string;
  /** The focus person's profile, when one exists. */
  focus: PersonProfile | undefined;
  /** The focus person's closest relatives, grouped by relationship kind. */
  relatives: FamilyRelations;
}

/**
 * Core data logic for the Explore Family view. Given a focus person id and the
 * profiles record, returns the focus person plus their closest relatives
 * grouped by relation (father, mother, spouse, siblings, children) — each
 * group populated only when the family record documents it.
 *
 * When `focusPersonId` is null, the focus resolves to the person marked "Me"
 * if present, otherwise the founding-couple anchor (Julia).
 */
export function useExploreFamily(
  focusPersonId: string | null,
  profiles: Record<string, PersonProfile>,
): ExploreFamilyState {
  return useMemo(() => {
    const resolvedId = focusPersonId ?? resolveDefaultFocus(profiles);
    return {
      focusPersonId: resolvedId,
      focus: profiles[resolvedId],
      relatives: getClosestRelatives(resolvedId),
    };
  }, [focusPersonId, profiles]);
}
