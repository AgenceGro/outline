import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import type { TFunction } from "i18next";
import { Pencil } from "lucide-react";
import { observer } from "mobx-react";
import { CloseIcon } from "outline-icons";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { darken } from "polished";
import styled from "styled-components";
import { s } from "@shared/styles";
import type { AssignedPropertyValue } from "~/models/DocumentPropertyValue";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import { Switch } from "~/components/arc/switch/switch";
import Button from "~/components/Button";
import { optionBadgeContainer } from "~/components/Properties/OptionBadge";
import { managedPropertyDescription } from "~/components/Properties/labels";
import { PropertyTypeIcon } from "~/components/Properties/PropertyTypeIcon";
import useStores from "~/hooks/useStores";
import type { PropertyWriteResult } from "~/stores/DocumentPropertiesStore";
import { AuthorizationError, BadRequestError } from "~/utils/errors";
import { IconButton, TextButton } from "./buttons";
import { DateValue } from "./DateValue";
import { ManagedValue } from "./ManagedValue";
import { MultiSelectValue } from "./MultiSelectValue";
import { PropertyEditor } from "./PropertyEditor";
import { PropertyValueView } from "./PropertyValueView";
import { SelectValue } from "./SelectValue";
import {
  surfaceFill,
  surfaceGeometry,
  trailingAffordance,
  valueSurface,
} from "./surface";
import { type TextSaveTrigger, TextValue } from "./TextValue";
import {
  type PropertyDraft,
  draftFromValue,
  parseDraft,
  propertyErrorMessage,
} from "./values";

interface Props {
  /** The ID of the document. */
  documentId: string;
  /** The definition of the property. */
  definition: PropertyDefinition;
  /** The value of the property, unless it was just added. */
  value?: AssignedPropertyValue;
  /** Whether the user can edit the document's properties. */
  canEdit: boolean;
  /** Whether the property was just added and has no value yet. */
  isNew?: boolean;
  /** Called when a newly added property is saved or abandoned. */
  onSettled?: (definitionId: string, saved: boolean) => void;
  /**
   * Called when the row starts or stops editing, so the panel keeps it
   * mounted if its value is cleared elsewhere in the meantime.
   */
  onEditingChange?: (definitionId: string, editing: boolean) => void;
  /** Announces a status message to assistive technology. */
  onAnnounce: (message: string) => void;
}

/** Types edited in place, without a separate edit button. */
type InlineKind = "single" | "multi" | "text" | "date";

/** How a write from an in-place editor ended. */
type CommitResult = "saved" | "conflict" | "invalid" | "failed";

function inlineKindFor(
  type: PropertyDefinition["type"]
): InlineKind | undefined {
  switch (type) {
    case "singleSelect":
      return "single";
    case "multiSelect":
      return "multi";
    case "text":
      return "text";
    case "date":
      return "date";
    default:
      return undefined;
  }
}

/**
 * A property of a document: its name, and its value with a typed editor for
 * those who can edit it. Select, text, and date values are edited in place;
 * other types open an editor from a button. Managed properties are always
 * read-only, and say who manages them in a tooltip.
 *
 * @param props the component props.
 * @returns the row.
 */
