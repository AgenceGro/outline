import type { UserPreference, UserPreferences } from "@shared/types";

/**
 * How property dates are shown: "long" names the month, "short" is numeric,
 * with the locale's own year length and separators.
 */
export type PropertyDateStyle = NonNullable<
  UserPreferences[UserPreference.PropertyDateStyle]
>;

/** The date format of each style. */
export const propertyDateFormats: Record<
  PropertyDateStyle,
  Intl.DateTimeFormatOptions
> = {
  long: { dateStyle: "long" },
  short: { dateStyle: "short" },
};

/**
 * Formats a calendar date in the given style.
 *
 * @param date the date, as a local date.
 * @param locale the locale to format in.
 * @param style the date style.
 * @returns the formatted date.
 */
export function formatPropertyDate(
  date: Date,
  locale: string | undefined,
  style: PropertyDateStyle
): string {
  return new Intl.DateTimeFormat(locale, propertyDateFormats[style]).format(
    date
  );
}

/**
 * Counts whole calendar days from one local date to another. Days are
 * counted on their calendar dates, so a daylight saving change between them
 * never adds or removes a day.
 *
 * @param from the start date.
 * @param to the end date.
 * @returns the number of days, negative when `to` is earlier.
 */
export function daysBetween(from: Date, to: Date): number {
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/**
 * Says how far a date is from today in days, such as "tomorrow" or
 * "in 5 days".
 *
 * @param date the date, as a local date.
 * @param today today's local date.
 * @param locale the locale to format in.
 * @returns the relative day.
 */
export function formatRelativeDay(
  date: Date,
  today: Date,
  locale: string | undefined
): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    daysBetween(today, date),
    "day"
  );
}
