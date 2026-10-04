import "@testing-library/jest-dom/vitest";
import { RelationshipType } from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RelationshipRequestForm } from "./components/RelationshipRequestForm";
import { ReviewRequestsTab } from "./components/governance/ReviewRequestsTab";

// ---------------------------------------------------------------------------
// Cover for the multi-family isolation wiring of the changed frontend surfaces.
//
// The audit fix threaded the centralized active family (`useFamilyScopedId()`)
// into the family-scoped hooks used by these components. This file mounts the
// real components under a NON-default `FamilyProvider` and asserts that every
// family-scoped backend call receives the active familyId as its FIRST
// argument — never a bare record id alone, and never a hard-coded "norwood".
//
// It proves the component-to-hook wiring over a typed local actor mock. It does
// not exercise the real canister; the backend family boundary is covered by the
// PocketIC lane (see coverageLimits).
//
// The default-family contract (legacy no-familyId call) is frozen separately by
// the existing characterize/cover suites and is not weakened here.
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

type CallLog = Record<string, unknown[][]>;

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: CallLog = {
    listProfileClaims: [],
    listProfileClaimsForFamily: [],
    listRelationshipRequests: [],
    listRelationshipRequestsForFamily: [],
    approveProfileClaim: [],
    approveProfileClaimForFamily: [],
    rejectProfileClaim: [],
    rejectProfileClaimForFamily: [],
    approveRelationshipRequest: [],
    approveRelationshipRequestForFamily: [],
    rejectRelationshipRequest: [],
    rejectRelationshipRequestForFamily: [],
    setRelationshipRequestPending: [],
    setRelationshipRequestPendingForFamily: [],
    proposeRelationship: [],
    proposeRelationshipForFamily: [],
  };

  const mockActor = {
    async listProfileClaims(...args: unknown[]): Promise<unknown> {
      calls.listProfileClaims.push(args);
      return [];
    },
    async listProfileClaimsForFamily(...args: unknown[]): Promise<unknown> {
      calls.listProfileClaimsForFamily.push(args);
      return [];
    },
    async listRelationshipRequests(...args: unknown[]): Promise<unknown> {
      calls.listRelationshipRequests.push(args);
      return [];
    },
    async listRelationshipRequestsForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.listRelationshipRequestsForFamily.push(args);
      return [];
    },
    async approveProfileClaim(...args: unknown[]): Promise<unknown> {
      calls.approveProfileClaim.push(args);
      return null;
    },
    async approveProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      calls.approveProfileClaimForFamily.push(args);
      return null;
    },
    async rejectProfileClaim(...args: unknown[]): Promise<unknown> {
      calls.rejectProfileClaim.push(args);
      return null;
    },
    async rejectProfileClaimForFamily(...args: unknown[]): Promise<unknown> {
      calls.rejectProfileClaimForFamily.push(args);
      return null;
    },
    async approveRelationshipRequest(...args: unknown[]): Promise<unknown> {
      calls.approveRelationshipRequest.push(args);
      return null;
    },
    async approveRelationshipRequestForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.approveRelationshipRequestForFamily.push(args);
      return null;
    },
    async rejectRelationshipRequest(...args: unknown[]): Promise<unknown> {
      calls.rejectRelationshipRequest.push(args);
      return null;
    },
    async rejectRelationshipRequestForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.rejectRelationshipRequestForFamily.push(args);
      return null;
    },
    async setRelationshipRequestPending(...args: unknown[]): Promise<unknown> {
      calls.setRelationshipRequestPending.push(args);
      return null;
    },
    async setRelationshipRequestPendingForFamily(
      ...args: unknown[]
    ): Promise<unknown> {
      calls.setRelationshipRequestPendingForFamily.push(args);
      return null;
    },
    async proposeRelationship(...args: unknown[]): Promise<unknown> {
      calls.proposeRelationship.push(args);
      return { __kind__: "ok", ok: {} };
    },
    async proposeRelationshipForFamily(...args: unknown[]): Promise<unknown> {
      calls.proposeRelationshipForFamily.push(args);
      return { __kind__: "ok", ok: {} };
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls)) {
        calls[key].length = 0;
      }
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
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

