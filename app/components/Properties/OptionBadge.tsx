import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { observer } from "mobx-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled, { css, useTheme } from "styled-components";
import type { PropertyOption } from "@shared/types/documentProperties";
import { IconLibrary } from "@shared/utils/IconLibrary";
import { Badge, type BadgeSize } from "~/components/arc/badge/badge";
import badgeStyles from "~/components/arc/badge/badge.module.css";
import { TextShimmer } from "~/components/arc/text-shimmer/text-shimmer";
import useStores from "~/hooks/useStores";
import { ArcScope, useInArcScope } from "./ArcScope";
import { optionBadgePalette } from "./contrast";

interface Props {
  /** The option to display. */
  option: PropertyOption;
  /** The size of the badge. */
  size?: BadgeSize;
  /** Whether to show the retired cue on retired options. */
  showRetired?: boolean;
  /** An optional class name. */
  className?: string;
}

/** The state of the custom emoji of an option. */
export type OptionEmojiStatus = "loading" | "ready" | "missing";

/**
 * Displays a select option as an Arc badge tinted with the option's color,
 * with its icon and a cue when the option is retired. The label color is
 * calculated to reach WCAG AA contrast against the painted tint in the
 * current theme. A custom emoji that was deleted or cannot load is replaced by
 * a neutral placeholder with an accessible name. Long labels wrap rather than
 * truncate, so the badge has no tooltip repeating its label. An option set to
 * shimmer sweeps a light band across its label, unless reduced motion is
 * preferred; the label keeps its color and is read as plain text.
 *
 * @param props the component props.
 * @returns the badge.
 */
