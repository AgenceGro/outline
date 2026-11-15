import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { PropertyType } from "@shared/types/documentProperties";
import { propertyTypes } from "@shared/types/documentProperties";
import Button from "~/components/Button";
import Input from "~/components/Input";
import { InputSelect } from "~/components/InputSelect";
import type { Option as SelectOption } from "~/components/InputSelect";
import Text from "~/components/Text";
import { OptionBadge } from "~/components/Properties/OptionBadge";
import {
  managedPropertyDescription,
  propertyTypeLabel,
} from "~/components/Properties/labels";
import { PropertyTypeIcon } from "~/components/Properties/PropertyTypeIcon";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import useStores from "~/hooks/useStores";
import { FieldMessage } from "./FieldMessage";
import { InlineAlert } from "./InlineAlert";
import { LiveRegion, useLiveAnnouncer } from "./LiveRegion";
import { PropertyOptionsEditor } from "./PropertyOptionsEditor";
import type { ServerFieldError } from "./propertyDefinitionForm";
import { requestErrorMessage } from "./requestError";
import {
  createDraft,
  hasErrors,
  hasOptions,
  isDraftDirty,
  parseServerFieldError,
  propertyDefinitionDraftReducer,
  propertyDefinitionLimits,
  toCreateInput,
  toUpdateInput,
  validateDraft,
} from "./propertyDefinitionForm";

interface Props {
  /** The definition to edit or view; omit to create a new one. */
  definition?: PropertyDefinition;
  /** Whether the definition is managed elsewhere and can only be viewed. */
  readOnly?: boolean;
  /**
   * Called after a successful save with the saved definition. Save responses
   * carry no usage count, so callers mark it unknown and refetch the list.
   */
  onSaved: (definition: PropertyDefinition, created: boolean) => void;
  /** Called when the dialog is dismissed without saving. */
  onCancel: () => void;
}

/**
 * Creates, edits or shows a property definition inside a modal. Validation
 * runs on save and server errors are shown beside the field they concern.
 *
 * @param props the dialog props.
 * @returns the dialog content.
 */
export const PropertyDefinitionDialog = observer(
  function PropertyDefinitionDialog({
    definition,
    readOnly,
    onSaved,
    onCancel,
  }: Props) {
    if (definition && readOnly) {
      return (
        <ManagedDefinitionDetails definition={definition} onClose={onCancel} />
      );
    }
    return (
      <DefinitionForm
        definition={definition}
        onSaved={onSaved}
        onCancel={onCancel}
      />
    );
  }
);

interface FormProps {
  definition?: PropertyDefinition;
  onSaved: (definition: PropertyDefinition, created: boolean) => void;
  onCancel: () => void;
}

