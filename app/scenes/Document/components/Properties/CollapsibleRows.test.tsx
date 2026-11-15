import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CollapsibleRows, rowReach } from "./CollapsibleRows";

declare global {
  // oxlint-disable-next-line no-var -- React reads this global to enable act()
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** Heights, in pixels, of the collapsed rows, the whole section, and the content. */
const geometry = { clamp: 148, limit: 192, content: 100 };
const observers = new Set<StubResizeObserver>();

class StubResizeObserver implements ResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    observers.add(this);
  }

  unobserve() {}

  disconnect() {
    observers.delete(this);
  }
}

/** Elements of the rows box are sized by `geometry`; others by `data-bottom`. */
function heightOf(element: HTMLElement) {
  if (element.dataset.bottom) {
    return Number(element.dataset.bottom);
  }
  if (!element.parentElement?.id) {
    return 0;
  }
  if (element.hasAttribute("data-limit")) {
    return geometry.limit;
  }
  return element.tagName === "SPAN" ? geometry.clamp : geometry.content;
}

function rect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width: 0,
    right: 0,
    height,
    bottom: height,
    toJSON: () => ({}),
  };
}

function rowsOf(heights: number[]) {
  let top = 0;
  return (
    <ul role="list">
      {heights.map((height, index) => {
        const row = (
          <li key={index} data-top={top} data-height={height}>
            <button type="button">Row {index + 1}</button>
            {height > geometry.clamp && (
              <button type="button" data-bottom={height - 8}>
                Low
              </button>
            )}
          </li>
        );
        top += height;
        return row;
      })}
    </ul>
  );
}

let container: HTMLDivElement;
let root: Root;

/** Starts a new root, so no state carries over. */
function remount() {
  act(() => root.unmount());
  root = createRoot(container);
}

async function render(
  heights: number[],
  { footer, signal = 0 }: { footer?: React.ReactNode; signal?: number } = {}
) {
  geometry.content = heights.reduce((sum, height) => sum + height, 0);
  await act(async () => {
    root.render(
      <CollapsibleRows expandSignal={signal} footer={footer}>
        {rowsOf(heights)}
      </CollapsibleRows>
    );
  });
}

/** Sizes the content and lets the observers and React settle. */
async function resize(content = geometry.content) {
  geometry.content = content;
  await act(async () => {
    for (const observer of observers) {
      observer.callback([], observer);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function toggle() {
  return container.querySelector<HTMLButtonElement>("button[aria-controls]");
}

function label() {
  return toggle()?.querySelector("[data-active]")?.textContent;
}

function inert() {
  return Array.from(container.querySelectorAll("li")).map((row) =>
    row.hasAttribute("inert")
  );
}

describe("rowReach", () => {
  const row = (top: number, height: number, focused = false, open = false) => ({
    top,
    height,
    focused,
    open,
  });

  it("hides rows ending below the fold, but never the first", () => {
    expect(
      rowReach([row(0, 40), row(40, 40), row(80, 40), row(120, 40)], 148)
    ).toEqual({ hidden: [false, false, false, true], expand: false });
    expect(rowReach([row(0, 300), row(300, 40)], 148).hidden).toEqual([
      false,
      true,
    ]);
  });

  it("opens instead for focus below the fold or an open list", () => {
    const opened = { hidden: [false, false], expand: true };
    expect(rowReach([row(0, 40), row(140, 40, true)], 148)).toEqual(opened);
    expect(rowReach([row(0, 40, false, true), row(140, 40)], 148)).toEqual(
      opened
    );
    expect(rowReach([row(0, 300), row(300, 40)], 148, 260)).toEqual(opened);
    expect(rowReach([row(0, 300), row(300, 40)], 148, 40).expand).toBe(false);
  });
});

describe("CollapsibleRows", () => {
  const originalMatchMedia = window.matchMedia;
  const originalResizeObserver = globalThis.ResizeObserver;
  const stubbed = [
    "getBoundingClientRect",
    "scrollIntoView",
    "offsetTop",
    "offsetHeight",
  ];
  const saved = new Map(
    stubbed.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
    ])
  );

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // Reduced motion, so every change lands at once.
    window.matchMedia = (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
    globalThis.ResizeObserver = StubResizeObserver;
    Object.defineProperties(HTMLElement.prototype, {
      getBoundingClientRect: {
        configurable: true,
        writable: true,
        value(this: HTMLElement) {
          return rect(heightOf(this));
        },
      },
      scrollIntoView: {
        configurable: true,
        writable: true,
        value: () => undefined,
      },
      offsetTop: {
        configurable: true,
        get(this: HTMLElement) {
          return Number(this.dataset.top ?? 0);
        },
      },
      offsetHeight: {
        configurable: true,
        get(this: HTMLElement) {
          return Number(this.dataset.height ?? 0);
        },
      },
    });
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
    globalThis.ResizeObserver = originalResizeObserver;
    for (const [name, descriptor] of saved) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, name);
      }
    }
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows no toggle while the rows fit", async () => {
    await render([40, 40]);
    expect(toggle()).toBeNull();
    expect(inert()).toEqual([false, false]);
  });

  it("lets read-only rows fill the footer's space before they overflow", async () => {
    await render([40, 40, 40, 45]);
    expect(toggle()).toBeNull();

    await render([40, 40, 40, 45], {
      footer: <button type="button">Add</button>,
    });
    expect(toggle()).not.toBeNull();
  });

  it("folds overflowing rows behind a toggle", async () => {
    await render([40, 40, 40, 40, 40]);
    const button = toggle();
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.getElementById(button?.getAttribute("aria-controls") ?? "")
    ).toBe(container.firstElementChild);
    expect(label()).toBe("Show more");
    expect(inert()).toEqual([false, false, false, true, true]);

    await act(async () => button?.click());
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(label()).toBe("Show less");
    expect(inert()).toEqual([false, false, false, false, false]);

    await act(async () => button?.click());
    expect(inert()).toEqual([false, false, false, true, true]);
  });

  it("opens at once for an open list, a new row, or focus below the fold", async () => {
    await render([40, 40, 40, 40, 40]);
    await act(async () => {
      container.querySelector("button")?.setAttribute("aria-expanded", "true");
    });
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");

    remount();
    await render([40, 40, 40, 40, 40]);
    await render([40, 40, 40, 40, 40, 40], { signal: 1 });
    await resize();
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(inert().includes(true)).toBe(false);

    remount();
    await render([300, 40]);
    expect(inert()).toEqual([false, true]);
    await act(async () => {
      container.querySelector<HTMLElement>("[data-bottom]")?.focus();
    });
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(inert()).toEqual([false, false]);
  });

  it("folds again after the rows fit", async () => {
    await render([40, 40, 40, 40, 40]);
    await act(async () => toggle()?.click());
    expect(label()).toBe("Show less");

    await resize(100);
    expect(toggle()).toBeNull();

    await resize(200);
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(label()).toBe("Show more");
  });
});
