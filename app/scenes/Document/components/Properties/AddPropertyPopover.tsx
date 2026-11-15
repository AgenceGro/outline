import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import { darken } from "polished";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import {
  type PropertyType,
  propertyTypes,
} from "@shared/types/documentProperties";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import Button from "~/components/Button";
import { ArcScope } from "~/components/Properties/ArcScope";
import { propertyTypeLabel } from "~/components/Properties/labels";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import { PropertyTypeIcon } from "~/components/Properties/PropertyTypeIcon";
import useStores from "~/hooks/useStores";
import { TextButton } from "./buttons";
import { FieldLabel, fieldStyles } from "./fields";
import { definitionInputFromForm } from "./createDefinition";
import { writeErrorMessage } from "./PropertyRow";

interface Props {
  /** The ID of the document. */
  documentId: string;
  /** Whether the user can create new definitions for the workspace. */
  canCreate: boolean;
  /** Called with the ID of the definition to add to the document. */
  onAdd: (definitionId: string) => void;
  /** Announces a status message to assistive technology. */
  onAnnounce: (message: string) => void;
  /** A ref to the trigger button, to return focus to it. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

/**
 * The "Add property" button and its popover, listing the open definitions
 * that are not yet on the document. Admins can also create a definition.
 *
 * @param props the component props.
 * @returns the button and popover.
 */
export const AddPropertyPopover = observer(function AddPropertyPopover({
  documentId,
  canCreate,
  onAdd,
  onAnnounce,
  triggerRef,
}: Props) {
  const { t } = useTranslation();
  const { documentProperties } = useStores();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const added = useRef(false);
  const headingId = useId();
  const available = documentProperties.availableFor(documentId);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      added.current = false;
      setCreating(false);
    }
  };

  const handleAdd = (definitionId: string) => {
    added.current = true;
    setOpen(false);
    onAdd(definitionId);
  };

  const handleCloseAutoFocus = (ev: Event) => {
    if (added.current) {
      ev.preventDefault();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <TextButton ref={triggerRef} type="button">
          <PlusIcon size={20} color="currentColor" aria-hidden="true" />
          {t("Add property")}
        </TextButton>
      </PopoverTrigger>
      <Content
        width={320}
        align="start"
        aria-labelledby={headingId}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <ArcScope>
          {creating ? (
            <CreateForm
              documentId={documentId}
              headingId={headingId}
              onCancel={() => setCreating(false)}
              onCreated={(definition) => {
                onAnnounce(t("{{ name }} created", { name: definition.name }));
                handleAdd(definition.id);
              }}
            />
          ) : (
            <>
              <Heading id={headingId}>{t("Add property")}</Heading>
              {available.length ? (
                <Choices role="list">
                  {available.map((definition) => (
                    <Choice key={definition.id}>
                      <DefinitionButton
                        definition={definition}
                        onClick={() => handleAdd(definition.id)}
                      />
                    </Choice>
                  ))}
                </Choices>
              ) : (
                <Empty>
                  {canCreate
                    ? t("Every property is already on this document.")
                    : t(
                        "Every property is already on this document. Ask an admin to create more."
                      )}
                </Empty>
              )}
              {canCreate && (
                <Footer>
                  <TextButton type="button" onClick={() => setCreating(true)}>
                    <PlusIcon
                      size={20}
                      color="currentColor"
                      aria-hidden="true"
                    />
                    {t("Create property")}
                  </TextButton>
                </Footer>
              )}
            </>
          )}
        </ArcScope>
      </Content>
    </Popover>
  );
});

function DefinitionButton({
  definition,
  onClick,
}: {
  definition: PropertyDefinition;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ChoiceButton type="button" onClick={onClick}>
      <PropertyTypeIcon type={definition.type} size={18} />
      <ChoiceName>{definition.name}</ChoiceName>
      <ChoiceType>{propertyTypeLabel(definition.type, t)}</ChoiceType>
    </ChoiceButton>
  );
}