function wrapperFor(familyId: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// ReviewRequestsTab: the Steward review surface reads and mutates only the
// active family's claims and relationship requests.
// ---------------------------------------------------------------------------

describe("ReviewRequestsTab: non-default family routes every call to the family endpoint (cover)", () => {
  it("reads claims and relationship requests for the active family, not the legacy endpoints", async () => {
    render(<ReviewRequestsTab />, { wrapper: wrapperFor(FAMILY_A) });

    await waitFor(() =>
      expect(calls.listProfileClaimsForFamily).toHaveLength(1),
    );
    await waitFor(() =>
      expect(calls.listRelationshipRequestsForFamily).toHaveLength(1),
    );

    // The active familyId is the FIRST positional argument.
    expect(calls.listProfileClaimsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listRelationshipRequestsForFamily).toEqual([[FAMILY_A]]);
    // The legacy no-familyId endpoints are never called for a non-default family.
    expect(calls.listProfileClaims).toEqual([]);
    expect(calls.listRelationshipRequests).toEqual([]);
  });

  it("passes the active familyId to the claim and relationship mutations", async () => {
    // Seed one pending claim and one pending relationship request so the action
    // buttons render.
    mockActor.listProfileClaimsForFamily = vi.fn(async (...args: unknown[]) => {
      calls.listProfileClaimsForFamily.push(args);
      return [
        {
          familyId: FAMILY_A,
          id: 7n,
          personId: "clayton",
          requestingUserId: OWNER,
          status: "Pending",
          submittedDate: 1n,
          reviewedBy: [],
          reviewedDate: [],
        },
      ];
    });
    mockActor.listRelationshipRequestsForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listRelationshipRequestsForFamily.push(args);
        return [
          {
            familyId: FAMILY_A,
            id: 9n,
            requestingPersonId: "clayton",
            relatedPersonId: "erma",
            proposedRelationship: RelationshipType.SpousePartner,
            status: "Pending",
            submittedDate: 1n,
            reviewer: [],
            reviewedDate: [],
          },
        ];
      },
    );

    const { container } = render(<ReviewRequestsTab />, {
      wrapper: wrapperFor(FAMILY_A),
    });

    const approveClaim = await waitFor(() => {
      const el = container.querySelector(
        '[data-ocid="governance.review.claim_approve_button.1"]',
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(approveClaim);
    await waitFor(() =>
      expect(calls.approveProfileClaimForFamily).toEqual([[FAMILY_A, 7n]]),
    );
    expect(calls.approveProfileClaim).toEqual([]);

    const approveRequest = await waitFor(() => {
      const el = container.querySelector(
        '[data-ocid="governance.review.request_approve_button.1"]',
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(approveRequest);
    await waitFor(() =>
      expect(calls.approveRelationshipRequestForFamily).toEqual([
        [FAMILY_A, 9n],
      ]),
    );
    expect(calls.approveRelationshipRequest).toEqual([]);
  });

  it("Family B reads Family B's records, never Family A's", async () => {
    render(<ReviewRequestsTab />, { wrapper: wrapperFor(FAMILY_B) });

    await waitFor(() =>
      expect(calls.listProfileClaimsForFamily).toHaveLength(1),
    );
    expect(calls.listProfileClaimsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listRelationshipRequestsForFamily).toEqual([[FAMILY_B]]);
    expect(calls.listProfileClaimsForFamily).not.toContainEqual([[FAMILY_A]]);
  });
});

// ---------------------------------------------------------------------------
// RelationshipRequestForm: proposing a relationship targets the active family.
// ---------------------------------------------------------------------------

describe("RelationshipRequestForm: non-default family proposes to the family endpoint (cover)", () => {
  it("calls proposeRelationshipForFamily(activeFamilyId, from, to, type)", async () => {
    const { container } = render(
      <RelationshipRequestForm fromPersonId="clayton" toPersonId="erma" />,
      { wrapper: wrapperFor(FAMILY_A) },
    );

    fireEvent.click(
      container.querySelector(
        `[data-ocid="relationship_request.option.${RelationshipType.SpousePartner}"]`,
      ) as HTMLElement,
    );
    fireEvent.click(
      container.querySelector(
        '[data-ocid="relationship_request.submit_button"]',
      ) as HTMLElement,
    );

    await waitFor(() =>
      expect(calls.proposeRelationshipForFamily).toEqual([
        [FAMILY_A, "clayton", "erma", RelationshipType.SpousePartner],
      ]),
    );
    expect(calls.proposeRelationship).toEqual([]);
  });

  it("Family B passes Family B's id as the first argument", async () => {
    const { container } = render(
      <RelationshipRequestForm fromPersonId="clayton" toPersonId="erma" />,
      { wrapper: wrapperFor(FAMILY_B) },
    );

    fireEvent.click(
      container.querySelector(
        `[data-ocid="relationship_request.option.${RelationshipType.Sibling}"]`,
      ) as HTMLElement,
    );
    fireEvent.click(
      container.querySelector(
        '[data-ocid="relationship_request.submit_button"]',
      ) as HTMLElement,
    );

    await waitFor(() =>
      expect(calls.proposeRelationshipForFamily).toEqual([
        [FAMILY_B, "clayton", "erma", RelationshipType.Sibling],
      ]),
    );
    expect(calls.proposeRelationship).toEqual([]);
  });
});
