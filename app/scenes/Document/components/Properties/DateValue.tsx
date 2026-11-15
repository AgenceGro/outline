import { observer } from "mobx-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { PropertyData } from "@shared/types/documentProperties";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import {
  DatePicker,
  type DatePickerLabels,
} from "~/components/arc/date-picker/date-picker";
import datePickerStyles from "~/components/arc/date-picker/date-picker.module.css";
import { useToday } from "~/components/arc/lib/use-today";
import {
  formatPropertyDate,
  formatRelativeDay,
  propertyDateFormats,
} from "~/components/Properties/dates";
import { usePropertyDateFormat } from "~/components/Properties/usePropertyDateFormat";
import { surfaceFill, surfaceGeometry, trailingAffordance } from "./surface";
import { parseIsoDate, toIsoDate } from "./values";

interface Props {
  /** The definition of the date property. */
  definition: PropertyDefinition;
  /** The current value, if any. */
  value?: PropertyData;
  /** Whether to open the calendar when mounted, for a new property. */
  autoOpen?: boolean;
  /** Whether a write is in progress, which prevents another pick. */
  saving?: boolean;
  /** Called when the calendar opens, before any day is picked. */
  onOpen: () => void;
  /** Called with the picked day as `YYYY-MM-DD`, or an empty string to clear. */
  onChoose: (date: string) => void;
  /** Called when the calendar closes without a new day. */
  onDismiss: () => void;
}

const triggerSelector = 'button[aria-haspopup="dialog"]';

/**
 * The value of an editable date property. At rest it shows the date in the
 * user's date style and how far it is from today, on a surface that spans
 * the value column; pressing it opens a calendar, and a picked day or a
 * clear is saved right away. The picked day shows while it saves, so the
 * calendar confirms it before closing.
 *
 * @param props the component props.
 * @returns the value and its calendar.
 */
export const DateValue = observer(function DateValue({
  definition,
  value,
  autoOpen = false,
  saving = false,
  onOpen,
  onChoose,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { locale, dateStyle } = usePropertyDateFormat();
  const today = useToday();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string>();
  const wasOpen = useRef(false);
  const chose = useRef(false);
  const current = typeof value === "string" ? value : "";
  const shown = picked ?? current;
  const date = parseIsoDate(shown);
  const text = date ? formatPropertyDate(date, locale, dateStyle) : undefined;
  const relative =
    date && today ? formatRelativeDay(date, today, locale) : undefined;

  const trigger = () =>
    rootRef.current?.querySelector<HTMLButtonElement>(triggerSelector) ?? null;

  // The picked day is shown until its write ends, or the value changes.
  useEffect(() => {
    if (!saving) {
      setPicked(undefined);
    }
  }, [saving, current]);

  // The picker's trigger reports whether its calendar is open.
  useEffect(() => {
    const button = trigger();
    const stack = rootRef.current;
    if (!button || !stack) {
      return;
    }
    const observer = new MutationObserver(() => {
      const next = button.getAttribute("aria-expanded") === "true";
      // The calendar mounts with the change, still transparent: it is placed
      // before its first frame is painted.
      if (next) {
        placeCalendar(stack);
      }
      setOpen(next);
    });
    observer.observe(button, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, []);

  // The calendar is placed again when the viewport is resized, such as by
  // rotating a tablet or by an on-screen keyboard.
  useLayoutEffect(() => {
    const stack = rootRef.current;
    if (!open || !stack) {
      return;
    }
    const place = () => placeCalendar(stack);
    const viewport = window.visualViewport;
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (open === wasOpen.current) {
      return;
    }
    wasOpen.current = open;
    if (open) {
      chose.current = false;
      onOpen();
    } else if (!chose.current) {
      onDismiss();
    }
  });

  // A property added just now opens its calendar once, on mount.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      trigger()?.focus();
      trigger()?.click();
    }
  }, [autoOpen]);

  const handleChange = (next: Date | undefined) => {
    const iso = next ? toIsoDate(next) : "";
    if (saving || iso === shown) {
      return;
    }
    chose.current = true;
    setPicked(iso);
    onChoose(iso);
  };

  // While a write is in progress the calendar does not open again.
  const blockWhileSaving = (ev: React.SyntheticEvent) => {
    const button = trigger();
    if (
      saving &&
      !open &&
      ev.target instanceof Node &&
      button?.contains(ev.target)
    ) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  };

  const labels: Partial<DatePickerLabels> = {
    calendar: (name) => t("{{ name }} calendar", { name }),
    clear: t("Clear"),
    selected: (day) => t("Selected {{ date }}", { date: day }),
    choose: t("Choose a day"),
    today: t("Today"),
    todayDate: (day) => t("Today, {{ date }}", { date: day }),
    previousMonth: t("Previous month"),
    nextMonth: t("Next month"),
  };

  return (
    <Stack
      ref={rootRef}
      onClickCapture={blockWhileSaving}
      onKeyDownCapture={(ev) => {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown") {
          blockWhileSaving(ev);
        }
      }}
    >
      <DatePicker
        label={definition.name}
        value={date}
        onChange={handleChange}
        placeholder={t("No value")}
        locale={locale}
        format={propertyDateFormats[dateStyle]}
        showToday
        labels={labels}
        aria-label={t("{{ name }}: {{ value }}", {
          name: definition.name,
          value: text
            ? relative
              ? t("{{ date }}, {{ relative }}", { date: text, relative })
              : text
            : t("No value"),
        })}
        aria-disabled={saving || undefined}
        data-relative={relative}
      />
    </Stack>
  );
});

