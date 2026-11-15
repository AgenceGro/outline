import { observer } from "mobx-react";
import { TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import NudeButton from "~/components/NudeButton";
import Text from "~/components/Text";
import Tooltip from "~/components/Tooltip";
import {
  propertyOwnerLabel,
  propertyTypeLabel,
} from "~/components/Properties/labels";
import { PropertyTypeIcon } from "~/components/Properties/PropertyTypeIcon";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import useStores from "~/hooks/useStores";
import type { PropertyUsageTracker } from "./propertyUsage";

interface Props {
  /** The section heading. */
  title: string;
  /** Optional explanation below the heading. */
  description?: string;
  /** The definitions to list. */
  definitions: PropertyDefinition[];
  /** Whether rows can be edited and deleted, or only viewed. */
  editable: boolean;
  /** Which usage counts are known. */
  usage: PropertyUsageTracker;
  /** Opens a definition for editing or viewing. */
  onOpen: (definition: PropertyDefinition, trigger: HTMLElement) => void;
  /** Asks to delete a definition. */
  onDelete?: (definition: PropertyDefinition, trigger: HTMLElement) => void;
}

/**
 * A titled group of property definitions, one row each with its type, owner,
 * access, options and usage.
 *
 * @param props the list props.
 * @returns the list section.
 */
export const PropertyDefinitionList = observer(function PropertyDefinitionList({
  title,
  description,
  definitions,
  editable,
  usage,
  onOpen,
  onDelete,
}: Props) {
  const headingId = React.useId();

  return (
    <Section aria-labelledby={headingId}>
      <Heading id={headingId}>{title}</Heading>
      {description && (
        <Text as="p" size="small" type="secondary">
          {description}
        </Text>
      )}
      <Group>
        {definitions.map((definition) => (
          <DefinitionRow
            key={definition.id}
            definition={definition}
            editable={editable}
            usage={usage}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </Group>
    </Section>
  );
});

interface RowProps {
  definition: PropertyDefinition;
  editable: boolean;
  usage: PropertyUsageTracker;
  onOpen: Props["onOpen"];
  onDelete: Props["onDelete"];
}

const DefinitionRow = observer(function DefinitionRow({
  definition,
  editable,
  usage,
  onOpen,
  onDelete,
}: RowProps) {
  const { t } = useTranslation();
  const { propertyDefinitions } = useStores();
  const name = definition.name;
  const retired = definition.options.length - definition.activeOptions.length;

  const documents = usage.usageOf(definition, propertyDefinitions.isFetching);
  const usageText =
    documents.status === "counting"
      ? `${t("Counting documents")}…`
      : documents.status === "failed"
        ? t("Usage unknown")
        : documents.count === 0
          ? t("Not used yet")
          : t("Used in {{ count }} document", { count: documents.count });

  return (
    <Row data-testid="property-definition-row">
      <Main>
        <Name>{name}</Name>
        <Meta>
          <MetaItem>
            <PropertyTypeIcon type={definition.type} size={18} />
            {propertyTypeLabel(definition.type, t)}
          </MetaItem>
          {definition.isSelect && (
            <MetaItem>
              {retired
                ? t("{{ active }} options, {{ retired }} retired", {
                    active: definition.activeOptions.length,
                    retired,
                  })
                : t("{{ count }} option", {
                    count: definition.options.length,
                  })}
            </MetaItem>
          )}
          <MetaItem>
            {t("Owner: {{ owner }}", {
              owner: propertyOwnerLabel(definition.owner, t),
            })}
          </MetaItem>
          <MetaItem>
            {definition.access === "managed"
              ? t("Access: Managed")
              : t("Access: Open")}
          </MetaItem>
          <MetaItem $numeric>{usageText}</MetaItem>
        </Meta>
      </Main>
      <Actions>
        {editable ? (
          <>
            <Button
              type="button"
              neutral
              aria-label={t("Edit {{ name }}", { name })}
              onClick={(ev: React.MouseEvent<HTMLButtonElement>) =>
                onOpen(definition, ev.currentTarget)
              }
            >
              {t("Edit")}
            </Button>
            {onDelete && (
              <Tooltip content={t("Delete property")}>
                <DeleteButton
                  type="button"
                  aria-label={t("Delete {{ name }}", { name })}
                  onClick={(ev: React.MouseEvent<HTMLButtonElement>) =>
                    onDelete(definition, ev.currentTarget)
                  }
                >
                  <TrashIcon aria-hidden="true" />
                </DeleteButton>
              </Tooltip>
            )}
          </>
        ) : (
          <Button
            type="button"
            neutral
            aria-label={t("View {{ name }}", { name })}
            onClick={(ev: React.MouseEvent<HTMLButtonElement>) =>
              onOpen(definition, ev.currentTarget)
            }
          >
            {t("View")}
          </Button>
        )}
      </Actions>
    </Row>
  );
});

const Section = styled.section`
  display: grid;
  gap: 8px;
  margin-top: 32px;
  min-width: 0;

  > p {
    margin: 0;
  }
`;

const Heading = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 500;
`;

const Group = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  min-width: 0;

  & + & {
    border-top: 1px solid ${s("inputBorder")};
  }

  @media (max-width: 560px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
`;

const Main = styled.div`
  display: grid;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const Name = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: ${s("text")};
  overflow-wrap: anywhere;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 13px;
  color: ${s("textSecondary")};
`;

const MetaItem = styled.span<{ $numeric?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: ${(props) => (props.$numeric ? "tabular-nums" : "normal")};

  svg {
    flex-shrink: 0;
    margin-inline-start: -2px;
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const DeleteButton = styled(NudeButton)`
  width: 36px;
  height: 36px;
  color: ${s("textSecondary")};

  &:hover {
    color: ${s("danger")};
  }

  @media (pointer: coarse) {
    width: 44px;
    height: 44px;
  }
`;
