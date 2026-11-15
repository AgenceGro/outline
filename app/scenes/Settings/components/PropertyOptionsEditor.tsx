import { observer } from "mobx-react";
import { CaretDownIcon, CaretUpIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import { colorPalette } from "@shared/constants";
import { s } from "@shared/styles";
import type {
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";
import { ColorPicker } from "~/components/arc/color-picker/color-picker";
import type { ColorSwatch } from "~/components/arc/color-picker/color-picker";
import { Switch } from "~/components/arc/switch/switch";
import Button from "~/components/Button";
import Input from "~/components/Input";
import NudeButton from "~/components/NudeButton";
import Text from "~/components/Text";
import Tooltip from "~/components/Tooltip";
import { ArcScope } from "~/components/Properties/ArcScope";
import { OptionBadge } from "~/components/Properties/OptionBadge";
import { newPropertyOption } from "~/components/Properties/options";
import { FieldMessage } from "./FieldMessage";
import { PropertyOptionIconPicker } from "./PropertyOptionIconPicker";
import type {
  PropertyDefinitionDraftEvent,
  PropertyDefinitionErrors,
} from "./propertyDefinitionForm";
import {
  normalizeHexColor,
  propertyDefinitionLimits,
  supportsOptionIcons,
  supportsOptionShimmer,
} from "./propertyDefinitionForm";

interface Props {
  /** The type of the definition, which decides whether icons are offered. */
  type: PropertyType;
  /** The options being edited, in order. */
  options: PropertyOption[];
  /** Ids of options saved on the server, which can only be retired. */
  savedOptionIds: string[];
  /** Client validation errors, shown once the user has tried to save. */
  errors: PropertyDefinitionErrors | undefined;
  /** A server error about the options, shown above the list. */
  serverError: string | undefined;
  /** Applies an edit to the draft. */
  dispatch: React.Dispatch<PropertyDefinitionDraftEvent>;
  /** Announces a change to assistive technology. */
  announce: (message: string) => void;
  /** Whether controls are disabled while saving. */
  disabled?: boolean;
}

/**
 * Edits the options of a select property: label, color and, for single
 * select, an icon and a shimmering label, with a live preview of each option.
 * Saved options are retired and restored rather than deleted, so documents
 * keep their values.
 *
 * @param props the editor props.
 * @returns the options editor.
 */
export const PropertyOptionsEditor = observer(function PropertyOptionsEditor({
  type,
  options,
  savedOptionIds,
  errors,
  serverError,
  dispatch,
  announce,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const headingId = React.useId();
  const listErrorId = React.useId();
  const [focusRequest, setFocusRequest] = React.useState<{
    id: string;
    control: "label" | "up" | "down" | "add";
  }>();
  const listRef = React.useRef<HTMLUListElement>(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!focusRequest) {
      return;
    }
    if (focusRequest.control === "add") {
      addButtonRef.current?.focus();
    } else {
      listRef.current
        ?.querySelector<HTMLElement>(
          `[data-option-id="${focusRequest.id}"] [data-control="${focusRequest.control}"]`
        )
        ?.focus();
    }
    setFocusRequest(undefined);
  }, [focusRequest, options]);

  // The surrounding modal closes on Escape before the color picker hears it,
  // which would discard every edit, so an open picker takes Escape first.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const trigger = listRef.current?.querySelector<HTMLElement>(
        '[data-color-picker] [aria-expanded="true"]'
      );
      if (!trigger) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      trigger.click();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const handleAdd = React.useCallback(() => {
    const option = newPropertyOption("");
    dispatch({ type: "optionAdded", option });
    setFocusRequest({ id: option.id, control: "label" });
  }, [dispatch]);

  const handleRemove = React.useCallback(
    (id: string) => {
      const index = options.findIndex((option) => option.id === id);
      const next = options[index + 1] ?? options[index - 1];
      dispatch({ type: "optionRemoved", id });
      setFocusRequest(
        next ? { id: next.id, control: "label" } : { id, control: "add" }
      );
      announce(t("Option removed"));
    },
    [announce, dispatch, options, t]
  );

  const handleMove = React.useCallback(
    (id: string, offset: -1 | 1) => {
      dispatch({ type: "optionMoved", id, offset });
      setFocusRequest({ id, control: offset === -1 ? "up" : "down" });
    },
    [dispatch]
  );

  const activeCount = options.filter((option) => !option.retired).length;
  const listError =
    serverError ??
    (errors?.options === "tooMany"
      ? t("A property can have at most {{ count }} options.", {
          count: propertyDefinitionLimits.options,
        })
      : undefined);

  return (
    <Section aria-labelledby={headingId}>
      <SectionHeader>
        <SectionTitle id={headingId}>{t("Options")}</SectionTitle>
        <Text size="small" type="tertiary">
          {options.length === activeCount
            ? t("{{ count }} option", { count: options.length })
            : t("{{ active }} active, {{ retired }} retired", {
                active: activeCount,
                retired: options.length - activeCount,
              })}
        </Text>
      </SectionHeader>

      {listError && (
        <FieldMessage id={listErrorId} tone="error">
          {listError}
        </FieldMessage>
      )}

      {options.length === 0 ? (
        <Text as="p" size="small" type="secondary">
          {t("No options yet. Add the choices people can pick from.")}
        </Text>
      ) : (
        <List
          ref={listRef}
          aria-describedby={listError ? listErrorId : undefined}
        >
          {options.map((option, index) => (
            <OptionRow
              key={option.id}
              option={option}
              index={index}
              count={options.length}
              type={type}
              isSaved={savedOptionIds.includes(option.id)}
              labelError={errors?.optionLabels[option.id]}
              dispatch={dispatch}
              announce={announce}
              disabled={disabled}
              onMove={handleMove}
              onRemove={handleRemove}
            />
          ))}
        </List>
      )}

      <div>
        <Button
          ref={addButtonRef}
          type="button"
          neutral
          icon={<PlusIcon />}
          onClick={handleAdd}
          disabled={
            disabled || options.length >= propertyDefinitionLimits.options
          }
        >
          {t("Add option")}
        </Button>
      </div>
    </Section>
  );
});

