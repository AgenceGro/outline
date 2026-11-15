import {
  parseIsoDate,
  toIsoDate,
} from "~/scenes/Document/components/Properties/values";
import { daysBetween, formatPropertyDate, formatRelativeDay } from "./dates";

/** Runs a check with the process in another time zone. */
function inTimeZone(zone: string, check: () => void) {
  const original = process.env.TZ;
  process.env.TZ = zone;
  try {
    check();
  } finally {
    process.env.TZ = original;
  }
}

describe("property dates", () => {
  const today = new Date(2026, 10, 15);

  it("formats both styles in the user's locale", () => {
    const date = new Date(2026, 11, 12);
    expect(formatPropertyDate(date, "en-US", "long")).toBe("December 12, 2026");
    expect(formatPropertyDate(date, "fr-CA", "long")).toBe("12 décembre 2026");
    expect(formatPropertyDate(date, "en-US", "short")).toBe("12/12/26");
    expect(formatPropertyDate(date, "fr-CA", "short")).toBe("2026-12-12");
  });

  it("says how far a date is from today in days", () => {
    expect(formatRelativeDay(new Date(2026, 10, 15), today, "en-US")).toBe(
      "today"
    );
    expect(formatRelativeDay(new Date(2026, 10, 16), today, "en-US")).toBe(
      "tomorrow"
    );
    expect(formatRelativeDay(new Date(2026, 10, 14), today, "en-US")).toBe(
      "yesterday"
    );
    expect(formatRelativeDay(new Date(2026, 10, 20), today, "en-US")).toBe(
      "in 5 days"
    );
    expect(formatRelativeDay(new Date(2026, 10, 12), today, "en-US")).toBe(
      "3 days ago"
    );
    expect(formatRelativeDay(new Date(2026, 10, 16), today, "fr")).toBe(
      "demain"
    );
  });

  it("counts calendar days across daylight saving changes", () => {
    inTimeZone("America/Toronto", () => {
      // Clocks spring forward on March 8 and fall back on November 1, 2026.
      expect(daysBetween(new Date(2026, 2, 7), new Date(2026, 2, 9))).toBe(2);
      expect(daysBetween(new Date(2026, 9, 31), new Date(2026, 10, 2))).toBe(2);
      expect(
        daysBetween(new Date(2026, 2, 8, 23, 30), new Date(2026, 2, 9, 0, 15))
      ).toBe(1);
      expect(daysBetween(new Date(2026, 0, 1), new Date(2027, 0, 1))).toBe(365);
    });
  });

  it("keeps the calendar day in every time zone", () => {
    for (const zone of [
      "UTC",
      "Pacific/Kiritimati",
      "Pacific/Pago_Pago",
      "America/Toronto",
      "Asia/Kolkata",
    ]) {
      inTimeZone(zone, () => {
        const date = parseIsoDate("2026-11-01");
        expect(date && toIsoDate(date)).toBe("2026-11-01");
        expect(date && formatPropertyDate(date, "en-US", "long")).toBe(
          "November 1, 2026"
        );
        expect(toIsoDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
        expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
      });
    }
  });
});