export const PropertyRow = observer(function PropertyRow({
  documentId,
  definition,
  value,
  canEdit,
  isNew = false,
  onSettled,
  onEditingChange,
  onAnnounce,
}: Props) {
  const { t } = useTranslation();
  const { documentProperties } = useStores();
  const labelId = useId();
  const errorId = useId();
  const managedId = useId();
  const editable = canEdit && !definition.isManaged;
  const isCheckbox = definition.type === "checkbox";
  const inlineKind = editable ? inlineKindFor(definition.type) : undefined;
  const [editing, setEditing] = useState(
    isNew && editable && !isCheckbox && !inlineKind
  );
  const [draft, setDraft] = useState<PropertyDraft>(() =>
    draftFromValue(definition.type, value?.value)
  );
  const [baseVersion, setBaseVersion] = useState(() =>
    documentProperties.versionFor(documentId, definition.id)
  );
  const [error, setError] = useState<string>();
  const [writing, setWriting] = useState(false);
  // In-place editors: whether one is open, the change a conflict kept, and
  // the write to repeat after a failure.
  const [inlineEditing, setInlineEditing] = useState(false);
  const [kept, setKept] = useState<PropertyDraft>();
  const [retry, setRetry] = useState<{
    draft: PropertyDraft;
    version: number;
  }>();
  const [textReset, setTextReset] = useState(0);
  const [textRefocus, setTextRefocus] = useState(false);
  const baseRef = useRef(baseVersion);
  const textSaveStarted = useRef(false);
  const settled = useRef(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  const announcedVersion = useRef<number | undefined>(undefined);
  const conflict = documentProperties.hasConflict(documentId, definition.id);
  const saving = documentProperties.isSaving(documentId, definition.id);
  const latest = documentProperties.valueFor(documentId, definition.id);
  const latestVersion = documentProperties.versionFor(
    documentId,
    definition.id
  );
  const shownVersion = value?.version ?? latestVersion;
  const textEditing = inlineKind === "text" && inlineEditing;
  const editingNow = editing || textEditing;
  // A newer saved version, including a clear, arrived while editing: the
  // draft is kept and the user chooses between it and the current value.
  // The row's own write is not a change from elsewhere.
  const stale = editingNow && !writing && latestVersion !== baseVersion;
  const showConflict = stale || conflict || kept !== undefined;

  useEffect(() => {
    if (wasEditing.current && !editing) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!(editing || inlineEditing) || !onEditingChange) {
      return;
    }
    onEditingChange(definition.id, true);
    return () => onEditingChange(definition.id, false);
  }, [editing, inlineEditing, onEditingChange, definition.id]);

  useEffect(() => {
    if (!editingNow || !showConflict) {
      announcedVersion.current = undefined;
      return;
    }
    if (announcedVersion.current !== latestVersion) {
      announcedVersion.current = latestVersion;
      onAnnounce(t("{{ name }} changed elsewhere", { name: definition.name }));
    }
  }, [editingNow, showConflict, latestVersion, onAnnounce, definition.name, t]);

  const finish = (saved: boolean) => {
    setEditing(false);
    setError(undefined);
    documentProperties.dismissConflict(documentId, definition.id);
    if (isNew) {
      onSettled?.(definition.id, saved);
    }
  };

  const handleEdit = () => {
    setDraft(draftFromValue(definition.type, value?.value));
    setBaseVersion(shownVersion);
    setError(undefined);
    documentProperties.dismissConflict(documentId, definition.id);
    setEditing(true);
  };

  const handleResult = (result: PropertyWriteResult, message: string) => {
    if (result.status === "conflict") {
      setError(undefined);
      return false;
    }
    setBaseVersion(result.value.version);
    onAnnounce(message);
    return true;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const parsed = parseDraft(definition, draft, value?.value);
    if (!parsed.ok) {
      setError(propertyErrorMessage(parsed.error, t));
      return;
    }

    // Only "Keep my edit" adopts the latest version, the one rendered with
    // the current value in the notice. Otherwise the write is based on the
    // version captured when editing started.
    const version = showConflict ? latestVersion : baseVersion;
    if (showConflict) {
      setBaseVersion(latestVersion);
    }

    setWriting(true);
    try {
      if (parsed.value === null) {
        if (!latest) {
          finish(false);
          return;
        }
        const result = await documentProperties.clearValue(
          documentId,
          definition.id,
          version
        );
        if (
          handleResult(
            result,
            t("{{ name }} removed", { name: definition.name })
          )
        ) {
          finish(true);
        }
        return;
      }

      const result = await documentProperties.setValue(
        documentId,
        definition.id,
        parsed.value,
        version
      );
      if (
        handleResult(result, t("{{ name }} saved", { name: definition.name }))
      ) {
        finish(true);
      }
    } catch (err) {
      setError(writeErrorMessage(err, t));
    } finally {
      setWriting(false);
    }
  };

  const remove = async (version: number) => {
    if (!value) {
      finish(false);
      return;
    }
    setWriting(true);
    try {
      const result = await documentProperties.clearValue(
        documentId,
        definition.id,
        version
      );
      if (
        handleResult(result, t("{{ name }} removed", { name: definition.name }))
      ) {
        finish(true);
      }
    } catch (err) {
      setError(writeErrorMessage(err, t));
    } finally {
      setWriting(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setError(undefined);
    try {
      const result = await documentProperties.setValue(
        documentId,
        definition.id,
        checked,
        shownVersion
      );
      if (
        handleResult(
          result,
          t("{{ name }} saved", { name: definition.name })
        ) &&
        isNew
      ) {
        onSettled?.(definition.id, true);
      }
    } catch (err) {
      setError(writeErrorMessage(err, t));
    }
  };

  /** Reports a new property as saved or abandoned, once. */
  const settleNew = (saved: boolean) => {
    if (isNew && !settled.current) {
      settled.current = true;
      onSettled?.(definition.id, saved);
    }
  };

  /** An in-place editor opened: its writes are based on the shown version. */
  const begin = () => {
    baseRef.current = shownVersion;
    setBaseVersion(shownVersion);
    setError(undefined);
    setRetry(undefined);
    documentProperties.dismissConflict(documentId, definition.id);
    setKept(undefined);
    setInlineEditing(true);
  };

  /**
   * Writes a change from an in-place editor, based on the given version. A
   * conflict keeps the change, so the user can keep it or use the current
   * value.
   */
  const commit = async (
    next: PropertyDraft,
    version: number,
    reportErrors: boolean
  ): Promise<CommitResult> => {
    const parsed = parseDraft(definition, next, value?.value);
    if (!parsed.ok) {
      setError(propertyErrorMessage(parsed.error, t));
      return "invalid";
    }
    setError(undefined);
    setRetry(undefined);
    if (parsed.value === null && !latest) {
      settleNew(false);
      return "saved";
    }

    setWriting(true);
    try {
      const result =
        parsed.value === null
          ? await documentProperties.clearValue(
              documentId,
              definition.id,
              version
            )
          : await documentProperties.setValue(
              documentId,
              definition.id,
              parsed.value,
              version
            );
      if (result.status === "conflict") {
        setKept(next);
        return "conflict";
      }
      setKept(undefined);
      baseRef.current = result.value.version;
      setBaseVersion(result.value.version);
      onAnnounce(
        parsed.value === null
          ? t("{{ name }} removed", { name: definition.name })
          : t("{{ name }} saved", { name: definition.name })
      );
      settleNew(true);
      return "saved";
    } catch (err) {
      // The text editor explains a failed save itself; only reasons it
      // cannot give are added here.
      if (
        reportErrors ||
        err instanceof AuthorizationError ||
        err instanceof BadRequestError
      ) {
        setError(writeErrorMessage(err, t));
      }
      if (reportErrors) {
        setRetry({ draft: next, version });
      }
      return "failed";
    } finally {
      setWriting(false);
    }
  };

  const handleChoice = (next: PropertyDraft) => {
    setInlineEditing(false);
    void commit(next, baseRef.current, true);
  };

  const handleDismiss = () => {
    setInlineEditing(false);
    settleNew(false);
  };

  const handleTextEditing = (active: boolean) => {
    if (active) {
      textSaveStarted.current = false;
      setTextRefocus(false);
      begin();
      return;
    }
    setInlineEditing(false);
    // The editor saves just after it closes; a close without a save is a
    // cancel. A value changed elsewhere meanwhile is shown afresh.
    setTimeout(() => {
      if (textSaveStarted.current) {
        return;
      }
      if (
        documentProperties.versionFor(documentId, definition.id) !==
        baseRef.current
      ) {
        setTextRefocus(true);
        setTextReset((key) => key + 1);
      }
      settleNew(false);
    });
  };

  const handleTextSave = async (next: string, trigger: TextSaveTrigger) => {
    textSaveStarted.current = true;
    // Leaving the field does not choose between the edit and the value that
    // changed elsewhere: both are kept until the user chooses.
    if (stale && trigger === "blur") {
      setKept(next);
      setTextReset((key) => key + 1);
      throw new Error("The text changed elsewhere");
    }
    // After the notice, saving replaces the current value it showed.
    const version = stale ? latestVersion : baseRef.current;
    const result = await commit(next, version, false);
    if (result === "saved") {
      return;
    }
    if (result === "conflict") {
      setTextRefocus(trigger === "commit");
      setTextReset((key) => key + 1);
    }
    throw new Error("The text was not saved");
  };

  const validateText = (next: string) => {
    const parsed = parseDraft(definition, next, value?.value);
    return parsed.ok ? null : propertyErrorMessage(parsed.error, t);
  };

  const keepChange = () => {
    if (kept === undefined) {
      return;
    }
    void commit(kept, latestVersion, true);
  };

  const useCurrentValue = () => {
    setKept(undefined);
    documentProperties.dismissConflict(documentId, definition.id);
    settleNew(false);
  };

  const handleKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }
  };

  const keptValue =
    kept === undefined ? undefined : parseDraft(definition, kept, value?.value);
  const conflictNotice = showConflict ? (
    <Notice role={editingNow ? undefined : "alert"}>
      <span>
        {textEditing
          ? t(
              "This property changed elsewhere. Press Enter to replace the current value with your edit, or Escape to discard it."
            )
          : editing
            ? t(
                "This property changed elsewhere. Your edit is kept: choose “Keep my edit” to replace the current value, or “Use current value” to discard your edit."
              )
            : kept !== undefined
              ? t(
                  "This property changed elsewhere, so your edit was not saved. Choose “Keep my edit” to replace the current value, or “Use current value” to discard your edit."
                )
              : t(
                  "This property changed elsewhere, so your change was not saved. Check the current value and try again."
                )}
      </span>
      <Latest>
        <span>{t("Current value")}:</span>{" "}
        {latest ? (
          <PropertyValueView definition={definition} value={latest.value} />
        ) : (
          <span>{t("No value")}</span>
        )}
      </Latest>
      {!editingNow && keptValue?.ok && (
        <Latest>
          <span>{t("Your edit")}:</span>{" "}
          {keptValue.value === null ? (
            <span>{t("No value")}</span>
          ) : (
            <PropertyValueView
              definition={definition}
              value={keptValue.value}
            />
          )}
        </Latest>
      )}
      {!editingNow && kept !== undefined ? (
        <NoticeActions>
          <TextButton type="button" disabled={saving} onClick={keepChange}>
            {t("Keep my edit")}
          </TextButton>
          <TextButton type="button" disabled={saving} onClick={useCurrentValue}>
            {t("Use current value")}
          </TextButton>
        </NoticeActions>
      ) : !editingNow ? (
        <TextButton
          type="button"
          onClick={() =>
            documentProperties.dismissConflict(documentId, definition.id)
          }
        >
          {t("Dismiss")}
        </TextButton>
      ) : null}
    </Notice>
  ) : null;
  const errorNotice = error ? (
    <ErrorText id={errorId} role="alert">
      {error}
      {retry && (
        <>
          {" "}
          <TextButton
            type="button"
            disabled={saving}
            onClick={() => void commit(retry.draft, retry.version, true)}
          >
            {t("Try again")}
          </TextButton>
        </>
      )}
    </ErrorText>
  ) : null;

  const inlineValue =
    inlineKind === "single" ? (
      <SelectValue
        definition={definition}
        value={value?.value}
        autoOpen={isNew}
        disabled={saving}
        onOpen={begin}
        onChoose={handleChoice}
        onDismiss={handleDismiss}
      />
    ) : inlineKind === "multi" ? (
      <MultiSelectValue
        definition={definition}
        value={value?.value}
        autoOpen={isNew}
        onOpen={begin}
        onCommit={handleChoice}
        onDismiss={handleDismiss}
      />
    ) : inlineKind === "text" ? (
      <TextValue
        definition={definition}
        value={typeof value?.value === "string" ? value.value : ""}
        placeholder={t("Enter text")}
        resetKey={textReset}
        autoEdit={isNew}
        focusOnReset={textRefocus}
        validate={validateText}
        onEditingChange={handleTextEditing}
        onSave={handleTextSave}
      />
    ) : inlineKind === "date" ? (
      <DateValue
        definition={definition}
        value={value?.value}
        autoOpen={isNew}
        saving={saving}
        onOpen={begin}
        onChoose={handleChoice}
        onDismiss={handleDismiss}
      />
    ) : null;

  return (
    <Row data-testid={`property-row-${definition.id}`}>
      <Name>
        <NameLine>
          <PropertyTypeIcon type={definition.type} size={18} />
          <NameText id={labelId}>{definition.name}</NameText>
        </NameLine>
        {definition.isManaged && (
          <VisuallyHidden.Root id={managedId}>
            {managedPropertyDescription(definition.owner, t)}
          </VisuallyHidden.Root>
        )}
      </Name>

      <ValueCell
        aria-labelledby={labelId}
        aria-describedby={definition.isManaged ? managedId : undefined}
        role="group"
      >
        {definition.isManaged ? (
          <ManagedValue definition={definition} value={value?.value} />
        ) : inlineValue ? (
          inlineValue
        ) : isCheckbox ? (
          editable ? (
            <CheckField>
              <CheckSurface>
                <ValueSwitch
                  checked={value?.value === true}
                  disabled={saving}
                  aria-labelledby={labelId}
                  aria-describedby={error ? errorId : undefined}
                  onCheckedChange={handleToggle}
                />
              </CheckSurface>
              {(value || isNew) && (
                <RemoveButton
                  type="button"
                  aria-label={t("Remove {{ name }}", { name: definition.name })}
                  disabled={saving}
                  onClick={() => remove(shownVersion)}
                >
                  <CloseIcon
                    size={20}
                    color="currentColor"
                    aria-hidden="true"
                  />
                </RemoveButton>
              )}
            </CheckField>
          ) : (
            <Inline>
              {value ? (
                <PropertyValueView
                  definition={definition}
                  value={value.value}
                />
              ) : null}
            </Inline>
          )
        ) : editing ? (
          <Form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
            <PropertyEditor
              definition={definition}
              draft={draft}
              onChange={setDraft}
              previous={value?.value}
              labelId={labelId}
              errorId={error ? errorId : undefined}
              autoFocus
            />
            <Actions>
              <Button type="submit" disabled={saving}>
                {showConflict ? t("Keep my edit") : t("Save")}
              </Button>
              {showConflict && (
                <Button
                  type="button"
                  neutral
                  disabled={saving}
                  onClick={() => finish(false)}
                >
                  {t("Use current value")}
                </Button>
              )}
              <Button
                type="button"
                neutral
                disabled={saving}
                onClick={() => finish(false)}
              >
                {t("Cancel")}
              </Button>
              {value && !showConflict && (
                <Button
                  type="button"
                  neutral
                  disabled={saving}
                  onClick={() => remove(baseVersion)}
                >
                  {t("Remove value")}
                </Button>
              )}
            </Actions>
          </Form>
        ) : editable ? (
          <EditSurface>
            <EditActivator
              ref={editButtonRef}
              type="button"
              aria-label={t("Edit {{ name }}", { name: definition.name })}
              onClick={handleEdit}
            >
              <EditPencil size={14} strokeWidth={1.75} aria-hidden="true" />
            </EditActivator>
            <EditContent>
              {value ? (
                <PropertyValueView
                  definition={definition}
                  value={value.value}
                />
              ) : (
                <Empty>{t("No value")}</Empty>
              )}
            </EditContent>
          </EditSurface>
        ) : (
          <Inline>
            {value ? (
              <PropertyValueView definition={definition} value={value.value} />
            ) : (
              <Empty>{t("No value")}</Empty>
            )}
          </Inline>
        )}
        {errorNotice}
        {conflictNotice}
      </ValueCell>
    </Row>
  );
});