const DefinitionForm = observer(function DefinitionForm({
  definition,
  onSaved,
  onCancel,
}: FormProps) {
  const { t } = useTranslation();
  const { propertyDefinitions } = useStores();
  const [draft, dispatch] = React.useReducer(
    propertyDefinitionDraftReducer,
    definition,
    (initial) => createDraft(initial, "text")
  );
  const [attempted, setAttempted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<ServerFieldError>();
  const { message, announce } = useLiveAnnouncer();
  const nameRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const nameErrorId = React.useId();
  const typeHintId = React.useId();
  const generalErrorId = React.useId();

  const otherNames = propertyDefinitions.orderedData
    .filter((other) => other.id !== definition?.id)
    .map((other) => other.name);
  const errors = validateDraft(draft, otherNames);
  const shownErrors = attempted ? errors : undefined;
  const dirty = isDraftDirty(draft, definition);

  const nameError =
    serverError?.field === "name"
      ? serverError.message
      : shownErrors?.name === "required"
        ? t("Enter a name for the property.")
        : shownErrors?.name === "tooLong"
          ? t("Use {{ count }} characters or fewer.", {
              count: propertyDefinitionLimits.name,
            })
          : undefined;
  const nameWarning =
    !nameError && errors.nameWarning === "duplicate"
      ? t(
          "Another property already has this name. People may confuse them in documents."
        )
      : undefined;

  const typeOptions = React.useMemo<SelectOption[]>(
    () =>
      propertyTypes.map((type) => ({
        type: "item",
        label: propertyTypeLabel(type, t),
        value: type,
        icon: <PropertyTypeIcon type={type} />,
      })),
    [t]
  );

  const handleName = React.useCallback(
    (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dispatch({ type: "nameChanged", name: ev.target.value });
      setServerError((current) =>
        current?.field === "name" ? undefined : current
      );
    },
    []
  );

  const handleType = React.useCallback((value: string) => {
    const propertyType = propertyTypes.find(
      (candidate): candidate is PropertyType => candidate === value
    );
    if (propertyType) {
      dispatch({ type: "typeChanged", propertyType });
    }
  }, []);

  const focusFirstInvalid = React.useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
  }, []);

  const save = React.useCallback(async () => {
    setAttempted(true);
    if (hasErrors(errors)) {
      announce(t("Some fields need attention before you can save."));
      focusFirstInvalid();
      return;
    }

    setSaving(true);
    setServerError(undefined);
    try {
      const saved = definition
        ? await propertyDefinitions.updateDefinition(
            toUpdateInput(draft, definition)
          )
        : await propertyDefinitions.createDefinition(toCreateInput(draft));

      onSaved(saved, !definition);
    } catch (err) {
      const parsed = parseServerFieldError(
        requestErrorMessage(err, t("Something went wrong"))
      );
      setServerError(parsed);
      setSaving(false);
      if (parsed.field === "name") {
        requestAnimationFrame(() => nameRef.current?.focus());
      }
    }
  }, [
    announce,
    definition,
    draft,
    errors,
    focusFirstInvalid,
    onSaved,
    propertyDefinitions,
    t,
  ]);

  const handleSubmit = React.useCallback(
    (ev: React.FormEvent) => {
      ev.preventDefault();
      void save();
    },
    [save]
  );

  const handleRetry = React.useCallback(() => {
    void save();
  }, [save]);

  return (
    <Form ref={formRef} onSubmit={handleSubmit} noValidate>
      <LiveRegion message={message} />
      <Field>
        <Input
          ref={nameRef}
          label={t("Name")}
          value={draft.name}
          onChange={handleName}
          maxLength={propertyDefinitionLimits.name}
          showCharacterCount
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError || nameWarning ? nameErrorId : undefined}
          disabled={saving}
          autoFocus
          autoComplete="off"
          margin={0}
          flex
        />
        {(nameError || nameWarning) && (
          <FieldMessage id={nameErrorId} tone={nameError ? "error" : "warning"}>
            {nameError ?? nameWarning}
          </FieldMessage>
        )}
      </Field>

      <Field>
        {definition ? (
          <ReadOnlyField>
            <Text size="small" type="secondary">
              {t("Type")}
            </Text>
            <Text>{propertyTypeLabel(definition.type, t)}</Text>
          </ReadOnlyField>
        ) : (
          <InputSelect
            label={t("Type")}
            options={typeOptions}
            value={draft.type}
            onChange={handleType}
            disabled={saving}
            aria-describedby={typeHintId}
          />
        )}
        <FieldMessage id={typeHintId}>
          {definition
            ? t("The type can’t be changed after the property is created.")
            : t("Choose carefully. The type can’t be changed later.")}
        </FieldMessage>
      </Field>

      {hasOptions(draft.type) && (
        <PropertyOptionsEditor
          type={draft.type}
          options={draft.options}
          savedOptionIds={draft.savedOptionIds}
          errors={shownErrors}
          serverError={
            serverError?.field === "options" ? serverError.message : undefined
          }
          dispatch={dispatch}
          announce={announce}
          disabled={saving}
        />
      )}

      {serverError && serverError.field !== "name" && (
        <InlineAlert
          id={generalErrorId}
          title={
            definition
              ? t("Your changes weren’t saved")
              : t("The property wasn’t created")
          }
          retryLabel={t("Try again")}
          onRetry={handleRetry}
          retrying={saving}
        >
          {serverError.message}
        </InlineAlert>
      )}

      <Footer>
        <Button type="button" neutral onClick={onCancel} disabled={saving}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={saving || !dirty}>
          {saving
            ? `${t("Saving")}…`
            : definition
              ? t("Save changes")
              : t("Create property")}
        </Button>
      </Footer>
    </Form>
  );
});

interface DetailsProps {
  definition: PropertyDefinition;
  onClose: () => void;
}

const ManagedDefinitionDetails = observer(function ManagedDefinitionDetails({
  definition,
  onClose,
}: DetailsProps) {
  const { t } = useTranslation();

  return (
    <Form as="div">
      <Text as="p" type="secondary">
        {managedPropertyDescription(definition.owner, t)}
      </Text>
      <Details>
        <dt>{t("Type")}</dt>
        <dd>{propertyTypeLabel(definition.type, t)}</dd>
        {definition.isSelect && (
          <>
            <dt>{t("Options")}</dt>
            <dd>
              {definition.options.length ? (
                <BadgeList>
                  {definition.options.map((option) => (
                    <li key={option.id}>
                      <OptionBadge option={option} size="sm" />
                    </li>
                  ))}
                </BadgeList>
              ) : (
                t("No options")
              )}
            </dd>
          </>
        )}
      </Details>
      <Footer>
        <Button type="button" neutral onClick={onClose}>
          {t("Close")}
        </Button>
      </Footer>
    </Form>
  );
});

const Form = styled.form`
  display: grid;
  gap: 20px;
  min-width: 0;
  padding-top: 8px;

  > p {
    margin: 0;
  }
`;

const Field = styled.div`
  display: grid;
  min-width: 0;
`;

const ReadOnlyField = styled.div`
  display: grid;
  gap: 4px;
`;

const Footer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
`;

const Details = styled.dl`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0;
  font-size: 14px;

  dt {
    color: ${(props) => props.theme.textSecondary};
  }

  dd {
    margin: 0;
    min-width: 0;
  }
`;

const BadgeList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
`;
