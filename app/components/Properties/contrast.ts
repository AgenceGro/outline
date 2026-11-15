import { parseToRgb } from "polished";

/** An opaque sRGB color with channels from 0 to 255. */
export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

/** The colors painted by an option badge. */
export interface OptionBadgePalette {
  /** The configured tone, mixed into the surface. */
  background: string;
  /** The label and icon color, at least 4.5:1 against the background. */
  foreground: string;
  /** The contrast ratio between the foreground and background. */
  contrast: number;
}

/** The minimum WCAG AA contrast ratio for body text. */
export const minimumTextContrast = 4.5;

/** The share of the tone in an Arc badge background, by theme. */
export const badgeTint = { light: 0.1, dark: 0.12 } as const;

/** The share of the tone in an Arc badge label, before any adjustment. */
export const badgeInk = { light: 0.84, dark: 0.94 } as const;

/**
 * Parses a CSS color, compositing any transparency over a backdrop.
 *
 * @param value the color, such as "#e5484d".
 * @param backdrop the color behind it, used when it is translucent.
 * @returns the opaque color, or undefined if the value is not a color.
 */
export function parseColor(value: string, backdrop?: Rgb): Rgb | undefined {
  try {
    const parsed = parseToRgb(value);
    const alpha = "alpha" in parsed ? parsed.alpha : 1;
    const color = { red: parsed.red, green: parsed.green, blue: parsed.blue };
    if (alpha >= 1 || !backdrop) {
      return color;
    }
    return {
      red: color.red * alpha + backdrop.red * (1 - alpha),
      green: color.green * alpha + backdrop.green * (1 - alpha),
      blue: color.blue * alpha + backdrop.blue * (1 - alpha),
    };
  } catch {
    return undefined;
  }
}

/**
 * Formats a color as a 6-digit hex string, rounding each channel.
 *
 * @param color the color.
 * @returns the hex string, such as "#e5484d".
 */
export function toHex(color: Rgb): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

/**
 * Mixes two colors in the Oklab space, like CSS
 * `color-mix(in oklab, a weight, b)`.
 *
 * @param a the first color.
 * @param b the second color.
 * @param weight the share of the first color, from 0 to 1.
 * @returns the mixed color, rounded to whole channels.
 */
export function mixOklab(a: Rgb, b: Rgb, weight: number): Rgb {
  const labA = rgbToOklab(a);
  const labB = rgbToOklab(b);
  const mixed = labA.map(
    (channel, index) => channel * weight + labB[index] * (1 - weight)
  );
  return roundRgb(oklabToRgb([mixed[0], mixed[1], mixed[2]]));
}

/**
 * Calculates the WCAG 2 relative luminance of a color.
 *
 * @param color the color.
 * @returns the luminance, from 0 to 1.
 */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * toLinear(color.red) +
    0.7152 * toLinear(color.green) +
    0.0722 * toLinear(color.blue)
  );
}

/**
 * Calculates the WCAG 2 contrast ratio between two colors.
 *
 * @param a the first color.
 * @param b the second color.
 * @returns the ratio, from 1 to 21.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculates the colors of an option badge. The configured color is used as
 * the exact tone and mixed into the surface as Arc's badge does; the label
 * starts at Arc's ink mix and moves toward the foreground until it reaches
 * WCAG AA contrast against the painted background.
 *
 * @param options.color the configured option color, or undefined for neutral.
 * @param options.neutral the tone used when there is no valid color.
 * @param options.surface the surface the badge is mixed into.
 * @param options.foreground the theme's text color.
 * @param options.isDark whether the theme is dark.
 * @returns the colors to paint.
 */
export function optionBadgePalette(options: {
  color?: string;
  neutral: string;
  surface: string;
  foreground: string;
  isDark: boolean;
}): OptionBadgePalette {
  const mode = options.isDark ? "dark" : "light";
  const surface = parseColor(options.surface) ?? fallbackSurface(mode);
  const foreground =
    parseColor(options.foreground, surface) ?? fallbackForeground(mode);
  const tone =
    (options.color ? parseColor(options.color, surface) : undefined) ??
    parseColor(options.neutral, surface) ??
    foreground;

  const background = mixOklab(tone, surface, badgeTint[mode]);
  let ink = foreground;

  for (let share = badgeInk[mode]; share > 0; share -= 0.02) {
    const candidate = mixOklab(tone, foreground, share);
    if (contrastRatio(candidate, background) >= minimumTextContrast) {
      ink = candidate;
      break;
    }
  }

  return {
    background: toHex(background),
    foreground: toHex(ink),
    contrast: contrastRatio(ink, background),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundRgb(color: Rgb): Rgb {
  return {
    red: Math.round(clamp(color.red, 0, 255)),
    green: Math.round(clamp(color.green, 0, 255)),
    blue: Math.round(clamp(color.blue, 0, 255)),
  };
}

function fallbackSurface(mode: "light" | "dark"): Rgb {
  return mode === "dark"
    ? { red: 17, green: 19, blue: 25 }
    : { red: 255, green: 255, blue: 255 };
}

function fallbackForeground(mode: "light" | "dark"): Rgb {
  return mode === "dark"
    ? { red: 230, green: 230, blue: 230 }
    : { red: 17, green: 19, blue: 25 };
}

function toLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function fromLinear(value: number) {
  const encoded =
    value <= 0.0031308
      ? value * 12.92
      : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return encoded * 255;
}

function rgbToOklab(color: Rgb): [number, number, number] {
  const red = toLinear(color.red);
  const green = toLinear(color.green);
  const blue = toLinear(color.blue);

  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  );

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([lightness, a, b]: [number, number, number]): Rgb {
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);

  return {
    red: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    blue: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}