/**
 * Explains why a write failed, saying what the user can do.
 *
 * @param err the error thrown by the write.
 * @param t the translation function.
 * @returns the translated message.
 */
export function writeErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof BadRequestError && err.message) {
    return err.message;
  }
  if (err instanceof AuthorizationError) {
    return t("You cannot edit this property. Ask an admin for access.");
  }
  return t(
    "The value could not be saved. Check your connection and try again."
  );
}

const Row = styled.li`
  position: relative;
  z-index: 0;
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
  gap: 4px 16px;
  align-items: start;
  padding: 4px 0;

  /* Each row keeps its layers to itself. The row being edited, or with an
     open list, rises above the rows after it so its list is never covered,
     and stays below menus and headers elsewhere in the app. */
  &:focus-within,
  &:has([aria-expanded="true"]) {
    z-index: 1;
  }

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Name = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  min-height: 32px;
  min-width: 0;
  color: ${s("textSecondary")};
  font-size: 14px;
  line-height: 1.4;

  svg {
    flex: none;
  }
`;

const NameLine = styled.span`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;

  svg {
    margin-block: calc((1lh - 18px) / 2);
  }
`;

const NameText = styled.span`
  min-width: 0;
  overflow-wrap: anywhere;
`;

const ValueCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 15px;
  color: ${s("text")};
