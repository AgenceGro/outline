import type { TFunction } from "i18next";
import type {
  PropertyData,
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";
import {
  type PropertyDateStyle,
  formatPropertyDate,
} from "~/components/Properties/dates";

/** The editable form of a property value, before it is parsed. */
export type PropertyDraft = string | boolean | string[];

/** Why a draft cannot be saved. */
export type PropertyValueError =
  | "number"
  | "date"
  | "url"
  | "textTooLong"
  | "listTooLong"
  | "itemTooLong"
  | "unknownOption"
  | "retiredOption";

/** The result of parsing a draft: a value to set, null to clear, or an error. */
export type ParsedPropertyValue =
  | { ok: true; value: PropertyData | null }
  | { ok: false; error: PropertyValueError };

/** The definition fields needed to parse and format values. */
export interface PropertyValueShape {
  type: PropertyType;
  options: PropertyOption[];
}

/** Limits enforced by the server for property values. */
export const propertyValueLimits = {
  textLength: 16000,
  listItems: 200,
  listItemLength: 2000,
} as const;

/**
 * Converts a stored value into an editable draft.
 *
 * @param type the property type.
 * @param value the stored value, if any.
 * @returns the draft.
 */
export function draftFromValue(
  type: PropertyType,
  value: PropertyData | null | undefined
): PropertyDraft {
  switch (type) {
    case "checkbox":
      return value === true;
    case "multiSelect":
    case "textList":
      return Array.isArray(value) ? [...value] : [];
    case "number":
      return typeof value === "number" ? String(value) : "";
    default:
      return typeof value === "string" ? value : "";
  }
}

/**
 * Parses and validates a draft with the same rules as the server. Empty
 * drafts parse to null, which clears the value.
 *
 * @param shape the type and options of the definition.
 * @param draft the draft to parse.
 * @param previous the stored value, so an assigned retired option can be kept.
 * @returns the parsed value or the validation error.
 */
export function parseDraft(
  shape: PropertyValueShape,
  draft: PropertyDraft,
  previous?: PropertyData | null
): ParsedPropertyValue {
  switch (shape.type) {
    case "checkbox":
      return { ok: true, value: draft === true };

    case "number": {
      const text = asString(draft).trim();
      if (!text) {
        return { ok: true, value: null };
      }
      const number = Number(text);
      return Number.isFinite(number)
        ? { ok: true, value: number }
        : { ok: false, error: "number" };
    }

    case "date": {
      const text = asString(draft).trim();
      if (!text) {
        return { ok: true, value: null };
      }
      return isIsoDate(text)
        ? { ok: true, value: text }
        : { ok: false, error: "date" };
    }

    case "url": {
      const text = asString(draft).trim();
      if (!text) {
        return { ok: true, value: null };
      }
      return isHttpUrl(text)
        ? { ok: true, value: text }
        : { ok: false, error: "url" };
    }

    case "singleSelect": {
      const id = asString(draft);
      if (!id) {
        return { ok: true, value: null };
      }
      const error = optionError(shape.options, [id], previous);
      return error ? { ok: false, error } : { ok: true, value: id };
    }

    case "multiSelect": {
      const ids = Array.from(new Set(asList(draft)));
      if (!ids.length) {
        return { ok: true, value: null };
      }
      const error = optionError(shape.options, ids, previous);
      return error ? { ok: false, error } : { ok: true, value: ids };
    }

    case "textList": {
      const items = asList(draft)
        .map((item) => item.trim())
        .filter(Boolean);
      if (!items.length) {
        return { ok: true, value: null };
      }
      if (items.length > propertyValueLimits.listItems) {
        return { ok: false, error: "listTooLong" };
      }
      if (
        items.some((item) => item.length > propertyValueLimits.listItemLength)
      ) {
        return { ok: false, error: "itemTooLong" };
      }
      return { ok: true, value: items };
    }

    default: {
      const text = asString(draft);
      if (!text.trim()) {
        return { ok: true, value: null };
      }
      return text.length > propertyValueLimits.textLength
        ? { ok: false, error: "textTooLong" }
        : { ok: true, value: text };
    }
  }
}

/**
 * Formats a value as plain text, for display and accessible names. Select
 * values are formatted as their option labels.
 *
 * @param shape the type and options of the definition.
 * @param value the stored value.
 * @param options.locale the locale to format numbers and dates in.
 * @param options.dateStyle the style of dates, long by default.
 * @param options.t the translation function.
 * @returns the formatted value.
 */
export function formatPropertyValue(
  shape: PropertyValueShape,
  value: PropertyData,
  options: { locale?: string; dateStyle?: PropertyDateStyle; t: TFunction }
): string {
  const { locale, dateStyle = "long", t } = options;

  switch (shape.type) {
    case "checkbox":
      return value === true ? t("Yes") : t("No");
    case "number":
      return typeof value === "number"
        ? new Intl.NumberFormat(locale).format(value)
        : String(value);
    case "date": {
      const date = typeof value === "string" ? parseIsoDate(value) : undefined;
      return date ? formatPropertyDate(date, locale, dateStyle) : String(value);
    }
    case "singleSelect":
    case "multiSelect":
      return asList(Array.isArray(value) ? value : String(value))
        .map(
          (id) =>
            shape.options.find((option) => option.id === id)?.label ??
            t("Unknown option")
        )
        .join(", ");
    case "textList":
      return asList(Array.isArray(value) ? value : String(value)).join(", ");
    default:
      return String(value);
  }
}

/**
 * Explains a validation error, saying how to fix it.
 *
 * @param error the validation error.
 * @param t the translation function.
 * @returns the translated message.
 */
export function propertyErrorMessage(
  error: PropertyValueError,
  t: TFunction
): string {
  switch (error) {
    case "number":
      return t("Enter a number, like 42 or 3.5.");
    case "date":
      return t("Enter a date, like 2026-11-13.");
    case "url":
      return t("Enter a link that starts with http:// or https://.");
    case "textTooLong":
      return t("Shorten the text to {{ count }} characters or fewer.", {
        count: propertyValueLimits.textLength,
      });
    case "listTooLong":
      return t("Remove items to keep {{ count }} or fewer.", {
        count: propertyValueLimits.listItems,
      });
    case "itemTooLong":
      return t("Shorten each item to {{ count }} characters or fewer.", {
        count: propertyValueLimits.listItemLength,
      });
    case "retiredOption":
      return t("This option is retired. Choose another option.");
    default:
      return t("This option no longer exists. Choose another option.");
  }
}

/**
 * Whether a string is a calendar date in the `YYYY-MM-DD` format.
 *
 * @param value the string to check.
 * @returns true if it is a valid date.
 */
export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== undefined;
}

