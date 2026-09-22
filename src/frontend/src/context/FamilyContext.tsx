import { type ReactNode, createContext, useContext, useMemo } from "react";

/**
 * Centralized family tenancy configuration.
 *
 * This module is the SINGLE source of truth for the active family id in the
 * frontend. The literal family id lives here and nowhere else — components and
 * hooks must never hardcode a family id, they read it from this context.
 *
 * Tenancy 1C-A wires the active family through the frontend so the
 * family-scoped backend endpoints receive an explicit familyId. There is no
 * family selector UI yet: the active family is always the default Norwood
 * family, so every existing default-family behavior is preserved exactly.
 */

/**
 * The default (and, for now, only) family. This is the canonical Norwood
 * family id the backend backfilled every pre-existing record with. It is the
 * one place the literal is allowed to appear in the frontend.
 */
export const DEFAULT_FAMILY_ID = "norwood";

export interface FamilyContextValue {
  /** The active family id. */
  familyId: string;
  /**
   * The family id to pass to a family-scoped backend call, or `undefined` when
   * the active family is the default family.
   *
   * The backend's legacy endpoints already resolve the default family, so the
   * default family is expressed as the legacy call (no explicit familyId).
   * This keeps the default-family behavior byte-for-byte identical to before
   * the tenancy change while still letting a non-default family route to the
   * `*ForFamily` endpoints. Hooks pass this value straight through.
   */
  familyScopedId: string | undefined;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

/**
 * Provides the active family to the component tree. Defaults to the Norwood
 * family; a future family selector would supply a different id here without
 * touching any consumer.
 */
export function FamilyProvider({
  familyId = DEFAULT_FAMILY_ID,
  children,
}: {
  familyId?: string;
  children: ReactNode;
}) {
  const value = useMemo<FamilyContextValue>(
    () => ({
      familyId,
      familyScopedId: familyId === DEFAULT_FAMILY_ID ? undefined : familyId,
    }),
    [familyId],
  );
  return (
    <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
  );
}

/**
 * Read the active family. Falls back to the default family when no provider is
 * mounted (e.g. a bare test render), so consumers always receive a usable
 * family value and never crash outside the provider tree.
 */
export function useActiveFamily(): FamilyContextValue {
  const context = useContext(FamilyContext);
  return context ?? { familyId: DEFAULT_FAMILY_ID, familyScopedId: undefined };
}

/** The active family id (always defined). */
export function useActiveFamilyId(): string {
  return useActiveFamily().familyId;
}

/**
 * The family id to pass to a family-scoped backend call, or `undefined` for the
 * default family (which the backend's legacy endpoints already resolve).
 */
export function useFamilyScopedId(): string | undefined {
  return useActiveFamily().familyScopedId;
}
