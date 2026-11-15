import datePickerStyles from "~/components/arc/date-picker/date-picker.module.css";
import { placeCalendar } from "./DateValue";

interface Geometry {
  /** The visible viewport's size. */
  viewport: { width: number; height: number };
  /** The value's box in the viewport. */
  anchor: { left: number; top: number; width: number; height: number };
  /** The calendar's layout size. */
  panel: { width: number; height: number };
}

/** Builds the picker's elements with the given layout, and places it. */
function place({ viewport, anchor, panel }: Geometry) {
  vi.stubGlobal("visualViewport", {
    offsetLeft: 0,
    offsetTop: 0,
    width: viewport.width,
    height: viewport.height,
  });
  const stack = document.createElement("div");
  const anchorElement = document.createElement("div");
  anchorElement.className = String(datePickerStyles.anchor);
  const panelElement = document.createElement("div");
  panelElement.className = String(datePickerStyles.popover);
  anchorElement.appendChild(panelElement);
  stack.appendChild(anchorElement);
  anchorElement.getBoundingClientRect = () =>
    new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height);
  Object.defineProperty(panelElement, "offsetWidth", { value: panel.width });
  Object.defineProperty(panelElement, "offsetHeight", { value: panel.height });
  placeCalendar(stack);
  return {
    stack,
    shift: stack.style.getPropertyValue("--calendar-x"),
    maxHeight: stack.style.getPropertyValue("--calendar-max-height"),
    side: stack.dataset.calendarSide ?? "below",
    scrolls: stack.dataset.calendarScroll !== undefined,
  };
}

const tablet = { width: 768, height: 780 };
const calendar = { width: 320, height: 424 };

describe("placeCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shifts back from the end edge instead of widening the page", () => {
    const placed = place({
      viewport: tablet,
      anchor: { left: 491, top: 200, width: 229, height: 34 },
      panel: calendar,
    });
    // 768 - 8 margin - 320 wide - 491 = -51: the calendar ends at 760.
    expect(placed.shift).toBe("-51px");
    expect(placed.side).toBe("below");
    expect(placed.scrolls).toBe(false);
  });

  it("stays at the value's edge when it fits, as on a phone", () => {
    const placed = place({
      viewport: { width: 320, height: 640 },
      anchor: { left: 16, top: 120, width: 288, height: 34 },
      panel: { width: 288, height: 424 },
    });
    expect(placed.shift).toBe("");
    expect(placed.side).toBe("below");
    expect(placed.scrolls).toBe(false);
  });

  it("opens above when it only fits there", () => {
    const placed = place({
      viewport: tablet,
      anchor: { left: 200, top: 600, width: 300, height: 34 },
      panel: calendar,
    });
    expect(placed.side).toBe("above");
    expect(placed.scrolls).toBe(false);
  });

  it("scrolls within the side with more room when it fits on neither", () => {
    const placed = place({
      viewport: tablet,
      anchor: { left: 200, top: 390, width: 300, height: 34 },
      panel: calendar,
    });
    // Above has 390 - 8 margin - 8 gap = 374px; below has 340px.
    expect(placed.side).toBe("above");
    expect(placed.scrolls).toBe(true);
    expect(placed.maxHeight).toBe("374px");
  });

  it("never starts before the viewport's leading edge", () => {
    const placed = place({
      viewport: tablet,
      anchor: { left: 2, top: 100, width: 300, height: 34 },
      panel: calendar,
    });
    expect(placed.shift).toBe("6px");
  });
});
