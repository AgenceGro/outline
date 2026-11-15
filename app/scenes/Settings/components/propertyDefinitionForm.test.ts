import type { PropertyOption } from "@shared/types/documentProperties";
import type { EditablePropertyDefinition } from "./propertyDefinitionForm";
import {
  createDraft,
  hasErrors,
  isDraftDirty,
  normalizeHexColor,
  parseServerFieldError,
  propertyDefinitionDraftReducer as reduce,
  toCreateInput,
  toUpdateInput,
  validateDraft,
} from "./propertyDefinitionForm";

const option = (id: string, label: string, extra = {}): PropertyOption => ({
  id,
  label,
  ...extra,
});

const status: EditablePropertyDefinition = {
  id: "def-1",
  name: "Status",
  type: "singleSelect",
  options: [
    option("a", "Draft", { color: "#aabbcc" }),
    option("b", "Done", { icon: { kind: "builtin", value: "DoneIcon" } }),
  ],
};

describe("propertyDefinitionDraftReducer", () => {
  it("edits option labels, colors and icons", () => {
    let draft = createDraft(status);
    draft = reduce(draft, {
      type: "optionLabelChanged",
      id: "a",
      label: "New",
    });
    draft = reduce(draft, {
      type: "optionColorChanged",
      id: "a",
      color: undefined,
    });
    draft = reduce(draft, {
      type: "optionIconChanged",
      id: "b",
      icon: undefined,
    });
    expect(draft.options).toEqual([option("a", "New"), option("b", "Done")]);
  });

  it("retires and restores saved options instead of removing them", () => {
    let draft = createDraft(status);
    draft = reduce(draft, { type: "optionRemoved", id: "a" });
    expect(draft.options).toHaveLength(2);

    draft = reduce(draft, { type: "optionRetired", id: "a" });
    expect(draft.options[0].retired).toBe(true);

    draft = reduce(draft, { type: "optionRestored", id: "a" });
    expect(draft.options[0]).not.toHaveProperty("retired");
  });

  it("removes options that were never saved", () => {
    let draft = createDraft(status);
    draft = reduce(draft, { type: "optionAdded", option: option("c", "") });
    draft = reduce(draft, { type: "optionRemoved", id: "c" });
    expect(draft.options.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("moves options within bounds", () => {
    let draft = createDraft(status);
    draft = reduce(draft, { type: "optionMoved", id: "b", offset: -1 });
    expect(draft.options.map((o) => o.id)).toEqual(["b", "a"]);
    expect(reduce(draft, { type: "optionMoved", id: "b", offset: -1 })).toBe(
      draft
    );
  });

  it("drops icons and options when a new definition changes type", () => {
    let draft = createDraft(undefined, "singleSelect");
    draft = reduce(draft, {
      type: "optionAdded",
      option: option("x", "One", { icon: { kind: "emoji", value: "uuid" } }),
    });
    draft = reduce(draft, { type: "typeChanged", propertyType: "multiSelect" });
    expect(draft.options).toEqual([option("x", "One")]);
    draft = reduce(draft, { type: "typeChanged", propertyType: "text" });
    expect(draft.options).toEqual([]);
  });

  it("never changes the type of a saved definition", () => {
    const draft = createDraft(status);
    expect(reduce(draft, { type: "typeChanged", propertyType: "text" })).toBe(
      draft
    );
  });
});

describe("validateDraft", () => {
  it("requires a name within the server limit", () => {
    const draft = createDraft(undefined, "text");
    expect(validateDraft(draft, []).name).toBe("required");
    expect(validateDraft({ ...draft, name: "x".repeat(151) }, []).name).toBe(
      "tooLong"
    );
    expect(
      hasErrors(validateDraft({ ...draft, name: "Owner" }, ["Status"]))
    ).toBe(false);
  });

  it("warns without blocking when another property has the name", () => {
    const errors = validateDraft(
      { ...createDraft(undefined, "text"), name: "  status " },
      ["Status"]
    );
    expect(errors.nameWarning).toBe("duplicate");
    expect(hasErrors(errors)).toBe(false);
  });

  it("requires unique, non-empty option labels", () => {
    const draft = {
      ...createDraft(status),
      options: [
        option("a", "Draft"),
        option("b", " draft "),
        option("c", " "),
        option("d", "y".repeat(101)),
      ],
    };
    expect(validateDraft(draft, []).optionLabels).toEqual({
      b: "duplicate",
      c: "required",
      d: "tooLong",
    });
  });

  it("limits the number of options", () => {
    const draft = {
      ...createDraft(status),
      options: Array.from({ length: 201 }, (_, i) => option(`${i}`, `${i}`)),
    };
    expect(validateDraft(draft, []).options).toBe("tooMany");
  });

  it("ignores options on types without options", () => {
    const draft = {
      ...createDraft(undefined, "text"),
      name: "Notes",
      options: [option("a", "")],
    };
    expect(hasErrors(validateDraft(draft, []))).toBe(false);
  });
});

describe("request inputs", () => {
  it("builds a trimmed create input with options only for select types", () => {
    expect(
      toCreateInput({ ...createDraft(undefined, "number"), name: " Cost " })
    ).toEqual({ name: "Cost", type: "number" });

    const draft = {
      ...createDraft(undefined, "multiSelect"),
      name: "Tags",
      options: [
        option("x", " Red ", {
          color: "",
          icon: { kind: "builtin", value: "StarredIcon" },
          retired: false,
        }),
      ],
    };
    expect(toCreateInput(draft)).toEqual({
      name: "Tags",
      type: "multiSelect",
      options: [option("x", "Red")],
    });
  });

  it("sends only changed fields on update", () => {
    const draft = createDraft(status);
    expect(toUpdateInput(draft, status)).toEqual({ id: "def-1" });
    expect(isDraftDirty(draft, status)).toBe(false);

    const renamed = reduce(draft, { type: "nameChanged", name: "State " });
    expect(toUpdateInput(renamed, status)).toEqual({
      id: "def-1",
      name: "State",
    });

    const retired = reduce(draft, { type: "optionRetired", id: "b" });
    const input = toUpdateInput(retired, status);
    expect(input.name).toBeUndefined();
    expect(input.options?.[1]).toMatchObject({ id: "b", retired: true });
    expect(isDraftDirty(retired, status)).toBe(true);
  });

  it("treats a new draft as dirty once something is entered", () => {
    const draft = createDraft(undefined, "text");
    expect(isDraftDirty(draft, undefined)).toBe(false);
    expect(isDraftDirty({ ...draft, name: "x" }, undefined)).toBe(true);
  });
});

describe("shimmer", () => {
  const shimmering: EditablePropertyDefinition = {
    ...status,
    options: [option("a", "Draft", { shimmer: true }), option("b", "Done")],
  };

  it("keeps a saved shimmer through an unrelated edit", () => {
    const draft = reduce(createDraft(shimmering), {
      type: "optionLabelChanged",
      id: "b",
      label: "Finished",
    });

    expect(toUpdateInput(draft, shimmering).options).toEqual([
      { id: "a", label: "Draft", shimmer: true },
      { id: "b", label: "Finished" },
    ]);
  });

  it("is dirty when toggled, and omitted once turned off", () => {
    const on = reduce(createDraft(status), {
      type: "optionShimmerChanged",
      id: "b",
      shimmer: true,
    });
    expect(isDraftDirty(on, status)).toBe(true);
    expect(toUpdateInput(on, status).options?.[1]).toMatchObject({
      shimmer: true,
    });

    const off = reduce(createDraft(shimmering), {
      type: "optionShimmerChanged",
      id: "a",
      shimmer: false,
    });
    expect(toUpdateInput(off, shimmering).options?.[0]).toEqual({
      id: "a",
      label: "Draft",
    });
    expect(
      isDraftDirty(createDraft(shimmering), {
        ...shimmering,
        options: [
          option("a", "Draft", { shimmer: true }),
          option("b", "Done", { shimmer: false }),
        ],
      })
    ).toBe(false);
  });

  it("is never sent for multi select, even when a draft changes type", () => {
    let draft = reduce(createDraft(undefined, "singleSelect"), {
      type: "optionAdded",
      option: option("x", "Fast", { shimmer: true }),
    });
    draft = reduce(draft, { type: "typeChanged", propertyType: "multiSelect" });

    expect(draft.options[0].shimmer).toBeUndefined();
    expect(
      toCreateInput({
        ...draft,
        options: [option("x", "Fast", { shimmer: true })],
      }).options
    ).toEqual([{ id: "x", label: "Fast" }]);
  });
});

describe("normalizeHexColor", () => {
  it("returns six digit lowercase hex", () => {
    expect(normalizeHexColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHexColor("abc")).toBe("#aabbcc");
    expect(normalizeHexColor(" #0f0 ")).toBe("#00ff00");
  });

  it("drops alpha so colors are saved opaque", () => {
    expect(normalizeHexColor("#AABBCC80")).toBe("#aabbcc");
    expect(normalizeHexColor("#abc8")).toBe("#aabbcc");
  });

  it("refuses colors the server cannot store", () => {
    expect(normalizeHexColor("#aabbccd")).toBeUndefined();
    expect(normalizeHexColor("rgb(0, 0, 0)")).toBeUndefined();
    expect(normalizeHexColor("oklch(50% 0.1 200)")).toBeUndefined();
    expect(normalizeHexColor(undefined)).toBeUndefined();
  });

  it("normalizes colors set through the reducer", () => {
    const draft = reduce(createDraft(status), {
      type: "optionColorChanged",
      id: "b",
      color: "#ABC",
    });
    expect(draft.options[1].color).toBe("#aabbcc");
  });
});

describe("parseServerFieldError", () => {
  it("maps validation messages to fields", () => {
    expect(parseServerFieldError("name: Required")).toEqual({
      field: "name",
      message: "Required",
    });
    expect(parseServerFieldError("label: Too long")).toEqual({
      field: "options",
      message: "Too long",
    });
    expect(parseServerFieldError("Something broke")).toEqual({
      field: null,
      message: "Something broke",
    });
    expect(parseServerFieldError("teamId: Invalid")).toEqual({
      field: null,
      message: "teamId: Invalid",
    });
    expect(
      parseServerFieldError("Choose a custom emoji from this workspace.")
    ).toEqual({
      field: "options",
      message: "Choose a custom emoji from this workspace.",
    });
  });
});
