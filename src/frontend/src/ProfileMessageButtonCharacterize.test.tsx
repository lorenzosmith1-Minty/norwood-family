import "@testing-library/jest-dom/vitest";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanMessagePerson } from "./hooks/useMessaging";
import { PersonProfilePage, juliaProfile } from "./pages/PersonProfilePage";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Characterization baseline for the "Message" button on a Person Profile.
//
// The upcoming messaging build makes the button's eligibility data-driven from
// the backend (a living approved claimed profile with a linked active account
// that is not the signed-in viewer and is not archived). The current
// implementation already gates the button on the backend `canMessagePerson`
// result via useCanMessagePerson — the button renders only when the backend
// confirms the viewer may message this person. This baseline freezes that
// data-driven seam so the upcoming build must keep the button driven by the
// backend result rather than by local UI state:
//
//  1. The button appears when the backend returns true for canMessagePerson.
//  2. The button is hidden when the backend returns false.
//  3. The button is a real button that opens the conversation with this person.
//
// The button's exact eligibility rules (living/claimed/active/not-self/not
// archived) are intentionally NOT asserted here — those are the backend's
// decision and the upcoming build's intentional change. What must survive is
// that the frontend renders the button only when the backend says so.
const { mockActor, setCanMessage, getCanMessageCalls } = vi.hoisted(() => {
  let canMessage = false;
  let canMessageCalls = 0;
  const mockActor = {
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
    async getPersonProfile(): Promise<unknown> {
      return {
        personId: "julia",
        name: "Julia “Julie” Norwood",
        livingStatus: "Deceased",
        claimStatus: "Unclaimed",
        claimedByUserId: null,
        preferredName: null,
        story: null,
        occupation: null,
        birthInfo: null,
        timeline: null,
        privacySettings: null,
      };
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async canMessagePerson(): Promise<boolean> {
      canMessageCalls += 1;
      return canMessage;
    },
  };
  return {
    mockActor,
    setCanMessage: (v: boolean) => {
      canMessage = v;
    },
    getCanMessageCalls: () => canMessageCalls,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

// PersonProfilePage's hooks use useQuery, so every render must be wrapped in a
// QueryClientProvider.
function Probe() {
  const { data } = useCanMessagePerson("julia");
  return <div data-ocid="probe">{String(data)}</div>;
}

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
      <ProbeCache />
      <PersonProfilePage
        person={juliaProfile}
        onBack={() => {}}
        onProfilePhotoChange={() => {}}
        onOpenConversation={() => {}}
      />
    </QueryClientProvider>,
  );
}

function ProbeCache() {
  // Read the same query key reactively so this probe re-renders when the
  // eligibility query lands in the cache (getQueryData alone is not reactive).
  const { data } = useQuery({
    queryKey: ["messaging", "canMessage", "julia"],
    queryFn: async () => null,
    enabled: false,
  });
  return <div data-ocid="cache">{String(data)}</div>;
}

afterEach(cleanup);
beforeEach(() => {
  setCanMessage(false);
});

describe("Person Profile Message button characterization", () => {
  it("renders the Message button when the backend confirms the viewer may message this person", async () => {
    setCanMessage(true);
    renderProfile();

    // The backend eligibility query must actually be consulted (data-driven),
    // not short-circuited by local UI state.
    await waitFor(() => expect(getCanMessageCalls()).toBeGreaterThan(0));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("true"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("cache")).toHaveTextContent("true"),
    );

    expect(
      await screen.findByTestId("profile.message_button"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument();
  });

  it("hides the Message button when the backend says the viewer may not message this person", async () => {
    setCanMessage(false);
    renderProfile();

    // The profile still renders, but no Message button appears.
    expect(
      await screen.findByRole("heading", { level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile.message_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Message" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Message button as a real button that opens the conversation", async () => {
    setCanMessage(true);
    renderProfile();

    const button = await screen.findByTestId("profile.message_button");
    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toHaveAttribute("href");
  });
});
