import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver. The Explore Family SiblingsRail
// observes its scroll row with a ResizeObserver to show/hide the overflow
// arrows, so every test that renders the Explore Family view would otherwise
// throw "ResizeObserver is not defined" during effect mount. This stub reports
// no size change (arrows stay hidden) and never throws, which is all the
// component needs in a jsdom test where layout metrics are not real.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