`;

const Inline = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  min-width: 0;
  ${optionBadgeContainer("36px")}

  > :first-child {
    min-width: 0;
  }

  @media (pointer: coarse) {
    --option-badge-reserve: 48px;
  }
`;

/**
 * A value edited in a form spans the column like the text value: the whole
 * surface opens the editor, while a link in the value still opens the link.
 */
const EditSurface = styled.div`
  ${valueSurface}

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:has(a:hover)) {
      background: var(--surface-muted);
    }
  }
`;

/** Covers the surface, under its content, so any press on it edits. */
const EditActivator = styled.button`
  position: absolute;
  inset: -1px;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
`;

const EditPencil = styled(Pencil)`
  --affordance-size: 14px;
  ${trailingAffordance}

  @media (hover: hover) and (pointer: fine) {
    ${EditSurface}:hover:not(:has(a:hover)) & {
      opacity: 1;
    }
  }

  ${EditActivator}:focus-visible > & {
    opacity: 1;
  }
`;

/** Lets presses through to the activator, except on links. */
const EditContent = styled.div`
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  pointer-events: none;

  a {
    pointer-events: auto;
  }
`;

/** Positions the checkbox's surface and its remove button. */
const CheckField = styled.div`
  ${surfaceGeometry}
  display: grid;
`;

