import { transparentize } from "polished";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
} from "react";
import styled, { type DefaultTheme, useTheme } from "styled-components";
import foundationCss from "~/components/arc/foundation.css?raw";
import { arcScopeAttribute, scopeFoundationCss } from "./scopeFoundation";

interface Props {
  /** The content that uses Arc components. */
  children?: React.ReactNode;
  /** The element to render, a span keeps inline content valid. */
  as?: "div" | "span";
  /** An optional class name, for example to give the scope a box. */
  className?: string;
}

/** Whether an element is rendered inside an {@link ArcScope}. */
export const ArcScopeContext = createContext(false);

/**
 * Provides Arc's design tokens to its children without affecting the rest of
 * the app. The foundation stylesheet is rewritten to apply inside
 * `[data-arc-scope]` only, the theme follows Outline's light or dark theme,
 * and Outline's fonts, text, surface, and accent colors are mapped onto Arc's
 * tokens. Content rendered in a portal must be wrapped in its own scope.
 *
 * @param props the component props.
 * @returns the scope element.
 */
export function ArcScope({ children, as = "div", className }: Props) {
  const theme = useTheme();
  useInsertionEffect(injectFoundation, []);

  return (
    <ArcScopeContext.Provider value>
      <Scope
        as={as}
        className={className}
        data-arc-scope=""
        data-theme={theme.isDark ? "dark" : "light"}
      >
        {children}
      </Scope>
    </ArcScopeContext.Provider>
  );
}

/**
 * Whether the calling component is rendered inside an {@link ArcScope}.
 *
 * @returns true if inside a scope.
 */
export function useInArcScope(): boolean {
  return useContext(ArcScopeContext);
}

/**
 * Maps Outline's theme onto Arc's design tokens.
 *
 * @param theme the Outline theme.
 * @returns the Arc custom properties and their values.
 */
export function arcThemeTokens(theme: DefaultTheme): Record<string, string> {
  return {
    "--font-inter": theme.fontFamily,
    "--font-geist": theme.fontFamily,
    "--background": theme.background,
    "--surface": theme.background,
    "--surface-raised": theme.menuBackground,
    "--foreground": theme.text,
    "--text-secondary": theme.textSecondary,
    "--border": theme.divider,
    "--accent": theme.accent,
    "--accent-strong": theme.accent,
    "--accent-subtle": transparentize(0.88, theme.accent),
    "--accent-foreground": theme.accentText,
    "--control-on": theme.accent,
    "--control-glyph": theme.accentText,
  };
}

/**
 * Gives Arc's design tokens to an element that an Arc component renders in a
 * portal outside the scope, such as a tooltip. The element is found by its ID
 * once it mounts, and follows the current theme.
 *
 * @param id the ID of the portaled element, while it is shown.
 */
export function useArcPortalScope(id: string | undefined) {
  const theme = useTheme();
  useInsertionEffect(injectFoundation, []);

  const scope = useCallback(
    (element: HTMLElement) => {
      element.setAttribute(arcScopeAttribute, "");
      element.setAttribute("data-theme", theme.isDark ? "dark" : "light");
      for (const [name, value] of Object.entries(arcThemeTokens(theme))) {
        element.style.setProperty(name, value);
      }
    },
    [theme]
  );

  useEffect(() => {
    if (!id) {
      return;
    }
    const element = document.getElementById(id);
    if (element) {
      scope(element);
      return;
    }
    // Portals mount after their trigger, the observer scopes the element
    // before it is first painted.
    const observer = new MutationObserver(() => {
      const mounted = document.getElementById(id);
      if (mounted) {
        observer.disconnect();
        scope(mounted);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id, scope]);
}

const foundationStyleId = "arc-foundation-scoped";

function injectFoundation() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(foundationStyleId)) {
    return;
  }
  const style = document.createElement("style");
  style.id = foundationStyleId;
  style.textContent = scopeFoundationCss(foundationCss);
  document.head.appendChild(style);
}

// The doubled class outranks the scoped foundation rules, such as
// [data-arc-scope][data-theme="dark"], whatever order the sheets load in.
const Scope = styled.div`
  display: contents;

  &&[${arcScopeAttribute}] {
    ${(props) =>
      Object.entries(arcThemeTokens(props.theme))
        .map(([name, value]) => `${name}: ${value};`)
        .join("\n")}
  }
`;
