import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import type { PropertyOption } from "@shared/types/documentProperties";
import { buildDarkTheme, buildLightTheme } from "@shared/styles/theme";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { NotFoundError } from "~/utils/errors";
import { optionBadgePalette } from "./contrast";
import { OptionBadge } from "./OptionBadge";

declare global {
  // oxlint-disable-next-line no-var -- React reads this global to enable act()
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const post = vi.mocked(client.post);

let container: HTMLDivElement;
let root: Root;

async function render(option: PropertyOption, isDark = false) {
  const theme = isDark ? buildDarkTheme({}) : buildLightTheme({});
  await act(async () => {
    root.render(
      <Provider rootStore={stores}>
        <ThemeProvider theme={theme}>
          <OptionBadge option={option} />
        </ThemeProvider>
      </Provider>
    );
  });
  return theme;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("OptionBadge", () => {
  const originalMatchMedia = window.matchMedia;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  beforeEach(() => {
    post.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the label inside an Arc scope", async () => {
    await render({ id: "a", label: "To do", color: "#e5484d" });
    expect(container.textContent).toBe("To do");
    expect(container.querySelector("[data-arc-scope]")).not.toBeNull();
    expect(
      container.querySelector("[data-arc-scope]")?.getAttribute("data-theme")
    ).toBe("light");
  });

  it("follows the dark theme", async () => {
    await render({ id: "a", label: "To do" }, true);
    expect(
      container.querySelector("[data-arc-scope]")?.getAttribute("data-theme")
    ).toBe("dark");
  });

  it("paints the palette computed from the exact option color", async () => {
    const theme = await render({ id: "a", label: "To do", color: "#30a46c" });
    const expected = optionBadgePalette({
      color: "#30a46c",
      neutral: theme.textSecondary,
      surface: theme.background,
      foreground: theme.text,
      isDark: false,
    });
    const styles = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .concat(
        Array.from(document.querySelectorAll("style")).map(
          (style) => style.textContent ?? ""
        )
      )
      .join("\n")
      .replace(/:\s+/g, ": ");
    expect(styles).toContain(`--badge-background: ${expected.background}`);
    expect(styles).toContain(`--badge-foreground: ${expected.foreground}`);
  });

  it("shows a retired cue", async () => {
    await render({ id: "a", label: "Old", retired: true });
    expect(container.textContent).toContain("Retired");
    expect(container.querySelector("[data-retired]")).not.toBeNull();
  });

  describe("shimmer", () => {
    const originalIntersectionObserver = globalThis.IntersectionObserver;

    beforeAll(() => {
      globalThis.IntersectionObserver = class {
        root = null;
        rootMargin = "";
        scrollMargin = "";
        thresholds = [];
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      };
    });

    afterAll(() => {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    });

    it("sweeps the label with Arc's text shimmer, read once as plain text", async () => {
      await render({
        id: "a",
        label: "Urgent",
        color: "#e5484d",
        shimmer: true,
      });
      const sweep = container.querySelector(
        '[aria-hidden="true"] [data-state]'
      );
      expect(sweep?.textContent).toBe("Urgent");
      expect(sweep?.closest('[aria-hidden="true"]')).not.toBeNull();

      const read = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-testid=option-badge] span"
        )
      ).filter(
        (element) =>
          element.textContent === "Urgent" &&
          !element.closest('[aria-hidden="true"]') &&
          element.children.length === 0
      );
      expect(read).toHaveLength(1);
    });

    it("keeps the retired cue beside a shimmering label", async () => {
      await render({ id: "a", label: "Old", retired: true, shimmer: true });
      expect(container.textContent).toContain("Retired");
      expect(container.querySelector("[data-state]")?.textContent).toBe("Old");
    });
  });

  it("keeps a long label whole and wraps it within its container", async () => {
    const label =
      "Inspection préliminaire obligatoire avant la pose de la membrane d’étanchéité";
    await render({
      id: "a",
      label,
      color: "#0e7490",
      icon: { kind: "builtin", value: "tools" },
    });
    const badge = container.querySelector("[data-testid='option-badge']");
    expect(badge?.textContent).toBe(label);
    // The label is never truncated, so no tooltip repeats it.
    expect(badge?.hasAttribute("title")).toBe(false);
    const styles = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("")
      .replace(/\s+/g, "");
    expect(styles).toContain("100cqi-var(--option-badge-reserve,0px)");
    expect(styles).toContain("white-space:normal");
    expect(styles).toContain("justify-content:flex-start");
    expect(styles).not.toContain("text-overflow:ellipsis");
  });

  it("shows a builtin icon from the catalog", async () => {
    await render({
      id: "a",
      label: "Starred",
      icon: { kind: "builtin", value: "bicycle" },
    });
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws a Font Awesome icon inside the badge's icon box", async () => {
    await render({
      id: "a",
      label: "Tree",
      icon: { kind: "builtin", value: "tree" },
    });
    const glyph = container.querySelector("svg");
    const box = glyph?.parentElement;
    if (!glyph || !box) {
      throw new Error("The icon is missing");
    }
    // Outline wraps Font Awesome glyphs in a box two thirds larger, which
    // must be the badge's icon box rather than Outline's default 24px.
    expect(getComputedStyle(box).width).toBe("16px");
    expect(getComputedStyle(box).height).toBe("16px");
    expect(parseFloat(glyph.style.width)).toBeCloseTo((16 * 2) / 3, 2);
    const styles = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("")
      .replace(/\s+/g, "");
    expect(styles).toContain("--badge-icon:16px");
  });

  it("shows a custom emoji that exists", async () => {
    stores.emojis.add({
      id: "emoji-present",
      name: "party",
      url: "https://example.com/party.png",
    });
    await render({
      id: "a",
      label: "Party",
      icon: { kind: "emoji", value: "emoji-present" },
    });
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://example.com/party.png");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("replaces a deleted emoji with a placeholder and an accessible name", async () => {
    post.mockRejectedValue(new NotFoundError("Not found"));
    await render({
      id: "a",
      label: "Party",
      icon: { kind: "emoji", value: "emoji-deleted" },
    });
    expect(
      container.querySelector('[data-testid="option-emoji-placeholder"]')
    ).not.toBeNull();

    await flush();

    expect(post).toHaveBeenCalledWith("/emojis.info", { id: "emoji-deleted" });
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector('[data-testid="option-emoji-placeholder"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("Party");
    expect(container.textContent).toContain("Emoji unavailable");
  });

  it("replaces an emoji image that fails to load", async () => {
    stores.emojis.add({
      id: "emoji-broken",
      name: "broken",
      url: "https://example.com/broken.png",
    });
    await render({
      id: "a",
      label: "Broken",
      icon: { kind: "emoji", value: "emoji-broken" },
    });
    const image = container.querySelector("img");
    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });
    expect(
      container.querySelector('[data-testid="option-emoji-placeholder"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("Emoji unavailable");
  });
});