interface OptionRowProps {
  option: PropertyOption;
  index: number;
  count: number;
  type: PropertyType;
  isSaved: boolean;
  labelError: PropertyDefinitionErrors["optionLabels"][string] | undefined;
  dispatch: React.Dispatch<PropertyDefinitionDraftEvent>;
  announce: (message: string) => void;
  disabled?: boolean;
  onMove: (id: string, offset: -1 | 1) => void;
  onRemove: (id: string) => void;
}

const OptionRow = observer(function OptionRow({
  option,
  index,
  count,
  type,
  isSaved,
  labelError,
  dispatch,
  announce,
  disabled,
  onMove,
  onRemove,
}: OptionRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorId = React.useId();
  const retiredId = React.useId();
  const name =
    option.label.trim() ||
    t("Option {{ number }}", {
      number: index + 1,
    });

  const swatches = React.useMemo<ColorSwatch[]>(
    () =>
      colorPalette.map((color) => ({ id: color, color: color.toLowerCase() })),
    []
  );

  const errorMessage =
    labelError === "required"
      ? t("Enter a label for this option.")
      : labelError === "tooLong"
        ? t("Use {{ count }} characters or fewer.", {
            count: propertyDefinitionLimits.optionLabel,
          })
        : labelError === "duplicate"
          ? t("Another option already has this label. Use a different one.")
          : undefined;

  const describedBy =
    [errorMessage ? errorId : undefined, option.retired ? retiredId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  const handleLabel = (ev: React.ChangeEvent<HTMLInputElement>) =>
    dispatch({
      type: "optionLabelChanged",
      id: option.id,
      label: ev.target.value,
    });

  const handleColor = (color: string) =>
    dispatch({ type: "optionColorChanged", id: option.id, color });

  const handleAddColor = () =>
    dispatch({
      type: "optionColorChanged",
      id: option.id,
      color: normalizeHexColor(colorPalette[index % colorPalette.length]),
    });

  const handleRemoveColor = () =>
    dispatch({ type: "optionColorChanged", id: option.id, color: undefined });

  const handleIcon = (icon: PropertyOption["icon"] | undefined) =>
    dispatch({ type: "optionIconChanged", id: option.id, icon });

  const handleShimmer = (shimmer: boolean) =>
    dispatch({ type: "optionShimmerChanged", id: option.id, shimmer });

  const handleRetire = () => {
    if (option.retired) {
      dispatch({ type: "optionRestored", id: option.id });
      announce(t("{{ name }} restored", { name }));
    } else {
      dispatch({ type: "optionRetired", id: option.id });
      announce(t("{{ name }} retired", { name }));
    }
  };

  return (
    <Row data-option-id={option.id} $retired={!!option.retired}>
      <Primary>
        <Preview aria-hidden="true">
          <OptionBadge option={{ ...option, label: name }} size="sm" />
        </Preview>
        <LabelField>
          <Input
            data-control="label"
            label={t("Label of option {{ number }}", { number: index + 1 })}
            labelHidden
            placeholder={t("Option label")}
            value={option.label}
            onChange={handleLabel}
            maxLength={propertyDefinitionLimits.optionLabel}
            aria-invalid={labelError ? true : undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            margin={0}
          />
          {errorMessage && (
            <FieldMessage id={errorId} tone="error">
              {errorMessage}
            </FieldMessage>
          )}
        </LabelField>
      </Primary>

      <Controls>
        {option.color ? (
          <ColorControl data-color-picker>
            <ArcScope>
              <ColorPicker
                value={option.color}
                onValueChange={handleColor}
                label={name}
                background={theme.background}
                defaultSwatches={swatches}
              />
            </ArcScope>
            <Button
              type="button"
              neutral
              onClick={handleRemoveColor}
              disabled={disabled}
              aria-label={t("Remove color from {{ name }}", { name })}
            >
              {t("Remove color")}
            </Button>
          </ColorControl>
        ) : (
          <Button
            type="button"
            neutral
            onClick={handleAddColor}
            disabled={disabled}
            aria-label={t("Add a color to {{ name }}", { name })}
          >
            {t("Add color")}
          </Button>
        )}

        {supportsOptionIcons(type) && (
          <PropertyOptionIconPicker
            optionLabel={name}
            icon={option.icon}
            color={option.color}
            onChange={handleIcon}
          />
        )}

        {supportsOptionShimmer(type) && (
          <ArcScope as="span">
            <ShimmerSwitch
              label={t("Shimmer")}
              aria-label={t("Shimmer the label of {{ name }}", { name })}
              checked={!!option.shimmer}
              onCheckedChange={handleShimmer}
              disabled={disabled}
            />
          </ArcScope>
        )}

        <Spacer />

        <Tooltip content={t("Move up")}>
          <MoveButton
            type="button"
            data-control="up"
            aria-label={t("Move {{ name }} up", { name })}
            onClick={() => onMove(option.id, -1)}
            disabled={disabled || index === 0}
          >
            <CaretUpIcon aria-hidden="true" />
          </MoveButton>
        </Tooltip>
        <Tooltip content={t("Move down")}>
          <MoveButton
            type="button"
            data-control="down"
            aria-label={t("Move {{ name }} down", { name })}
            onClick={() => onMove(option.id, 1)}
            disabled={disabled || index === count - 1}
          >
            <CaretDownIcon aria-hidden="true" />
          </MoveButton>
        </Tooltip>

        {isSaved ? (
          <Button
            type="button"
            neutral
            onClick={handleRetire}
            disabled={disabled}
            aria-label={
              option.retired
                ? t("Restore {{ name }}", { name })
                : t("Retire {{ name }}", { name })
            }
          >
            {option.retired ? t("Restore") : t("Retire")}
          </Button>
        ) : (
          <Button
            type="button"
            neutral
            onClick={() => onRemove(option.id)}
            disabled={disabled}
            aria-label={t("Remove {{ name }}", { name })}
          >
            {t("Remove")}
          </Button>
        )}
      </Controls>

      {option.retired && (
        <FieldMessage id={retiredId} tone="warning">
          {t(
            "Retired. It can’t be chosen for new values. Documents that already use it keep it."
          )}
        </FieldMessage>
      )}
    </Row>
  );
});

const Section = styled.section`
  display: grid;
  gap: 12px;
  min-width: 0;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 500;
`;

const List = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
`;

const Row = styled.li<{ $retired: boolean }>`
  display: grid;
  gap: 8px;
  padding: 12px;
  min-width: 0;
  background: ${(props) =>
    props.$retired ? props.theme.backgroundSecondary : "transparent"};

  & + & {
    border-top: 1px solid ${s("inputBorder")};
  }

  &:first-child {
    border-radius: 8px 8px 0 0;
  }

  &:last-child {
    border-radius: 0 0 8px 8px;
  }

  &:only-child {
    border-radius: 8px;
  }
`;

const Primary = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  align-items: start;
  gap: 12px;

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
`;

const Preview = styled.div`
  display: flex;
  align-items: center;
  min-height: 32px;
  min-width: 0;
  overflow: hidden;
`;

const LabelField = styled.div`
  display: grid;
  min-width: 0;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const ColorControl = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const Spacer = styled.span`
  flex: 1 1 0;
`;

/** Sized to sit in line with the buttons beside it, and larger for touch. */
const ShimmerSwitch = styled(Switch)`
  && {
    padding-inline: 4px;
    font-size: 14px;
  }

  @media (pointer: fine) {
    && {
      min-height: 32px;
    }
  }
`;

const MoveButton = styled(NudeButton)`
  width: 32px;
  height: 32px;

  @media (pointer: coarse) {
    width: 44px;
    height: 44px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;
