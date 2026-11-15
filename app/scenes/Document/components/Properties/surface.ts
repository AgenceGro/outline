import { css } from "styled-components";

/**
 * The box of an editable value, matching the text value's editor: it starts
 * a border and padding before the column, so its content lines up with the
 * column's edge, and ends before a trailing zone that holds the value's
 * affordance. A hover tint fills the whole box.
 */
export const surfaceGeometry = css`
  --value-leading: round(var(--text-base) * 1.5, 1px);
  --value-height: calc(var(--value-leading) + 12px);
  position: relative;
  box-sizing: border-box;
  width: calc(100% - 29px);
  min-width: 0;
  margin: 0;
  margin-inline-start: -9px;
  border-radius: var(--radius-control);
`;

/** The surface's own frame, padding, and tint transition. */
export const surfaceFill = css`
  display: flex;
  align-items: center;
  min-height: var(--value-height);
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: var(--value-leading);
  text-align: start;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--duration-fast) var(--ease-standard);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** A complete surface: its box and its frame. */
export const valueSurface = css`
  ${surfaceGeometry}
  ${surfaceFill}
`;

/**
 * Places an affordance in the trailing zone, centered where the text value
 * shows its pencil and beside the first line of the value. Its positioned
 * parent spans the surface; set `--affordance-size` to the affordance's
 * size and `--affordance-border` to that parent's border width. Pointers
 * that hover reveal it on hover or keyboard focus; elsewhere it stays
 * visible, as the text value's pencil does.
 */
export const trailingAffordance = css`
  position: absolute;
  top: calc(
    6px + var(--value-leading) / 2 - var(--affordance-border, 1px) -
      var(--affordance-size) / 2
  );
  inset-inline-start: calc(
    100% + 16px + var(--affordance-border, 1px) - var(--affordance-size) / 2
  );
  margin: 0;
  color: var(--text-muted);
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-spring) var(--ease-spring);

  @media (hover: hover) and (pointer: fine) {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