/**
 * Parses a `YYYY-MM-DD` date as a local date, so it is not shifted by the
 * time zone when formatted.
 *
 * @param value the date string.
 * @returns the date, or undefined if the string is not a valid date.
 */
export function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

/**
 * Formats a local date as `YYYY-MM-DD`, the inverse of {@link parseIsoDate}.
 * It reads the local calendar date, so the day never shifts with the time
 * zone.
 *
 * @param date the local date.
 * @returns the date string.
 */
export function toIsoDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(
    date.getMonth() + 1
  )}-${pad(date.getDate())}`;
}

/**
 * Whether a string is an absolute http or https URL.
 *
 * @param value the string to check.
 * @returns true if it is a web URL.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !!url.host
    );
  } catch {
    return false;
  }
}

function asString(draft: PropertyDraft): string {
  return typeof draft === "string" ? draft : "";
}

function asList(draft: PropertyDraft): string[] {
  if (Array.isArray(draft)) {
    return draft;
  }
  return typeof draft === "string" && draft ? [draft] : [];
}

function optionError(
  options: PropertyOption[],
  ids: string[],
  previous?: PropertyData | null
): PropertyValueError | undefined {
  const kept = new Set(
    Array.isArray(previous)
      ? previous
      : typeof previous === "string"
        ? [previous]
        : []
  );

  for (const id of ids) {
    const option = options.find((candidate) => candidate.id === id);
    if (!option) {
      return "unknownOption";
    }
    if (option.retired && !kept.has(id)) {
      return "retiredOption";
    }
  }
  return undefined;
}
