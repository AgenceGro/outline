import { observer, Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import type { PropertyData } from "@shared/types/documentProperties";
import { buildLightTheme } from "@shared/styles/theme";
import type { DocumentPropertyValue } from "~/models/DocumentPropertyValue";
import type { PropertyDefinitionData } from "~/models/PropertyDefinition";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { ConflictError } from "~/utils/errors";
import { PropertyRow } from "./PropertyRow";

declare global {
  // oxlint-disable-next-line no-var -- React reads this global to enable act()
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const documentId = "doc-row";

const options = [
  { id: "ready", label: "Ready", color: "#238338" },
  { id: "review", label: "Needs review" },
  { id: "ops", label: "Operations" },
  { id: "design", label: "Design" },
  { id: "old", label: "Old", retired: true },
];

const definitions: PropertyDefinitionData[] = [
  {
    id: "notes",
    name: "Notes",
    type: "text",
    owner: "workspace",
    access: "open",
    options: [],
    key: null,
  },
  {
    id: "workflow",
    name: "Workflow",
    type: "singleSelect",
    owner: "workspace",
    access: "open",
    options,
    key: null,
  },
  {
    id: "topics",
    name: "Topics",
    type: "multiSelect",
    owner: "workspace",
    access: "open",
    options,
    key: null,
  },
  {
    id: "integration",
    name: "Integration review",
    type: "singleSelect",
    owner: "altai",
    access: "managed",
    options,
    key: null,
  },
  {
    id: "website",
    name: "Website",
    type: "url",
    owner: "workspace",
    access: "open",
    options: [],
    key: null,
  },
  {
    id: "done",
    name: "Done",
    type: "checkbox",
    owner: "workspace",
    access: "open",
    options: [],
    key: null,
  },
  {
    id: "due",
    name: "Due",
    type: "date",
    owner: "workspace",
    access: "open",
    options: [],
    key: null,
  },
];

const post = vi.mocked(client.post);

let container: HTMLDivElement;
let root: Root;
let server: Record<string, { value: PropertyData | null; version: number }>;
let announce: ReturnType<typeof vi.fn<(message: string) => void>>;

const Host = observer(function Host({
  ids,
  canEdit,
}: {
  ids: string[];
  canEdit: boolean;
}) {
  return (
    <ul>
      {ids.map((id) => {
        const definition = stores.documentProperties.getDefinition(id);
        return definition ? (
          <PropertyRow
            key={id}
            documentId={documentId}
            definition={definition}
            value={stores.documentProperties.valueFor(documentId, id)}
            canEdit={canEdit}
            onAnnounce={announce}
          />
        ) : null;
      })}
    </ul>
  );
});

function listed(): {
  data: {
    definitions: PropertyDefinitionData[];
    values: DocumentPropertyValue[];
  };
} {
  return {
    data: {
      definitions,
      values: Object.entries(server).map(([definitionId, entry]) => ({
        documentId,
        definitionId,
        value: entry.value,
        version: entry.version,
      })),
    },
  };
}

async function render(ids: string[], canEdit = true) {
  await act(async () => {
    root.render(
      <Provider rootStore={stores}>
        <ThemeProvider theme={buildLightTheme({})}>
          <ActionContextProvider>
            <Host ids={ids} canEdit={canEdit} />
          </ActionContextProvider>
        </ThemeProvider>
      </Provider>
    );
  });
}

async function refresh() {
  await act(async () => {
    await stores.documentProperties.fetch(documentId, { force: true });
  });
}

/** Lets pending writes, observers, and timers settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (element) =>
      (element.getAttribute("aria-label") ?? element.textContent) === name
  );
}

function option(name: string) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="option"]')
  ).find((element) => element.textContent === name);
}

async function click(target: HTMLElement | undefined | null) {
  if (!target) {
    throw new Error("Nothing to click");
  }
  await act(async () => {
    target.click();
  });
  await settle();
}

async function press(target: Element | undefined | null, key: string) {
  if (!target) {
    throw new Error("Nothing to press keys on");
  }
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
  await settle();
}

function textarea() {
  return container.querySelector("textarea");
}

async function type(text: string) {
  const element = textarea();
  if (!element) {
    throw new Error("The text is not being edited");
  }
  await act(async () => {
    // Sets the value through the prototype, as typing does, so React sees
    // the change.
    Reflect.set(HTMLTextAreaElement.prototype, "value", text, element);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function writes() {
  return post.mock.calls.filter(
    ([path]) => path !== "/documentProperties.list"
  );
}

/** Moves focus to a field outside the row, as clicking elsewhere does. */
async function leave() {
  const outside = document.createElement("input");
  document.body.appendChild(outside);
  await act(async () => {
    outside.focus();
  });
  await settle();
  return outside;
}

describe("PropertyRow", () => {
  const originalMatchMedia = window.matchMedia;
  const originalResizeObserver = globalThis.ResizeObserver;

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

  beforeEach(async () => {
    server = {
      notes: { value: "Original", version: 3 },
      workflow: { value: "ready", version: 1 },
      topics: { value: ["ops", "design"], version: 1 },
      integration: { value: "ready", version: 1 },
      website: { value: "https://example.com/spec", version: 2 },
      done: { value: true, version: 4 },
      due: { value: "2026-11-20", version: 1 },
    };
    announce = vi.fn<(message: string) => void>();
    post.mockReset();
    post.mockImplementation(async (path: string, params?: unknown) => {
      if (path === "/documentProperties.list") {
        return listed();
      }
      const body: Record<string, unknown> =
        params && typeof params === "object"
          ? Object.fromEntries(Object.entries(params))
          : {};
      const definitionId = String(body.definitionId);
      const entry = server[definitionId];
      if (body.version !== entry.version) {
        throw new ConflictError("The property changed");
      }
      entry.value =
        path === "/documentProperties.clear" ||
        !(
          typeof body.value === "string" ||
          typeof body.value === "boolean" ||
          Array.isArray(body.value)
        )
          ? null
          : body.value;
      entry.version += 1;
      return {
        data: {
          documentId,
          definitionId,
          value: entry.value,
          version: entry.version,
        },
      };
    });
    stores.documentProperties.clear();
    await stores.documentProperties.fetch(documentId);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  describe("text", () => {
    beforeEach(async () => {
      await render(["notes"]);
    });

    async function edit(text: string) {
      await click(button("Notes: Original"));
      await type(text);
    }

    it("edits the text in place, without an edit button", async () => {
      expect(button("Edit Notes")).toBeUndefined();
      await click(button("Notes: Original"));

      expect(textarea()?.value).toBe("Original");
    });

    it("saves on Enter with the version captured when editing started", async () => {
      await edit("My draft");
      expect(container.textContent).not.toContain("changed elsewhere");
      await press(textarea(), "Enter");

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({ version: 3, value: "My draft" });
      expect(textarea()).toBeNull();
      expect(button("Notes: My draft")).toBeDefined();
      expect(announce).toHaveBeenCalledWith("Notes saved");
    });

    it("cancels on Escape without writing", async () => {
      await edit("Discard this text");
      await press(textarea(), "Escape");

      expect(writes()).toHaveLength(0);
      expect(textarea()).toBeNull();
      expect(button("Notes: Original")).toBeDefined();
    });

    it("shows a newer saved value right away and keeps the draft", async () => {
      await edit("My draft");
      server.notes = { value: "Remote", version: 4 };
      await refresh();

      expect(container.textContent).toContain("changed elsewhere");
      expect(container.textContent).toContain("Remote");
      expect(textarea()?.value).toBe("My draft");
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith("Notes changed elsewhere");
      expect(writes()).toHaveLength(0);
    });

    it("saves over the newest value shown when Enter is pressed", async () => {
      await edit("My draft");
      server.notes = { value: "Remote", version: 4 };
      await refresh();
      server.notes = { value: "Remote again", version: 5 };
      await refresh();

      expect(container.textContent).toContain("Remote again");
      expect(announce).toHaveBeenCalledTimes(2);
      await press(textarea(), "Enter");

      expect(writes()[0][1]).toMatchObject({ version: 5, value: "My draft" });
      expect(textarea()).toBeNull();
      expect(button("Notes: My draft")).toBeDefined();
    });

    it("shows a remote clear as no value", async () => {
      await edit("My draft");
      server.notes = { value: null, version: 4 };
      await refresh();

      expect(container.textContent).toContain("No value");
      expect(textarea()?.value).toBe("My draft");
      await press(textarea(), "Enter");
      expect(writes()[0][1]).toMatchObject({ version: 4, value: "My draft" });
    });

    it("discards the edit on Escape and shows the newer value", async () => {
      await edit("My draft");
      server.notes = { value: "Remote", version: 4 };
      await refresh();
      await press(textarea(), "Escape");

      expect(writes()).toHaveLength(0);
      expect(textarea()).toBeNull();
      expect(button("Notes: Remote")).toBeDefined();
      expect(container.textContent).not.toContain("changed elsewhere");
    });

    it("saves when focus leaves an edit nothing else changed", async () => {
      await edit("Blurred text");
      const outside = await leave();

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({
        version: 3,
        value: "Blurred text",
      });
      expect(button("Notes: Blurred text")).toBeDefined();
      outside.remove();
    });

    it("keeps both values when focus leaves an edit that changed elsewhere", async () => {
      await edit("Keep for later");
      server.notes = { value: "Updated by integration", version: 4 };
      await refresh();
      const outside = await leave();

      expect(writes()).toHaveLength(0);
      expect(server.notes.value).toBe("Updated by integration");
      expect(textarea()).toBeNull();
      expect(button("Notes: Updated by integration")).toBeDefined();
      expect(container.textContent).toContain("was not saved");
      expect(container.textContent).toContain(
        "Current value: Updated by integration"
      );
      expect(container.textContent).toContain("Your edit: Keep for later");
      expect(document.activeElement).toBe(outside);

      await click(button("Keep my edit"));
      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({
        version: 4,
        value: "Keep for later",
      });
      expect(button("Notes: Keep for later")).toBeDefined();
      outside.remove();
    });

    it("uses the current value after leaving a conflicted edit", async () => {
      await edit("Keep for later");
      server.notes = { value: "Updated by integration", version: 4 };
      await refresh();
      const outside = await leave();
      await click(button("Use current value"));

      expect(writes()).toHaveLength(0);
      expect(container.textContent).not.toContain("changed elsewhere");
      expect(button("Notes: Updated by integration")).toBeDefined();
      outside.remove();
    });

    describe("after a conflicting save", () => {
      beforeEach(async () => {
        await edit("My draft");
        // Changed elsewhere without this tab hearing about it yet.
        server.notes = { value: "Remote", version: 4 };
        await press(textarea(), "Enter");
      });

      it("keeps the change and shows both values", () => {
        expect(writes()).toHaveLength(1);
        expect(writes()[0][1]).toMatchObject({ version: 3 });
        expect(container.textContent).toContain("was not saved");
        expect(container.textContent).toContain("Current value: Remote");
        expect(container.textContent).toContain("Your edit: My draft");
        expect(button("Notes: Remote")).toBeDefined();
      });

      it("keeps the change with the version shown", async () => {
        await click(button("Keep my edit"));

        expect(writes()).toHaveLength(2);
        expect(writes()[1][1]).toMatchObject({ version: 4, value: "My draft" });
        expect(container.textContent).not.toContain("changed elsewhere");
        expect(button("Notes: My draft")).toBeDefined();
      });

      it("uses the current value without writing", async () => {
        await click(button("Use current value"));

        expect(writes()).toHaveLength(1);
        expect(container.textContent).not.toContain("changed elsewhere");
        expect(button("Notes: Remote")).toBeDefined();
      });
    });

    it("keeps the type icon on the same line group as the name", () => {
      const name = Array.from(container.querySelectorAll("span")).find(
        (element) => element.textContent === "Notes" && element.id
      );
      const line = name?.parentElement;
      expect(line?.children).toHaveLength(2);
      expect(line?.firstElementChild?.tagName.toLowerCase()).toBe("svg");
      expect(line?.lastElementChild).toBe(name);
    });
  });

  describe("single select", () => {
    beforeEach(async () => {
      await render(["workflow"]);
    });

    function combobox() {
      return container.querySelector<HTMLInputElement>('[role="combobox"]');
    }

    function choices() {
      return Array.from(
        container.querySelectorAll('[role="option"]'),
        (element) => element.textContent
      );
    }

    async function search(text: string) {
      const element = combobox();
      if (!element) {
        throw new Error("The options are not open");
      }
      await act(async () => {
        Reflect.set(HTMLInputElement.prototype, "value", text, element);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    it("opens the options from the badge and saves a choice at once", async () => {
      expect(button("Edit Workflow")).toBeUndefined();
      const badge = container.querySelector('[data-testid="option-badge"]');
      await click(button("Workflow: Ready"));

      expect(document.activeElement).toBe(combobox());
      expect(container.querySelector('[role="listbox"]')).not.toBeNull();
      await click(option("Needs review"));

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({ version: 1, value: "review" });
      expect(combobox()).toBeNull();
      expect(document.activeElement).toBe(button("Workflow: Needs review"));
      expect(container.querySelector('[data-testid="option-badge"]')).toBe(
        badge
      );
      expect(announce).toHaveBeenCalledWith("Workflow saved");
    });

    it("keeps the badge as the trigger and previews each option as a badge", async () => {
      const badge = container.querySelector('[data-testid="option-badge"]');
      await click(button("Workflow: Ready"));

      expect(button("Workflow: Ready")?.getAttribute("aria-expanded")).toBe(
        "true"
      );
      expect(container.querySelector('[data-testid="option-badge"]')).toBe(
        badge
      );
      expect(combobox()?.placeholder).toBe("Search options");
      expect(choices()).toEqual([
        "No value",
        "Ready",
        "Needs review",
        "Operations",
        "Design",
      ]);
      expect(option("Ready")?.getAttribute("aria-selected")).toBe("true");
      expect(
        option("Needs review")?.querySelector('[data-testid="option-badge"]')
      ).not.toBeNull();
      expect(
        option("No value")?.querySelector('[data-testid="option-badge"]')
      ).toBeNull();
      // The list offers no value as a choice, so the field has no clear
      // button that could read as clearing the search.
      expect(button("Clear selection")).toBeUndefined();
      expect(container.querySelector("[title]")).toBeNull();
    });

    it("filters the options as you type and chooses with the keyboard", async () => {
      await click(button("Workflow: Ready"));
      await search("need");

      expect(choices()).toEqual(["Needs review"]);
      await press(combobox(), "ArrowDown");
      await press(combobox(), "Enter");

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({ version: 1, value: "review" });
      expect(document.activeElement).toBe(button("Workflow: Needs review"));
    });

    it("clears the value with the no value choice", async () => {
      await click(button("Workflow: Ready"));
      await click(option("No value"));

      expect(writes()).toHaveLength(1);
      expect(writes()[0][0]).toBe("/documentProperties.clear");
      expect(writes()[0][1]).toMatchObject({ version: 1 });
      expect(document.activeElement).toBe(button("Workflow: No value"));
    });

    it("closes when the badge is pressed again, without writing", async () => {
      await click(button("Workflow: Ready"));
      await click(button("Workflow: Ready"));

      expect(combobox()).toBeNull();
      expect(button("Workflow: Ready")?.getAttribute("aria-expanded")).toBe(
        "false"
      );
      expect(writes()).toHaveLength(0);
      expect(document.activeElement).toBe(button("Workflow: Ready"));
    });

    it("closes on Escape without writing", async () => {
      await click(button("Workflow: Ready"));
      await press(combobox(), "Escape");

      expect(combobox()).toBeNull();
      expect(writes()).toHaveLength(0);
      expect(document.activeElement).toBe(button("Workflow: Ready"));
    });

    it("offers retired options only while assigned", async () => {
      await click(button("Workflow: Ready"));

      expect(option("Ready")).toBeDefined();
      expect(option("Old")).toBeUndefined();
    });

    it("keeps a conflicting choice so it can be kept", async () => {
      server.workflow = { value: "design", version: 2 };
      await click(button("Workflow: Ready"));
      await click(option("Needs review"));

      // The badges crossfade their labels, so the value is read from names.
      expect(container.textContent).toContain("Current value:");
      expect(button("Workflow: Design")).toBeDefined();
      expect(container.textContent).toContain("Your edit: Needs review");
      await click(button("Keep my edit"));

      expect(writes()).toHaveLength(2);
      expect(writes()[1][1]).toMatchObject({ version: 2, value: "review" });
      expect(button("Workflow: Needs review")).toBeDefined();
    });
  });

  describe("multi select", () => {
    beforeEach(async () => {
      await render(["topics"]);
    });

    function trigger() {
      return container.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="listbox"]'
      );
    }

    it("shows the badges at rest, behind the picker", () => {
      expect(button("Edit Topics")).toBeUndefined();
      const badges = container.querySelectorAll(
        '[aria-hidden="true"] [data-testid="option-badge"]'
      );
      expect(Array.from(badges, (badge) => badge.textContent)).toEqual([
        "Operations",
        "Design",
      ]);
    });

    it("saves the selection once, when the list closes", async () => {
      await click(trigger());
      expect(container.querySelector('[role="listbox"]')).not.toBeNull();
      await click(option("Needs review"));
      await click(option("Design"));

      expect(writes()).toHaveLength(0);
      await press(option("Design"), "Escape");

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({
        version: 1,
        value: ["ops", "review"],
      });
      expect(container.querySelector('[role="listbox"]')).toBeNull();
      expect(document.activeElement).toBe(trigger());
    });

    it("does not write when closed without a change", async () => {
      await click(trigger());
      await press(trigger(), "Escape");

      // The list then leaves with an exit animation.
      expect(trigger()?.getAttribute("aria-expanded")).toBe("false");
      expect(writes()).toHaveLength(0);
    });

    it("shows the choices in the badges before saving", async () => {
      await click(trigger());
      await click(option("Needs review"));

      const badges = container.querySelectorAll(
        '[aria-hidden="true"] [data-testid="option-badge"]'
      );
      expect(Array.from(badges, (badge) => badge.textContent)).toEqual([
        "Operations",
        "Design",
        "Needs review",
      ]);
      expect(writes()).toHaveLength(0);
    });
  });

  describe("form-edited values", () => {
    beforeEach(async () => {
      await render(["website"]);
    });

    function link() {
      return container.querySelector<HTMLAnchorElement>("a[href]");
    }

    it("edits from anywhere on the value's surface", async () => {
      const edit = button("Edit Website");
      expect(edit?.contains(link())).toBe(false);
      await click(edit);

      expect(container.querySelector("form")).not.toBeNull();
      await click(button("Cancel"));

      expect(container.querySelector("form")).toBeNull();
      expect(document.activeElement).toBe(button("Edit Website"));
    });

    it("opens a link in the value without editing", async () => {
      const target = link();
      expect(target?.getAttribute("href")).toBe("https://example.com/spec");
      target?.addEventListener("click", (ev) => ev.preventDefault());
      await click(target);

      expect(container.querySelector("form")).toBeNull();
      expect(writes()).toHaveLength(0);
    });
  });

  describe("checkbox", () => {
    beforeEach(async () => {
      await render(["done"]);
    });

    function toggle() {
      return container.querySelector<HTMLButtonElement>('[role="switch"]');
    }

    it("is a switch named by the property", () => {
      const name = document.getElementById(
        toggle()?.getAttribute("aria-labelledby") ?? ""
      );
      expect(name?.textContent).toBe("Done");
      expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    });

    it("toggles from anywhere on the value's surface", async () => {
      const surface = toggle()?.closest("label");
      expect(surface?.querySelectorAll("button")).toHaveLength(1);
      await click(surface);

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({ version: 4, value: false });
      expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    });

    it("toggles once when the switch itself is pressed", async () => {
      await click(toggle());

      expect(writes()).toHaveLength(1);
      expect(writes()[0][1]).toMatchObject({ version: 4, value: false });
    });

    it("removes the value with a separate control", async () => {
      const remove = button("Remove Done");
      expect(remove?.closest("label")).toBeNull();
      await click(remove);

      expect(writes()).toHaveLength(1);
      expect(writes()[0][0]).toBe("/documentProperties.clear");
      expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    });
  });

  describe("date", () => {
    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 15, 12));
      await render(["due"]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function trigger() {
      return container.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="dialog"]'
      );
    }

    function calendar() {
      return container.querySelector<HTMLElement>('[role="dialog"]');
    }

    function day(date: string) {
      return calendar()?.querySelector<HTMLButtonElement>(
        `[data-present] [data-date="${date}"]`
      );
    }

    it("shows the date and how far it is from today", () => {
      expect(trigger()?.getAttribute("aria-label")).toBe(
        "Due: November 20, 2026, in 5 days"
      );
      expect(trigger()?.getAttribute("data-relative")).toBe("in 5 days");
      expect(button("Edit Due")).toBeUndefined();
    });

    it("saves a picked day right away, based on the shown version", async () => {
      await click(trigger());
      expect(calendar()?.getAttribute("aria-label")).toBe("Due calendar");
      await click(day("2026-11-16"));

      expect(writes()).toHaveLength(1);
      expect(writes()[0][0]).toBe("/documentProperties.set");
      expect(writes()[0][1]).toMatchObject({ version: 1, value: "2026-11-16" });
      expect(trigger()?.getAttribute("aria-label")).toBe(
        "Due: November 16, 2026, tomorrow"
      );
      expect(announce).toHaveBeenCalledWith("Due saved");
    });

    it("clears the date", async () => {
      await click(trigger());
      await click(button("Clear"));

      expect(writes()).toHaveLength(1);
      expect(writes()[0][0]).toBe("/documentProperties.clear");
      expect(trigger()?.getAttribute("aria-label")).toBe("Due: No value");
      expect(trigger()?.hasAttribute("data-relative")).toBe(false);
    });

    it("saves nothing when closed without a new day", async () => {
      await click(trigger());
      await click(day("2026-11-20"));
      await press(calendar(), "Escape");

      expect(trigger()?.getAttribute("aria-expanded")).toBe("false");
      expect(writes()).toHaveLength(0);
      expect(document.activeElement).toBe(trigger());
    });

    it("does not open again while a pick is saving", async () => {
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const respond = post.getMockImplementation();
      post.mockImplementation(
        async (...args: Parameters<typeof client.post>) => {
          if (args[0] !== "/documentProperties.list") {
            await held;
          }
          return respond?.(...args);
        }
      );

      await click(trigger());
      await click(day("2026-11-25"));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
      expect(trigger()?.getAttribute("aria-expanded")).toBe("false");
      expect(trigger()?.getAttribute("aria-disabled")).toBe("true");

      await click(trigger());
      expect(trigger()?.getAttribute("aria-expanded")).toBe("false");

      await act(async () => {
        release();
        await held;
      });
      await settle();
      expect(writes()).toHaveLength(1);
      expect(trigger()?.getAttribute("aria-label")).toBe(
        "Due: November 25, 2026, in 10 days"
      );
      expect(trigger()?.hasAttribute("aria-disabled")).toBe(false);
    });
  });

  describe("managed", () => {
    beforeEach(async () => {
      await render(["integration"]);
    });

    it("shows the value without an editor or a visible lock", async () => {
      const trigger = container.querySelector<HTMLElement>('[role="button"]');
      expect(trigger?.textContent).toBe("Ready");
      expect(container.querySelector("button")).toBeNull();
      expect(container.querySelector('[role="combobox"]')).toBeNull();

      const group = container.querySelector('[role="group"]');
      const description = document.getElementById(
        group?.getAttribute("aria-describedby") ?? ""
      );
      expect(description?.textContent).toBe(
        "Managed by Altai. Change it in Altai."
      );
      const visibleText = Array.from(
        container.querySelectorAll("li > div")
      ).map((cell) =>
        Array.from(cell.childNodes)
          .filter((node) => node !== description)
          .map((node) => node.textContent)
          .join("")
      );
      expect(visibleText.join(" ")).not.toContain("Managed by");

      await click(trigger);
      expect(writes()).toHaveLength(0);
      expect(container.querySelector("textarea, input")).toBeNull();
    });

    it("names the owner in a tooltip with the panel's tokens", async () => {
      const trigger = container.querySelector<HTMLElement>('[role="button"]');
      await act(async () => {
        trigger?.focus();
      });
      await settle();

      const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
      expect(tooltip?.textContent).toContain("Managed by Altai");
      expect(tooltip?.hasAttribute("data-arc-scope")).toBe(true);
      expect(tooltip?.style.getPropertyValue("--foreground")).not.toBe("");
      expect(trigger?.getAttribute("aria-describedby")).toBe(tooltip?.id);

      await press(trigger, "Escape");
      expect(writes()).toHaveLength(0);
    });
  });

  it("shows values without controls to readers who cannot edit", async () => {
    await render(["notes", "workflow", "topics", "website", "done"], false);

    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("input, label")).toBeNull();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Original");
    expect(container.textContent).toContain("Ready");
    expect(container.textContent).toContain("Operations");
    expect(container.querySelector("a[href]")?.textContent).toContain(
      "example.com"
    );
  });
});
