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

// jsdom does not implement HTMLCanvasElement.prototype.getContext, so it
// returns null and logs "Not implemented: HTMLCanvasElement.prototype
// .getContext (without installing the canvas npm package)". The archive PDF
// preview paints each page through a real 2D context and treats a null context
// as a render failure, so without this stub every PDF preview test would land
// in the error state for an environment reason rather than an application one.
//
// The stub returns a minimal, inert 2D context: the PDF.js renderer is mocked
// in these tests, so nothing actually draws, and the component only needs a
// truthy context to hand to page.render. Only the "2d" context id is stubbed;
// every other context type still delegates to jsdom.
const canvasContextStub = {
  save(): void {},
  restore(): void {},
  scale(): void {},
  translate(): void {},
  transform(): void {},
  setTransform(): void {},
  clearRect(): void {},
  fillRect(): void {},
  strokeRect(): void {},
  beginPath(): void {},
  closePath(): void {},
  moveTo(): void {},
  lineTo(): void {},
  rect(): void {},
  arc(): void {},
  fill(): void {},
  stroke(): void {},
  clip(): void {},
  drawImage(): void {},
  fillText(): void {},
  strokeText(): void {},
  measureText(): { width: number } {
    return { width: 0 };
  },
  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  },
  createPattern(): null {
    return null;
  },
  getImageData(): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: new Uint8ClampedArray(0), width: 0, height: 0 };
  },
  putImageData(): void {},
} as unknown as CanvasRenderingContext2D;

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: string,
  ...rest: unknown[]
): CanvasRenderingContext2D | null {
  // jsdom's own implementation logs "Not implemented" and returns null, so it
  // is never consulted for a 2D context; the inert stub stands in for it.
  if (contextId === "2d") {
    return canvasContextStub;
  }
  return originalGetContext.call(
    this,
    contextId as "2d",
    ...(rest as []),
  ) as CanvasRenderingContext2D | null;
} as typeof HTMLCanvasElement.prototype.getContext;
