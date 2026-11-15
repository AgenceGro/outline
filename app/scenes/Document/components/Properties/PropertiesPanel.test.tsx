import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { buildLightTheme } from "@shared/styles/theme";
import Document from "~/models/Document";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { PropertiesPanel } from "./PropertiesPanel";

declare global {
  // oxlint-disable-next-line no-var -- React reads this global to enable act()
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const post = vi.mocked(client.post);

let container: HTMLDivElement;
let root: Root;

async function render(id: string) {
  const model = new Document({ id, title: "Plan" }, stores.documents);
  await act(async () => {
    root.render(
      <Provider rootStore={stores}>
        <ThemeProvider theme={buildLightTheme({})}>
          <PropertiesPanel document={model} />
        </ThemeProvider>
      </Provider>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("PropertiesPanel", () => {
  const originalMatchMedia = window.matchMedia;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  beforeEach(() => {
    post.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("holds the section's space while it loads", async () => {
    post.mockImplementation(() => new Promise(() => undefined));
    await render("doc-loading");
    expect(container.querySelector("section")).toBeNull();
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("tells readers when there are no properties", async () => {
    post.mockResolvedValue({ data: { definitions: [], values: [] } });
    await render("doc-empty");
    const section = container.querySelector("section");
    expect(section?.textContent).toContain(
      "This document has no properties yet."
    );
    expect(section?.querySelector("button")).toBeNull();
  });
});
