import { ChevronDown } from "lucide-react";
import { observer } from "mobx-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import styled, { css, keyframes } from "styled-components";
import type { PropertyData } from "@shared/types/documentProperties";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import {
  Combobox,
  type ComboboxOption,
} from "~/components/arc/combobox/combobox";
import comboboxStyles from "~/components/arc/combobox/combobox.module.css";
import {
  OptionBadge,
  optionBadgeContainer,
} from "~/components/Properties/OptionBadge";
import { PropertyValueView } from "./PropertyValueView";
import { choosableOptions } from "./options";
import { trailingAffordance, valueSurface } from "./surface";

interface Props {
  /** The definition of the single-select property. */
  definition: PropertyDefinition;
  /** The current value, if any. */
  value?: PropertyData;
  /** Whether to open the choices when mounted, for a new property. */
  autoOpen?: boolean;
  /** Whether a write is in progress, which prevents another choice. */
  disabled?: boolean;
  /** Called when the choices open, before any choice is made. */
  onOpen: () => void;
  /** Called with the chosen option ID, or an empty string to clear. */
  onChoose: (id: string) => void;
  /** Called when the choices close without a choice. */
  onDismiss: () => void;
}

/** Where the list's panel opens, and the most height its list may take. */
interface Placement {
  /** The side of the value the panel opens on. */
  side: "below" | "above";
  /** The most height of the list in pixels, when it must be shortened. */
  listMax?: number;
}

/**
 * The value of an editable single-select property. At rest it shows the
 * option's badge on a surface that spans the value column; pressing anywhere
 * on it opens a compact list below, with a search field and each option
 * previewed as its badge, and a choice is saved right away. Choosing no
 * value clears the property. Near the bottom of the viewport the list opens
 * above the value instead.
 *
 * @param props the component props.
 * @returns the value and its picker.
 */
export const SelectValue = observer(function SelectValue({
  definition,
  value,
  autoOpen = false,
  disabled = false,
  onOpen,
  onChoose,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const pickerId = useId();
  const [active, setActive] = useState(autoOpen);
  const [placement, setPlacement] = useState<Placement>(defaultPlacement);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);
  const current = typeof value === "string" ? value : "";
  const choices = choosableOptions(definition, current ? [current] : []);
  const noValue = t("No value");
  const options: ComboboxOption[] = choices.length
    ? [{ value: "", label: noValue }, ...choices]
    : choices;

  const announcedOpen = useRef(false);
  useEffect(() => {
    // Only a property added just now opens on mount.
    if (autoOpen && !announcedOpen.current) {
      announcedOpen.current = true;
      onOpen();
    }
  }, [autoOpen, onOpen]);

  // The combobox opens its list when focused.
  useLayoutEffect(() => {
    if (active) {
      inputRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [active]);

  // Places the panel once its list has rendered, before it is painted, and
  // again when the viewport is resized, such as by an on-screen keyboard.
  useLayoutEffect(() => {
    const anchor = rootRef.current;
    const picker = pickerRef.current;
    if (!active || !anchor || !picker) {
      return;
    }
    const place = () => setPlacement(placePicker(anchor, picker));
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (picker.querySelector('[role="listbox"]')) {
              observer?.disconnect();
              flushSync(place);
            }
          });
    observer?.observe(picker);
    const viewport = window.visualViewport;
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
    };
  }, [active]);

  const open = () => {
    if (disabled || active) {
      return;
    }
    onOpen();
    setPlacement(defaultPlacement);
    setActive(true);
  };

  const close = (refocus: boolean) => {
    returnFocus.current = refocus;
    setActive(false);
  };

  const dismiss = () => {
    close(true);
    onDismiss();
  };

  const handleChoose = (id: string) => {
    close(true);
    if (id === current) {
      onDismiss();
      return;
    }
    onChoose(id);
  };

  const handleKeyDown = (ev: React.KeyboardEvent) => {
    if (active && ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      dismiss();
    }
  };

  const handleBlur = (ev: React.FocusEvent) => {
    const next = ev.relatedTarget;
    if (!active || (next instanceof Node && rootRef.current?.contains(next))) {
      return;
    }
    // Switching to another window keeps the choices open.
    if (!next && !document.hasFocus()) {
      return;
    }
    close(false);
    onDismiss();
  };

  const renderOption = (option: ComboboxOption) => {
    const shown = definition.options.find((item) => item.id === option.value);
    return shown ? (
      <OptionBadge option={shown} />
    ) : (
      <Empty>{option.label}</Empty>
    );
  };

  return (
    <Stack ref={rootRef} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={active}
        aria-controls={active ? pickerId : undefined}
        aria-label={t("{{ name }}: {{ value }}", {
          name: definition.name,
          value:
            choices.find((option) => option.value === current)?.label ??
            noValue,
        })}
        aria-disabled={disabled || undefined}
        onMouseDown={(ev) => {
          // Keeps focus in the search, so pressing the badge again closes.
          if (active) {
            ev.preventDefault();
          }
        }}
        onClick={active ? dismiss : open}
        onKeyDown={(ev) => {
          if (ev.key === "ArrowDown") {
            ev.preventDefault();
            open();
          }
        }}
      >
        {current ? (
          <PropertyValueView definition={definition} value={current} />
        ) : (
          <Empty>{noValue}</Empty>
        )}
        <Affordance size={16} strokeWidth={1.75} aria-hidden="true" />
      </Trigger>
      {active && (
        <Picker
          ref={pickerRef}
          id={pickerId}
          $above={placement.side === "above"}
          $listMax={placement.listMax}
        >
          <Combobox
            ref={inputRef}
            label={definition.name}
            options={options}
            value={current}
            onValueChange={handleChoose}
            placeholder={t("Search options")}
            searchPlaceholder={t("Search options")}
            clearable={false}
            renderOption={renderOption}
            emptyMessage={
              options.length
                ? t("No matching options")
                : t(
                    "This property has no options yet. An admin can add them in settings."
                  )
            }
          />
        </Picker>
      )}
    </Stack>
  );
});