const styles = datePickerStyles;

/** The gap between the value and the calendar, in pixels, as Arc sets it. */
const panelGap = 8;

/** The room kept between the calendar and the viewport's edges, in pixels. */
const viewportMargin = 8;

/**
 * Keeps the open calendar inside the visible viewport. It starts at the
 * value's leading edge and shifts back from the end edge when it would run
 * past it. It opens below the value when it fits there, and otherwise on the
 * side with more room; when it fits on neither, it takes that room and
 * scrolls within itself, so every week and all seven days stay reachable.
 * Sizes are read from layout, so the calendar's opening scale does not skew
 * them.
 *
 * @param stack the element that holds the picker.
 */
export function placeCalendar(stack: HTMLElement) {
  const anchor = stack.querySelector<HTMLElement>(`.${styles.anchor}`);
  const panel = stack.querySelector<HTMLElement>(`.${styles.popover}`);
  if (!anchor || !panel) {
    return;
  }
  stack.style.removeProperty("--calendar-x");
  stack.style.removeProperty("--calendar-max-height");
  delete stack.dataset.calendarSide;
  delete stack.dataset.calendarScroll;

  const viewport = window.visualViewport;
  const viewLeft = viewport?.offsetLeft ?? 0;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewWidth = viewport?.width ?? document.documentElement.clientWidth;
  const viewHeight = viewport?.height ?? window.innerHeight;
  const rect = anchor.getBoundingClientRect();

  const start = viewLeft + viewportMargin - rect.left;
  const end = viewLeft + viewWidth - viewportMargin - panel.offsetWidth;
  const shift = Math.max(Math.min(0, end - rect.left), start);
  if (shift !== 0) {
    stack.style.setProperty("--calendar-x", `${Math.round(shift)}px`);
  }

  const below = viewTop + viewHeight - viewportMargin - rect.bottom - panelGap;
  const above = rect.top - viewTop - viewportMargin - panelGap;
  const height = panel.offsetHeight;
  if (height <= below) {
    return;
  }
  const side = height <= above || above > below ? "above" : "below";
  if (side === "above") {
    stack.dataset.calendarSide = "above";
  }
  const room = Math.max(side === "above" ? above : below, 0);
  if (height > room) {
    stack.dataset.calendarScroll = "";
    stack.style.setProperty("--calendar-max-height", `${Math.floor(room)}px`);
  }
}

/**
 * Arc's trigger is the value's surface: it loses its frame and leading icon,
 * tints like the other values, and its chevron moves to the trailing zone.
 * The relative day follows the date in the trigger itself, so the date keeps
 * Arc's roll when it changes. The row names the field, so the label is only
 * read by assistive technology. The calendar is placed by
 * {@link placeCalendar}.
 */
const Stack = styled.div`
  ${surfaceGeometry}
  display: grid;

  .${styles.field} {
    gap: 0;
  }

  .${styles.label} {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  &&& .${styles.trigger} {
    ${surfaceFill}
    gap: 0;
    width: 100%;
    cursor: pointer;
  }

  &&& .${styles.trigger} > svg:first-child {
    display: none;
  }

  &&& .${styles.trigger}:active,
  &&& .${styles.trigger}[aria-expanded="true"] {
    border-color: transparent;
    background: var(--surface-muted);
  }

  &&& .${styles.trigger}[aria-disabled="true"] {
    cursor: progress;
  }

  @media (hover: hover) and (pointer: fine) {
    &&& .${styles.trigger}:hover:not([aria-disabled="true"]) {
      border-color: transparent;
      background: var(--surface-muted);
    }

    &&& .${styles.trigger}:hover .${styles.chevron} {
      opacity: 1;
    }
  }

  .${styles.valueText} {
    flex: 0 1 auto;
  }

  .${styles.placeholder} {
    color: var(--text-secondary);
  }

  &&& .${styles.trigger}[data-relative]::after {
    content: "· " attr(data-relative);
    min-width: 0;
    margin-inline-start: 0.3em;
    overflow: hidden;
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &&& .${styles.chevron} {
    --affordance-size: 16px;
    ${trailingAffordance}
  }

  &&& .${styles.trigger}:focus-visible .${styles.chevron},
  &&& .${styles.trigger}[aria-expanded="true"] .${styles.chevron} {
    opacity: 1;
  }

  &&& .${styles.popover} {
    left: var(--calendar-x, 0px);
  }

  &[data-calendar-side="above"] .${styles.popover} {
    top: auto;
    bottom: calc(100% + ${panelGap}px);
    transform-origin: 22px calc(100% + ${panelGap}px);
  }

  &[data-calendar-scroll] .${styles.popover} {
    max-height: var(--calendar-max-height);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;
