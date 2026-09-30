import "@testing-library/jest-dom/vitest";
import { type Family, FamilyStatus } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipInactiveShell } from "./components/MembershipInactiveShell";
import { MembershipPendingShell } from "./components/MembershipPendingShell";
import { useActiveFamilyRecord } from "./hooks/useActiveFamilyRecord";
import * as membershipConfirmation from "./hooks/useMembershipConfirmation";

// ---------------------------------------------------------------------------
// Cover for the limited membership shells' FAMILY NAME and PENDING COPY.
//
// The accepted change requires that:
//
//   1. MembershipPendingShell and MembershipInactiveShell display the active
//      Family record's real `displayName` (read through the centralized
//      FamilyContext and the existing `getFamily` binding) — never a name
//      derived from the technical familyId;
//   2. a generated familyId suffix is never shown as the family name;
//   3. the default Norwood family still renders "Norwood Family";
//   4. the pending copy reflects trusted-relative confirmation plus Steward
//      escalation ("A family member may confirm your connection. If there is a
//      disagreement, a Family Steward will review it."), not universal Steward
//      review;
//   5. the obsolete notification-message parsing helpers
//      (parseConfirmationRequest / ConfirmationRequestRef) are gone from the
//      confirmation hook module, while the canonical eligible-confirmation
//      query (useMyEligibleMembershipConfirmations) remains.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls, setFamily } = vi.hoisted(() => {
  const calls: { getFamily: unknown[][] } = { getFamily: [] };

  let family: Family | null = null;

  const mockActor = {
    async getFamily(...args: unknown[]): Promise<Family | null> {
      calls.getFamily.push(args);
      return family;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.getFamily.length = 0;
      family = null;
    },
    setFamily: (value: Family | null) => {
      family = value;
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

afterEach(cleanup);
beforeEach(resetCalls);

function makeFamily(id: string, displayName: string): Family {
  return {
    id,
    status: FamilyStatus.active,
    displayName,
    createdAt: 1_700_000_000_000_000_000n,
    createdBy: OWNER,
  };
}

function renderWithFamily(familyId: string, node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={familyId}>{node}</FamilyProvider>
    </QueryClientProvider>,
  );
}

describe("pending shell: real family display name (cover)", () => {
  it("renders the active Family record's displayName, not a familyId-derived name", async () => {
    setFamily(makeFamily(DEFAULT_FAMILY_ID, "Norwood"));

    renderWithFamily(
      DEFAULT_FAMILY_ID,
      <MembershipPendingShell membershipId={7n} onSignOut={() => {}} />,
    );

    // The real Family.displayName renders as the family label.
    expect(await screen.findByText("Norwood Family")).toBeInTheDocument();
    // The read is scoped to the active family id.
    expect(calls.getFamily).toEqual([[DEFAULT_FAMILY_ID]]);
    // The technical familyId is never shown as the family name.
    expect(screen.queryByText(DEFAULT_FAMILY_ID)).toBeNull();
  });

  it("never shows a generated familyId suffix as the family name", async () => {
    // A generated family id whose suffix would be a plausible-looking name.
    const generatedId = "family-9f3c2a1b";
    setFamily(makeFamily(generatedId, "Rivera"));

    renderWithFamily(
      generatedId,
      <MembershipPendingShell membershipId={7n} onSignOut={() => {}} />,
    );

    expect(await screen.findByText("Rivera Family")).toBeInTheDocument();
    // Neither the raw id nor its suffix leaks into the rendered name.
    expect(screen.queryByText(generatedId)).toBeNull();
    expect(screen.queryByText("9f3c2a1b")).toBeNull();
    expect(screen.queryByText("family-9f3c2a1b Family")).toBeNull();
  });

  it("renders the trusted-relative confirmation plus Steward escalation copy, not universal Steward review", async () => {
    setFamily(makeFamily(DEFAULT_FAMILY_ID, "Norwood"));

    renderWithFamily(
      DEFAULT_FAMILY_ID,
      <MembershipPendingShell membershipId={7n} onSignOut={() => {}} />,
    );

    expect(
      await screen.findByText(
        "Your family connection is waiting for confirmation. A family member may confirm your connection. If there is a disagreement, a Family Steward will review it.",
      ),
    ).toBeInTheDocument();
    // The copy must not claim a Steward always reviews the connection.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/steward will review your connection/i);
    expect(text).not.toMatch(/under steward review/i);
  });

  it("falls back to a neutral 'Family' label when the record cannot be resolved", async () => {
    // No family record: the shell renders a neutral fallback rather than a
    // derived name.
    setFamily(null);

    renderWithFamily(
      DEFAULT_FAMILY_ID,
      <MembershipPendingShell membershipId={7n} onSignOut={() => {}} />,
    );

    expect(await screen.findByText("Family")).toBeInTheDocument();
    expect(screen.queryByText("Norwood Family")).toBeNull();
  });
});

describe("inactive shell: real family display name (cover)", () => {
  it("renders the active Family record's displayName for the suspended state", async () => {
    setFamily(makeFamily(DEFAULT_FAMILY_ID, "Norwood"));

    renderWithFamily(
      DEFAULT_FAMILY_ID,
      <MembershipInactiveShell kind="suspended" onSignOut={() => {}} />,
    );

    expect(await screen.findByText("Norwood Family")).toBeInTheDocument();
    expect(calls.getFamily).toEqual([[DEFAULT_FAMILY_ID]]);
    expect(screen.queryByText(DEFAULT_FAMILY_ID)).toBeNull();
  });

  it("renders the active Family record's displayName for the left state", async () => {
    const generatedId = "family-9f3c2a1b";
    setFamily(makeFamily(generatedId, "Rivera"));

    renderWithFamily(
      generatedId,
      <MembershipInactiveShell kind="left" onSignOut={() => {}} />,
    );

    expect(await screen.findByText("Rivera Family")).toBeInTheDocument();
    expect(screen.queryByText(generatedId)).toBeNull();
    expect(screen.queryByText("9f3c2a1b")).toBeNull();
  });
});

describe("confirmation hook module: obsolete parsing removed, canonical query kept (cover)", () => {
  it("no longer exports the notification-message parsing helpers", () => {
    const exports = membershipConfirmation as Record<string, unknown>;
    expect(exports.parseConfirmationRequest).toBeUndefined();
    expect(exports.ConfirmationRequestRef).toBeUndefined();
  });

  it("still exports the canonical eligible-confirmation query", () => {
    expect(
      typeof membershipConfirmation.useMyEligibleMembershipConfirmations,
    ).toBe("function");
  });
});

describe("active family record hook: family-scoped read (cover)", () => {
  it("reads getFamily with the active family id and exposes its displayName", async () => {
    setFamily(makeFamily(FAMILY_A, "Rivera"));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useActiveFamilyRecord(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.displayName).toBe("Rivera"));
    expect(calls.getFamily).toEqual([[FAMILY_A]]);
  });
});
