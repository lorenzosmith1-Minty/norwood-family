import {
  type FamilyInvitation,
  type FamilyInvitationCreated,
  FamilyInvitationError,
  InvitationStatus,
  InvitationType,
  type Result_42,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateFamilyInvitation } from "./hooks/useInvitation";

// ---------------------------------------------------------------------------
// Characterization baseline for the `useCreateFamilyInvitation` hook contract.
//
// The upcoming change narrows the Person Profile invite BUTTON gating and
// changes how the invite DIALOG handles a `Created` outcome whose
// `created` flag is false (an existing Pending invitation): the dialog must
// stop building a link from the empty rawToken and show neutral
// existing-invitation guidance instead.
//
// Neither change touches this hook. It must keep:
//
//   A. calling `createFamilyInvitation(familyId, personId, invitedEmail)` with
//      the exact arguments it is given;
//   B. mapping the backend's three-way outcome onto the discriminated
//      `CreateFamilyInvitationResult` — `Created` -> `{kind:'created', created}`,
//      `AlreadyMember` -> `{kind:'already-member'}`,
//      `RelationshipNotificationRequired` -> `{kind:'relationship-notification-required'}`;
//   C. mapping an `#err` result to `{kind:'error', error}` and RESOLVING rather
//      than rejecting, so the dialog can render neutral copy;
//   D. passing the `FamilyInvitationCreated` payload through faithfully,
//      including `created: false` with an empty `rawToken` — the hook reports
//      what the backend said; deciding what to render is the dialog's job.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls, setCreateResult } = vi.hoisted(() => {
  const calls: { createFamilyInvitation: unknown[][] } = {
    createFamilyInvitation: [],
  };

  let createResult: unknown = {
    __kind__: "err",
    err: "InvalidInput",
  };

  const mockActor = {
    async createFamilyInvitation(...args: unknown[]): Promise<unknown> {
      calls.createFamilyInvitation.push(args);
      return createResult;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.createFamilyInvitation.length = 0;
      createResult = { __kind__: "err", err: "InvalidInput" };
    },
    setCreateResult: (result: unknown) => {
      createResult = result;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeInvitation(
  overrides: Partial<FamilyInvitation> = {},
): FamilyInvitation {
  return {
    id: 1n,
    familyId: "norwood",
    personId: "clayton",
    invitedEmail: "relative@example.com",
    invitedByAccountId: OWNER,
    invitedByPersonId: undefined,
    invitationType: InvitationType.FamilyMember,
    tokenHash: "hash",
    status: InvitationStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    expiresAt: 1_800_000_000_000_000_000n,
    acceptedAt: undefined,
    acceptedByAccountId: undefined,
    cancelledAt: undefined,
    ...overrides,
  };
}

function makeCreated(
  overrides: Partial<FamilyInvitationCreated> = {},
): FamilyInvitationCreated {
  return {
    created: true,
    rawToken: "secure-token-abc",
    invitation: makeInvitation(),
    ...overrides,
  };
}

const INPUT = {
  familyId: "norwood",
  personId: "clayton",
  invitedEmail: "relative@example.com",
};

describe("useCreateFamilyInvitation call shape (characterization)", () => {
  it("calls createFamilyInvitation(familyId, personId, invitedEmail) with the given arguments", async () => {
    setCreateResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: makeCreated() },
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    await result.current.mutateAsync(INPUT);

    expect(calls.createFamilyInvitation).toEqual([
      ["norwood", "clayton", "relative@example.com"],
    ]);
  });

  it("passes a null invitedEmail straight through", async () => {
    setCreateResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: makeCreated() },
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    await result.current.mutateAsync({ ...INPUT, invitedEmail: null });

    expect(calls.createFamilyInvitation).toEqual([
      ["norwood", "clayton", null],
    ]);
  });
});

describe("useCreateFamilyInvitation outcome mapping (characterization)", () => {
  it("maps a Created outcome to {kind:'created'} and passes the payload through", async () => {
    const created = makeCreated({ rawToken: "tok-xyz" });
    setCreateResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: created },
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    const outcome = await result.current.mutateAsync(INPUT);

    expect(outcome).toEqual({ kind: "created", created });
  });

  it("passes a Created outcome with created:false and an empty rawToken through faithfully", async () => {
    // The backend reports an existing Pending invitation as Created with
    // created=false and an empty rawToken. The hook must not invent a token or
    // reinterpret the outcome; it reports exactly what the backend returned.
    const existing = makeCreated({ created: false, rawToken: "" });
    setCreateResult({
      __kind__: "ok",
      ok: { __kind__: "Created", Created: existing },
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    const outcome = await result.current.mutateAsync(INPUT);

    expect(outcome).toEqual({ kind: "created", created: existing });
    if (outcome.kind === "created") {
      expect(outcome.created.created).toBe(false);
      expect(outcome.created.rawToken).toBe("");
    }
  });

  it("maps an AlreadyMember outcome to {kind:'already-member'}", async () => {
    setCreateResult({
      __kind__: "ok",
      ok: { __kind__: "AlreadyMember", AlreadyMember: null },
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    const outcome = await result.current.mutateAsync(INPUT);

    expect(outcome).toEqual({ kind: "already-member" });
  });

  it("maps a RelationshipNotificationRequired outcome to {kind:'relationship-notification-required'}", async () => {
    setCreateResult({
      __kind__: "ok",
      ok: {
        __kind__: "RelationshipNotificationRequired",
        RelationshipNotificationRequired: null,
      },
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    const outcome = await result.current.mutateAsync(INPUT);

    expect(outcome).toEqual({ kind: "relationship-notification-required" });
  });

  it("maps an #err result to {kind:'error'} and resolves instead of rejecting", async () => {
    setCreateResult({
      __kind__: "err",
      err: FamilyInvitationError.NotAuthorized,
    } satisfies Result_42);

    const { result } = renderHook(() => useCreateFamilyInvitation(), {
      wrapper,
    });
    const outcome = await result.current.mutateAsync(INPUT);

    expect(outcome).toEqual({
      kind: "error",
      error: FamilyInvitationError.NotAuthorized,
    });
  });
});
