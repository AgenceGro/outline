import styled, { css } from "styled-components";

/**
 * The box of the properties section. Collapsed, the section is always
 * `--properties-height` tall, its footer included, whether it is loading,
 * empty, short, or overflowing, so the document below never moves.
 */
export const panelFrame = css`
  --properties-height: 12rem;
  --properties-footer: 2.5rem;
  --properties-gap: 4px;
  --properties-rows: calc(
    var(--properties-height) - var(--properties-footer) - var(--properties-gap)
  );
  margin: 12px 0 20px;
  min-width: 0;

  @media (pointer: coarse) {
    --properties-footer: 44px;
  }
`;

/** Blank space the size of the collapsed section, held until it can show. */
export const ReservedPanel = styled.div.attrs({ "aria-hidden": true })`
  ${panelFrame}
  height: var(--properties-height);
`;
