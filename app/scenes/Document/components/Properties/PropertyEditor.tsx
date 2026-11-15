import { observer } from "mobx-react";
import { CloseIcon, PlusIcon } from "outline-icons";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import type { PropertyData } from "@shared/types/documentProperties";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import {
  OptionBadge,
  optionBadgeContainer,
} from "~/components/Properties/OptionBadge";
import { IconButton, TextButton } from "./buttons";
import { fieldStyles } from "./fields";
import { type PropertyDraft, propertyValueLimits } from "./values";

interface Props {
  /** The definition of the property being edited. */
  definition: PropertyDefinition;
  /** The current draft. */
  draft: PropertyDraft;
  /** Called with the new draft when the user changes it. */
  onChange: (draft: PropertyDraft) => void;
  /** The stored value, so assigned retired options remain choosable. */
  previous?: PropertyData | null;
  /** The ID of the element that labels the property. */
  labelId: string;
  /** The ID of the element that describes an error, if any. */
  errorId?: string;
  /** Whether to focus the editor when it mounts. */
  autoFocus?: boolean;
}

/**
 * Edits a draft value with the native control for the property type. The
 * checkbox type is edited directly in its row and is not handled here.
 *
 * @param props the component props.
 * @returns the editor.
 */
export const PropertyEditor = observer(function PropertyEditor({
  definition,
  draft,
  onChange,
  previous,
  labelId,
  errorId,
  autoFocus,
}: Props) {
  const { t } = useTranslation();
  const invalid = Boolean(errorId);
  const text = typeof draft === "string" ? draft : "";
  const common = {
    "aria-labelledby": labelId,
    "aria-describedby": errorId,
    "aria-invalid": invalid || undefined,
    autoFocus,
  };

  switch (definition.type) {
    case "number":
      return (
        <Field
          {...common}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(ev) => onChange(ev.target.value)}
          $invalid={invalid}
          $numeric
        />
      );

    case "date":
      return (
        <Field
          {...common}
          type="date"
          value={text}
          onChange={(ev) => onChange(ev.target.value)}
          $invalid={invalid}
        />
      );

    case "url":
      return (
        <Field
          {...common}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
          value={text}
          onChange={(ev) => onChange(ev.target.value)}
          $invalid={invalid}
        />
      );

    case "singleSelect":
    case "multiSelect":
      return (
        <OptionChoices
          definition={definition}
          draft={draft}
          onChange={onChange}
          previous={previous}
          labelId={labelId}
          errorId={errorId}
          autoFocus={autoFocus}
        />
      );

    case "textList":
      return (
        <TextListEditor
          items={Array.isArray(draft) ? draft : []}
          onChange={onChange}
          labelId={labelId}
          errorId={errorId}
          autoFocus={autoFocus}
        />
      );

    default:
      return (
        <TextArea
          {...common}
          rows={2}
          maxLength={propertyValueLimits.textLength}
          placeholder={t("Enter text")}
          value={text}
          onChange={(ev) => onChange(ev.target.value)}
          $invalid={invalid}
        />
      );
  }
});

const OptionChoices = observer(function OptionChoices({
  definition,
  draft,
  onChange,
  previous,
  labelId,
  errorId,
  autoFocus,
}: Omit<Props, "draft"> & { draft: PropertyDraft }) {
  const { t } = useTranslation();
  const multiple = definition.type === "multiSelect";
  const selected = Array.isArray(draft)
    ? draft
    : typeof draft === "string" && draft
      ? [draft]
      : [];
  const assigned = Array.isArray(previous)
    ? previous
    : typeof previous === "string"
      ? [previous]
      : [];
  const choices = definition.options.filter(
    (option) => !option.retired || assigned.includes(option.id)
  );
  const name = `property-${definition.id}`;

  if (!choices.length) {
    return (
      <Hint id={errorId}>
        {t(
          "This property has no options yet. An admin can add them in settings."
        )}
      </Hint>
    );
  }

  const handleChange = (id: string, checked: boolean) => {
    if (!multiple) {
      onChange(id);
      return;
    }
    onChange(
      checked
        ? [...selected.filter((value) => value !== id), id]
        : selected.filter((value) => value !== id)
    );
  };

  return (
    <Choices
      aria-labelledby={labelId}
      aria-describedby={errorId}
      role={multiple ? "group" : "radiogroup"}
    >
      {choices.map((option, index) => (
        <Choice key={option.id}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            value={option.id}
            checked={selected.includes(option.id)}
            autoFocus={autoFocus && index === 0}
            onChange={(ev) => handleChange(option.id, ev.target.checked)}
          />
          <OptionBadge option={option} />
        </Choice>
      ))}
    </Choices>
  );
});

