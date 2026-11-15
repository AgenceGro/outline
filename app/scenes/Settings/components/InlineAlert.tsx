import { WarningIcon } from "outline-icons";
import type * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Text from "~/components/Text";

interface Props {
  /** The id of the alert, so fields can reference it with aria-describedby. */
  id?: string;
  /** A short sentence saying what failed. */
  title: string;
  /** Optional detail, such as how to fix the problem or the server message. */
  children?: React.ReactNode;
  /** Label of the retry button. Required together with onRetry. */
  retryLabel?: string;
  /** Called when the retry button is pressed. */
  onRetry?: () => void;
  /** Whether the retry is in progress. */
  retrying?: boolean;
}

/**
 * An inline error placed next to the content it concerns, with an optional
 * retry. It is announced to assistive technology as soon as it appears.
 *
 * @param props the alert props.
 * @returns the alert element.
 */
export function InlineAlert({
  id,
  title,
  children,
  retryLabel,
  onRetry,
  retrying,
}: Props) {
  return (
    <Container id={id} role="alert">
      <StyledWarningIcon size={20} aria-hidden="true" />
      <Body>
        <Text as="p" size="small">
          {title}
        </Text>
        {children && (
          <Text as="p" size="small" type="secondary">
            {children}
          </Text>
        )}
      </Body>
      {onRetry && retryLabel && (
        <Button type="button" neutral onClick={onRetry} disabled={retrying}>
          {retryLabel}
        </Button>
      )}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  margin: 16px 0;
  border: 1px solid ${s("danger")};
  border-radius: 8px;
  background: ${s("background")};

  p {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

const Body = styled.div`
  display: grid;
  gap: 2px;
  flex: 1 1 200px;
  min-width: 0;

  p:first-child {
    font-weight: 500;
  }
`;

const StyledWarningIcon = styled(WarningIcon)`
  flex-shrink: 0;
  color: ${s("danger")};
`;
