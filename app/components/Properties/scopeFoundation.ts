/** The attribute that marks an element as the root of Arc's design tokens. */
export const arcScopeAttribute = "data-arc-scope";

/** The selector for elements carrying Arc's design tokens. */
export const arcScopeSelector = `[${arcScopeAttribute}]`;

/** At-rules whose bodies hold style rules that need scoping. */
const groupingAtRules = ["@media", "@supports", "@container", "@layer"];

/**
 * Rewrites Arc's foundation stylesheet so it applies inside a scope only.
 * Rules on `:root`, `html`, or `body` move to the scope element itself, and
 * every other rule, such as the focus styles, only matches descendants of the
 * scope. Nothing in the result matches outside the scope.
 *
 * @param css the foundation stylesheet.
 * @param scope the selector of the scope element.
 * @returns the scoped stylesheet.
 */
export function scopeFoundationCss(
  css: string,
  scope: string = arcScopeSelector
): string {
  return scopeBlock(css.replace(/\/\*[\s\S]*?\*\//g, ""), scope);
}

/**
 * Scopes one comma-separated selector list.
 *
 * @param selectors the selector list.
 * @param scope the selector of the scope element.
 * @returns the scoped selector list.
 */
export function scopeSelectorList(selectors: string, scope: string): string {
  return splitTopLevel(selectors, ",")
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => {
      const root = /^(:root|html|body)(?![\w-])/.exec(selector);
      if (root) {
        return `${scope}${selector.slice(root[0].length)}`;
      }
      return `${scope} ${selector}`;
    })
    .join(", ");
}

function scopeBlock(css: string, scope: string): string {
  let output = "";
  let index = 0;

  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open === -1) {
      output += css.slice(index).trim() ? css.slice(index) : "";
      break;
    }

    const close = findClosingBrace(css, open);
    const prelude = css.slice(index, open).trim();
    const body = css.slice(open + 1, close);
    index = close + 1;

    if (!prelude) {
      continue;
    }
    if (groupingAtRules.some((rule) => prelude.startsWith(rule))) {
      output += `${prelude} {${scopeBlock(body, scope)}}\n`;
    } else if (prelude.startsWith("@")) {
      output += `${prelude} {${body}}\n`;
    } else {
      output += `${scopeSelectorList(prelude, scope)} {${body}}\n`;
    }
  }

  return output;
}

function findClosingBrace(css: string, open: number): number {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") {
      depth++;
    } else if (css[index] === "}") {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }
  return css.length;
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth--;
    } else if (char === separator && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}
