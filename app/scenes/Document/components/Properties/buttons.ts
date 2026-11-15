import styled from "styled-components";
import { s } from "@shared/styles";

/** A borderless button that holds only an icon. */
export const IconButton = styled.button`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textSecondary")};
  cursor: var(--pointer);

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  @media (pointer: coarse) {
    width: 44px;
    height: 44px;
  }
`;

/** A borderless button with an icon and a text label. */
export const TextButton = styled.button`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textSecondary")};
  font: inherit;
  font-size: 14px;
  cursor: var(--pointer);

  &:hover:not(:disabled) {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
`;