/**
 * The whole surface toggles the switch. Keyboard focus rings the surface
 * rather than the small switch, using the foundation's focus outline tokens.
 */
const CheckSurface = styled.label`
  ${surfaceFill}
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:has([role="switch"]:disabled)) {
      background: var(--surface-muted);
    }
  }

  &:has([role="switch"]:disabled) {
    cursor: progress;
  }

  &:has([role="switch"]:focus-visible) {
    outline: var(--focus-outline-width, 2px) solid
      var(
        --focus-outline,
        color-mix(in oklab, var(--accent-strong) 72%, transparent)
      );
    outline-offset: var(--focus-outline-offset, 2px);
  }
`;

/**
 * Sits in the trailing zone, where the other values show their affordance.
 * With touch it always shows, so a tap never meets a hidden button.
 */
const RemoveButton = styled(IconButton)`
  --affordance-size: 32px;
  --affordance-border: 0px;
  ${trailingAffordance}

  @media (pointer: coarse) {
    --affordance-size: 44px;
  }

  @media (hover: hover) and (pointer: fine) {
    ${CheckField}:hover > &,
    ${CheckField}:has(:focus-visible) > & {
      opacity: 1;
    }
  }

  @media (any-pointer: coarse) {
    opacity: 1;
  }
`;

const Empty = styled.span`
  color: ${s("textSecondary")};
`;

/**
 * Fits the value's line, so the row keeps the height of the other values.
 * A save in progress keeps it at full strength, so a toggle never flickers.
 */
const ValueSwitch = styled(Switch)`
  && {
    min-height: 0;
  }

  &&:disabled {
    opacity: 1;
    cursor: progress;
  }

  &:focus-visible {
    --focus-outline: transparent;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ErrorText = styled.p`
  margin: 0;
  color: ${(props) =>
    props.theme.isDark ? props.theme.danger : darken(0.1, props.theme.danger)};
  font-size: 14px;
`;

const Notice = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  background: ${s("backgroundSecondary")};
  font-size: 14px;
`;

const Latest = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  color: ${s("textSecondary")};
  ${optionBadgeContainer()}
`;

const NoticeActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
`;
