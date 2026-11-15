import i18n from "i18next";
import type {
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";
import {
  draftFromValue,
  formatPropertyValue,
  isHttpUrl,
  isIsoDate,
  parseDraft,
  propertyErrorMessage,
  propertyValueLimits,
} from "./values";

const t = i18n.t.bind(i18n);

const options: PropertyOption[] = [
  { id: "todo", label: "To do", color: "#e5484d" },
  { id: "done", label: "Done" },
  { id: "old", label: "Old", retired: true },
];

function shape(type: PropertyType) {
  return { type, options };
}

describe("parseDraft", () => {
  it("parses text and clears blank text", () => {
    expect(parseDraft(shape("text"), "  Hello ")).toEqual({
      ok: true,
      value: "  Hello ",
    });
    expect(parseDraft(shape("text"), "   ")).toEqual({ ok: true, value: null });
    expect(
      parseDraft(shape("text"), "a".repeat(propertyValueLimits.textLength + 1))
    ).toEqual({ ok: false, error: "textTooLong" });
  });

  it("parses finite numbers only", () => {
    expect(parseDraft(shape("number"), " 3.5 ")).toEqual({
      ok: true,
      value: 3.5,
    });
    expect(parseDraft(shape("number"), "-0")).toEqual({ ok: true, value: -0 });
    expect(parseDraft(shape("number"), "")).toEqual({ ok: true, value: null });
    expect(parseDraft(shape("number"), "abc")).toEqual({
      ok: false,
      error: "number",
    });
    expect(parseDraft(shape("number"), "Infinity")).toEqual({
      ok: false,
      error: "number",
    });
  });

  it("parses checkboxes as booleans", () => {
    expect(parseDraft(shape("checkbox"), true)).toEqual({
      ok: true,
      value: true,
    });
    expect(parseDraft(shape("checkbox"), false)).toEqual({
      ok: true,
      value: false,
    });
  });

  it("accepts real ISO dates only", () => {
    expect(parseDraft(shape("date"), "2026-11-13")).toEqual({
      ok: true,
      value: "2026-11-13",
    });
    expect(parseDraft(shape("date"), "2026-02-30")).toEqual({
      ok: false,
      error: "date",
    });
    expect(parseDraft(shape("date"), "13/11/2026")).toEqual({
      ok: false,
      error: "date",
    });
  });

  it("accepts http and https URLs only", () => {
    expect(parseDraft(shape("url"), "https://example.com/a")).toEqual({
      ok: true,
      value: "https://example.com/a",
    });
    expect(parseDraft(shape("url"), "javascript:alert(1)")).toEqual({
      ok: false,
      error: "url",
    });
    expect(parseDraft(shape("url"), "example.com")).toEqual({
      ok: false,
      error: "url",
    });
  });

  it("rejects unknown and newly chosen retired options", () => {
    expect(parseDraft(shape("singleSelect"), "todo")).toEqual({
      ok: true,
      value: "todo",
    });
    expect(parseDraft(shape("singleSelect"), "")).toEqual({
      ok: true,
      value: null,
    });
    expect(parseDraft(shape("singleSelect"), "missing")).toEqual({
      ok: false,
      error: "unknownOption",
    });
    expect(parseDraft(shape("singleSelect"), "old")).toEqual({
      ok: false,
      error: "retiredOption",
    });
  });

  it("keeps a retired option that is already assigned", () => {
    expect(parseDraft(shape("singleSelect"), "old", "old")).toEqual({
      ok: true,
      value: "old",
    });
    expect(parseDraft(shape("multiSelect"), ["old", "todo"], ["old"])).toEqual({
      ok: true,
      value: ["old", "todo"],
    });
  });

  it("removes duplicate multi-select options", () => {
    expect(parseDraft(shape("multiSelect"), ["todo", "todo", "done"])).toEqual({
      ok: true,
      value: ["todo", "done"],
    });
    expect(parseDraft(shape("multiSelect"), [])).toEqual({
      ok: true,
      value: null,
    });
  });

  it("trims text list items and enforces the limits", () => {
    expect(parseDraft(shape("textList"), [" a ", "", "b"])).toEqual({
      ok: true,
      value: ["a", "b"],
    });
    expect(parseDraft(shape("textList"), ["  "])).toEqual({
      ok: true,
      value: null,
    });
    expect(
      parseDraft(
        shape("textList"),
        Array.from({ length: propertyValueLimits.listItems + 1 }, () => "x")
      )
    ).toEqual({ ok: false, error: "listTooLong" });
    expect(
      parseDraft(shape("textList"), [
        "x".repeat(propertyValueLimits.listItemLength + 1),
      ])
    ).toEqual({ ok: false, error: "itemTooLong" });
  });
});

describe("draftFromValue", () => {
  it("converts stored values into drafts for each type", () => {
    expect(draftFromValue("text", "Hi")).toBe("Hi");
    expect(draftFromValue("number", 42)).toBe("42");
    expect(draftFromValue("checkbox", true)).toBe(true);
    expect(draftFromValue("checkbox", undefined)).toBe(false);
    expect(draftFromValue("date", "2026-11-13")).toBe("2026-11-13");
    expect(draftFromValue("url", null)).toBe("");
    expect(draftFromValue("singleSelect", "todo")).toBe("todo");
    expect(draftFromValue("multiSelect", ["todo"])).toEqual(["todo"]);
    expect(draftFromValue("textList", undefined)).toEqual([]);
  });

  it("copies lists so drafts do not change stored values", () => {
    const stored = ["a"];
    const draft = draftFromValue("textList", stored);
    expect(draft).not.toBe(stored);
  });
});

describe("formatPropertyValue", () => {
  const format = { locale: "en-US", t };

  it("formats each type as text", () => {
    expect(formatPropertyValue(shape("text"), "Hello", format)).toBe("Hello");
    expect(formatPropertyValue(shape("number"), 1234.5, format)).toBe(
      "1,234.5"
    );
    expect(formatPropertyValue(shape("checkbox"), true, format)).toBe("Yes");
    expect(formatPropertyValue(shape("checkbox"), false, format)).toBe("No");
    expect(formatPropertyValue(shape("date"), "2026-11-13", format)).toBe(
      "November 13, 2026"
    );
    expect(
      formatPropertyValue(shape("url"), "https://example.com", format)
    ).toBe("https://example.com");
    expect(formatPropertyValue(shape("singleSelect"), "todo", format)).toBe(
      "To do"
    );
    expect(
      formatPropertyValue(shape("multiSelect"), ["todo", "old"], format)
    ).toBe("To do, Old");
    expect(formatPropertyValue(shape("textList"), ["a", "b"], format)).toBe(
      "a, b"
    );
  });

  it("does not shift dates across time zones", () => {
    expect(
      formatPropertyValue(shape("date"), "2026-01-01", { locale: "en-US", t })
    ).toBe("January 1, 2026");
  });

  it("formats dates in the short style with the locale's own year", () => {
    expect(
      formatPropertyValue(shape("date"), "2026-12-12", {
        locale: "en-US",
        dateStyle: "short",
        t,
      })
    ).toBe("12/12/26");
    expect(
      formatPropertyValue(shape("date"), "2026-12-12", {
        locale: "en-GB",
        dateStyle: "short",
        t,
      })
    ).toBe("12/12/2026");
  });

  it("names options that no longer exist", () => {
    expect(formatPropertyValue(shape("singleSelect"), "gone", format)).toBe(
      "Unknown option"
    );
  });
});

describe("validators", () => {
  it("checks ISO dates and web URLs", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isHttpUrl("http://localhost:3000")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
  });

  it("explains every error", () => {
    expect(propertyErrorMessage("number", t)).toBe(
      "Enter a number, like 42 or 3.5."
    );
    expect(propertyErrorMessage("retiredOption", t)).toBe(
      "This option is retired. Choose another option."
    );
  });
});
