import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NotificationType,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
  RecoveryVerificationDecision,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useApproveRecovery,
  useRejectRecovery,
  useVerifyStewardRecovery,
} from "./hooks/useRecovery";
import { NOTIFICATION_TYPE_LABELS } from "./types/ownership";

// ---------------------------------------------------------------------------
// Characterization baseline for the Phase 4D recovery-notification change.
//
// The requested change will intentionally:
//
//   * make recovery lifecycle transitions emit NEW family-scoped notifications
//     to the affected recipients (candidate, Steward, verifiers);
//   * ADD new recovery notification types to the canonical notification type
//     set and render them with family-facing labels; and
//   * ADD a new authorized recovery-audit read.
//
// This file deliberately does NOT freeze any of those three behaviors. It does
// not assert that recovery transitions emit no notification, it does not assert
// the canonical type set is exactly the current twelve, and it does not assert
// anything about the audit read. Those are exactly what the change is allowed
// to alter.
//
// What it protects is the ADJACENT working behavior the additive change must
// not disturb:
//
//   A. The EXISTING canonical notification types are preserved. The change ADDS
//      recovery types; it must not remove or rename any existing type, or every
//      existing notification already stored under that type stops rendering.
//      The existing twelve are asserted as a SUBSET of the generated enum and
//      of the backend Motoko source, so an additive change passes and a removal
//      or rename fails.
//   B. The EXISTING family-facing labels for those types are preserved. The
//      change adds labels for the new recovery types; it must not reword an
//      existing type's label.
//   C. The EXISTING recovery approve / reject / verify action flows keep their
//      consumer contract: each calls the family-scoped backend action with the
//      ACTIVE family id, maps a request-change error to the neutral
//      `alreadySettled` state (never exposing a technical tag), and invalidates
//      only the active family's recovery cache. The new notification emission
//      is added around these transitions, so a regression here would break the
//      existing recovery flow.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits). Section A/B is a typed consumer-contract +
// static-source characterization of the generated bindings and the Motoko the
// bindings are generated from.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/src/frontend/src; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const ownershipTypes = stripComments(
  readBackend(path.join("types", "ownership.mo")),
);

/**
 * The twelve notification types that exist before the Phase 4D change. The
 * change ADDS recovery types; these must all survive.
 */
const EXISTING_NOTIFICATION_TYPES = [
  "ProfileClaimRequested",
  "ProfileClaimReviewed",
  "RelationshipRequested",
  "RelationshipReviewed",
  "BoardReply",
  "BoardMention",
  "NewMessage",
  "ResearchSubmission",
  "ResearchApproved",
  "ResearchRejected",
  "ArchiveApproved",
  "ArchiveRejected",
] as const;

/**
 * The existing family-facing label for each existing type. The change adds
 * labels for new recovery types; it must not reword these.
 */
const EXISTING_NOTIFICATION_LABELS: Record<string, string> = {
  ProfileClaimRequested: "Profile claim requested",
  ProfileClaimReviewed: "Profile claim reviewed",
  RelationshipRequested: "Relationship requested",
  RelationshipReviewed: "Relationship reviewed",
  BoardReply: "Board reply",
  BoardMention: "Board mention",
  NewMessage: "New message",
  ResearchSubmission: "Research submitted",
  ResearchApproved: "Research approved",
  ResearchRejected: "Research rejected",
  ArchiveApproved: "Archive contribution approved",
  ArchiveRejected: "Archive contribution rejected",
};

// ---------------------------------------------------------------------------
// A. The existing canonical notification types are preserved.
// ---------------------------------------------------------------------------

