import { observer } from "mobx-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { PropertyData } from "@shared/types/documentProperties";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import { MultiSelect } from "~/components/arc/multi-select/multi-select";
import multiSelectStyles from "~/components/arc/multi-select/multi-select.module.css";
import { optionBadgeContainer } from "~/components/Properties/OptionBadge";
import { PropertyValueView } from "./PropertyValueView";
import { choosableOptions, sameSelection } from "./options";
import { surfaceGeometry, trailingAffordance } from "./surface";

interface Props {
  /** The definition of the multi-select property. */
  definition: PropertyDefinition;
  /** The current value, if any. */
  value?: PropertyData;
  /** Whether to open the choices when mounted, for a new property. */
  autoOpen?: boolean;
  /** Called when the choices open, before anything changes. */
  onOpen: () => void;
  /** Called once the choices close, with the changed selection. */
  onCommit: (ids: string[]) => void;
  /** Called when the choices close without a change. */
  onDismiss: () => void;
}

const triggerSelector = 'button[aria-haspopup="listbox"]';

/**
 * The value of an editable multi-select property. The options' badges stay
 * in place on a surface that spans the value column, and the whole surface
 * opens the picker. Choices stay open while toggling, show in the badges at
 * once, and are saved once, when the list closes.
 *
 * @param props the component props.
 * @returns the value and its picker.
 */
export const MultiSelectValue = observer(function MultiSelectValue({
  definition,
  value,
  autoOpen = false,
  onOpen,
  onCommit,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = Array.isArray(value)
    ? value
    : value !== undefined
      ? [String(value)]
      : [];
  const [draft, setDraft] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  // Remounting the picker is the only way to close its list from outside.
  const [generation, setGeneration] = useState(0);
  const draftRef = useRef<string[] | null>(null);
  const wasOpen = useRef(false);
  const focusTrigger = useRef(false);
  const options = choosableOptions(definition, current);
  const shown = draft ?? current;

  const trigger = () =>
    rootRef.current?.querySelector<HTMLButtonElement>(triggerSelector) ?? null;

  const start = () => {
    if (draftRef.current) {
      return;
    }
    draftRef.current = current;
    setDraft(current);
    onOpen();
  };

  const finish = () => {
    const next = draftRef.current;
    if (!next) {
      return;
    }
    draftRef.current = null;
    setDraft(null);
    if (sameSelection(next, current)) {
      onDismiss();
    } else {
      onCommit(next);
    }
  };

  const closeFromOutside = (refocus: boolean) => {
    wasOpen.current = false;
    setOpen(false);
    focusTrigger.current = refocus;
    setGeneration((value) => value + 1);
    finish();
  };

  // The picker's trigger reports whether its list is open.
  useEffect(() => {
    const button = trigger();
    if (!button) {
      return;
    }
    const update = () =>
      setOpen(button.getAttribute("aria-expanded") === "true");
    update();
    const observer = new MutationObserver(update);
    observer.observe(button, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, [generation]);

  useEffect(() => {
    if (open === wasOpen.current) {
      return;
    }
    wasOpen.current = open;
    if (open) {
      start();
    } else {
      finish();
    }
  });

  useLayoutEffect(() => {
    if (focusTrigger.current) {
      focusTrigger.current = false;
      trigger()?.focus();
    }
  }, [generation]);

  // A property added just now opens its choices once, on mount.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      trigger()?.focus();
      trigger()?.click();
    }
  }, [autoOpen]);

  // Escape closes the list wherever focus is inside it. The trigger closes
  // it on its own.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.target === trigger()) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      closeFromOutside(true);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  const handleBlur = (ev: React.FocusEvent) => {
    const next = ev.relatedTarget;
    if (!open || (next instanceof Node && rootRef.current?.contains(next))) {
      return;
    }
    if (!next && !document.hasFocus()) {
      return;
    }
    closeFromOutside(false);
  };

  const handleChange = (ids: string[]) => {
    if (draftRef.current) {
      draftRef.current = ids;
      setDraft(ids);
      return;
    }
    // Clearing from the closed picker saves right away.
    onOpen();
    if (!sameSelection(ids, current)) {
      onCommit(ids);
    } else {
      onDismiss();
    }
  };

  return (
    <Stack ref={rootRef} onBlur={handleBlur} data-open={open || undefined}>
      <Picker key={generation}>
        <MultiSelect
          label={definition.name}
          options={options}
          value={shown}
          onValueChange={handleChange}
          placeholder={t("No value")}
          maxVisible={3}
        />
      </Picker>
      <Badges aria-hidden="true">
        {shown.length ? (
          <PropertyValueView definition={definition} value={shown} />
        ) : (
          <Empty>{t("No value")}</Empty>
        )}
      </Badges>
    </Stack>
  );
});

/**
 * The picker's trigger is the value's surface, and the badges sit over it in
 * the same cell without ever taking a press.
 */
const Stack = styled.div`
  ${surfaceGeometry}
  display: grid;

  > * {
    grid-area: 1 / 1;
  }
`;

/**
 * Arc's trigger keeps its behavior but loses its frame and chips: it tints
 * like the other values, its chevron moves to the trailing zone, and the
 * clear button sits at the surface's end, shown with the chevron.
 */
const Picker = styled.div`
  display: grid;
  min-width: 0;

  > div,
  > div > div,
  ${triggerSelector} {
    height: 100%;
  }

  > div > span:first-child {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  &&& .${multiSelectStyles.trigger} {
    min-height: var(--value-height);
    padding: 0;
    border-color: transparent;
    background: transparent;
  }

  &&& .${multiSelectStyles.trigger}[aria-expanded="true"] {
    background: var(--surface-muted);
  }

  .${multiSelectStyles.value} {
    display: none;
  }

  &&& .${multiSelectStyles.chevron} {
    --affordance-size: 16px;
    ${trailingAffordance}
  }

  &&& .${multiSelectStyles.trigger}:focus-visible .${multiSelectStyles.chevron},
  &&&
  .${multiSelectStyles.trigger}[aria-expanded="true"]
  .${multiSelectStyles.chevron} {
    opacity: 1;
  }

  &&& .${multiSelectStyles.clear} {
    top: calc(6px + var(--value-leading) / 2 - 11px);
    right: 6px;
    bottom: auto;
    margin: 0;
    visibility: hidden;
  }

  @media (hover: hover) and (pointer: fine) {
    ${Stack}:hover &&& .${multiSelectStyles.trigger} {
      background: var(--surface-muted);
    }

    ${Stack}:hover &&& .${multiSelectStyles.chevron} {
      opacity: 1;
    }

    ${Stack}:hover &&& .${multiSelectStyles.clear} {
      visibility: visible;
    }
  }

  ${Stack}:has(:focus-visible) &&& .${multiSelectStyles.clear},
  ${Stack}[data-open] &&& .${multiSelectStyles.clear} {
    visibility: visible;
  }

  /* A touch must never reveal the clear button under the finger mid-press,
     where it would take the click meant for the trigger. With touch, it
     shows only while the list is open or after keyboard focus. */
  @media (any-pointer: coarse) {
    ${Stack}:hover:not([data-open]):not(:has(:focus-visible))
    &&&
    .${multiSelectStyles.clear} {
      visibility: hidden;
    }
  }
`;

/** Leaves room at the end for the clear button, so showing it moves nothing. */
const Badges = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 6px 9px;
  padding-inline-end: 34px;
  pointer-events: none;
  line-height: var(--value-leading);
  ${optionBadgeContainer()}
`;

const Empty = styled.span`
  color: var(--text-secondary);
`;
