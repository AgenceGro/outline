import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  navigateToWorkspaceSettings,
  logout,
} from "~/actions/definitions/navigation";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import { useMenuAction } from "~/hooks/useMenuAction";

type Props = {
  children?: React.ReactNode;
};

const actions = [navigateToWorkspaceSettings, logout];

const TeamMenu: React.FC<Props> = ({ children }: Props) => {
  const { t } = useTranslation();
  const rootAction = useMenuAction(actions);

  return (
    <DropdownMenu action={rootAction} align="start" ariaLabel={t("Account")}>
      {children}
    </DropdownMenu>
  );
};

export default observer(TeamMenu);
