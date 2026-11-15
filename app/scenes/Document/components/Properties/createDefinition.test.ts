import { definitionInputFromForm, definitionLimits } from "./createDefinition";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("definitionInputFromForm", () => {
  it("requires a name", () => {
    expect(
      definitionInputFromForm({ name: "  ", type: "text", options: "" })
    ).toEqual({ ok: false, error: "name" });
    expect(
      definitionInputFromForm({
        name: "a".repeat(definitionLimits.name + 1),
        type: "text",
        options: "",
      })
    ).toEqual({ ok: false, error: "nameTooLong" });
  });

  it("sends no options for other types", () => {
    expect(
      definitionInputFromForm({ name: " Due ", type: "date", options: "A" })
    ).toEqual({ ok: true, value: { name: "Due", type: "date" } });
  });

  it("creates one option per distinct line with client IDs", () => {
    const result = definitionInputFromForm({
      name: "Status",
      type: "singleSelect",
      options: "To do\n\n Done \nto do\n",
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const created = result.value.options ?? [];
    expect(created.map((option) => option.label)).toEqual(["To do", "Done"]);
    for (const option of created) {
      expect(option.id).toMatch(uuid);
    }
    expect(new Set(created.map((option) => option.id)).size).toBe(2);
  });

  it("requires options for select types and applies the limits", () => {
    expect(
      definitionInputFromForm({
        name: "Tags",
        type: "multiSelect",
        options: " ",
      })
    ).toEqual({ ok: false, error: "options" });
    expect(
      definitionInputFromForm({
        name: "Tags",
        type: "multiSelect",
        options: "x".repeat(definitionLimits.optionLabel + 1),
      })
    ).toEqual({ ok: false, error: "optionTooLong" });
    expect(
      definitionInputFromForm({
        name: "Tags",
        type: "multiSelect",
        options: Array.from(
          { length: definitionLimits.options + 1 },
          (_, index) => `Option ${index}`
        ).join("\n"),
      })
    ).toEqual({ ok: false, error: "tooManyOptions" });
  });
});
