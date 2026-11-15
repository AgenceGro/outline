import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import type { PropertyData } from "@shared/types/documentProperties";
import { sanitizeUrl } from "@shared/utils/urls";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import { useToday } from "~/components/arc/lib/use-today";
import { formatRelativeDay } from "~/components/Properties/dates";
import { OptionBadge } from "~/components/Properties/OptionBadge";
import { usePropertyDateFormat } from "~/components/Properties/usePropertyDateFormat";
import { DestinationIcon } from "./destinations";
import { formatPropertyValue, isHttpUrl, parseIsoDate } from "./values";

interface Props {
  /** The definition of the property. */
  definition: PropertyDefinition;
  /** The value to display. */
  value: PropertyData;
}

/**
 * Displays a property value read-only, formatted for its type. Dates are
 * shown in the user's date style, followed by how far they are from today.
 * Links show the logo of a known service they open in.
 *
 * @param props the component props.
 * @returns the formatted value.
 */
export const PropertyValueView = observer(function PropertyValueView({
  definition,
  value,
}: Props) {
  const { t } = useTranslation();
  const { locale, dateStyle } = usePropertyDateFormat();
  const text = formatPropertyValue(definition, value, { locale, dateStyle, t });

  switch (definition.type) {
    case "date":
      return (
        <DateText
          text={text}
          date={typeof value === "string" ? parseIsoDate(value) : undefined}
          locale={locale}
        />
      );

    case "url": {
      const href =
        typeof value === "string" && isHttpUrl(value)
          ? sanitizeUrl(value)
          : undefined;
      return href ? (
        <Link href={href} target="_blank" rel="noopener noreferrer nofollow">
          <DestinationIcon url={href} />
          <LinkText>{text}</LinkText>
        </Link>
      ) : (
        <Plain>{text}</Plain>
      );
    }

    case "singleSelect": {
      // One value in a stable slot, so changing the option updates the same
      // badge instead of mounting a new one.
      const option = definition.getOption(String(value));
      return option ? (
        <OptionBadge option={option} />
      ) : (
        <Muted>{t("Unknown option")}</Muted>
      );
    }

    case "multiSelect": {
      const ids = Array.isArray(value) ? value : [String(value)];
      return (
        <Badges>
          {ids.map((id) => {
            const option = definition.getOption(id);
            return (
              <li key={id}>
                {option ? (
                  <OptionBadge option={option} />
                ) : (
                  <Muted>{t("Unknown option")}</Muted>
                )}
              </li>
            );
          })}
        </Badges>
      );
    }

    case "textList":
      return (
        <Items>
          {(Array.isArray(value) ? value : [String(value)]).map(
            (item, index) => (
              <li key={index}>{item}</li>
            )
          )}
        </Items>
      );

    case "number":
      return <Numeric>{text}</Numeric>;

    default:
      return <Plain>{text}</Plain>;
  }
});

/**
 * A formatted date followed by how far it is from today. Only dates follow
 * today, so other values never wait for midnight.
 *
 * @param props.text the formatted date.
 * @param props.date the date, when the value is a valid date.
 * @param props.locale the locale of the relative day.
 * @returns the date.
 */
function DateText({
  text,
  date,
  locale,
}: {
  text: string;
  date?: Date;
  locale?: string;
}) {
  const today = useToday();
  return (
    <Plain>
      {text}
      {date && today && (
        <>
          {" "}
          <Relative>{formatRelativeDay(date, today, locale)}</Relative>
        </>
      )}
    </Plain>
  );
}

const Plain = styled.span`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 0;
`;

const Numeric = styled(Plain)`
  font-variant-numeric: tabular-nums;
`;

const Muted = styled.span`
  color: ${s("textSecondary")};
`;

/** Follows the date after a separator, and wraps as a whole. */
const Relative = styled(Muted)`
  white-space: nowrap;

  &::before {
    content: "· ";
  }
`;

/** The logo and the address are one link, the logo beside its first line. */
const Link = styled.a`
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  color: ${s("link")};
  text-decoration: none;
`;

const LinkText = styled.span`
  min-width: 0;
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 2px;
`;

const Badges = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;

  li {
    display: flex;
    max-width: 100%;
  }
`;

const Items = styled.ul`
  margin: 0;
  padding-inline-start: 18px;
  overflow-wrap: anywhere;
`;
