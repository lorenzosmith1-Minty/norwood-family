import { useMemo } from "react";
import type { PersonProfile } from "../types/family";
import {
  FAMILY_GRAPH,
  type FamilyRelations,
  getClosestRelatives,
  overlayConfirmedRelationships,
  resolveDefaultFocus,
} from "../types/family";
import { useListConfirmedRelationships } from "./useRelationshipRequests";

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
 * The shared FAMILY_GRAPH is overlaid with the backend's confirmed
 * relationships at render time, so approved relationship requests automatically
 * appear in the constellation without mutating the static graph. When the user
 * is not signed in (no confirmed relationships loaded), the view falls back to
 * the static graph unchanged.
 *
 * When `focusPersonId` is null, the focus resolves to the person marked "Me"
 * if present, otherwise the founding-couple anchor (Julia).
 */
export function useExploreFamily(
  focusPersonId: string | null,
  profiles: Record<string, PersonProfile>,
): ExploreFamilyState {
  const { data: confirmed = [] } = useListConfirmedRelationships();
  return useMemo(() => {
    const graph = overlayConfirmedRelationships(FAMILY_GRAPH, confirmed);
    const resolvedId = focusPersonId ?? resolveDefaultFocus(profiles);
    return {
      focusPersonId: resolvedId,
      focus: profiles[resolvedId],
      relatives: getClosestRelatives(resolvedId, graph),
    };
  }, [focusPersonId, profiles, confirmed]);
}
