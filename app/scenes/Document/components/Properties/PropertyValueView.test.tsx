import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import type { PropertyData } from "@shared/types/documentProperties";
import { buildLightTheme } from "@shared/styles/theme";
import { PropertyDefinition } from "~/models/PropertyDefinition";
import stores from "~/stores";
import { PropertyValueView } from "./PropertyValueView";

declare global {
  // oxlint-disable-next-line no-var -- React reads this global to enable act()
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const options = [
  { id: "ready", label: "Ready", color: "#30a46c" },
  { id: "review", label: "Needs review", color: "#e5484d" },
  { id: "blocked", label: "Blocked", color: "#ffb224" },
];

const status = new PropertyDefinition({
  id: "status",
  name: "Status",
  type: "singleSelect",
  owner: "workspace",
  access: "open",
  options,
  key: null,
});

const tags = new PropertyDefinition({
  id: "tags",
  name: "Tags",
  type: "multiSelect",
  owner: "workspace",
  access: "open",
  options,
  key: null,
});

const due = new PropertyDefinition({
  id: "due",
  name: "Due",
  type: "date",
  owner: "workspace",
  access: "open",
  options: [],
  key: null,
});

const thread = new PropertyDefinition({
  id: "thread",
  name: "Thread",
  type: "url",
  owner: "workspace",
  access: "open",
  options: [],
  key: null,
});

let container: HTMLDivElement;
let root: Root;

async function render(definition: PropertyDefinition, value: PropertyData) {
  await act(async () => {
    root.render(
      <Provider rootStore={stores}>
        <ThemeProvider theme={buildLightTheme({})}>
          <PropertyValueView definition={definition} value={value} />
        </ThemeProvider>
      </Provider>
    );
  });
}

function badges() {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="option-badge"]')
  );
}

/** The label a badge shows; an outgoing label stays hidden while it fades. */
function shownLabel(badge: HTMLElement) {
  const copy = badge.cloneNode(true);
  if (!(copy instanceof HTMLElement)) {
    return "";
  }
  copy
    .querySelectorAll('[aria-hidden="true"]')
    .forEach((node) => node.remove());
  return copy.textContent;
}

describe("PropertyValueView", () => {
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the same badge node when a single select value changes", async () => {
    await render(status, "ready");
    const [before] = badges();
    expect(shownLabel(before)).toBe("Ready");

    await render(status, "review");
    const after = badges();

    expect(after).toHaveLength(1);
    expect(after[0]).toBe(before);
    expect(shownLabel(after[0])).toBe("Needs review");
  });

  it("renders a single select value without a list", async () => {
    await render(status, "ready");
    expect(container.querySelector("ul, li")).toBeNull();
  });

  it("keeps existing multi select badges when an option is added", async () => {
    await render(tags, ["ready", "blocked"]);
    const [ready, blocked] = badges();
    const items = Array.from(container.querySelectorAll("li"));

    await render(tags, ["ready", "review", "blocked"]);
    const after = badges();

    expect(after).toHaveLength(3);
    expect(after[0]).toBe(ready);
    expect(after[2]).toBe(blocked);
    expect(shownLabel(after[1])).toBe("Needs review");
    const itemsAfter = Array.from(container.querySelectorAll("li"));
    expect(itemsAfter[0]).toBe(items[0]);
    expect(itemsAfter[2]).toBe(items[1]);
  });

  it("drops only the removed multi select badge", async () => {
    await render(tags, ["ready", "review", "blocked"]);
    const [ready, , blocked] = badges();

    await render(tags, ["ready", "blocked"]);
    const after = badges();

    expect(after).toHaveLength(2);
    expect(after[0]).toBe(ready);
    expect(after[1]).toBe(blocked);
  });

  it("follows a date with how far it is from today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 15, 12));
    try {
      await render(due, "2026-11-12");
      expect(container.textContent).toBe("November 12, 2026 3 days ago");

      await render(due, "not a date");
      expect(container.textContent).toBe("not a date");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the logo of a known service in the link, named by its address", async () => {
    const address = "https://acme.slack.com/archives/C1/p2";
    await render(thread, address);
    const link = container.querySelector("a");
    const logo = link?.querySelector('[aria-hidden="true"]');

    expect(link?.getAttribute("href")).toBe(address);
    expect(link?.textContent).toBe(address);
    expect(logo?.getAttribute("data-destination")).toBe("Slack");
    expect(logo?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(logo?.querySelector("img")?.getAttribute("src")).toContain(
      "/images/slack.png"
    );
  });

  it("shows a generic logo for other links", async () => {
    await render(thread, "https://slack.com.example.org/");
    const logo = container.querySelector('a [aria-hidden="true"]');

    expect(logo?.getAttribute("data-destination")).toBe("link");
    expect(logo?.querySelector("img")).toBeNull();
    expect(logo?.querySelector("svg")).not.toBeNull();
  });
});