const CreateForm = observer(function CreateForm({
  documentId,
  headingId,
  onCancel,
  onCreated,
}: {
  documentId: string;
  headingId: string;
  onCancel: () => void;
  onCreated: (definition: PropertyDefinition) => void;
}) {
  const { t } = useTranslation();
  const { propertyDefinitions, documentProperties } = useStores();
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string>();
  const nameId = useId();
  const typeId = useId();
  const optionsId = useId();
  const optionsHintId = useId();
  const errorId = useId();
  const isSelect = type === "singleSelect" || type === "multiSelect";

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const input = definitionInputFromForm({ name, type, options });
    if (!input.ok) {
      switch (input.error) {
        case "name":
          setError(t("Enter a name for the property."));
          break;
        case "nameTooLong":
          setError(t("Use a name of 150 characters or fewer."));
          break;
        case "options":
          setError(t("Add at least one option, one per line."));
          break;
        case "optionTooLong":
          setError(t("Use options of 100 characters or fewer."));
          break;
        case "tooManyOptions":
          setError(t("Use 200 options or fewer."));
          break;
      }
      return;
    }

    setError(undefined);
    try {
      const definition = await propertyDefinitions.createDefinition(
        input.value
      );
      documentProperties.addDefinition(
        {
          id: definition.id,
          name: definition.name,
          type: definition.type,
          owner: definition.owner,
          access: definition.access,
          options: definition.options,
          key: definition.key,
        },
        documentId
      );
      onCreated(definition);
    } catch (err) {
      setError(writeErrorMessage(err, t));
    }
  };

  return (
    <Form onSubmit={handleSubmit} noValidate>
      <Heading id={headingId}>{t("Create property")}</Heading>
      <div>
        <FieldLabel htmlFor={nameId}>{t("Name")}</FieldLabel>
        <Input
          id={nameId}
          value={name}
          maxLength={150}
          autoFocus
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(ev) => setName(ev.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor={typeId}>{t("Type")}</FieldLabel>
        <Select
          id={typeId}
          value={type}
          onChange={(ev) => {
            const next = propertyTypes.find((item) => item === ev.target.value);
            if (next) {
              setType(next);
            }
          }}
        >
          {propertyTypes.map((item) => (
            <option key={item} value={item}>
              {propertyTypeLabel(item, t)}
            </option>
          ))}
        </Select>
      </div>
      {isSelect && (
        <div>
          <FieldLabel htmlFor={optionsId}>{t("Options")}</FieldLabel>
          <TextArea
            id={optionsId}
            rows={4}
            value={options}
            aria-describedby={optionsHintId}
            onChange={(ev) => setOptions(ev.target.value)}
          />
          <Hint id={optionsHintId}>
            {t("One per line. Add colors and icons later in settings.")}
          </Hint>
        </div>
      )}
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
      <Actions>
        <Button type="submit" disabled={propertyDefinitions.isSaving}>
          {propertyDefinitions.isSaving ? t("Creating…") : t("Create and add")}
        </Button>
        <Button type="button" neutral onClick={onCancel}>
          {t("Back")}
        </Button>
      </Actions>
    </Form>
  );
});

const Content = styled(PopoverContent)`
  && {
    max-width: calc(100vw - 16px);
    padding: 8px;
  }
`;

const Heading = styled.h3`
  margin: 4px 8px 8px;
  color: ${s("textSecondary")};
  font-size: 14px;
  font-weight: 500;
`;

const Choices = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Choice = styled.li`
  margin: 0;
`;

const ChoiceButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("text")};
  font: inherit;
  font-size: 15px;
  text-align: start;
  cursor: var(--pointer);

  svg {
    flex: none;
    color: ${s("textSecondary")};
  }

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
`;

const ChoiceName = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const ChoiceType = styled.span`
  flex: none;
  color: ${s("textSecondary")};
  font-size: 13px;
`;

const Empty = styled.p`
  margin: 0 8px 8px;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const Footer = styled.div`
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid ${s("divider")};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 8px 8px;

  ${Heading} {
    margin: 4px 0 0;
  }
`;

const Input = styled.input<{ $invalid?: boolean }>`
  ${fieldStyles}
`;

const Select = styled.select<{ $invalid?: boolean }>`
  ${fieldStyles}
`;

const TextArea = styled.textarea<{ $invalid?: boolean }>`
  ${fieldStyles}
  resize: vertical;
  line-height: 1.4;
`;

const Hint = styled.p`
  margin: 4px 0 0;
  color: ${s("textSecondary")};
  font-size: 13px;
`;

const ErrorText = styled.p`
  margin: 0;
  color: ${(props) =>
    props.theme.isDark ? props.theme.danger : darken(0.1, props.theme.danger)};
  font-size: 14px;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