export const OptionBadge = observer(function OptionBadge({
  option,
  size = "md",
  showRetired = true,
  className,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const inScope = useInArcScope();
  const emojiId = option.icon?.kind === "emoji" ? option.icon.value : undefined;
  const emoji = useOptionEmoji(emojiId);

  const palette = useMemo(
    () =>
      optionBadgePalette({
        color: option.color,
        neutral: theme.textSecondary,
        surface: theme.background,
        foreground: theme.text,
        isDark: theme.isDark,
      }),
    [
      option.color,
      theme.textSecondary,
      theme.background,
      theme.text,
      theme.isDark,
    ]
  );

  let icon: React.ReactNode;
  if (option.icon?.kind === "builtin") {
    const Component = IconLibrary.mapping[option.icon.value]?.component;
    icon = Component ? (
      <Component color={palette.foreground} size={iconBoxes[size]} />
    ) : undefined;
  } else if (emojiId) {
    icon =
      emoji.status === "ready" && emoji.url ? (
        <EmojiImage src={emoji.url} alt="" onError={emoji.handleError} />
      ) : (
        <EmojiPlaceholder
          data-testid="option-emoji-placeholder"
          $loading={emoji.status === "loading"}
        />
      );
  }

  const isRetired = Boolean(option.retired) && showRetired;
  const isEmojiMissing = Boolean(emojiId) && emoji.status === "missing";
  const label = option.shimmer ? (
    <>
      <Shimmer aria-hidden="true">
        <TextShimmer>{option.label}</TextShimmer>
      </Shimmer>
      <VisuallyHidden.Root>{option.label}</VisuallyHidden.Root>
    </>
  ) : (
    option.label
  );
  const content =
    isRetired || isEmojiMissing || option.shimmer ? (
      <Content>
        <Label>{label}</Label>
        {isEmojiMissing && (
          <VisuallyHidden.Root>{t("Emoji unavailable")}</VisuallyHidden.Root>
        )}
        {isRetired && <RetiredCue>{t("Retired")}</RetiredCue>}
      </Content>
    ) : (
      option.label
    );

  const badge = (
    <StyledBadge
      size={size}
      icon={icon}
      outline={isRetired}
      className={className}
      data-testid="option-badge"
      data-retired={isRetired ? "" : undefined}
      $background={palette.background}
      $foreground={palette.foreground}
      $icon={iconBoxes[size]}
    >
      {content}
    </StyledBadge>
  );

  return inScope ? badge : <ArcScope as="span">{badge}</ArcScope>;
});

/**
 * Makes a block the width reference for the option badges inside it, so a
 * long label wraps within the block instead of being clipped. Badges outside
 * such a block are limited by the viewport width.
 *
 * @param reserve the width taken beside the badges, such as by a trailing
 * button or a radio input.
 * @returns the styles for the block.
 */
export function optionBadgeContainer(reserve = "0px") {
  return css`
    container-type: inline-size;
    --option-badge-reserve: ${reserve};
  `;
}

/**
 * Resolves a workspace custom emoji for an option icon, fetching it when it
 * is not loaded and reporting it missing when it was deleted or fails to load.
 *
 * @param id the ID of the custom emoji, if the option has one.
 * @returns the emoji URL, its status, and an image error handler.
 */
export function useOptionEmoji(id: string | undefined): {
  url?: string;
  status: OptionEmojiStatus;
  handleError: () => void;
} {
  const { emojis } = useStores();
  const emoji = id ? emojis.get(id) : undefined;
  const [failedId, setFailedId] = useState<string>();
  const failed = id ? failedId === id || missingEmojiIds.has(id) : false;

  useEffect(() => {
    if (!id || emoji || failed) {
      return;
    }
    let cancelled = false;
    emojis.fetch(id).catch(() => {
      missingEmojiIds.add(id);
      if (!cancelled) {
        setFailedId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, emoji, failed, emojis]);

  const handleError = useMemo(
    () => () => {
      if (id) {
        missingEmojiIds.add(id);
        setFailedId(id);
      }
    },
    [id]
  );

  if (!id || failed) {
    return { status: "missing", handleError };
  }
  if (!emoji) {
    return { status: "loading", handleError };
  }
  return { url: emoji.url, status: "ready", handleError };
}

/** IDs of custom emoji that could not be found, shared between badges. */
const missingEmojiIds = new Set<string>();

/**
 * The icon box of each badge size, in pixels. Icons share one box, drawn the
 * way Outline's Icon draws them: Outline icons fill it with their own
 * padding, Font Awesome icons take two thirds of it, and custom emoji three
 * quarters, so every kind looks the same size beside the label.
 */
const iconBoxes: Record<BadgeSize, number> = { sm: 14, md: 16, lg: 18 };

/** The line height of wrapped labels, in ems. */
const labelLineHeight = 1.25;

const wrappingText = css`
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: ${labelLineHeight};
  text-align: start;
`;

// Arc sizes the badge content to its max-content width so the label can
// crossfade while the width springs. The content is capped by the nearest
// optionBadgeContainer instead of the badge itself, which keeps that
// measurement independent of the animated width, and long labels wrap from
// the start edge with the icon aligned to the first line.
const StyledBadge = styled(Badge)<{
  $background: string;
  $foreground: string;
  $icon: number;
}>`
  && {
    --badge-background: ${(props) => props.$background};
    --badge-foreground: ${(props) => props.$foreground};
    --badge-color: ${(props) => props.$foreground};
    --badge-icon: ${(props) => props.$icon}px;
    max-width: 100%;
    justify-content: flex-start;
    padding-block: calc((var(--badge-height) - ${labelLineHeight}em) / 2 - 1px);
  }

  && .${badgeStyles.content} {
    max-width: calc(
      100cqi - var(--option-badge-reserve, 0px) - 2 * var(--badge-pad) - 2px
    );
    align-items: flex-start;
  }

  && .${badgeStyles.label} {
    min-width: 0;
  }

  && .${badgeStyles.text} {
    ${wrappingText}
  }

  && .${badgeStyles.icon} {
    margin-block: calc((${labelLineHeight}em - var(--badge-icon)) / 2);
  }

  @supports (text-box: trim-both cap alphabetic) {
    && {
      padding-block: calc((var(--badge-height) - 1cap) / 2 - 1px);
    }

    && .${badgeStyles.icon} {
      margin-block: calc((1cap - var(--badge-icon)) / 2);
    }
  }
`;

const Content = styled.span`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
`;

const Label = styled.span`
  min-width: 0;
  text-box: trim-both cap alphabetic;
  ${wrappingText}
`;

/**
 * The label rests in the badge's own ink, and the band moves toward the
 * theme's text color, which only raises contrast, so the label is never less
 * readable than a plain one.
 */
const Shimmer = styled.span`
  --text-shimmer-base: currentColor;
  --text-shimmer-highlight: color-mix(
    in oklab,
    currentColor 35%,
    var(--foreground)
  );
`;

const RetiredCue = styled.span`
  flex: none;
  padding-inline-start: 6px;
  border-inline-start: 1px solid currentColor;
  font-weight: 400;
  line-height: ${labelLineHeight};
  text-box: trim-both cap alphabetic;
`;

const EmojiImage = styled.img`
  display: block;
  width: calc(var(--badge-icon) * 0.75);
  height: calc(var(--badge-icon) * 0.75);
  margin: calc(var(--badge-icon) * 0.125);
  object-fit: contain;
`;

const EmojiPlaceholder = styled.span<{ $loading: boolean }>`
  display: block;
  box-sizing: border-box;
  width: calc(var(--badge-icon) * 0.75);
  height: calc(var(--badge-icon) * 0.75);
  margin: calc(var(--badge-icon) * 0.125);
  border-radius: 3px;
  border: 1px ${(props) => (props.$loading ? "solid" : "dashed")} currentColor;
  opacity: ${(props) => (props.$loading ? 0.3 : 0.7)};
`;
