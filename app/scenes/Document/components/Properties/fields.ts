import styled, { css } from "styled-components";
import { s } from "@shared/styles";

/** Styles shared by the text fields of the properties panel. */
export const fieldStyles = css<{ $invalid?: boolean }>`
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid
    ${(props) =>
      props.$invalid ? props.theme.danger : props.theme.inputBorder};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  font: inherit;
  font-size: 15px;
  outline: none;

  &:focus {
    border-color: ${(props) =>
      props.$invalid ? props.theme.danger : props.theme.inputBorderFocused};
  }

  &::placeholder {
    color: ${s("placeholder")};
  }

  @media (pointer: coarse) {
    min-height: 44px;
    font-size: 16px;
  }
`;

/** A visible label above a field. */
export const FieldLabel = styled.label`
  display: block;
  margin-bottom: 4px;
  color: ${s("textSecondary")};
  font-size: 14px;
  font-weight: 500;
`;
