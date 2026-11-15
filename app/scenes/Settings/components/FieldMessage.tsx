import type * as React from "react";
import styled from "styled-components";

interface Props {
  /** The id that the field references with aria-describedby. */
  id: string;
  /** Whether the message is an error rather than a hint or warning. */
  tone?: "error" | "warning" | "hint";
  children: React.ReactNode;
}

/**
 * A message placed directly below a field, referenced by the field with
 * aria-describedby so it is read when the field is focused.
 *
 * @param props the message props.
 * @returns the message element.
 */
export function FieldMessage({ id, tone = "hint", children }: Props) {
  return (
    <Message id={id} $tone={tone}>
      {children}
    </Message>
  );
}

/** Shared spacing for a label, field and message group. */
export const FieldGroup = styled.div`
  display: grid;
  min-width: 0;
`;

const Message = styled.p<{ $tone: "error" | "warning" | "hint" }>`
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  color: ${(props) =>
    props.$tone === "error"
      ? props.theme.danger
      : props.$tone === "warning"
        ? props.theme.textSecondary
        : props.theme.textTertiary};

  &:empty {
    display: none;
  }
`;
