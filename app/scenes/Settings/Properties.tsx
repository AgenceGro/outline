import { observer } from "mobx-react";
import { InputIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import { Action } from "~/components/Actions";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import PlaceholderText from "~/components/PlaceholderText";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import useStores from "~/hooks/useStores";
import { InlineAlert } from "./components/InlineAlert";
import { LiveRegion, useLiveAnnouncer } from "./components/LiveRegion";
import { PropertyDefinitionDeleteDialog } from "./components/PropertyDefinitionDeleteDialog";
import { PropertyDefinitionDialog } from "./components/PropertyDefinitionDialog";
import { PropertyDefinitionList } from "./components/PropertyDefinitionList";
import { PropertyUsageTracker } from "./components/propertyUsage";
import { requestErrorMessage } from "./components/requestError";

const dialogId = "property-definition";

/**
 * Admin settings page listing the workspace's document properties, where
 * workspace properties are created, edited and deleted, and properties
 * managed by Altai or Outline can be viewed.
 *
 * @returns the properties settings scene.
 */
export const Properties = observer(function Properties() {
  const { t } = useTranslation();
  const { propertyDefinitions, dialogs } = useStores();
  const [loadError, setLoadError] = React.useState<string>();
  const { message, announce } = useLiveAnnouncer();
  const newButtonRef = React.useRef<HTMLButtonElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const [usage] = React.useState(
    () =>
      new PropertyUsageTracker(() =>
        propertyDefinitions.fetchAll({ force: true })
      )
  );

  const track = React.useCallback(
    async (request: Promise<void>) => {
      setLoadError(undefined);
      try {
        await request;
      } catch (err) {
        setLoadError(requestErrorMessage(err, t("Something went wrong")));
      }
    },
    [t]
  );

  const load = React.useCallback(() => track(usage.refresh()), [track, usage]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const restoreFocus = React.useCallback((trigger?: HTMLElement | null) => {
    setTimeout(() => {
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      (newButtonRef.current ?? headingRef.current)?.focus();
    }, 0);
  }, []);

  const closeDialog = React.useCallback(
    (trigger?: HTMLElement | null) => {
      dialogs.closeModal(dialogId);
      restoreFocus(trigger);
    },
    [dialogs, restoreFocus]
  );

  const openDefinition = React.useCallback(
    (
      definition: PropertyDefinition | undefined,
      trigger: HTMLElement | null
    ) => {
      const readOnly = definition ? isReadOnly(definition) : false;
      dialogs.openModal({
        id: dialogId,
        title: !definition
          ? t("New property")
          : readOnly
            ? definition.name
            : t("Edit {{ name }}", { name: definition.name }),
        width: 720,
        onClose: () => restoreFocus(trigger),
        content: (
          <PropertyDefinitionDialog
            definition={definition}
            readOnly={readOnly}
            onCancel={() => closeDialog(trigger)}
            onSaved={(saved, created) => {
              closeDialog(trigger);
              void track(usage.invalidate(saved.id));
              announce(
                created
                  ? t("{{ name }} created", { name: saved.name })
                  : t("{{ name }} saved", { name: saved.name })
              );
            }}
          />
        ),
      });
    },
    [announce, closeDialog, dialogs, restoreFocus, t, track, usage]
  );

  const handleCreate = React.useCallback(
    (ev: React.MouseEvent<HTMLButtonElement>) => {
      openDefinition(undefined, ev.currentTarget);
    },
    [openDefinition]
  );

  const handleOpen = React.useCallback(
    (definition: PropertyDefinition, trigger: HTMLElement) => {
      openDefinition(definition, trigger);
    },
    [openDefinition]
  );

  const handleDelete = React.useCallback(
    (definition: PropertyDefinition, trigger: HTMLElement) => {
      dialogs.openModal({
        id: dialogId,
        title: t("Delete {{ name }}?", { name: definition.name }),
        onClose: () => restoreFocus(trigger),
        content: (
          <PropertyDefinitionDeleteDialog
            definition={definition}
            usage={usage}
            onCancel={() => closeDialog(trigger)}
            onDeleted={(name) => {
              closeDialog();
              announce(t("{{ name }} deleted", { name }));
            }}
          />
        ),
      });
    },
    [announce, closeDialog, dialogs, restoreFocus, t, usage]
  );

  const definitions = propertyDefinitions.orderedData;
  const workspaceDefinitions = definitions.filter(
    (definition) => !isReadOnly(definition)
  );
  const managedDefinitions = definitions.filter(isReadOnly);
  const isLoading = !propertyDefinitions.isLoaded && !loadError;
  const isEmpty = propertyDefinitions.isLoaded && definitions.length === 0;

  return (
    <Scene
      title={t("Properties")}
      icon={<InputIcon />}
      actions={
        propertyDefinitions.isLoaded && !isEmpty ? (
          <Action>
            <Button
              ref={newButtonRef}
              type="button"
              icon={<PlusIcon />}
              onClick={handleCreate}
            >
              {t("New property")}
            </Button>
          </Action>
        ) : undefined
      }
    >
      <Heading ref={headingRef} tabIndex={-1}>
        {t("Properties")}
      </Heading>
      <Text as="p" type="secondary">
        {t(
          "Properties add structured details, such as a status or a due date, to documents across the workspace."
        )}
      </Text>
      <LiveRegion message={message} />

      {loadError && (
        <InlineAlert
          title={
            propertyDefinitions.isLoaded
              ? t("Document counts couldn’t be loaded")
              : t("Properties couldn’t be loaded")
          }
          retryLabel={t("Try again")}
          onRetry={load}
          retrying={propertyDefinitions.isFetching}
        >
          {loadError}
        </InlineAlert>
      )}

      {isLoading && (
        <Skeleton aria-busy="true" aria-label={t("Loading properties")}>
          {[0, 1, 2].map((index) => (
            <SkeletonRow key={index}>
              <PlaceholderText maxWidth={40} />
              <PlaceholderText maxWidth={70} height={14} />
            </SkeletonRow>
          ))}
        </Skeleton>
      )}

      {isEmpty && !loadError && (
        <Empty>
          <EmptyTitle>{t("No properties yet")}</EmptyTitle>
          <Text as="p" size="small" type="secondary">
            {t(
              "Create a property to track details like status, owner or due date on every document."
            )}
          </Text>
          <div>
            <Button
              ref={newButtonRef}
              type="button"
              icon={<PlusIcon />}
              onClick={handleCreate}
            >
              {t("Create property")}
            </Button>
          </div>
        </Empty>
      )}

      {workspaceDefinitions.length > 0 && (
        <PropertyDefinitionList
          title={t("Workspace properties")}
          definitions={workspaceDefinitions}
          editable
          usage={usage}
          onOpen={handleOpen}
          onDelete={handleDelete}
        />
      )}

      {managedDefinitions.length > 0 && (
        <PropertyDefinitionList
          title={t("Managed by apps")}
          description={t(
            "Apps such as Altai own these properties. You can view them here, but only the app that owns a property can change or delete it."
          )}
          definitions={managedDefinitions}
          editable={false}
          usage={usage}
          onOpen={handleOpen}
        />
      )}
    </Scene>
  );
});

/**
 * Whether a definition is owned by an app or locked, in which case the
 * server refuses edits and deletes from people.
 *
 * @param definition the definition.
 * @returns true when it can only be viewed.
 */
const isReadOnly = (definition: PropertyDefinition) =>
  definition.owner !== "workspace" || definition.isManaged;

const Skeleton = styled.div`
  display: grid;
  margin-top: 32px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
`;

const SkeletonRow = styled.div`
  padding: 14px 16px 8px;

  & + & {
    border-top: 1px solid ${s("inputBorder")};
  }
`;

const Empty = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 32px;
  padding: 32px 24px;
  border: 1px dashed ${s("inputBorder")};
  border-radius: 8px;
  text-align: center;
  justify-items: center;

  p {
    margin: 0;
    max-width: 48ch;
  }
`;

const EmptyTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 500;
`;
