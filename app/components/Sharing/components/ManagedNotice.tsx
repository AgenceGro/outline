import { BuildingBlocksIcon, UserIcon } from "outline-icons";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "styled-components";
import Squircle from "@shared/components/Squircle";
import { AvatarSize } from "~/components/Avatar";
import { ListItem } from "./ListItem";

/**
 * Explains in a share popover that Altai manages the content, so everyone
 * signed in can read its published documents and only admins give edit
 * access.
 */
export function ManagedNotice() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <ListItem
      image={
        <Squircle color={theme.slate} size={AvatarSize.Medium}>
          <BuildingBlocksIcon color={theme.white} size={16} />
        </Squircle>
      }
      title={t("Managed by Altai")}
      subtitle={t(
        "Everyone signed in can read published documents. Only admins can give edit access."
      )}
    />
  );
}

/**
 * The readers of managed content in a share popover: everyone signed in,
 * while drafts stay private.
 *
 * @param props the permission label or control shown at the end of the row.
 */
export function ManagedReaders({ actions }: { actions: React.ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <ListItem
      image={
        <Squircle color={theme.accent} size={AvatarSize.Medium}>
          <UserIcon color={theme.accentText} size={16} />
        </Squircle>
      }
      title={t("Everyone signed in")}
      subtitle={t("Drafts stay private")}
      actions={actions}
    />
  );
}
