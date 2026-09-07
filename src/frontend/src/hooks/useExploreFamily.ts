import { useMemo } from "react";
import {
  type PersonProfile,
  backendProfileToPersonProfile,
} from "../pages/PersonProfilePage";
import {
  FAMILY_GRAPH,
  type FamilyRelations,
  getClosestRelatives,
  overlayConfirmedRelationships,
  resolveDefaultFocus,
} from "../types/family";
import { usePersonProfile } from "./useProfileClaims";
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
 * Merge the canonical backend profile over the static profile record so the
 * focus card reflects saved edits (display name, birth date -> years, story)
 * while preserving static-only presentation data (portrait, family,
 * relation-to-you). Canonical facts win per-label; static facts not present in
 * the canonical record are kept so years never disappear when the backend has
 * no birth date.
 */
function mergeCanonicalProfile(
  staticProfile: PersonProfile | undefined,
  canonical: PersonProfile,
): PersonProfile {
  if (!staticProfile) return canonical;
  const canonicalByLabel = new Map(
    canonical.facts.map((fact) => [fact.label, fact]),
  );
  const staticLabels = new Set(staticProfile.facts.map((fact) => fact.label));
  const facts = [
    ...staticProfile.facts.map(
      (fact) => canonicalByLabel.get(fact.label) ?? fact,
    ),
    ...canonical.facts.filter((fact) => !staticLabels.has(fact.label)),
  ];
  return {
    ...staticProfile,
    name: canonical.name || staticProfile.name,
    facts,
    story: canonical.story || staticProfile.story,
  };
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
 * The focus person's profile is resolved from the shared canonical backend
 * store (keyed by personId) rather than the static `profiles` record, so a
 * saved profile edit — display name, birth date, story — reflects immediately
 * in the focus card. useUpdateOwnProfile invalidates the personProfile query
 * key on save, so the memo below recomputes with the fresh canonical data
 * without any route navigation or manual refresh. When no backend record
 * exists, the static profile is used unchanged.
 *
 * When `focusPersonId` is null, the focus resolves to the person marked "Me"
 * if present, otherwise the founding-couple anchor (Julia).
 */
export function useExploreFamily(
  focusPersonId: string | null,
  profiles: Record<string, PersonProfile>,
): ExploreFamilyState {
  const { data: confirmed = [] } = useListConfirmedRelationships();
  const resolvedId = focusPersonId ?? resolveDefaultFocus(profiles);
  // Resolve the focus person's canonical backend profile. This query is
  // invalidated by useUpdateOwnProfile on save, so the memo below recomputes
  // with the fresh canonical data immediately after a profile edit.
  const { data: backendProfile } = usePersonProfile(resolvedId);
  return useMemo(() => {
    const graph = overlayConfirmedRelationships(FAMILY_GRAPH, confirmed);
    const staticProfile = profiles[resolvedId];
    const focus = backendProfile
      ? mergeCanonicalProfile(
          staticProfile,
          backendProfileToPersonProfile(backendProfile),
        )
      : staticProfile;
    return {
      focusPersonId: resolvedId,
      focus,
      relatives: getClosestRelatives(resolvedId, graph),
    };
  }, [resolvedId, profiles, confirmed, backendProfile]);
}
