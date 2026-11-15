import {
  badgeTint,
  contrastRatio,
  minimumTextContrast,
  mixOklab,
  optionBadgePalette,
  parseColor,
  toHex,
} from "./contrast";

const light = {
  neutral: "#9ba6b2",
  surface: "#ffffff",
  foreground: "#111319",
  isDark: false,
};

const dark = {
  neutral: "#9ba6b2",
  surface: "#111319",
  foreground: "#e6e6e6",
  isDark: true,
};

const samples = [
  "#e5484d",
  "#f5d90a",
  "#ffffff",
  "#000000",
  "#30a46c",
  "#0091ff",
  "#8e4ec6",
  "#ffb224",
  "#00ffff",
  "#777777",
];

function hexToRgb(hex: string) {
  const rgb = parseColor(hex);
  if (!rgb) {
    throw new Error(`Not a color: ${hex}`);
  }
  return rgb;
}

describe("parseColor", () => {
  it("round-trips hex colors", () => {
    expect(toHex(hexToRgb("#e5484d"))).toBe("#e5484d");
  });

  it("composites translucent colors over the backdrop", () => {
    const color = parseColor("rgba(0, 0, 0, 0.5)", {
      red: 255,
      green: 255,
      blue: 255,
    });
    expect(color && toHex(color)).toBe("#808080");
  });

  it("returns undefined for invalid colors", () => {
    expect(parseColor("not a color")).toBeUndefined();
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG ratio for black on white", () => {
    expect(contrastRatio(hexToRgb("#000000"), hexToRgb("#ffffff"))).toBeCloseTo(
      21,
      5
    );
  });
});

describe("optionBadgePalette", () => {
  it("paints the exact configured tint over the light surface", () => {
    const palette = optionBadgePalette({ ...light, color: "#e5484d" });
    const expected = mixOklab(
      hexToRgb("#e5484d"),
      hexToRgb(light.surface),
      badgeTint.light
    );
    expect(palette.background).toBe(toHex(expected));
  });

  it("paints the exact configured tint over the dark surface", () => {
    const palette = optionBadgePalette({ ...dark, color: "#e5484d" });
    const expected = mixOklab(
      hexToRgb("#e5484d"),
      hexToRgb(dark.surface),
      badgeTint.dark
    );
    expect(palette.background).toBe(toHex(expected));
  });

  it.each(samples)(
    "keeps %s labels at AA contrast in light and dark",
    (color) => {
      for (const theme of [light, dark]) {
        const palette = optionBadgePalette({ ...theme, color });
        const measured = contrastRatio(
          hexToRgb(palette.foreground),
          hexToRgb(palette.background)
        );
        expect(measured).toBeGreaterThanOrEqual(minimumTextContrast);
        expect(palette.contrast).toBeGreaterThanOrEqual(minimumTextContrast);
      }
    }
  );

  it("keeps the tone in the label when contrast allows", () => {
    const palette = optionBadgePalette({ ...light, color: "#0091ff" });
    expect(palette.foreground).not.toBe(light.foreground);
  });

  it("uses the neutral tone when no color is configured", () => {
    const palette = optionBadgePalette(light);
    const expected = mixOklab(
      hexToRgb(light.neutral),
      hexToRgb(light.surface),
      badgeTint.light
    );
    expect(palette.background).toBe(toHex(expected));
  });
});
