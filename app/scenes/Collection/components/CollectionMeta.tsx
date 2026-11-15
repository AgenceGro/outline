import { observer } from "mobx-react";
import {
  BuildingBlocksIcon,
  GlobeIcon,
  PadlockIcon,
  TeamIcon,
} from "outline-icons";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { breakpoint } from "@shared/styles/breakpoint";
import { flattenTree } from "@shared/utils/tree";
import type Collection from "~/models/Collection";
import Flex from "~/components/Flex";
import { HeaderMeta, Separator } from "~/components/HeaderMeta";
import Tooltip from "~/components/Tooltip";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useStores from "~/hooks/useStores";

type Props = {
  /** The collection to display meta information for */
  collection: Collection;
};

/**
 * A line of meta information about a collection, rendered directly beneath its
 * title to match the equivalent display for documents.
 */
export const CollectionMeta = observer(function CollectionMeta_({
  collection,
}: Props) {
  const { t } = useTranslation();
  const { shares } = useStores();
  const team = useCurrentTeam();

  const share = shares.getByCollectionId(collection.id);
  const isPubliclyShared =
    !collection.isManaged &&
    team.sharing !== false &&
    collection.sharing !== false &&
    !!share?.isActive;

  // The document structure is cached on the collection once loaded, so this is
  // a no-op when the sidebar or another tab has already requested it.
  useEffect(() => {
    void collection.fetchDocuments();
  }, [collection]);

  const documentCount = collection.documents
    ? flattenTree(collection.asNavigationNode).length - 1
    : undefined;

  return (
    <Meta align="center" dir="ltr">
      {collection.isManaged ? (
        <>
          <Tooltip
            content={t("Only admins can give people and groups edit access")}
            side="bottom"
          >
            <IconLabel align="center">
              <BuildingBlocksIcon size={18} />
              {t("Managed by Altai")}
            </IconLabel>
          </Tooltip>
          <Separator />
          <Tooltip
            content={t(
              "Everyone signed in can read published documents. Drafts stay private."
            )}
            side="bottom"
          >
            <IconLabel align="center">
              <TeamIcon size={18} />
              {t("Everyone can read")}
            </IconLabel>
          </Tooltip>
        </>
      ) : (
        <Tooltip
          content={
            collection.isPrivate
              ? t("Only members with access can view")
              : t("All members in the workspace can view")
          }
          side="bottom"
        >
          <IconLabel align="center">
            {collection.isPrivate ? (
              <PadlockIcon size={18} />
            ) : (
              <TeamIcon size={18} />
            )}
            {collection.isPrivate ? t("Private") : t("Workspace")}
          </IconLabel>
        </Tooltip>
      )}
      {isPubliclyShared && (
        <>
          <Separator />
          <Tooltip content={t("Anyone with the link can view")} side="bottom">
            <IconLabel align="center">
              <GlobeIcon size={18} />
              {t("Publicly shared")}
            </IconLabel>
          </Tooltip>
        </>
      )}
      {documentCount !== undefined && (
        <span>
          <Separator />
          {t("{{ count }} document", { count: documentCount })}
        </span>
      )}
    </Meta>
  );
});

const IconLabel = styled(Flex)`
  gap: 2px;
  cursor: default;
`;

const Meta = styled(HeaderMeta)`
  // Aligns with the collection title, which is indented on mobile.
  margin-inline-start: 16px;

  ${breakpoint("tablet")`
    margin-inline-start: 0;
  `}
`;
