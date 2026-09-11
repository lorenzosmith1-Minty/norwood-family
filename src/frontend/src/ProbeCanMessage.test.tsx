import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCanMessagePerson } from "./hooks/useMessaging";

const { mockActor, setCanMessage, getCalls } = vi.hoisted(() => {
  let canMessage = false;
  let calls = 0;
  const mockActor = {
    async canMessagePerson(): Promise<boolean> {
      calls += 1;
      return canMessage;
    },
  };
  return {
    mockActor,
    setCanMessage: (v: boolean) => {
      canMessage = v;
    },
    getCalls: () => calls,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
}));

function Probe() {
  const { data } = useCanMessagePerson("julia");
  return <div data-testid="probe">{String(data)}</div>;
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("probe", () => {
  it("resolves true", async () => {
    setCanMessage(true);
    renderProbe();
    await screen.findByTestId("probe");
    // eslint-disable-next-line no-console
    console.log("calls", getCalls());
    expect(await screen.findByTestId("probe")).toHaveTextContent("true");
  });
});