interface TextListEditorProps {
  items: string[];
  onChange: (draft: PropertyDraft) => void;
  labelId: string;
  errorId?: string;
  autoFocus?: boolean;
}

function TextListEditor({
  items,
  onChange,
  labelId,
  errorId,
  autoFocus,
}: TextListEditorProps) {
  const { t } = useTranslation();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const rows = items.length ? items : [""];
  const canAdd = rows.length < propertyValueLimits.listItems;

  // Focus moves to an item once the parent renders the changed list.
  useEffect(() => {
    const index = pendingFocus.current;
    if (index !== null) {
      pendingFocus.current = null;
      inputs.current[Math.min(index, rows.length - 1)]?.focus();
    }
  }, [items, rows.length]);

  const handleAdd = (after: number) => {
    if (!canAdd) {
      return;
    }
    const next = [...rows];
    next.splice(after + 1, 0, "");
    onChange(next);
    pendingFocus.current = after + 1;
  };

  const handleRemove = (index: number) => {
    onChange(rows.filter((_, position) => position !== index));
    pendingFocus.current = Math.max(0, index - 1);
  };

  return (
    <ListEditor role="group" aria-labelledby={labelId}>
      <ol>
        {rows.map((item, index) => (
          <ListRow key={index}>
            <Field
              ref={(element) => {
                inputs.current[index] = element;
              }}
              type="text"
              value={item}
              maxLength={propertyValueLimits.listItemLength}
              aria-label={t("Item {{ number }}", { number: index + 1 })}
              aria-describedby={errorId}
              autoFocus={autoFocus && index === 0}
              onChange={(ev) => {
                const next = [...rows];
                next[index] = ev.target.value;
                onChange(next);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.nativeEvent.isComposing) {
                  ev.preventDefault();
                  handleAdd(index);
                }
              }}
              $invalid={Boolean(errorId)}
            />
            <IconButton
              type="button"
              aria-label={t("Remove item {{ number }}", { number: index + 1 })}
              onClick={() => handleRemove(index)}
            >
              <CloseIcon size={20} aria-hidden="true" />
            </IconButton>
          </ListRow>
        ))}
      </ol>
      <TextButton
        type="button"
        onClick={() => handleAdd(rows.length - 1)}
        disabled={!canAdd}
      >
        <PlusIcon size={20} aria-hidden="true" />
        {t("Add item")}
      </TextButton>
    </ListEditor>
  );
}

/** A single-line input styled to match Outline's fields. */
const Field = styled.input<{ $invalid?: boolean; $numeric?: boolean }>`
  ${fieldStyles}
  ${(props) => props.$numeric && "font-variant-numeric: tabular-nums;"}
`;

const TextArea = styled.textarea<{ $invalid?: boolean }>`
  ${fieldStyles}
  resize: vertical;
  line-height: 1.4;
`;

const Hint = styled.p`
  margin: 0;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const Choices = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
  ${optionBadgeContainer("24px")}
`;

const Choice = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  max-width: 100%;
  cursor: var(--pointer);

  input {
    margin: 0;
    accent-color: ${s("accent")};
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
`;

const ListEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  ol {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
`;

const ListRow = styled.li`
  display: flex;
  align-items: center;
  gap: 4px;
`;
