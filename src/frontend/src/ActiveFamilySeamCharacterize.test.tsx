import "@testing-library/jest-dom/vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FAMILY_ID,
  FamilyProvider,
  useActiveFamily,
  useActiveFamilyId,
  useFamilyScopedId,
} from "./context/FamilyContext";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped New Person Candidate change:
// the frontend active-family seam.
//
// Every family-aware hook in the app (including the candidate hooks the change
// makes family-aware) decides between the legacy no-argument call and the
// canonical `*ForFamily` call by reading `useFamilyScopedId()`. The contract is:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook makes the legacy call and keeps the legacy React Query key;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// This file freezes the DEFAULT-family half of that seam, which the candidate
// change must preserve: if the default family ever resolved to "norwood" instead
// of `undefined`, every default-family candidate call would silently move onto a
// `*ForFamily` endpoint and the legacy Norwood behavior would change.
//
// The non-default half is exercised by the `*FamilyScopedCallShape.cover`
// files, which mount `FamilyProvider familyId={FAMILY_A}`.
//
// This is a pure hook/context characterization; it does not touch the backend.
// ---------------------------------------------------------------------------

afterEach(cleanup);

function defaultWrapper({ children }: { children: ReactNode }) {
  return <FamilyProvider>{children}</FamilyProvider>;
}

function familyAWrapper({ children }: { children: ReactNode }) {
  return <FamilyProvider familyId="test-family-a">{children}</FamilyProvider>;
}

describe("active-family seam: default family resolves to the legacy call (characterization)", () => {
  it("resolves familyScopedId to undefined for the default family", () => {
    const { result } = renderHook(() => useFamilyScopedId(), {
      wrapper: defaultWrapper,
    });
    // `undefined` is what makes a hook choose the legacy no-argument endpoint.
    expect(result.current).toBeUndefined();
  });

  it("reports the default family id as the active family", () => {
    const { result } = renderHook(
      () => ({ id: useActiveFamilyId(), family: useActiveFamily() }),
      { wrapper: defaultWrapper },
    );
    expect(result.current.id).toBe(DEFAULT_FAMILY_ID);
    expect(result.current.family.familyId).toBe(DEFAULT_FAMILY_ID);
    expect(result.current.family.familyScopedId).toBeUndefined();
  });

  it("falls back to the default family when no provider is mounted", () => {
    const { result } = renderHook(() => ({
      id: useActiveFamilyId(),
      scoped: useFamilyScopedId(),
    }));
    expect(result.current.id).toBe(DEFAULT_FAMILY_ID);
    expect(result.current.scoped).toBeUndefined();
  });

  it("resolves familyScopedId to the family id for a non-default family", () => {
    const { result } = renderHook(
      () => ({ id: useActiveFamilyId(), scoped: useFamilyScopedId() }),
      { wrapper: familyAWrapper },
    );
    expect(result.current.id).toBe("test-family-a");
    expect(result.current.scoped).toBe("test-family-a");
  });
});