const defaultPlacement: Placement = { side: "below" };

/** The gap between the value and the panel, in pixels. */
const panelGap = 2;

/** The room kept between the panel and the edge of the viewport, in pixels. */
const viewportMargin = 8;

/** The list is never shortened below about two options, in pixels. */
const listMin = 80;

/**
 * Opens the panel below the value when it fits there, and otherwise on the
 * side with more room, shortening the list to that room when it still does
 * not fit.
 *
 * @param anchor the element the panel is positioned against.
 * @param picker the panel.
 * @returns where the panel opens.
 */
function placePicker(anchor: HTMLElement, picker: HTMLElement): Placement {
  const list = picker.querySelector<HTMLElement>('[role="listbox"]');
  if (!list) {
    return defaultPlacement;
  }
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewHeight = viewport?.height ?? window.innerHeight;
  const rect = anchor.getBoundingClientRect();
  const below = viewTop + viewHeight - viewportMargin - rect.bottom - panelGap;
  const above = rect.top - viewTop - viewportMargin - panelGap;
  const chrome = picker.offsetHeight - list.offsetHeight;
  // Arc's listbox is at most 300px tall, and at most 40% of the viewport.
  const listHeight = Math.min(list.scrollHeight, 300, window.innerHeight * 0.4);
  const needed = chrome + listHeight;
  if (needed <= below) {
    return defaultPlacement;
  }
  const side = above > below ? "above" : "below";
  const room = Math.max(side === "above" ? above : below, 0);
  return {
    side,
    listMax: needed > room ? Math.max(room - chrome, listMin) : undefined,
  };
}

/**
 * Spans the value column, so the panel and the badge's label are measured
 * against the column rather than the page. The badge's room excludes the
 * surface's frame and the trailing zone.
 */
const Stack = styled.div`
  position: relative;
  display: flex;
  min-width: 0;
  ${optionBadgeContainer("47px")}

  @media (pointer: fine) {
    --control-height-md: 2rem;
  }
`;

/** The value's surface is the trigger, quiet until hovered or open. */
const Trigger = styled.button`
  ${valueSurface}
  cursor: pointer;

  > :first-child {
    min-width: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not([aria-disabled="true"]) {
      background: var(--surface-muted);
    }
  }

  &[aria-expanded="true"] {
    background: var(--surface-muted);
  }

  &[aria-disabled="true"] {
    cursor: progress;
  }
`;

/**
 * Sits in the trailing zone. With a fine pointer, hover, keyboard focus, and
 * the open list reveal it.
 */
const Affordance = styled(ChevronDown)`
  --affordance-size: 16px;
  ${trailingAffordance}

  @media (hover: hover) and (pointer: fine) {
    ${Trigger}:hover:not([aria-disabled="true"]) & {
      opacity: 1;
    }
  }

  ${Trigger}:focus-visible &,
  ${Trigger}[aria-expanded="true"] & {
    opacity: 1;
  }

  ${Trigger}[aria-expanded="true"] & {
    transform: rotate(180deg);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
`;

/**
 * The list's panel, anchored below the badge and no wider than the value
 * column. The combobox's field becomes a quiet search row and its list
 * follows in the panel rather than floating on its own; the row's name
 * already labels the field.
 */
const Picker = styled.div<{ $above: boolean; $listMax?: number }>`
  position: absolute;
  z-index: 80;
  top: calc(100% + ${panelGap}px);
  inset-inline-start: 0;
  width: min(18rem, 100%);
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  background: var(--surface-raised);
  color: var(--foreground);
  box-shadow: var(--shadow-floating);
  animation: ${fadeIn} var(--duration-fast) var(--ease-enter);

  ${(props) =>
    props.$above &&
    css`
      top: auto;
      bottom: calc(100% + ${panelGap}px);
    `}

  .${comboboxStyles.field} {
    gap: 0;
  }

  .${comboboxStyles.field} > label {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  && .${comboboxStyles.control},
  && .${comboboxStyles.control}:hover,
  && .${comboboxStyles.control}:focus-within {
    padding-inline: 8px;
    border-color: transparent;
    background: transparent;
  }

  .${comboboxStyles.chevron} {
    display: none;
  }

  .${comboboxStyles.popover} {
    position: static;
    margin: 4px -4px 0;
    padding: 4px 4px 0;
    border: 0;
    border-top: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .${comboboxStyles.listbox} {
    ${optionBadgeContainer("calc(16px + 16px + var(--space-3))")}
    ${(props) =>
      props.$listMax !== undefined &&
      css`
        max-height: ${props.$listMax}px;
      `}
  }

  .${comboboxStyles.option} {
    padding: 4px 8px;
    border-radius: calc(var(--radius-panel) - 5px);
  }

  .${comboboxStyles.option} > span:first-child {
    display: flex;
    overflow: visible;
    white-space: normal;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: var(--duration-instant);
  }
`;

const Empty = styled.span`
  color: var(--text-secondary);
`;
