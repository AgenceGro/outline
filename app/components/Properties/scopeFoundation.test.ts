import fs from "node:fs";
import path from "node:path";
import { scopeFoundationCss, scopeSelectorList } from "./scopeFoundation";

const scope = "[data-arc-scope]";

const foundationCss = fs.readFileSync(
  path.resolve(process.cwd(), "app/components/arc/foundation.css"),
  "utf8"
);

function selectorsOf(css: string): string[] {
  const selectors: string[] = [];
  const pattern = /([^{}]+)\{/g;
  let match = pattern.exec(css);
  while (match) {
    const prelude = match[1].trim();
    if (!prelude.startsWith("@")) {
      selectors.push(prelude);
    }
    match = pattern.exec(css);
  }
  return selectors;
}

function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of prelude) {
    if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth--;
    }
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

describe("scopeSelectorList", () => {
  it("moves root selectors onto the scope element", () => {
    expect(scopeSelectorList(":root", scope)).toBe(scope);
    expect(scopeSelectorList(':root[data-theme="dark"]', scope)).toBe(
      `${scope}[data-theme="dark"]`
    );
    expect(scopeSelectorList("html, body", scope)).toBe(`${scope}, ${scope}`);
  });

  it("nests other selectors inside the scope", () => {
    expect(scopeSelectorList(":focus-visible", scope)).toBe(
      `${scope} :focus-visible`
    );
    expect(scopeSelectorList("button, a:hover", scope)).toBe(
      `${scope} button, ${scope} a:hover`
    );
  });

  it("keeps commas inside functional selectors", () => {
    expect(scopeSelectorList(":is(input, textarea):focus", scope)).toBe(
      `${scope} :is(input, textarea):focus`
    );
  });

  it("does not treat element names that start like root names as roots", () => {
    expect(scopeSelectorList("bodyish", scope)).toBe(`${scope} bodyish`);
  });
});

describe("scopeFoundationCss", () => {
  it("scopes rules inside @media and @supports", () => {
    const css = scopeFoundationCss(
      "@media (max-width: 640px) { :root { --a: 1; } } @supports (color: red) { a { color: red; } }"
    );
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain(`${scope} {`);
    expect(css).toContain(`${scope} a {`);
    expect(css).not.toMatch(/:root/);
  });

  it("leaves keyframes untouched", () => {
    const css = scopeFoundationCss("@keyframes spin { from { opacity: 0; } }");
    expect(css).toContain("from { opacity: 0; }");
  });

  it("leaves no rule of the Arc foundation outside the scope", () => {
    const css = scopeFoundationCss(foundationCss);
    const selectors = selectorsOf(css).flatMap(splitSelectors);

    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) {
      if (/^(from|to|\d+%)$/.test(selector)) {
        continue;
      }
      expect(selector).toMatch(/^\[data-arc-scope\]/);
    }
    expect(css).not.toMatch(/(^|[\s,}]):root\b/);
    expect(css).not.toMatch(/(^|[\s,}])(html|body)\s*[{,]/);
    expect(css).toContain(`${scope}[data-theme="dark"]`);
  });
});
