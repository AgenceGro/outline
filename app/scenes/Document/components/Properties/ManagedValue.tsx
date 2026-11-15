import { observer } from "mobx-react";
import { forwardRef, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { PropertyData } from "@shared/types/documentProperties";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import { Tooltip } from "~/components/arc/tooltip/tooltip";
import { useArcPortalScope } from "~/components/Properties/ArcScope";
import { managedPropertyDescription } from "~/components/Properties/labels";
import { PropertyValueView } from "./PropertyValueView";
import { isHttpUrl } from "./values";

interface Props {
  /** The definition of the managed property. */
  definition: PropertyDefinition;
  /** The value of the property, if it has one. */
  value?: PropertyData;
}

/**
 * The read-only value of a managed property. Hovering, focusing, or pressing
 * the value shows who manages it in a tooltip; it never opens an editor.
 *
 * @param props the component props.
 * @returns the value with its tooltip.
 */
export const ManagedValue = observer(function ManagedValue({
  definition,
  value,
}: Props) {
  const { t } = useTranslation();

  return (
    <Tooltip content={managedPropertyDescription(definition.owner, t)}>
      <ManagedTrigger definition={definition} value={value} />
    </Tooltip>
  );
});

type TriggerProps = ComponentPropsWithoutRef<"div"> &
  Props & {
    /** Set by the tooltip: closed, delayed-open, or instant-open. */
    "data-state"?: string;
  };

/**
 * The tooltip's trigger. A link value keeps its own focus and the tooltip
 * follows it; any other value is a focusable toggle for the tooltip.
 */
const ManagedTrigger = forwardRef<HTMLDivElement, TriggerProps>(
  function ManagedTrigger(
    { definition, value, onClick, onKeyDown, ...rest },
    forwardedRef
  ) {
    const { t } = useTranslation();
    const own = useRef<HTMLDivElement | null>(null);
    const open =
      rest["data-state"] !== undefined && rest["data-state"] !== "closed";
    useArcPortalScope(
      open ? rest["aria-describedby"]?.split(" ").pop() : undefined
    );
    const link =
      definition.type === "url" &&
      typeof value === "string" &&
      isHttpUrl(value);

    const setRef = (node: HTMLDivElement | null) => {
      own.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    // The tooltip closes when its trigger is pressed. Focusing the trigger
    // again once that settles opens it, so a tap, a click, Enter, or Space
    // shows the owner too.
    const reopen = () => {
      requestAnimationFrame(() => {
        const node = own.current;
        if (!node || node.getAttribute("data-state") !== "closed") {
          return;
        }
        const target = link ? node.querySelector("a") : node;
        target?.blur();
        target?.focus();
      });
    };

    return (
      <Trigger
        {...rest}
        ref={setRef}
        role={link ? undefined : "button"}
        tabIndex={link ? undefined : 0}
        onClick={(ev) => {
          onClick?.(ev);
          reopen();
        }}
        onKeyDown={(ev) => {
          onKeyDown?.(ev);
          if (!link && (ev.key === "Enter" || ev.key === " ")) {
            ev.preventDefault();
            reopen();
          }
        }}
      >
        {value === undefined ? (
          <Empty>{t("No value")}</Empty>
        ) : (
          <PropertyValueView definition={definition} value={value} />
        )}
      </Trigger>
    );
  }
);

const Trigger = styled.div`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  min-height: 32px;
  border-radius: var(--radius-control);
  cursor: default;
  -webkit-tap-highlight-color: transparent;
`;

const Empty = styled.span`
  color: var(--text-secondary);
`;