describe("existing canonical notification types (recovery-notification-adjacent baseline)", () => {
  it("keeps every existing notification type in the generated enum", () => {
    // The change adds recovery types to this enum. Every existing type must
    // still be present: a notification already stored under an existing type
    // must keep resolving to a known type.
    for (const type of EXISTING_NOTIFICATION_TYPES) {
      expect(NotificationType).toHaveProperty(type);
      expect(NotificationType[type as keyof typeof NotificationType]).toBe(
        type,
      );
    }
  });

  it("keeps every existing notification type in the backend Motoko source", () => {
    // The Motoko `NotificationType` variant set is the source of truth for the
    // generated binding. The additive change must not remove or rename an
    // existing variant.
    for (const type of EXISTING_NOTIFICATION_TYPES) {
      expect(ownershipTypes).toContain(`#${type};`);
    }
  });

  it("keeps the Notification record's family-scoped field set", () => {
    // The change adds notification emission, not a new Notification field. The
    // record the existing list/count/mark-read reads consume must keep its
    // shape.
    expect(ownershipTypes).toContain("public type Notification = {");
    for (const field of [
      "familyId : Text;",
      "id : Nat;",
      "recipient : Principal;",
      "notificationType : NotificationType;",
      "message : Text;",
      "createdAt : Int;",
      "read : Bool;",
    ]) {
      expect(ownershipTypes).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// B. The existing family-facing labels are preserved.
// ---------------------------------------------------------------------------

describe("existing notification type labels (recovery-notification-adjacent baseline)", () => {
  it("keeps the family-facing label for every existing notification type", () => {
    // The change adds labels for the new recovery types. It must not reword an
    // existing type's label, or an existing notification's presentation
    // silently changes.
    for (const type of EXISTING_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_LABELS[type as NotificationType]).toBe(
        EXISTING_NOTIFICATION_LABELS[type],
      );
    }
  });

  it("keeps every existing label plain and free of internal enum names", () => {
    // The labels are family-facing: none may expose the raw enum name or a
    // technical tag.
    for (const type of EXISTING_NOTIFICATION_TYPES) {
      const label = NOTIFICATION_TYPE_LABELS[type as NotificationType];
      expect(label).not.toBe(type);
      expect(label).not.toMatch(/[A-Za-z]+[A-Z][a-z]+/u);
    }
  });
});

// ---------------------------------------------------------------------------
// C. The existing recovery approve / reject / verify action flows.
// ---------------------------------------------------------------------------

const ACCOUNT = "2vxsx-fae";
const OTHER_ACCOUNT = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetState, setOutcome } = vi.hoisted(() => {
  let outcome: "ok" | "alreadySettled" | "error" = "ok";
  const calls = {
    approveAccountRecoveryForFamily: [] as unknown[][],
    rejectRecoveryForFamily: [] as unknown[][],
    verifyStewardRecoveryForFamily: [] as unknown[][],
  };

  const mockActor = {
    async approveAccountRecoveryForFamily(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      calls.approveAccountRecoveryForFamily.push(args);
      if (outcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyResolved" };
      }
      if (outcome === "error") {
        return { __kind__: "err", err: "NotSteward" };
      }
      return { __kind__: "ok", ok: recoveryRequest() };
    },
    async rejectRecoveryForFamily(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      calls.rejectRecoveryForFamily.push(args);
      if (outcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyResolved" };
      }
      if (outcome === "error") {
        return { __kind__: "err", err: "NotSteward" };
      }
      return { __kind__: "ok", ok: recoveryRequest() };
    },
    async verifyStewardRecoveryForFamily(
      ...args: unknown[]
    ): Promise<
      { __kind__: "ok"; ok: RecoveryRequest } | { __kind__: "err"; err: string }
    > {
      calls.verifyStewardRecoveryForFamily.push(args);
      if (outcome === "alreadySettled") {
        return { __kind__: "err", err: "AlreadyVerifier" };
      }
      if (outcome === "error") {
        return { __kind__: "err", err: "NotSignedIn" };
      }
      return { __kind__: "ok", ok: recoveryRequest() };
    },
  };

  return {
    mockActor,
    calls,
    resetState: () => {
      outcome = "ok";
      calls.approveAccountRecoveryForFamily.length = 0;
      calls.rejectRecoveryForFamily.length = 0;
      calls.verifyStewardRecoveryForFamily.length = 0;
    },
    setOutcome: (next: "ok" | "alreadySettled" | "error") => {
      outcome = next;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isInitializing: false,
    accountId: ACCOUNT,
    signOut: () => {},
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
});

function recoveryRequest(
  overrides: Partial<RecoveryRequest> = {},
): RecoveryRequest {
  return {
    familyId: FAMILY_A,
    id: 7n,
    recoveryType: RecoveryType.AccountRecovery,
    personId: "lula-mae",
    ownerAccountId: Principal.fromText(OTHER_ACCOUNT),
    replacementAccountId: Principal.fromText(ACCOUNT),
    status: RecoveryStatus.Pending,
    requestedByAccountId: Principal.fromText(ACCOUNT),
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    decidedByAccountId: undefined,
    decidedAt: undefined,
    transferredAt: undefined,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

describe("existing recovery approve action (recovery-notification-adjacent baseline)", () => {
  it("approves with the active family id and returns the approved outcome", async () => {
    const { result } = renderHook(() => useApproveRecovery(), { wrapper });

    const outcome = await result.current.mutateAsync({ recoveryId: 11n });

    expect(outcome.kind).toBe("approved");
    expect(calls.approveAccountRecoveryForFamily).toEqual([[FAMILY_A, 11n]]);
    // The active family id is used, never a hard-coded default.
    expect(calls.approveAccountRecoveryForFamily[0]?.[0]).not.toBe("norwood");
  });

  it("maps a request-change error to the neutral alreadySettled state", async () => {
    setOutcome("alreadySettled");
    const { result } = renderHook(() => useApproveRecovery(), { wrapper });

    const outcome = await result.current.mutateAsync({ recoveryId: 12n });

    // The technical tag is never surfaced: the UI gets the neutral state.
    expect(outcome).toEqual({ kind: "alreadySettled" });
  });

  it("maps a non-request-change error to the neutral error state", async () => {
    setOutcome("error");
    const { result } = renderHook(() => useApproveRecovery(), { wrapper });

    const outcome = await result.current.mutateAsync({ recoveryId: 13n });

    expect(outcome).toEqual({ kind: "error" });
  });
});

describe("existing recovery reject action (recovery-notification-adjacent baseline)", () => {
  it("rejects with the active family id and returns the rejected outcome", async () => {
    const { result } = renderHook(() => useRejectRecovery(), { wrapper });

    const outcome = await result.current.mutateAsync({ recoveryId: 21n });

    expect(outcome.kind).toBe("rejected");
    expect(calls.rejectRecoveryForFamily).toEqual([[FAMILY_A, 21n]]);
  });

  it("maps a request-change error to the neutral alreadySettled state", async () => {
    setOutcome("alreadySettled");
    const { result } = renderHook(() => useRejectRecovery(), { wrapper });

    const outcome = await result.current.mutateAsync({ recoveryId: 22n });

    expect(outcome).toEqual({ kind: "alreadySettled" });
  });
});

describe("existing recovery verify action (recovery-notification-adjacent baseline)", () => {
  it("verifies with the active family id, the recovery id, and the decision", async () => {
    const { result } = renderHook(() => useVerifyStewardRecovery(), {
      wrapper,
    });

    const outcome = await result.current.mutateAsync({
      recoveryId: 31n,
      decision: RecoveryVerificationDecision.Confirm,
    });

    expect(outcome.kind).toBe("confirmed");
    expect(calls.verifyStewardRecoveryForFamily).toEqual([
      [FAMILY_A, 31n, RecoveryVerificationDecision.Confirm],
    ]);
  });

  it("maps a Dispute decision to the disputed outcome", async () => {
    const { result } = renderHook(() => useVerifyStewardRecovery(), {
      wrapper,
    });

    const outcome = await result.current.mutateAsync({
      recoveryId: 32n,
      decision: RecoveryVerificationDecision.Reject,
    });

    expect(outcome.kind).toBe("disputed");
  });

  it("maps a request-change error to the neutral alreadySettled state", async () => {
    setOutcome("alreadySettled");
    const { result } = renderHook(() => useVerifyStewardRecovery(), {
      wrapper,
    });

    const outcome = await result.current.mutateAsync({
      recoveryId: 33n,
      decision: RecoveryVerificationDecision.Confirm,
    });

    expect(outcome).toEqual({ kind: "alreadySettled" });
  });
});

describe("existing recovery action cache invalidation (recovery-notification-adjacent baseline)", () => {
  it("invalidates only the active family's recovery cache after an approval", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useApproveRecovery(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ recoveryId: 41n });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    const filter = invalidateSpy.mock.calls[0]?.[0] as {
      predicate?: (query: { queryKey: unknown[] }) => boolean;
    };
    expect(filter.predicate).toBeTypeOf("function");
    // The filter is family-exact: it matches the active family and never
    // another family's recovery cache.
    expect(
      filter.predicate?.({ queryKey: ["recovery", FAMILY_A, "stewardQueue"] }),
    ).toBe(true);
    expect(
      filter.predicate?.({ queryKey: ["recovery", FAMILY_B, "stewardQueue"] }),
    ).toBe(false);

    invalidateSpy.mockRestore();
  });
});
